import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import JSZip from 'jszip';
import {
  AddonConfig,
  BridgeTarget,
  buildInGameHudPayload,
  clampRange,
  DimensionId,
  generateAddonFiles,
  generateExternalRepoFiles,
  HudCorner,
  normalizeDimension,
  normalizeGamertag,
  normalizeRoomCode,
  PacketEventEntry,
  PacketSource,
  parseBedrockCommand,
  PlayerVoiceState,
  RoomPublicState,
  sanitizeHttpUrl,
  VoiceScope,
} from './src/shared/voiceProtocol';

interface ServerRoom {
  code: string;
  scope: VoiceScope;
  hostGamertag: string;
  pinSalt?: string;
  pinHash?: string;
  maxRange: number;
  hudCorner: HudCorner;
  hudVisible: boolean;
  players: Map<string, PlayerVoiceState>;
  recentEvents: PacketEventEntry[];
  createdAt: number;
}

interface ClientSocketMeta {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string | null;
}

interface BedrockSocketMeta {
  ws: WebSocket;
  roomCode: string;
  gamertag: string;
  playerId: string;
}

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map<string, ServerRoom>();
const clientSockets = new Map<WebSocket, ClientSocketMeta>();
const bedrockSockets = new Map<WebSocket, BedrockSocketMeta>();

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

function verifyPin(pin: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashPin(pin, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function getOrCreateRoom(code: string, hostGamertag = 'Host', scope: VoiceScope = 'proximity'): ServerRoom {
  const normalized = normalizeRoomCode(code) || 'CRAFT1';
  let room = rooms.get(normalized);
  if (!room) {
    room = {
      code: normalized,
      scope,
      hostGamertag: normalizeGamertag(hostGamertag) || 'Host',
      maxRange: 48,
      hudCorner: 'top-left',
      hudVisible: true,
      players: new Map(),
      recentEvents: [],
      createdAt: Date.now(),
    };
    rooms.set(normalized, room);
  }
  return room;
}

getOrCreateRoom('CRAFT1', 'ServerHost', 'proximity');

function addRoomEvent(room: ServerRoom, source: PacketSource, gamertag: string, summary: string) {
  room.recentEvents.unshift({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source,
    gamertag,
    summary,
  });
  if (room.recentEvents.length > 25) {
    room.recentEvents.length = 25;
  }
}

function toPublicRoom(room: ServerRoom): RoomPublicState {
  return {
    code: room.code,
    scope: room.scope,
    hostGamertag: room.hostGamertag,
    hasPin: Boolean(room.pinHash),
    maxRange: room.maxRange,
    hudCorner: room.hudCorner,
    hudVisible: room.hudVisible,
    players: Array.from(room.players.values()),
    recentEvents: room.recentEvents,
  };
}

function sendBedrockCommand(ws: WebSocket, commandLine: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      header: {
        version: 1,
        requestId: crypto.randomUUID(),
        messageType: 'commandRequest',
        messagePurpose: 'commandRequest',
      },
      body: {
        version: 1,
        commandLine,
        origin: { type: 'player' },
      },
    })
  );
}

function subscribeBedrockEvent(ws: WebSocket, eventName: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      header: {
        version: 1,
        requestId: crypto.randomUUID(),
        messageType: 'commandRequest',
        messagePurpose: 'subscribe',
      },
      body: {
        eventName,
      },
    })
  );
}

function broadcastRoomState(room: ServerRoom) {
  const publicState = toPublicRoom(room);
  const payload = JSON.stringify({ type: 'room-state', room: publicState });

  for (const meta of clientSockets.values()) {
    if (meta.roomCode === room.code && meta.ws.readyState === WebSocket.OPEN) {
      meta.ws.send(payload);
    }
  }

  for (const bMeta of bedrockSockets.values()) {
    if (bMeta.roomCode === room.code && bMeta.ws.readyState === WebSocket.OPEN) {
      const hud = buildInGameHudPayload(publicState, bMeta.gamertag);
      sendBedrockCommand(bMeta.ws, `scriptevent vc:sync ${hud.actionBarText.slice(0, 60)}`);
    }
  }
}

function applyCommandToPlayer(room: ServerRoom, player: PlayerVoiceState, message: string, source: PacketSource): string {
  const parsed = parseBedrockCommand(message);
  if (!parsed.valid) {
    return parsed.error || 'Invalid command';
  }

  switch (parsed.action) {
    case 'mute':
      player.muted = true;
      addRoomEvent(room, source, player.gamertag, 'Microphone OFF');
      return 'Microphone OFF';
    case 'unmute':
      player.muted = false;
      addRoomEvent(room, source, player.gamertag, 'Microphone ON');
      return 'Microphone ON';
    case 'toggle_mic':
      player.muted = !player.muted;
      addRoomEvent(room, source, player.gamertag, player.muted ? 'Microphone OFF' : 'Microphone ON');
      return player.muted ? 'Microphone OFF' : 'Microphone ON';
    case 'deafen':
      player.deafened = true;
      addRoomEvent(room, source, player.gamertag, "People's Voices OFF");
      return "People's Voices OFF";
    case 'undeafen':
      player.deafened = false;
      addRoomEvent(room, source, player.gamertag, "People's Voices ON");
      return "People's Voices ON";
    case 'toggle_voices':
      player.deafened = !player.deafened;
      addRoomEvent(room, source, player.gamertag, player.deafened ? "People's Voices OFF" : "People's Voices ON");
      return player.deafened ? "People's Voices OFF" : "People's Voices ON";
    case 'speak_off':
      player.speakingDisabled = true;
      addRoomEvent(room, source, player.gamertag, 'Speaking OFF');
      return 'Speaking OFF';
    case 'speak_on':
      player.speakingDisabled = false;
      addRoomEvent(room, source, player.gamertag, 'Speaking ON');
      return 'Speaking ON';
    case 'toggle_speak':
      player.speakingDisabled = !player.speakingDisabled;
      addRoomEvent(room, source, player.gamertag, player.speakingDisabled ? 'Speaking OFF' : 'Speaking ON');
      return player.speakingDisabled ? 'Speaking OFF' : 'Speaking ON';
    case 'mute_player':
      if (parsed.targetPlayer && !player.mutedPlayers.includes(parsed.targetPlayer)) {
        player.mutedPlayers.push(parsed.targetPlayer);
        addRoomEvent(room, source, player.gamertag, `Muted ${parsed.targetPlayer}`);
        return `Muted ${parsed.targetPlayer}`;
      }
      return 'Player muted';
    case 'unmute_player':
      if (parsed.targetPlayer) {
        player.mutedPlayers = player.mutedPlayers.filter(
          (n) => n.toLowerCase() !== parsed.targetPlayer!.toLowerCase()
        );
        addRoomEvent(room, source, player.gamertag, `Unmuted ${parsed.targetPlayer}`);
        return `Unmuted ${parsed.targetPlayer}`;
      }
      return 'Player unmuted';
    case 'mode':
      if (parsed.scope) {
        player.scope = parsed.scope;
        if (parsed.channel) player.privateChannel = parsed.channel;
        room.scope = parsed.scope;
        addRoomEvent(room, source, player.gamertag, `Switched channel to ${parsed.scope}`);
        return `Switched to ${parsed.scope}`;
      }
      return 'Channel unchanged';
    case 'private':
      player.scope = 'private';
      player.privateChannel = parsed.channel || 'squad';
      if (parsed.pin) {
        const salt = crypto.randomBytes(16).toString('hex');
        room.pinSalt = salt;
        room.pinHash = hashPin(parsed.pin, salt);
      }
      addRoomEvent(room, source, player.gamertag, `Joined private channel "${player.privateChannel}"`);
      return `Private channel: ${player.privateChannel}`;
    case 'range':
      if (parsed.range) {
        player.range = parsed.range;
        room.maxRange = parsed.range;
        addRoomEvent(room, source, player.gamertag, `Range set to ${parsed.range} blocks`);
        return `Range set to ${parsed.range}b`;
      }
      return 'Range unchanged';
    case 'hud':
      if (typeof parsed.hudVisible === 'boolean') room.hudVisible = parsed.hudVisible;
      if (parsed.hudCorner) room.hudCorner = parsed.hudCorner;
      addRoomEvent(room, source, player.gamertag, `HUD ${room.hudVisible ? 'shown' : 'hidden'}`);
      return 'HUD updated';
    default:
      return 'Command processed';
  }
}

// Pure-Node RGBA PNG encoder for pack_icon.png and 16x16 Minecraft HUD button sprites
function encodeRgbaPng(size: number, pixelAt: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const [r, g, b, a] = pixelAt(x, y);
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const makeChunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function make16x16GlyphPng(rows: string[], fg: [number, number, number], slashColor?: [number, number, number]): Buffer {
  return encodeRgbaPng(16, (x, y) => {
    if (slashColor && Math.abs(x - y) <= 0 && x >= 2 && x <= 13) {
      return [slashColor[0], slashColor[1], slashColor[2], 255];
    }
    const ch = rows[y]?.[x] || '.';
    if (ch === '#') return [fg[0], fg[1], fg[2], 255];
    if (ch === 'S') return [20, 22, 28, 255];
    return [0, 0, 0, 0];
  });
}

const MIC_GLYPH = [
  '................',
  '......####......',
  '.....######.....',
  '.....######.....',
  '.....######.....',
  '.....######.....',
  '......####......',
  '...##......##...',
  '...##.####.##...',
  '....########....',
  '.......##.......',
  '.......##.......',
  '.....######.....',
  '................',
  '................',
  '................',
];

const VOICES_GLYPH = [
  '................',
  '.......##.......',
  '......###..#....',
  '.....####...#...',
  '..#######.#..#..',
  '..#######..#.#..',
  '..#######..#.#..',
  '..#######.#..#..',
  '.....####...#...',
  '......###..#....',
  '.......##.......',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const SPEAK_GLYPH = [
  '................',
  '................',
  '...##########...',
  '..############..',
  '..##.######.##..',
  '..############..',
  '..##.######.##..',
  '..############..',
  '...##########...',
  '.....###........',
  '....##..........',
  '...#............',
  '................',
  '................',
  '................',
  '................',
];

const PACK_ICON_PNG = encodeRgbaPng(32, (x, y) => {
  const isBorder = x < 2 || y < 2 || x >= 30 || y >= 30;
  const isSpeaker = x >= 8 && x < 24 && y >= 8 && y < 24;
  const isGrille = isSpeaker && (x % 3 === 0 || y % 3 === 0) && x >= 11 && x < 21 && y >= 11 && y < 21;
  const isAntenna = x >= 14 && x < 18 && y >= 4 && y < 8;
  if (isBorder) return [28, 31, 38, 255];
  if (isAntenna) return [71, 194, 255, 255];
  if (isGrille) return [20, 44, 24, 255];
  if (isSpeaker) return [85, 170, 51, 255];
  return [42, 45, 54, 255];
});

const HUD_SPRITES = {
  'VoiceCraft_RP/textures/voicecraft/mic_on.png': make16x16GlyphPng(MIC_GLYPH, [99, 212, 70]),
  'VoiceCraft_RP/textures/voicecraft/mic_off.png': make16x16GlyphPng(MIC_GLYPH, [175, 180, 192], [220, 65, 65]),
  'VoiceCraft_RP/textures/voicecraft/voices_on.png': make16x16GlyphPng(VOICES_GLYPH, [71, 194, 255]),
  'VoiceCraft_RP/textures/voicecraft/voices_off.png': make16x16GlyphPng(VOICES_GLYPH, [175, 180, 192], [220, 65, 65]),
  'VoiceCraft_RP/textures/voicecraft/speak_on.png': make16x16GlyphPng(SPEAK_GLYPH, [244, 198, 92]),
  'VoiceCraft_RP/textures/voicecraft/speak_off.png': make16x16GlyphPng(SPEAK_GLYPH, [175, 180, 192], [220, 65, 65]),
};

function parseAddonConfigFromRequest(body: Record<string, unknown>, req: Request): AddonConfig {
  const originFromReq = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
  const requestedExternal =
    typeof body.externalServerUrl === 'string' && body.externalServerUrl.trim()
      ? body.externalServerUrl
      : originFromReq;
  const bridgeTarget: BridgeTarget = 'external';
  const scopeCandidate = String(body.defaultScope || 'proximity') as VoiceScope;
  const hudCandidate = String(body.hudCorner || 'top-left') as HudCorner;

  return {
    packName: typeof body.packName === 'string' && body.packName.trim() ? body.packName.slice(0, 40) : 'VoiceCraft',
    bridgeTarget,
    externalServerUrl: sanitizeHttpUrl(requestedExternal),
    roomCode: normalizeRoomCode(String(body.roomCode || 'CRAFT1')) || 'CRAFT1',
    enableServerNetPackets: Boolean(body.enableServerNetPackets),
    includeHudButtons: body.includeHudButtons !== false,
    includePauseButton: body.includePauseButton !== false,
    giveHotbarToggles: body.giveHotbarToggles !== false,
    defaultScope: ['proximity', 'server', 'realm', 'private'].includes(scopeCandidate) ? scopeCandidate : 'proximity',
    defaultRange: clampRange(Number(body.defaultRange || 48)),
    hudCorner: ['top-left', 'top-right', 'bottom-left'].includes(hudCandidate) ? hudCandidate : 'top-left',
    syncIntervalTicks: Math.min(40, Math.max(4, Math.round(Number(body.syncIntervalTicks || 10)))),
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      roomsCount: rooms.size,
      clientsCount: clientSockets.size,
      bedrockLinksCount: bedrockSockets.size,
    });
  });

  app.get('/api/rooms/:code', (req: Request, res: Response) => {
    const code = normalizeRoomCode(req.params.code || '');
    if (!code) {
      res.status(400).json({ error: 'Invalid room code' });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: toPublicRoom(room) });
  });

  app.post('/api/packets/ingest', (req: Request, res: Response) => {
    const configuredSecret = process.env.PACKET_BRIDGE_SECRET;
    if (configuredSecret) {
      const provided = String(req.headers['x-voicecraft-secret'] || '');
      if (provided !== configuredSecret) {
        res.status(401).json({ error: 'Unauthorized packet bridge secret' });
        return;
      }
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const roomCode = normalizeRoomCode(String(body.roomCode || 'CRAFT1'));
    const gamertag = normalizeGamertag(String(body.gamertag || ''));

    if (!roomCode || !gamertag) {
      res.status(400).json({ error: 'roomCode and gamertag are required' });
      return;
    }

    const room = getOrCreateRoom(roomCode, gamertag);
    const existing = Array.from(room.players.values()).find(
      (p) => p.gamertag.toLowerCase() === gamertag.toLowerCase()
    );

    const playerId = existing?.id || `pkt_${gamertag.toLowerCase()}`;
    const scopeCandidate = String(body.scope || existing?.scope || room.scope) as VoiceScope;
    const validScope: VoiceScope = ['proximity', 'server', 'realm', 'private'].includes(scopeCandidate)
      ? scopeCandidate
      : 'proximity';

    const player: PlayerVoiceState = {
      id: playerId,
      gamertag,
      x: Number.isFinite(Number(body.x)) ? Number(body.x) : existing?.x ?? 0,
      y: Number.isFinite(Number(body.y)) ? Number(body.y) : existing?.y ?? 64,
      z: Number.isFinite(Number(body.z)) ? Number(body.z) : existing?.z ?? 0,
      yaw: Number.isFinite(Number(body.yaw)) ? Number(body.yaw) : existing?.yaw ?? 0,
      dimension: body.dimension ? normalizeDimension(String(body.dimension)) : existing?.dimension ?? 'overworld',
      scope: validScope,
      privateChannel:
        typeof body.privateChannel === 'string' && body.privateChannel.trim()
          ? body.privateChannel.trim().toLowerCase().slice(0, 16)
          : existing?.privateChannel ?? 'squad',
      range: body.range !== undefined ? clampRange(Number(body.range)) : existing?.range ?? room.maxRange,
      muted: typeof body.muted === 'boolean' ? body.muted : existing?.muted ?? false,
      deafened: typeof body.deafened === 'boolean' ? body.deafened : existing?.deafened ?? false,
      speakingDisabled:
        typeof body.speakingDisabled === 'boolean'
          ? body.speakingDisabled
          : existing?.speakingDisabled ?? false,
      mutedPlayers: Array.isArray(body.mutedPlayers)
        ? body.mutedPlayers.map((v) => normalizeGamertag(String(v))).filter(Boolean).slice(0, 32)
        : existing?.mutedPlayers ?? [],
      speaking: typeof body.speaking === 'boolean' ? body.speaking : existing?.speaking ?? false,
      volume: existing?.volume ?? 100,
      bedrockLinked: true,
      packetSource: (body.source === 'wsserver' ? 'wsserver' : 'script-net') as PacketSource,
      lastSeen: Date.now(),
    };

    room.players.set(playerId, player);

    let commandReply = '';
    if (typeof body.command === 'string' && body.command.trim()) {
      commandReply = applyCommandToPlayer(room, player, body.command.trim(), player.packetSource);
    }

    broadcastRoomState(room);
    const hudPayload = buildInGameHudPayload(toPublicRoom(room), player.gamertag);

    res.json({
      ok: true,
      commandReply,
      hudSummary: hudPayload.actionBarText,
      hudPayload,
      room: toPublicRoom(room),
    });
  });

  app.post('/api/addon/preview', (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest((req.body || {}) as Record<string, unknown>, req);
    const files = generateAddonFiles(config);
    res.json({ config, files });
  });

  const buildAddonZipBuffer = async (config: AddonConfig): Promise<Buffer> => {
    const files = generateAddonFiles(config);
    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.path, file.content);
    }
    zip.file('VoiceCraft_BP/pack_icon.png', PACK_ICON_PNG);
    zip.file('VoiceCraft_RP/pack_icon.png', PACK_ICON_PNG);
    for (const [spritePath, pngBuf] of Object.entries(HUD_SPRITES)) {
      zip.file(spritePath, pngBuf);
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  };

  const handleAddonDownload = async (config: AddonConfig, res: Response) => {
    const archive = await buildAddonZipBuffer(config);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="VoiceCraft_Bedrock_${config.roomCode}.mcaddon"`);
    res.send(archive);
  };

  app.post('/api/addon/download', async (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest((req.body || {}) as Record<string, unknown>, req);
    await handleAddonDownload(config, res);
  });

  app.get('/api/addon/download', async (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest(
      {
        roomCode: req.query.roomCode,
        externalServerUrl: req.query.externalServerUrl,
        defaultScope: req.query.defaultScope,
        defaultRange: req.query.defaultRange,
        hudCorner: req.query.hudCorner,
        enableServerNetPackets: req.query.enableServerNetPackets === 'true',
      },
      req
    );
    await handleAddonDownload(config, res);
  });

  const handleRepoDownload = async (config: AddonConfig, res: Response) => {
    const repoFiles = generateExternalRepoFiles(config);
    const addonFiles = generateAddonFiles(config);
    const addonBuffer = await buildAddonZipBuffer(config);

    const zip = new JSZip();
    for (const f of repoFiles) {
      zip.file(`VoiceCraft/${f.path}`, f.content);
    }
    // Include both the ready-to-import .mcaddon and unpacked addon source inside the VoiceCraft repo
    zip.file('VoiceCraft/addon/VoiceCraft.mcaddon', addonBuffer);
    zip.file(`VoiceCraft/addon/VoiceCraft_Bedrock_${config.roomCode}.mcaddon`, addonBuffer);
    for (const f of addonFiles) {
      zip.file(`VoiceCraft/addon/${f.path}`, f.content);
    }
    zip.file('VoiceCraft/addon/VoiceCraft_BP/pack_icon.png', PACK_ICON_PNG);
    zip.file('VoiceCraft/addon/VoiceCraft_RP/pack_icon.png', PACK_ICON_PNG);
    for (const [spritePath, pngBuf] of Object.entries(HUD_SPRITES)) {
      zip.file(`VoiceCraft/addon/${spritePath}`, pngBuf);
    }

    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="VoiceCraft_GitHub_Repo.zip"`);
    res.send(archive);
  };

  app.post('/api/repo/download', async (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest((req.body || {}) as Record<string, unknown>, req);
    await handleRepoDownload(config, res);
  });

  app.get('/api/repo/download', async (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest(
      {
        roomCode: req.query.roomCode,
        externalServerUrl: req.query.externalServerUrl,
        defaultScope: req.query.defaultScope,
        defaultRange: req.query.defaultRange,
        hudCorner: req.query.hudCorner,
        enableServerNetPackets: req.query.enableServerNetPackets === 'true',
      },
      req
    );
    await handleRepoDownload(config, res);
  });

  app.get('/api/bridge/download', async (req: Request, res: Response) => {
    const config = parseAddonConfigFromRequest(
      {
        roomCode: req.query.roomCode,
        externalServerUrl: req.query.externalServerUrl,
      },
      req
    );
    await handleRepoDownload(config, res);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wssClient = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const wssBedrock = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws/client') {
      wssClient.handleUpgrade(request, socket, head, (ws) => wssClient.emit('connection', ws, request));
    } else if (reqUrl.pathname === '/ws/bedrock') {
      wssBedrock.handleUpgrade(request, socket, head, (ws) => wssBedrock.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
  });

  // Ping/pong keepalive so cloud hosts keep active Bedrock & browser WebSocket links warm
  const heartbeat = setInterval(() => {
    for (const ws of [...wssClient.clients, ...wssBedrock.clients]) {
      const sock = ws as WebSocket & { isAlive?: boolean };
      if (sock.isAlive === false) {
        sock.terminate();
        continue;
      }
      sock.isAlive = false;
      sock.ping();
    }
  }, 25000);
  server.on('close', () => clearInterval(heartbeat));

  wssClient.on('connection', (ws) => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    const meta: ClientSocketMeta = { ws, roomCode: null, playerId: null };
    clientSockets.set(ws, meta);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = String(msg.type || '');

        if (type === 'join') {
          const roomCode = normalizeRoomCode(String(msg.roomCode || 'CRAFT1'));
          const gamertag = normalizeGamertag(String(msg.gamertag || ''));
          if (!roomCode || !gamertag) {
            ws.send(JSON.stringify({ type: 'error', error: 'Room code and gamertag are required.' }));
            return;
          }

          const requestedScope = (['proximity', 'server', 'realm', 'private'].includes(String(msg.scope))
            ? String(msg.scope)
            : 'proximity') as VoiceScope;
          const pin = typeof msg.pin === 'string' ? msg.pin.trim().slice(0, 12) : '';

          const existingRoom = rooms.get(roomCode);
          if (existingRoom && existingRoom.pinHash && existingRoom.pinSalt) {
            if (!pin || !verifyPin(pin, existingRoom.pinSalt, existingRoom.pinHash)) {
              ws.send(JSON.stringify({ type: 'error', error: 'Incorrect Private Room PIN.' }));
              return;
            }
          }

          const room = getOrCreateRoom(roomCode, gamertag, requestedScope);
          if (!existingRoom && requestedScope === 'private' && pin) {
            const salt = crypto.randomBytes(16).toString('hex');
            room.pinSalt = salt;
            room.pinHash = hashPin(pin, salt);
          }

          const playerId = crypto.randomUUID();
          const bedrockPeer = Array.from(room.players.values()).find(
            (p) => p.gamertag.toLowerCase() === gamertag.toLowerCase()
          );

          const player: PlayerVoiceState = {
            id: playerId,
            gamertag,
            x: bedrockPeer?.x ?? 0,
            y: bedrockPeer?.y ?? 64,
            z: bedrockPeer?.z ?? 0,
            yaw: bedrockPeer?.yaw ?? 0,
            dimension: bedrockPeer?.dimension ?? 'overworld',
            scope: bedrockPeer?.scope ?? requestedScope,
            privateChannel: bedrockPeer?.privateChannel ?? 'squad',
            range: bedrockPeer?.range ?? room.maxRange,
            muted: bedrockPeer?.muted ?? false,
            deafened: bedrockPeer?.deafened ?? false,
            speakingDisabled: bedrockPeer?.speakingDisabled ?? false,
            mutedPlayers: bedrockPeer?.mutedPlayers ?? [],
            speaking: false,
            volume: 100,
            bedrockLinked: Boolean(bedrockPeer?.bedrockLinked),
            packetSource: bedrockPeer?.bedrockLinked ? bedrockPeer.packetSource : 'browser',
            lastSeen: Date.now(),
          };

          if (bedrockPeer && bedrockPeer.id !== playerId) {
            room.players.delete(bedrockPeer.id);
          }

          meta.roomCode = room.code;
          meta.playerId = playerId;
          room.players.set(playerId, player);
          addRoomEvent(room, 'browser', gamertag, `Audio carrier linked to ${room.code}`);

          ws.send(JSON.stringify({ type: 'joined', playerId, room: toPublicRoom(room) }));
          broadcastRoomState(room);
          return;
        }

        if (!meta.roomCode || !meta.playerId) return;
        const room = rooms.get(meta.roomCode);
        if (!room) return;
        const player = room.players.get(meta.playerId);
        if (!player) return;

        if (type === 'state') {
          if (typeof msg.speaking === 'boolean') player.speaking = msg.speaking;
          player.lastSeen = Date.now();
          broadcastRoomState(room);
        } else if (type === 'rtc-signal') {
          const targetId = String(msg.targetId || '');
          for (const peerMeta of clientSockets.values()) {
            if (peerMeta.roomCode === room.code && peerMeta.playerId === targetId && peerMeta.ws.readyState === WebSocket.OPEN) {
              peerMeta.ws.send(
                JSON.stringify({
                  type: 'rtc-signal',
                  fromId: meta.playerId,
                  signal: msg.signal,
                })
              );
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clientSockets.delete(ws);
      if (meta.roomCode && meta.playerId) {
        const room = rooms.get(meta.roomCode);
        if (room) {
          room.players.delete(meta.playerId);
          broadcastRoomState(room);
        }
      }
    });
  });

  wssBedrock.on('connection', (ws, request) => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const roomCode = normalizeRoomCode(reqUrl.searchParams.get('code') || 'CRAFT1') || 'CRAFT1';
    const gamertag = normalizeGamertag(reqUrl.searchParams.get('tag') || 'BedrockPlayer') || 'BedrockPlayer';

    const room = getOrCreateRoom(roomCode, gamertag);
    const existing = Array.from(room.players.values()).find(
      (p) => p.gamertag.toLowerCase() === gamertag.toLowerCase()
    );
    const playerId = existing?.id || `mc_${gamertag.toLowerCase()}`;

    const player: PlayerVoiceState = existing || {
      id: playerId,
      gamertag,
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      dimension: 'overworld',
      scope: room.scope,
      privateChannel: 'squad',
      range: room.maxRange,
      muted: false,
      deafened: false,
      speakingDisabled: false,
      mutedPlayers: [],
      speaking: false,
      volume: 100,
      bedrockLinked: true,
      packetSource: 'wsserver',
      lastSeen: Date.now(),
    };
    player.bedrockLinked = true;
    player.packetSource = 'wsserver';
    player.lastSeen = Date.now();
    room.players.set(playerId, player);

    const bMeta: BedrockSocketMeta = { ws, roomCode: room.code, gamertag, playerId };
    bedrockSockets.set(ws, bMeta);
    addRoomEvent(room, 'wsserver', gamertag, `Bedrock /wsserver linked to ${room.code}`);

    subscribeBedrockEvent(ws, 'PlayerMessage');
    subscribeBedrockEvent(ws, 'PlayerTravelled');
    sendBedrockCommand(
      ws,
      `tellraw @s {"rawtext":[{"text":"§a[VoiceCraft]§f Connected to room §b${room.code}§f. Control everything in-game with HUD buttons or !vc menu."}]}`
    );
    broadcastRoomState(room);

    ws.on('message', (raw) => {
      try {
        const packet = JSON.parse(raw.toString()) as {
          header?: { messagePurpose?: string; eventName?: string };
          body?: Record<string, unknown>;
        };
        const eventName = packet.header?.eventName || (packet.body?.eventName as string | undefined);
        const targetRoom = rooms.get(bMeta.roomCode);
        if (!targetRoom) return;
        const targetPlayer = targetRoom.players.get(bMeta.playerId);
        if (!targetPlayer) return;

        if (eventName === 'PlayerMessage') {
          const message = String(packet.body?.message || '');
          const sender = normalizeGamertag(String(packet.body?.sender || bMeta.gamertag));
          if (message.trim().toLowerCase().startsWith('!vc')) {
            const reply = applyCommandToPlayer(targetRoom, targetPlayer, message, 'wsserver');
            sendBedrockCommand(ws, `tellraw "${sender}" {"rawtext":[{"text":"§a[VoiceCraft]§f ${reply}"}]}`);
            broadcastRoomState(targetRoom);
          }
        } else if (eventName === 'PlayerTravelled') {
          const playerObj = packet.body?.player as
            | { position?: { x?: number; y?: number; z?: number }; yRot?: number; dimension?: number }
            | undefined;
          if (playerObj?.position) {
            if (typeof playerObj.position.x === 'number') targetPlayer.x = Number(playerObj.position.x.toFixed(1));
            if (typeof playerObj.position.y === 'number') targetPlayer.y = Number(playerObj.position.y.toFixed(1));
            if (typeof playerObj.position.z === 'number') targetPlayer.z = Number(playerObj.position.z.toFixed(1));
          }
          if (typeof playerObj?.yRot === 'number') targetPlayer.yaw = Number(playerObj.yRot.toFixed(1));
          if (typeof playerObj?.dimension === 'number') {
            targetPlayer.dimension =
              playerObj.dimension === 1 ? 'nether' : playerObj.dimension === 2 ? 'the_end' : 'overworld';
          }
          targetPlayer.lastSeen = Date.now();
          broadcastRoomState(targetRoom);
        }
      } catch {
        // Ignore malformed Bedrock frames
      }
    });

    ws.on('close', () => {
      bedrockSockets.delete(ws);
      const targetRoom = rooms.get(bMeta.roomCode);
      if (targetRoom) {
        const p = targetRoom.players.get(bMeta.playerId);
        if (p) p.bedrockLinked = false;
        broadcastRoomState(targetRoom);
      }
    });
  });

  if (process.env.NODE_ENV === 'production' && !fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    console.warn('Warning: dist/ directory not found in production mode.');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VoiceCraft server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
