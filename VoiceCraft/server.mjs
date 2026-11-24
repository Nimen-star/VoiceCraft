import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 3000);
const PACKET_SECRET = process.env.PACKET_BRIDGE_SECRET || "";
const rooms = new Map();
const clients = new Map();
const bedrockLinks = new Map();

function normalizeCode(raw) {
  return String(raw || "CRAFT1").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12) || "CRAFT1";
}

function normalizeTag(raw) {
  return String(raw || "Player").trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 20) || "Player";
}

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

function verifyPin(pin, salt, expectedHex) {
  const actual = Buffer.from(hashPin(pin, salt), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function getRoom(code) {
  const key = normalizeCode(code);
  let room = rooms.get(key);
  if (!room) {
    room = { code: key, scope: "proximity", maxRange: 48, pinSalt: null, pinHash: null, players: new Map() };
    rooms.set(key, room);
  }
  return room;
}

function toPublicRoom(room) {
  return {
    code: room.code,
    scope: room.scope,
    maxRange: room.maxRange,
    hasPin: Boolean(room.pinHash),
    players: Array.from(room.players.values())
  };
}

function broadcast(room) {
  const payload = JSON.stringify({ type: "room-state", room: toPublicRoom(room) });
  for (const meta of clients.values()) {
    if (meta.roomCode === room.code && meta.ws.readyState === WebSocket.OPEN) {
      meta.ws.send(payload);
    }
  }
}

function sendBedrockCmd(ws, commandLine) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    header: { version: 1, requestId: crypto.randomUUID(), messageType: "commandRequest", messagePurpose: "commandRequest" },
    body: { version: 1, commandLine, origin: { type: "player" } }
  }));
}

function applyCommand(room, p, msg) {
  const body = String(msg || "").trim().slice(3).trim();
  const parts = body.split(/\s+/);
  const cmd = (parts[0] || "menu").toLowerCase();
  const arg = parts[1];
  if (cmd === "mute" && arg) {
    const t = normalizeTag(arg);
    if (!p.mutedPlayers.includes(t)) p.mutedPlayers.push(t);
    return "Muted " + t;
  }
  if (cmd === "unmute" && arg) {
    p.mutedPlayers = p.mutedPlayers.filter((n) => n.toLowerCase() !== arg.toLowerCase());
    return "Unmuted " + arg;
  }
  if (cmd === "mute" || cmd === "mic_off") { p.muted = true; return "Microphone OFF"; }
  if (cmd === "unmute" || cmd === "mic_on") { p.muted = false; return "Microphone ON"; }
  if (cmd === "mic" || cmd === "toggle_mic") { p.muted = !p.muted; return p.muted ? "Microphone OFF" : "Microphone ON"; }
  if (cmd === "deafen" || cmd === "voices_off") { p.deafened = true; return "People's Voices OFF"; }
  if (cmd === "undeafen" || cmd === "voices_on") { p.deafened = false; return "People's Voices ON"; }
  if (cmd === "voices" || cmd === "toggle_voices") { p.deafened = !p.deafened; return p.deafened ? "People's Voices OFF" : "People's Voices ON"; }
  if (cmd === "speak_off") { p.speakingDisabled = true; return "Speaking OFF"; }
  if (cmd === "speak_on") { p.speakingDisabled = false; return "Speaking ON"; }
  if (cmd === "speak" || cmd === "toggle_speak") { p.speakingDisabled = !p.speakingDisabled; return p.speakingDisabled ? "Speaking OFF" : "Speaking ON"; }
  if (cmd === "mode" && ["proximity", "server", "realm", "private"].includes((arg || "").toLowerCase())) {
    p.scope = arg.toLowerCase();
    room.scope = p.scope;
    return "Channel: " + p.scope;
  }
  if (cmd === "private") {
    p.scope = "private";
    p.privateChannel = (arg || "squad").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16) || "squad";
    return "Private channel: " + p.privateChannel;
  }
  if (cmd === "range" && arg) {
    p.range = Math.min(128, Math.max(8, Math.round(Number(arg) || 48)));
    return "Range: " + p.range + "b";
  }
  return "Updated";
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", "http://localhost:" + PORT);

  if (req.method === "GET" && reqUrl.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "VoiceCraft", rooms: rooms.size, clients: clients.size }));
    return;
  }

  if (req.method === "GET" && (reqUrl.pathname === "/download/VoiceCraft.mcaddon" || reqUrl.pathname === "/api/addon/download")) {
    const addonDir = path.resolve(process.cwd(), "addon");
    const target = path.resolve(addonDir, "VoiceCraft.mcaddon");
    if (target.startsWith(addonDir + path.sep) && fs.existsSync(target)) {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="VoiceCraft.mcaddon"'
      });
      fs.createReadStream(target).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("Addon file not found");
    return;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/packets/ingest") {
    if (PACKET_SECRET && String(req.headers["x-voicecraft-secret"] || "") !== PACKET_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) { req.destroy(); return; }
      body += chunk;
    });
    req.on("end", () => {
      try {
        const pkt = JSON.parse(body || "{}");
        const room = getRoom(pkt.roomCode);
        const tag = normalizeTag(pkt.gamertag);
        const id = "pkt_" + tag.toLowerCase();
        const prev = room.players.get(id) || {};
        room.players.set(id, {
          ...prev,
          id,
          gamertag: tag,
          x: Number(pkt.x || 0),
          y: Number(pkt.y || 64),
          z: Number(pkt.z || 0),
          yaw: Number(pkt.yaw || 0),
          dimension: String(pkt.dimension || "overworld"),
          scope: ["proximity", "server", "realm", "private"].includes(pkt.scope) ? pkt.scope : "proximity",
          privateChannel: String(pkt.privateChannel || "squad").slice(0, 16),
          range: Math.min(128, Math.max(8, Number(pkt.range || 48))),
          muted: Boolean(pkt.muted),
          deafened: Boolean(pkt.deafened),
          speakingDisabled: Boolean(pkt.speakingDisabled),
          mutedPlayers: Array.isArray(pkt.mutedPlayers) ? pkt.mutedPlayers.slice(0, 32) : [],
          bedrockLinked: true,
          packetSource: "script-net"
        });
        broadcast(room);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, hudSummary: room.players.size + " linked" }));
      } catch {
        res.writeHead(400);
        res.end("Bad JSON");
      }
    });
    return;
  }

  const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

const wssClient = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const wssBedrock = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost:" + PORT);
  if (url.pathname === "/ws/client") {
    wssClient.handleUpgrade(req, socket, head, (ws) => wssClient.emit("connection", ws, req));
  } else if (url.pathname === "/ws/bedrock") {
    wssBedrock.handleUpgrade(req, socket, head, (ws) => wssBedrock.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// Ping/pong keepalive for external cloud WebSocket hosts (e.g. Render)
setInterval(() => {
  for (const ws of [...wssClient.clients, ...wssBedrock.clients]) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

wssClient.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  const meta = { ws, roomCode: null, playerId: null };
  clients.set(ws, meta);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "join") {
        const roomCode = normalizeCode(msg.roomCode);
        const tag = normalizeTag(msg.gamertag);
        const existing = rooms.get(roomCode);
        const pin = typeof msg.pin === "string" ? msg.pin.trim().slice(0, 12) : "";
        if (existing && existing.pinHash && existing.pinSalt) {
          if (!pin || !verifyPin(pin, existing.pinSalt, existing.pinHash)) {
            ws.send(JSON.stringify({ type: "error", error: "Incorrect Private Room PIN." }));
            return;
          }
        }
        const room = getRoom(roomCode);
        if (!existing && msg.scope === "private" && pin) {
          room.pinSalt = crypto.randomBytes(16).toString("hex");
          room.pinHash = hashPin(pin, room.pinSalt);
        }
        const id = crypto.randomUUID();
        const linked = Array.from(room.players.values()).find((p) => p.gamertag.toLowerCase() === tag.toLowerCase());
        meta.roomCode = room.code;
        meta.playerId = id;
        if (linked && linked.id !== id) room.players.delete(linked.id);
        room.players.set(id, {
          id,
          gamertag: tag,
          x: linked?.x ?? 0, y: linked?.y ?? 64, z: linked?.z ?? 0, yaw: linked?.yaw ?? 0,
          dimension: linked?.dimension ?? "overworld",
          scope: linked?.scope ?? "proximity",
          privateChannel: linked?.privateChannel ?? "squad",
          range: linked?.range ?? 48,
          muted: linked?.muted ?? false,
          deafened: linked?.deafened ?? false,
          speakingDisabled: linked?.speakingDisabled ?? false,
          mutedPlayers: linked?.mutedPlayers ?? [],
          bedrockLinked: Boolean(linked?.bedrockLinked),
          packetSource: "browser"
        });
        ws.send(JSON.stringify({ type: "joined", playerId: id, room: toPublicRoom(room) }));
        broadcast(room);
      } else if (msg.type === "rtc-signal" && meta.roomCode) {
        for (const peer of clients.values()) {
          if (peer.roomCode === meta.roomCode && peer.playerId === msg.targetId && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({ type: "rtc-signal", fromId: meta.playerId, signal: msg.signal }));
          }
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    clients.delete(ws);
    if (meta.roomCode && meta.playerId) {
      const room = rooms.get(meta.roomCode);
      if (room) {
        room.players.delete(meta.playerId);
        broadcast(room);
      }
    }
  });
});

wssBedrock.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  const url = new URL(req.url || "/", "http://localhost:" + PORT);
  const room = getRoom(url.searchParams.get("code") || "CRAFT1");
  const tag = normalizeTag(url.searchParams.get("tag") || "BedrockPlayer");
  const existing = Array.from(room.players.values()).find((p) => p.gamertag.toLowerCase() === tag.toLowerCase());
  const id = existing?.id || "mc_" + tag.toLowerCase();
  const initial = existing || {
    id, gamertag: tag, x: 0, y: 64, z: 0, yaw: 0, dimension: "overworld",
    scope: room.scope, privateChannel: "squad", range: 48,
    muted: false, deafened: false, speakingDisabled: false, mutedPlayers: [],
    bedrockLinked: true, packetSource: "wsserver"
  };
  initial.bedrockLinked = true;
  room.players.set(id, initial);
  bedrockLinks.set(ws, { roomCode: room.code, id, tag });

  const sub = (eventName) =>
    ws.send(JSON.stringify({
      header: { version: 1, requestId: crypto.randomUUID(), messageType: "commandRequest", messagePurpose: "subscribe" },
      body: { eventName }
    }));
  sub("PlayerMessage");
  sub("PlayerTravelled");
  sendBedrockCmd(ws, 'tellraw @s {"rawtext":[{"text":"§a[VoiceCraft]§f Connected to room §b' + room.code + '§f. Control everything in-game via HUD button or !vc menu."}]}');
  broadcast(room);

  ws.on("message", (raw) => {
    try {
      const pkt = JSON.parse(raw.toString());
      const ev = pkt.header?.eventName || pkt.body?.eventName;
      const p = room.players.get(id);
      if (!p) return;
      if (ev === "PlayerTravelled" && pkt.body?.player?.position) {
        p.x = Number(pkt.body.player.position.x || 0);
        p.y = Number(pkt.body.player.position.y || 64);
        p.z = Number(pkt.body.player.position.z || 0);
        p.yaw = Number(pkt.body.player.yRot || 0);
        broadcast(room);
      } else if (ev === "PlayerMessage" && String(pkt.body?.message || "").trim().toLowerCase().startsWith("!vc")) {
        const reply = applyCommand(room, p, pkt.body.message);
        sendBedrockCmd(ws, 'tellraw @s {"rawtext":[{"text":"§a[VoiceCraft]§f ' + reply + '"}]}');
        broadcast(room);
      }
    } catch {}
  });

  ws.on("close", () => {
    bedrockLinks.delete(ws);
    const p = room.players.get(id);
    if (p) { p.bedrockLinked = false; broadcast(room); }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("VoiceCraft External Bridge listening on port " + PORT);
});
