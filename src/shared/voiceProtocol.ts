export type VoiceScope = 'proximity' | 'server' | 'realm' | 'private';
export type DimensionId = 'overworld' | 'nether' | 'the_end';
export type HudCorner = 'top-left' | 'top-right' | 'bottom-left';
export type PacketSource = 'browser' | 'wsserver' | 'script-net';
export type BridgeTarget = 'external';

export interface PlayerVoiceState {
  id: string;
  gamertag: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  dimension: DimensionId;
  scope: VoiceScope;
  privateChannel: string;
  range: number;
  muted: boolean;
  deafened: boolean;
  speakingDisabled: boolean;
  mutedPlayers: string[];
  speaking: boolean;
  volume: number;
  bedrockLinked: boolean;
  packetSource: PacketSource;
  lastSeen: number;
}

export interface PacketEventEntry {
  id: string;
  timestamp: number;
  source: PacketSource;
  gamertag: string;
  summary: string;
}

export interface RoomPublicState {
  code: string;
  scope: VoiceScope;
  hostGamertag: string;
  hasPin: boolean;
  maxRange: number;
  hudCorner: HudCorner;
  hudVisible: boolean;
  players: PlayerVoiceState[];
  recentEvents: PacketEventEntry[];
}

export interface SpatialAudioResult {
  audible: boolean;
  gain: number;
  pan: number;
  distance: number;
  reason:
    | 'audible'
    | 'muted'
    | 'deafened'
    | 'peer_muted_by_listener'
    | 'different_dimension'
    | 'out_of_range'
    | 'different_private_channel'
    | 'scope_mismatch';
}

export interface ParsedBedrockCommand {
  valid: boolean;
  action:
    | 'mute'
    | 'unmute'
    | 'toggle_mic'
    | 'deafen'
    | 'undeafen'
    | 'toggle_voices'
    | 'speak_on'
    | 'speak_off'
    | 'toggle_speak'
    | 'mute_player'
    | 'unmute_player'
    | 'mode'
    | 'private'
    | 'range'
    | 'hud'
    | 'join'
    | 'menu'
    | 'help'
    | 'unknown';
  targetPlayer?: string;
  scope?: VoiceScope;
  channel?: string;
  pin?: string;
  range?: number;
  hudVisible?: boolean;
  hudCorner?: HudCorner;
  roomCode?: string;
  error?: string;
}

export interface HudOverlayLine {
  gamertag: string;
  speaking: boolean;
  muted: boolean;
  deafened: boolean;
  distanceBlocks: number | null;
  gainPercent: number;
  scope: VoiceScope;
}

export interface InGameHudPayload {
  roomCode: string;
  scope: VoiceScope;
  scopeLabel: string;
  privateChannel: string;
  range: number;
  hudCorner: HudCorner;
  hudVisible: boolean;
  selfMuted: boolean;
  selfDeafened: boolean;
  selfSpeakingDisabled: boolean;
  selfSpeaking: boolean;
  bedrockLinked: boolean;
  activeSpeakersCount: number;
  speakers: HudOverlayLine[];
  actionBarText: string;
}

export interface AddonConfig {
  packName: string;
  bridgeTarget: BridgeTarget;
  externalServerUrl: string;
  roomCode: string;
  enableServerNetPackets: boolean;
  includeHudButtons: boolean;
  includePauseButton: boolean;
  giveHotbarToggles: boolean;
  defaultScope: VoiceScope;
  defaultRange: number;
  hudCorner: HudCorner;
  syncIntervalTicks: number;
}

export interface GeneratedFileEntry {
  path: string;
  language: 'json' | 'javascript' | 'text' | 'html' | 'shell' | 'yaml' | 'markdown';
  description: string;
  content: string;
}

const VALID_SCOPES: VoiceScope[] = ['proximity', 'server', 'realm', 'private'];
const VALID_DIMENSIONS: DimensionId[] = ['overworld', 'nether', 'the_end'];

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 12);
}

export function normalizeGamertag(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 20);
}

export function normalizeDimension(raw: string | undefined): DimensionId {
  const lower = (raw ?? 'overworld').toLowerCase().replace('minecraft:', '');
  if (lower === 'nether' || lower === 'the_nether') return 'nether';
  if (lower === 'the_end' || lower === 'end') return 'the_end';
  return VALID_DIMENSIONS.includes(lower as DimensionId) ? (lower as DimensionId) : 'overworld';
}

export function clampRange(range: number): number {
  if (!Number.isFinite(range)) return 48;
  return Math.min(128, Math.max(8, Math.round(range)));
}

export function sanitizeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'https://voicecraft-bridge.onrender.com';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'https://voicecraft-bridge.onrender.com';
    }
    return parsed.origin;
  } catch {
    return 'https://voicecraft-bridge.onrender.com';
  }
}

export function toWebSocketUrl(httpOrigin: string): string {
  const safe = sanitizeHttpUrl(httpOrigin);
  if (safe.startsWith('https://')) {
    return `wss://${safe.slice('https://'.length)}`;
  }
  return `ws://${safe.slice('http://'.length)}`;
}

export function resolveBridgeOrigin(config: Pick<AddonConfig, 'externalServerUrl'>): string {
  return sanitizeHttpUrl(config.externalServerUrl);
}

export function formatScopeLabel(scope: VoiceScope, privateChannel?: string): string {
  switch (scope) {
    case 'proximity':
      return 'World Proximity';
    case 'server':
      return 'Server Global';
    case 'realm':
      return 'Realm Party';
    case 'private':
      return privateChannel ? `Private · ${privateChannel}` : 'Private Channel';
  }
}

export function computeSpatialAudio(
  listener: Pick<
    PlayerVoiceState,
    'x' | 'y' | 'z' | 'yaw' | 'dimension' | 'scope' | 'privateChannel' | 'range' | 'deafened' | 'mutedPlayers'
  >,
  speaker: Pick<
    PlayerVoiceState,
    'gamertag' | 'x' | 'y' | 'z' | 'dimension' | 'scope' | 'privateChannel' | 'range' | 'muted' | 'speakingDisabled' | 'volume'
  >,
  roomMaxRange = 48
): SpatialAudioResult {
  const dx = speaker.x - listener.x;
  const dy = speaker.y - listener.y;
  const dz = speaker.z - listener.z;
  const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 10) / 10;

  if (listener.deafened) {
    return { audible: false, gain: 0, pan: 0, distance, reason: 'deafened' };
  }
  if (
    listener.mutedPlayers?.some((name) => name.toLowerCase() === speaker.gamertag.toLowerCase())
  ) {
    return { audible: false, gain: 0, pan: 0, distance, reason: 'peer_muted_by_listener' };
  }
  if (speaker.muted || speaker.speakingDisabled) {
    return { audible: false, gain: 0, pan: 0, distance, reason: 'muted' };
  }

  const userVolumeScale = Math.min(1, Math.max(0, (speaker.volume ?? 100) / 100));

  if (listener.scope === 'private' || speaker.scope === 'private') {
    const listenerChan = (listener.privateChannel || 'squad').toLowerCase();
    const speakerChan = (speaker.privateChannel || 'squad').toLowerCase();
    if (listener.scope === 'private' && speaker.scope === 'private' && listenerChan === speakerChan) {
      return {
        audible: userVolumeScale > 0,
        gain: Number(userVolumeScale.toFixed(3)),
        pan: 0,
        distance,
        reason: 'audible',
      };
    }
    return { audible: false, gain: 0, pan: 0, distance, reason: 'different_private_channel' };
  }

  if (
    listener.scope === 'server' ||
    speaker.scope === 'server' ||
    listener.scope === 'realm' ||
    speaker.scope === 'realm'
  ) {
    if (listener.scope === speaker.scope) {
      return {
        audible: userVolumeScale > 0,
        gain: Number(userVolumeScale.toFixed(3)),
        pan: 0,
        distance,
        reason: 'audible',
      };
    }
    return { audible: false, gain: 0, pan: 0, distance, reason: 'scope_mismatch' };
  }

  if (listener.dimension !== speaker.dimension) {
    return { audible: false, gain: 0, pan: 0, distance, reason: 'different_dimension' };
  }

  const effectiveRange = clampRange(Math.min(roomMaxRange, Math.max(listener.range, speaker.range)));
  if (distance > effectiveRange) {
    return { audible: false, gain: 0, pan: 0, distance, reason: 'out_of_range' };
  }

  const normalized = distance / effectiveRange;
  const attenuation = Math.max(0, 1 - Math.pow(normalized, 1.35));
  const gain = Number((attenuation * userVolumeScale).toFixed(3));

  let pan = 0;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  if (horizontalDist > 0.25) {
    const yawRad = (listener.yaw * Math.PI) / 180;
    const rightX = -Math.cos(yawRad);
    const rightZ = -Math.sin(yawRad);
    const dirX = dx / horizontalDist;
    const dirZ = dz / horizontalDist;
    pan = Number(Math.max(-1, Math.min(1, dirX * rightX + dirZ * rightZ)).toFixed(3));
  }

  return {
    audible: gain > 0.01,
    gain,
    pan,
    distance,
    reason: gain > 0.01 ? 'audible' : 'out_of_range',
  };
}

export function parseBedrockCommand(rawMessage: string): ParsedBedrockCommand {
  const trimmed = rawMessage.trim();
  let body = '';

  if (trimmed.toLowerCase().startsWith('!vc')) {
    body = trimmed.slice(3).trim();
  } else if (trimmed.toLowerCase().startsWith('/scriptevent vc:')) {
    body = trimmed.slice('/scriptevent vc:'.length).trim();
  } else if (trimmed.toLowerCase().startsWith('vc:')) {
    body = trimmed.slice(3).trim();
  } else {
    return { valid: false, action: 'unknown', error: 'Commands must start with !vc or vc:' };
  }

  if (!body || body.toLowerCase() === 'menu') {
    return { valid: true, action: 'menu' };
  }

  const parts = body.split(/\s+/);
  const sub = parts[0].toLowerCase();
  const arg1 = parts[1];
  const arg2 = parts[2];

  switch (sub) {
    case 'mute':
      if (arg1) {
        return { valid: true, action: 'mute_player', targetPlayer: normalizeGamertag(arg1) };
      }
      return { valid: true, action: 'mute' };
    case 'unmute':
      if (arg1) {
        return { valid: true, action: 'unmute_player', targetPlayer: normalizeGamertag(arg1) };
      }
      return { valid: true, action: 'unmute' };
    case 'toggle_mic':
    case 'mic':
      return { valid: true, action: 'toggle_mic' };
    case 'deafen':
    case 'voices_off':
      return { valid: true, action: 'deafen' };
    case 'undeafen':
    case 'voices_on':
      return { valid: true, action: 'undeafen' };
    case 'toggle_voices':
    case 'voices':
      return { valid: true, action: 'toggle_voices' };
    case 'speak_off':
      return { valid: true, action: 'speak_off' };
    case 'speak_on':
      return { valid: true, action: 'speak_on' };
    case 'toggle_speak':
    case 'speak':
      return { valid: true, action: 'toggle_speak' };
    case 'help':
      return { valid: true, action: 'help' };
    case 'mode':
    case 'channel': {
      const candidate = (arg1 ?? '').toLowerCase() as VoiceScope;
      if (!VALID_SCOPES.includes(candidate)) {
        return {
          valid: false,
          action: 'mode',
          error: 'Mode must be proximity, server, realm, or private.',
        };
      }
      return {
        valid: true,
        action: 'mode',
        scope: candidate,
        channel: candidate === 'private' ? (arg2 ? normalizeRoomCode(arg2).toLowerCase() : 'squad') : undefined,
      };
    }
    case 'private': {
      const channelName = arg1 ? arg1.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16) : 'squad';
      return {
        valid: true,
        action: 'private',
        scope: 'private',
        channel: channelName || 'squad',
        pin: arg2 ? arg2.slice(0, 12) : undefined,
      };
    }
    case 'range': {
      const parsed = Number(arg1);
      if (!Number.isFinite(parsed) || parsed < 8 || parsed > 128) {
        return {
          valid: false,
          action: 'range',
          error: 'Range must be a number between 8 and 128 blocks.',
        };
      }
      return { valid: true, action: 'range', range: Math.round(parsed) };
    }
    case 'hud': {
      const option = (arg1 ?? 'show').toLowerCase();
      if (option === 'show' || option === 'on') {
        return { valid: true, action: 'hud', hudVisible: true };
      }
      if (option === 'hide' || option === 'off') {
        return { valid: true, action: 'hud', hudVisible: false };
      }
      if (option === 'top-left' || option === 'top-right' || option === 'bottom-left') {
        return { valid: true, action: 'hud', hudVisible: true, hudCorner: option };
      }
      return {
        valid: false,
        action: 'hud',
        error: 'HUD option must be show, hide, top-left, top-right, or bottom-left.',
      };
    }
    case 'join': {
      const code = normalizeRoomCode(arg1 ?? '');
      if (!code || code.length < 3) {
        return { valid: false, action: 'join', error: 'Provide a room code (at least 3 characters).' };
      }
      return { valid: true, action: 'join', roomCode: code };
    }
    default:
      return {
        valid: false,
        action: 'unknown',
        error: `Unknown voice command "${sub}". Try !vc help.`,
      };
  }
}

export function buildInGameHudPayload(room: RoomPublicState, viewerGamertag?: string): InGameHudPayload {
  const viewer =
    room.players.find(
      (p) => viewerGamertag && p.gamertag.toLowerCase() === viewerGamertag.toLowerCase()
    ) ?? room.players[0];

  const activeScope = viewer?.scope ?? room.scope;
  const activePrivateChannel = viewer?.privateChannel ?? 'squad';
  const effectiveRange = viewer?.range ?? room.maxRange;

  const lines: HudOverlayLine[] = room.players
    .map((player) => {
      const effectiveMuted = player.muted || player.speakingDisabled;
      if (!viewer || player.id === viewer.id) {
        return {
          gamertag: player.gamertag,
          speaking: player.speaking && !effectiveMuted,
          muted: effectiveMuted,
          deafened: player.deafened,
          distanceBlocks: activeScope === 'proximity' ? 0 : null,
          gainPercent: effectiveMuted ? 0 : 100,
          scope: player.scope,
        };
      }
      const spatial = computeSpatialAudio(viewer, player, room.maxRange);
      return {
        gamertag: player.gamertag,
        speaking: player.speaking && spatial.audible,
        muted: effectiveMuted,
        deafened: player.deafened,
        distanceBlocks: activeScope === 'proximity' ? Math.round(spatial.distance) : null,
        gainPercent: Math.round(spatial.gain * 100),
        scope: player.scope,
      };
    })
    .sort((a, b) => {
      if (a.speaking !== b.speaking) return a.speaking ? -1 : 1;
      return a.gamertag.localeCompare(b.gamertag);
    });

  const activeSpeakers = lines.filter((l) => l.speaking);
  const micBadge = viewer?.deafened
    ? '[VOICES OFF]'
    : viewer?.muted
      ? '[MIC OFF]'
      : viewer?.speakingDisabled
        ? '[SPEAK OFF]'
        : viewer?.speaking
          ? '[TX]'
          : '[MIC ON]';
  const scopeLabel = formatScopeLabel(activeScope, activePrivateChannel);
  const speakerSummary =
    activeSpeakers.length > 0
      ? `Speaking: ${activeSpeakers.map((s) => s.gamertag).slice(0, 3).join(', ')}`
      : `${room.players.length} in-game`;

  const actionBarText = `${micBadge} ${scopeLabel} (${effectiveRange}b) | ${speakerSummary}`;

  return {
    roomCode: room.code,
    scope: activeScope,
    scopeLabel,
    privateChannel: activePrivateChannel,
    range: effectiveRange,
    hudCorner: room.hudCorner,
    hudVisible: room.hudVisible,
    selfMuted: viewer?.muted ?? false,
    selfDeafened: viewer?.deafened ?? false,
    selfSpeakingDisabled: viewer?.speakingDisabled ?? false,
    selfSpeaking: (viewer?.speaking && !viewer?.muted && !viewer?.speakingDisabled) ?? false,
    bedrockLinked: viewer?.bedrockLinked ?? false,
    activeSpeakersCount: activeSpeakers.length,
    speakers: lines,
    actionBarText,
  };
}

export function generateAddonFiles(config: AddonConfig): GeneratedFileEntry[] {
  const safeName = config.packName.trim().slice(0, 40) || 'VoiceCraft';
  const safeHttpUrl = resolveBridgeOrigin(config);
  const safeWsUrl = `${toWebSocketUrl(safeHttpUrl)}/ws/bedrock`;
  const safeRoom = normalizeRoomCode(config.roomCode) || 'CRAFT1';
  const safeRange = clampRange(config.defaultRange);
  const safeInterval = Math.min(40, Math.max(4, Math.round(config.syncIntervalTicks || 10)));

  const bpDependencies: Array<{ module_name?: string; uuid?: string; version: string | number[] }> = [
    { module_name: '@minecraft/server', version: '1.14.0' },
    { module_name: '@minecraft/server-ui', version: '1.3.0' },
  ];

  if (config.enableServerNetPackets) {
    bpDependencies.push({ module_name: '@minecraft/server-net', version: '1.0.0-beta' });
  }

  bpDependencies.push({
    uuid: '7f41b9e2-4a62-4e8d-91ab-8c04d13e2001',
    version: [1, 2, 0],
  });

  const bpManifest = {
    format_version: 2,
    header: {
      name: `${safeName} Behavior`,
      description: `In-game Voice Chat controls, Emote-adjacent HUD drawer & WebSockets bridge synced to ${safeHttpUrl}`,
      uuid: '7f41b9e2-4a62-4e8d-91ab-8c04d13e1001',
      version: [1, 2, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [
      {
        description: 'VoiceCraft In-Game Voice Controller',
        type: 'script',
        language: 'javascript',
        uuid: '7f41b9e2-4a62-4e8d-91ab-8c04d13e1002',
        entry: 'scripts/main.js',
        version: [1, 2, 0],
      },
    ],
    dependencies: bpDependencies,
  };

  const rpManifest = {
    format_version: 2,
    header: {
      name: `${safeName} Minecraft UI`,
      description: 'Minecraft-styled HUD button next to Emote, Mic/Voices/Speak toggles & Pause button.',
      uuid: '7f41b9e2-4a62-4e8d-91ab-8c04d13e2001',
      version: [1, 2, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [
      {
        type: 'resources',
        uuid: '7f41b9e2-4a62-4e8d-91ab-8c04d13e2002',
        version: [1, 2, 0],
      },
    ],
  };

  const hudAnchorMap: Record<HudCorner, { anchor_from: string; anchor_to: string; offset: [number, number] }> = {
    'top-left': { anchor_from: 'top_left', anchor_to: 'top_left', offset: [6, 6] },
    'top-right': { anchor_from: 'top_right', anchor_to: 'top_right', offset: [-6, 6] },
    'bottom-left': { anchor_from: 'bottom_left', anchor_to: 'bottom_left', offset: [6, -46] },
  };
  const anchor = hudAnchorMap[config.hudCorner] || hudAnchorMap['top-left'];

  // Minecraft Bedrock JSON UI (hud_screen.json):
  // Places the VoiceCraft HUD button right next to Minecraft's Emote button in the top HUD bar,
  // matching the exact borderless dark-bevel button dimensions [18, 18], and toggles an all-in-one
  // Minecraft-UI drawer containing Mic ON/OFF, People's Voices ON/OFF, Speaking ON/OFF, and Channel info.
  const hudScreenJson = {
    namespace: 'hud',
    voicecraft_top_btn_base: {
      type: 'button',
      size: [18, 18],
      default_control: 'default',
      hover_control: 'hover',
      pressed_control: 'pressed',
      sound_name: 'random.click',
      sound_volume: 0.7,
    },
    'voicecraft_emote_adjacent_btn@hud.voicecraft_top_btn_base': {
      $pressed_button_name: 'button.voicecraft_toggle_drawer',
      controls: [
        {
          default: {
            type: 'image',
            texture: 'textures/ui/button_borderless_dark',
            size: [18, 18],
            controls: [
              {
                icon: {
                  type: 'image',
                  texture: 'textures/voicecraft/mic_on',
                  size: [12, 12],
                },
              },
            ],
          },
        },
        {
          hover: {
            type: 'image',
            texture: 'textures/ui/button_borderless_light',
            size: [18, 18],
            controls: [
              {
                icon: {
                  type: 'image',
                  texture: 'textures/voicecraft/mic_on',
                  size: [12, 12],
                },
              },
            ],
          },
        },
        {
          pressed: {
            type: 'image',
            texture: 'textures/ui/button_borderless_darkpressed',
            size: [18, 18],
            controls: [
              {
                icon: {
                  type: 'image',
                  texture: 'textures/voicecraft/mic_off',
                  size: [12, 12],
                },
              },
            ],
          },
        },
      ],
    },
    'voicecraft_drawer_row_btn@common_buttons.dark_text_button': {
      size: ['100%', 20],
    },
    'voicecraft_mic_toggle_btn@hud.voicecraft_drawer_row_btn': {
      $pressed_button_name: 'button.voicecraft_mic_toggle',
      $button_text: 'Mic: ON / OFF',
    },
    'voicecraft_voices_toggle_btn@hud.voicecraft_drawer_row_btn': {
      $pressed_button_name: 'button.voicecraft_voices_toggle',
      $button_text: "People's Voices: ON / OFF",
    },
    'voicecraft_speak_toggle_btn@hud.voicecraft_drawer_row_btn': {
      $pressed_button_name: 'button.voicecraft_speak_toggle',
      $button_text: 'Speaking: ON / OFF',
    },
    'voicecraft_open_menu_btn@hud.voicecraft_drawer_row_btn': {
      $pressed_button_name: 'button.chat',
      $button_text: 'Open !vc Menu / Channels',
    },
    voicecraft_hud_drawer: {
      type: 'stack_panel',
      orientation: 'vertical',
      size: [148, '100%c'],
      anchor_from: anchor.anchor_from,
      anchor_to: anchor.anchor_to,
      offset: [anchor.offset[0], anchor.offset[1] + 22],
      layer: 14,
      controls: [
        {
          header_panel: {
            type: 'panel',
            size: [148, 22],
            controls: [
              {
                bg: {
                  type: 'image',
                  texture: 'textures/ui/dialog_background_opaque',
                  alpha: 0.84,
                  size: ['100%', '100%'],
                },
              },
              {
                title_label: {
                  type: 'label',
                  text: `VOICECRAFT · ${safeRoom}`,
                  color: [0.39, 0.83, 0.27],
                  font_scale_factor: 0.78,
                  offset: [6, 3],
                  anchor_from: 'top_left',
                  anchor_to: 'top_left',
                },
              },
              {
                hint_label: {
                  type: 'label',
                  text: 'Chat: !vc menu | !vc setup',
                  color: [0.82, 0.85, 0.9],
                  font_scale_factor: 0.62,
                  offset: [6, 12],
                  anchor_from: 'top_left',
                  anchor_to: 'top_left',
                },
              },
            ],
          },
        },
        ...(config.includeHudButtons
          ? [
              {
                controls_panel: {
                  type: 'panel',
                  size: [148, 86],
                  controls: [
                    {
                      bg: {
                        type: 'image',
                        texture: 'textures/ui/dialog_background_opaque',
                        alpha: 0.78,
                        size: ['100%', '100%'],
                      },
                    },
                    {
                      stack: {
                        type: 'stack_panel',
                        orientation: 'vertical',
                        size: [140, 82],
                        offset: [0, 2],
                        controls: [
                          { 'mic_btn@hud.voicecraft_mic_toggle_btn': {} },
                          { sp1: { type: 'panel', size: ['100%', 2] } },
                          { 'voices_btn@hud.voicecraft_voices_toggle_btn': {} },
                          { sp2: { type: 'panel', size: ['100%', 2] } },
                          { 'speak_btn@hud.voicecraft_speak_toggle_btn': {} },
                          { sp3: { type: 'panel', size: ['100%', 2] } },
                          { 'menu_btn@hud.voicecraft_open_menu_btn': {} },
                        ],
                      },
                    },
                  ],
                },
              },
            ]
          : []),
      ],
    },
    'emote_button@hud.hud_action_button': {},
    chat_stack: {
      modifications: [
        {
          array_name: 'controls',
          operation: 'insert_after',
          where: {
            emote_button: {},
          },
          value: [
            {
              'voicecraft_voice_hud_btn@hud.voicecraft_emote_adjacent_btn': {},
            },
          ],
        },
      ],
    },
    root_panel: {
      modifications: [
        {
          array_name: 'controls',
          operation: 'insert_front',
          value: [
            {
              'voicecraft_voice_hud_btn_fallback@hud.voicecraft_emote_adjacent_btn': {
                anchor_from: anchor.anchor_from,
                anchor_to: anchor.anchor_to,
                offset: anchor.offset,
              },
            },
            {
              'voicecraft_voice_hud@hud.voicecraft_hud_drawer': {},
            },
          ],
        },
      ],
    },
  };

  // Separate Pause Screen button matching Minecraft's native pause menu button style
  const pauseScreenJson = {
    namespace: 'pause',
    'voicecraft_pause_voice_btn@common_buttons.light_text_button': {
      $pressed_button_name: 'button.menu_open_uri',
      $button_text: 'VoiceCraft Voice Bridge',
      size: ['100%', 26],
      property_bag: {
        '#hyperlink': `${safeHttpUrl}/?room=${safeRoom}`,
      },
    },
    pause_menu_buttons: {
      modifications: config.includePauseButton
        ? [
            {
              array_name: 'controls',
              operation: 'insert_back',
              value: [
                {
                  voicecraft_spacer: {
                    type: 'panel',
                    size: ['100%', 4],
                  },
                },
                {
                  'voicecraft_voice_pause_button@pause.voicecraft_pause_voice_btn': {},
                },
              ],
            },
          ]
        : [],
    },
  };

  const uiDefs = {
    ui_defs: config.includePauseButton
      ? ['ui/hud_screen.json', 'ui/pause_screen.json']
      : ['ui/hud_screen.json'],
  };

  const itemTextureJson = {
    resource_pack_name: safeName,
    texture_name: 'atlas.items',
    texture_data: {
      voicecraft_mic_btn: { textures: 'textures/voicecraft/mic_on' },
      voicecraft_voices_btn: { textures: 'textures/voicecraft/voices_on' },
      voicecraft_radio_btn: { textures: 'textures/voicecraft/speak_on' },
    },
  };

  const langText = [
    `pack.name=${safeName}`,
    `pack.description=In-game Voice Chat HUD button next to Emote & WebSockets bridge (${safeRoom})`,
    `item.voicecraft:mic_toggle.name=Mic ON/OFF Toggle`,
    `item.voicecraft:voices_toggle.name=People's Voices ON/OFF`,
    `item.voicecraft:voice_menu.name=Voice Radio Menu`,
    `voicecraft.hud.title=VoiceCraft Voice Chat`,
  ].join('\n');

  const makeItemJson = (id: string, icon: string) =>
    JSON.stringify(
      {
        format_version: '1.21.10',
        'minecraft:item': {
          description: {
            identifier: id,
            menu_category: { category: 'equipment' },
          },
          components: {
            'minecraft:max_stack_size': 1,
            'minecraft:icon': icon,
            'minecraft:hand_equipped': false,
          },
        },
      },
      null,
      2
    );

  const mainScript = `import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
${
  config.enableServerNetPackets
    ? 'import { http, HttpRequest, HttpHeader, HttpRequestMethod } from "@minecraft/server-net";'
    : '// Universal mode: works on Realms, Worlds, and Servers via /wsserver + Script UI'
}

const CONFIG = {
  serverUrl: "${safeHttpUrl}",
  wsUrl: "${safeWsUrl}",
  roomCode: "${safeRoom}",
  defaultScope: "${config.defaultScope}",
  defaultRange: ${safeRange},
  syncIntervalTicks: ${safeInterval},
  useServerNet: ${config.enableServerNetPackets ? 'true' : 'false'},
  giveHotbarToggles: ${config.giveHotbarToggles ? 'true' : 'false'}
};

const playerVoiceState = new Map();
let lastServerHudSummary = "";

function getState(player) {
  let state = playerVoiceState.get(player.id);
  if (!state) {
    state = {
      scope: CONFIG.defaultScope,
      privateChannel: "squad",
      range: CONFIG.defaultRange,
      muted: false,
      deafened: false,
      speakingDisabled: false,
      mutedPlayers: [],
      hudVisible: true
    };
    playerVoiceState.set(player.id, state);
  }
  return state;
}

function formatScope(state) {
  if (state.scope === "private") return "§dPrivate:" + state.privateChannel;
  if (state.scope === "server") return "§bServer Global";
  if (state.scope === "realm") return "§6Realm Party";
  return "§aProximity (" + state.range + "b)";
}

function renderActionBar(player) {
  const state = getState(player);
  if (!state.hudVisible) return;
  const mic = state.muted ? "§c[MIC OFF]" : "§a[MIC ON]";
  const ear = state.deafened ? "§c[VOICES OFF]" : "§b[VOICES ON]";
  const spk = state.speakingDisabled ? "§e[SPEAK OFF]" : "§a[TX]";
  const extra = lastServerHudSummary ? " §7| " + lastServerHudSummary : "";
  player.onScreenDisplay.setActionBar(mic + " " + ear + " " + spk + " §f" + formatScope(state) + extra);
}

function sendConnectChatHint(player) {
  const wsCommand = "/wsserver " + CONFIG.wsUrl + "?code=" + CONFIG.roomCode + "&tag=" + player.name;
  player.sendMessage("§a[VoiceCraft]§f Enable WebSockets to connect:");
  player.sendMessage("§e1.§f Open §lSettings -> Network Settings§r -> turn §aON \\"Enable WebSockets\\"§f.");
  player.sendMessage("§e2.§f Run in chat: §b" + wsCommand);
  player.sendMessage("§e3.§f Open §b" + CONFIG.serverUrl + "§f in the background for mic/audio, then control everything in-game via §a!vc menu§f or the HUD button next to Emote.");
}

async function showWebSocketsOnboarding(player) {
  const form = new ActionFormData()
    .title("§lVoiceCraft: Enable WebSockets")
    .body(
      "To let Minecraft send & receive voice chat packets:\\n\\n" +
      "§a1.§f Open §lSettings -> Network Settings§r and toggle §aEnable WebSockets ON§f.\\n" +
      "§a2.§f Copy & run the §b/wsserver§f command posted in chat.\\n" +
      "§a3.§f Keep §b" + CONFIG.serverUrl + "§f open in the background for audio.\\n\\n" +
      "Everything else (Mic ON/OFF, People's Voices, Speaking, Channels) is handled right here in-game!"
    )
    .button("§aGot It (Don't Show Again)")
    .button("§bOpen Voice Menu Now")
    .button("§7Remind Me Next Join");

  try {
    const res = await form.show(player);
    if (res.canceled) return;
    if (res.selection === 0) {
      player.setDynamicProperty("voicecraft:onboarded", true);
    } else if (res.selection === 1) {
      player.setDynamicProperty("voicecraft:onboarded", true);
      await openVoiceMenu(player);
    }
  } catch {
    // Player closed dialog or moved during spawn
  }
}

function giveToggleKit(player) {
  const inv = player.getComponent("minecraft:inventory");
  if (!inv || !inv.container) return;
  const items = ["voicecraft:mic_toggle", "voicecraft:voices_toggle", "voicecraft:voice_menu"];
  for (const id of items) {
    let found = false;
    for (let i = 0; i < inv.container.size; i++) {
      const slot = inv.container.getItem(i);
      if (slot && slot.typeId === id) {
        found = true;
        break;
      }
    }
    if (!found) {
      try {
        inv.container.addItem(new ItemStack(id, 1));
      } catch {}
    }
  }
}

async function openMutePlayersMenu(player) {
  const state = getState(player);
  const others = world.getAllPlayers().filter((p) => p.id !== player.id);
  if (others.length === 0) {
    player.sendMessage("§e[VoiceCraft]§f No other players in this world to mute.");
    return;
  }
  const form = new ActionFormData()
    .title("§lMute Individual Players")
    .body("Tap a player to turn their voice ON or OFF for you:");
  for (const other of others) {
    const isMuted = state.mutedPlayers.includes(other.name);
    form.button((isMuted ? "§c[OFF] " : "§a[ON] ") + other.name);
  }
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const target = others[res.selection];
  if (!target) return;
  const idx = state.mutedPlayers.indexOf(target.name);
  if (idx >= 0) {
    state.mutedPlayers.splice(idx, 1);
    player.sendMessage("§a[VoiceCraft]§f Voice ON for §f" + target.name);
  } else {
    state.mutedPlayers.push(target.name);
    player.sendMessage("§c[VoiceCraft]§f Voice OFF for §f" + target.name);
  }
  await pushSinglePlayerPacket(player, "mute_player");
}

async function openVoiceMenu(player) {
  const state = getState(player);
  const menu = new ActionFormData()
    .title("§lVoiceCraft In-Game Voice")
    .body(
      "Bridge: §b" + CONFIG.roomCode +
      "\\nChannel: " + formatScope(state) +
      "\\nMic: " + (state.muted ? "§cOFF" : "§aON") +
      " §7| §fVoices: " + (state.deafened ? "§cOFF" : "§aON") +
      " §7| §fSpeak: " + (state.speakingDisabled ? "§eOFF" : "§aON")
    )
    .button(state.muted ? "§aTurn Microphone ON" : "§cTurn Microphone OFF")
    .button(state.deafened ? "§aTurn People's Voices ON" : "§cTurn People's Voices OFF")
    .button(state.speakingDisabled ? "§aTurn Speaking ON" : "§eTurn Speaking OFF")
    .button("§fMute / Unmute Specific Player")
    .button("§aChannel: World Proximity")
    .button("§bChannel: Server Global")
    .button("§6Channel: Realm Party")
    .button("§dJoin Private Squad Channel")
    .button("§fProximity Hearing Range (" + state.range + "b)")
    .button(state.hudVisible ? "§7Hide HUD Overlay" : "§aShow HUD Overlay")
    .button("§eWebSockets Setup Guide");

  const res = await menu.show(player);
  if (res.canceled) return;

  if (res.selection === 0) state.muted = !state.muted;
  else if (res.selection === 1) state.deafened = !state.deafened;
  else if (res.selection === 2) state.speakingDisabled = !state.speakingDisabled;
  else if (res.selection === 3) {
    await openMutePlayersMenu(player);
    return;
  }
  else if (res.selection === 4) state.scope = "proximity";
  else if (res.selection === 5) state.scope = "server";
  else if (res.selection === 6) state.scope = "realm";
  else if (res.selection === 7) {
    const modal = new ModalFormData()
      .title("Private Voice Channel")
      .textField("Private Channel Name", "squad", { defaultValue: state.privateChannel });
    const mRes = await modal.show(player);
    if (!mRes.canceled && mRes.formValues && mRes.formValues[0]) {
      state.scope = "private";
      state.privateChannel = String(mRes.formValues[0]).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "squad";
    }
  } else if (res.selection === 8) {
    const modal = new ModalFormData()
      .title("Proximity Hearing Range")
      .slider("Blocks Radius", 8, 128, { valueStep: 4, defaultValue: state.range });
    const mRes = await modal.show(player);
    if (!mRes.canceled && mRes.formValues) {
      state.range = Number(mRes.formValues[0]) || CONFIG.defaultRange;
    }
  } else if (res.selection === 9) {
    state.hudVisible = !state.hudVisible;
  } else if (res.selection === 10) {
    sendConnectChatHint(player);
    await showWebSocketsOnboarding(player);
    return;
  }

  renderActionBar(player);
  await pushSinglePlayerPacket(player, "ui_change");
}

async function pushSinglePlayerPacket(player, reason) {
  const state = getState(player);
  const loc = player.location;
  const rot = player.getRotation();
  const payload = {
    roomCode: CONFIG.roomCode,
    gamertag: player.name,
    x: Number(loc.x.toFixed(2)),
    y: Number(loc.y.toFixed(2)),
    z: Number(loc.z.toFixed(2)),
    yaw: Number(rot.y.toFixed(1)),
    dimension: player.dimension.id.replace("minecraft:", ""),
    scope: state.scope,
    privateChannel: state.privateChannel,
    range: state.range,
    muted: state.muted,
    deafened: state.deafened,
    speakingDisabled: state.speakingDisabled,
    mutedPlayers: state.mutedPlayers,
    reason
  };
${
  config.enableServerNetPackets
    ? `  try {
    const req = new HttpRequest(CONFIG.serverUrl + "/api/packets/ingest");
    req.method = HttpRequestMethod.Post;
    req.headers = [new HttpHeader("Content-Type", "application/json")];
    req.body = JSON.stringify(payload);
    const resp = await http.request(req);
    if (resp && resp.status === 200) {
      const parsed = JSON.parse(resp.body);
      if (parsed && parsed.hudSummary) {
        lastServerHudSummary = parsed.hudSummary;
      }
    }
  } catch (err) {
    // Bridge offline or server-net disabled
  }`
    : `  // Syncs via /wsserver ` + `${safeWsUrl}?code=${safeRoom}`
}
}

world.beforeEvents.chatSend.subscribe((event) => {
  const msg = event.message.trim();
  if (!msg.toLowerCase().startsWith("!vc")) return;
  event.cancel = true;

  const player = event.sender;
  const state = getState(player);
  const parts = msg.slice(3).trim().split(/\\s+/);
  const cmd = (parts[0] || "menu").toLowerCase();

  system.run(() => {
    if (cmd === "menu") {
      openVoiceMenu(player);
      return;
    }
    if (cmd === "setup") {
      sendConnectChatHint(player);
      showWebSocketsOnboarding(player);
      return;
    }
    if (cmd === "kit") {
      giveToggleKit(player);
      player.sendMessage("§a[VoiceCraft]§f Gave Mic, Voices, and Radio quick-toggle items.");
      return;
    }
    if (cmd === "mute" && parts[1]) {
      const t = parts[1];
      if (!state.mutedPlayers.includes(t)) state.mutedPlayers.push(t);
    } else if (cmd === "unmute" && parts[1]) {
      state.mutedPlayers = state.mutedPlayers.filter((n) => n.toLowerCase() !== parts[1].toLowerCase());
    } else if (cmd === "mute" || cmd === "mic_off") state.muted = true;
    else if (cmd === "unmute" || cmd === "mic_on") state.muted = false;
    else if (cmd === "mic" || cmd === "toggle_mic") state.muted = !state.muted;
    else if (cmd === "deafen" || cmd === "voices_off") state.deafened = true;
    else if (cmd === "undeafen" || cmd === "voices_on") state.deafened = false;
    else if (cmd === "voices" || cmd === "toggle_voices") state.deafened = !state.deafened;
    else if (cmd === "speak_off") state.speakingDisabled = true;
    else if (cmd === "speak_on") state.speakingDisabled = false;
    else if (cmd === "speak" || cmd === "toggle_speak") state.speakingDisabled = !state.speakingDisabled;
    else if (cmd === "mode" && parts[1]) {
      const m = parts[1].toLowerCase();
      if (["proximity", "server", "realm", "private"].includes(m)) state.scope = m;
    } else if (cmd === "private") {
      state.scope = "private";
      state.privateChannel = (parts[1] || "squad").slice(0, 16);
    } else if (cmd === "range" && parts[1]) {
      state.range = Math.min(128, Math.max(8, Math.round(Number(parts[1]) || 48)));
    } else if (cmd === "hud") {
      state.hudVisible = parts[1] !== "hide";
    } else if (cmd === "help") {
      sendConnectChatHint(player);
      player.sendMessage("§a[VoiceCraft Commands]§f !vc menu | setup | kit | mic | voices | speak | mute <player> | mode <proximity|server|realm|private> | range <8-128>");
      return;
    }
    renderActionBar(player);
    pushSinglePlayerPacket(player, "chat_cmd");
  });
});

world.afterEvents.itemUse.subscribe((event) => {
  const typeId = event.itemStack?.typeId;
  const player = event.source;
  const state = getState(player);
  if (typeId === "voicecraft:mic_toggle") {
    state.muted = !state.muted;
    player.sendMessage(state.muted ? "§c[VoiceCraft]§f Microphone OFF" : "§a[VoiceCraft]§f Microphone ON");
    renderActionBar(player);
    pushSinglePlayerPacket(player, "item_mic");
  } else if (typeId === "voicecraft:voices_toggle") {
    state.deafened = !state.deafened;
    player.sendMessage(state.deafened ? "§c[VoiceCraft]§f People's Voices OFF" : "§a[VoiceCraft]§f People's Voices ON");
    renderActionBar(player);
    pushSinglePlayerPacket(player, "item_voices");
  } else if (typeId === "voicecraft:voice_menu" || typeId === "minecraft:compass") {
    openVoiceMenu(player);
  }
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  if (CONFIG.giveHotbarToggles) {
    giveToggleKit(player);
  }
  system.runTimeout(() => {
    sendConnectChatHint(player);
    if (!player.getDynamicProperty("voicecraft:onboarded")) {
      showWebSocketsOnboarding(player);
    }
  }, 40);
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "vc:sync" && event.message) {
    lastServerHudSummary = event.message.slice(0, 64);
  } else if (event.id === "vc:open" && event.sourceEntity) {
    openVoiceMenu(event.sourceEntity);
  } else if (event.id === "vc:setup" && event.sourceEntity) {
    sendConnectChatHint(event.sourceEntity);
    showWebSocketsOnboarding(event.sourceEntity);
  } else if (event.id === "vc:toggle_mic" && event.sourceEntity) {
    const s = getState(event.sourceEntity);
    s.muted = !s.muted;
    renderActionBar(event.sourceEntity);
    pushSinglePlayerPacket(event.sourceEntity, "script_mic");
  } else if (event.id === "vc:toggle_voices" && event.sourceEntity) {
    const s = getState(event.sourceEntity);
    s.deafened = !s.deafened;
    renderActionBar(event.sourceEntity);
    pushSinglePlayerPacket(event.sourceEntity, "script_voices");
  } else if (event.id === "vc:toggle_speak" && event.sourceEntity) {
    const s = getState(event.sourceEntity);
    s.speakingDisabled = !s.speakingDisabled;
    renderActionBar(event.sourceEntity);
    pushSinglePlayerPacket(event.sourceEntity, "script_speak");
  }
});

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    renderActionBar(player);
    if (CONFIG.useServerNet) {
      pushSinglePlayerPacket(player, "tick");
    }
  }
}, CONFIG.syncIntervalTicks);
`;

  const readmeText = [
    `=== VoiceCraft In-Game Bedrock Voice Chat ===`,
    ``,
    `External Bridge Website: ${safeHttpUrl}`,
    `WebSocket Endpoint: ${safeWsUrl}?code=${safeRoom}&tag=YourGamertag`,
    ``,
    `IN-GAME CONTROLS (Everything Inside Minecraft):`,
    `- Top HUD Button right next to Emote opens the all-in-one Voice Drawer (Mic ON/OFF, People's Voices ON/OFF, Speaking ON/OFF, Channels)`,
    `- Pause Menu Button: VoiceCraft Voice Bridge`,
    `- 1-Tap Hotbar Buttons: Mic Toggle, Voices Toggle, and Voice Radio Menu`,
    `- Chat Commands: !vc menu | !vc setup | !vc mic | !vc voices | !vc speak | !vc mute <player> | !vc private <channel>`,
    ``,
    `ENABLE WEBSOCKETS IN MINECRAFT BEDROCK:`,
    `1. Open Settings -> Network Settings -> turn ON "Enable WebSockets"`,
    `2. Run in chat (shown automatically on first spawn): /wsserver ${safeWsUrl}?code=${safeRoom}&tag=YourGamertag`,
    `3. Keep ${safeHttpUrl} open in the background to transmit/receive audio.`,
  ].join('\n');

  return [
    {
      path: 'VoiceCraft_RP/ui/hud_screen.json',
      language: 'json',
      description: 'Emote-adjacent HUD button & all-in-one Voice Drawer (Mic, Voices, Speaking, Channels)',
      content: JSON.stringify(hudScreenJson, null, 2),
    },
    {
      path: 'VoiceCraft_RP/ui/pause_screen.json',
      language: 'json',
      description: 'Minecraft Pause Menu button matching native light_text_button UI',
      content: JSON.stringify(pauseScreenJson, null, 2),
    },
    {
      path: 'VoiceCraft_BP/scripts/main.js',
      language: 'javascript',
      description: 'In-game Voice Menu, one-time Enable WebSockets popup, !vc commands & packet sync',
      content: mainScript,
    },
    {
      path: 'VoiceCraft_BP/manifest.json',
      language: 'json',
      description: 'Behavior Pack manifest (@minecraft/server, @minecraft/server-ui, optional @minecraft/server-net)',
      content: JSON.stringify(bpManifest, null, 2),
    },
    {
      path: 'VoiceCraft_RP/manifest.json',
      language: 'json',
      description: 'Resource Pack manifest for Minecraft UI buttons & pixel textures',
      content: JSON.stringify(rpManifest, null, 2),
    },
    {
      path: 'VoiceCraft_RP/ui/_ui_defs.json',
      language: 'json',
      description: 'Registers HUD and Pause screen JSON UI files',
      content: JSON.stringify(uiDefs, null, 2),
    },
    {
      path: 'VoiceCraft_RP/textures/item_texture.json',
      language: 'json',
      description: 'Maps pixel-art button textures for Mic, Voices, and Radio items',
      content: JSON.stringify(itemTextureJson, null, 2),
    },
    {
      path: 'VoiceCraft_BP/items/mic_toggle.json',
      language: 'json',
      description: '1-tap hotbar Mic ON/OFF toggle item',
      content: makeItemJson('voicecraft:mic_toggle', 'voicecraft_mic_btn'),
    },
    {
      path: 'VoiceCraft_BP/items/voices_toggle.json',
      language: 'json',
      description: '1-tap hotbar People Voices ON/OFF toggle item',
      content: makeItemJson('voicecraft:voices_toggle', 'voicecraft_voices_btn'),
    },
    {
      path: 'VoiceCraft_BP/items/voice_menu.json',
      language: 'json',
      description: '1-tap hotbar Voice Radio Menu item',
      content: makeItemJson('voicecraft:voice_menu', 'voicecraft_radio_btn'),
    },
    {
      path: 'VoiceCraft_RP/texts/en_US.lang',
      language: 'text',
      description: 'Minecraft localization names for items and HUD labels',
      content: langText,
    },
    {
      path: 'README_INSTALL.txt',
      language: 'text',
      description: 'In-game setup instructions',
      content: readmeText,
    },
  ];
}

export function generateExternalRepoFiles(config: AddonConfig): GeneratedFileEntry[] {
  const safeRoom = normalizeRoomCode(config.roomCode) || 'CRAFT1';
  const safeExternalUrl = resolveBridgeOrigin(config);

  const pkgJson = {
    name: 'voicecraft',
    version: '1.0.0',
    private: true,
    type: 'module',
    engines: {
      node: '>=20',
    },
    scripts: {
      start: 'node server.mjs',
    },
    dependencies: {
      ws: '^8.18.0',
    },
  };

  const serverMjs = `import http from "node:http";
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
  return String(raw || "Player").trim().replace(/[^\\w\\s-]/g, "").replace(/\\s+/g, "_").slice(0, 20) || "Player";
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
  const parts = body.split(/\\s+/);
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
`;

  const clientHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VoiceCraft — External Voice Bridge</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Pixelify+Sans:wght@400;600;700&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin:0; background:#16181d; color:#f0f2f5; font-family:"Pixelify Sans", system-ui, sans-serif; }
    header { background:#1e2028; border-bottom:2px solid #0a0b0e; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; }
    .brand { font-family:"Silkscreen", monospace; font-size:20px; font-weight:700; color:#63d446; }
    .wrap { max-width:780px; margin:28px auto; padding:0 16px; }
    .panel { background:#252831; border:2px solid #0d0e12; box-shadow:inset 2px 2px 0 rgba(255,255,255,.1), inset -2px -2px 0 rgba(0,0,0,.45); padding:20px; }
    .slot { background:#14161b; border:2px solid #0a0b0e; padding:10px; font-family:"JetBrains Mono", monospace; font-size:12px; }
    h1 { font-family:"Silkscreen", monospace; font-size:20px; margin:0 0 6px; }
    p { color:#aeb5c4; font-size:14px; margin:0 0 14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; }
    label { display:block; font-size:13px; color:#d5dbe6; margin-bottom:4px; }
    input { width:100%; background:#14161b; color:#fff; border:2px solid #0a0b0e; padding:8px 10px; font-family:"JetBrains Mono", monospace; font-size:13px; }
    .row { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; padding:10px 16px; border:2px solid #0a0b0e; background:#3a3f4d; color:#fff; font-family:"Pixelify Sans", sans-serif; font-weight:600; cursor:pointer; text-decoration:none; }
    .btn-green { background:#469c31; }
    .status-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; margin-top:14px; }
  </style>
</head>
<body>
  <header>
    <span class="brand">VoiceCraft</span>
    <a class="btn btn-green" href="/download/VoiceCraft.mcaddon">Download .mcaddon</a>
  </header>
  <main class="wrap">
    <section class="panel">
      <h1>VoiceCraft External Bridge</h1>
      <p>Keep this tab minimized while playing Minecraft Bedrock. Mute, People's Voices, Speaking, and Channels are controlled inside the game.</p>
      <div class="grid">
        <div><label for="tag">Minecraft Gamertag</label><input id="tag" value="Steve_Bedrock" /></div>
        <div><label for="code">Room / Server Code</label><input id="code" value="${safeRoom}" /></div>
        <div><label for="pin">Private PIN (Optional)</label><input id="pin" type="password" placeholder="Open if blank" /></div>
      </div>
      <div class="row">
        <button id="go" class="btn btn-green" type="button">Connect Voice Bridge</button>
        <span id="status" class="slot">Status: Disconnected</span>
      </div>
      <div class="slot" style="margin-top:14px;color:#7ce861;word-break:break-all;" id="wscmd"></div>
      <div class="status-grid" id="synced" style="display:none;">
        <div class="slot"><div style="color:#8c94a6">Mic</div><div id="st-mic">ON</div></div>
        <div class="slot"><div style="color:#8c94a6">Voices</div><div id="st-voices">ON</div></div>
        <div class="slot"><div style="color:#8c94a6">Speaking</div><div id="st-speak">ON</div></div>
        <div class="slot"><div style="color:#8c94a6">Channel</div><div id="st-chan">Proximity</div></div>
      </div>
    </section>
  </main>
  <script>
    const tagEl = document.getElementById("tag");
    const codeEl = document.getElementById("code");
    const pinEl = document.getElementById("pin");
    const cmdEl = document.getElementById("wscmd");
    const statusEl = document.getElementById("status");
    const syncedEl = document.getElementById("synced");
    const updateCmd = () => {
      const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
      cmdEl.textContent = "/wsserver " + wsProto + "//" + location.host + "/ws/bedrock?code=" + (codeEl.value || "${safeRoom}").toUpperCase() + "&tag=" + (tagEl.value || "Steve_Bedrock");
    };
    tagEl.oninput = updateCmd;
    codeEl.oninput = updateCmd;
    updateCmd();

    document.getElementById("go").onclick = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(wsProto + "//" + location.host + "/ws/client");
      const peers = new Map();
      let selfId = null;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", gamertag: tagEl.value, roomCode: codeEl.value, pin: pinEl.value }));
      };
      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "error") { statusEl.textContent = "Error: " + msg.error; return; }
        if (msg.type === "joined") {
          selfId = msg.playerId;
          statusEl.textContent = "Status: Connected (" + msg.room.code + ")";
          syncedEl.style.display = "grid";
        }
        if (msg.type === "room-state" && selfId) {
          const me = msg.room.players.find((p) => p.id === selfId);
          if (me) {
            stream.getAudioTracks().forEach((t) => (t.enabled = !(me.muted || me.speakingDisabled)));
            document.getElementById("st-mic").textContent = me.muted ? "OFF" : "ON";
            document.getElementById("st-voices").textContent = me.deafened ? "OFF" : "ON";
            document.getElementById("st-speak").textContent = me.speakingDisabled ? "OFF" : "ON";
            document.getElementById("st-chan").textContent = me.scope;
          }
          for (const p of msg.room.players) {
            if (p.id !== selfId && !peers.has(p.id) && selfId < p.id) {
              const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
              peers.set(p.id, pc);
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));
              pc.onicecandidate = (e) => e.candidate && ws.send(JSON.stringify({ type: "rtc-signal", targetId: p.id, signal: { kind: "candidate", candidate: e.candidate } }));
              pc.ontrack = (e) => { const a = new Audio(); a.srcObject = e.streams[0]; a.autoplay = true; };
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: "rtc-signal", targetId: p.id, signal: { kind: "sdp", sdp: offer } }));
            }
          }
        }
        if (msg.type === "rtc-signal") {
          let pc = peers.get(msg.fromId);
          if (!pc) {
            pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            peers.set(msg.fromId, pc);
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            pc.onicecandidate = (e) => e.candidate && ws.send(JSON.stringify({ type: "rtc-signal", targetId: msg.fromId, signal: { kind: "candidate", candidate: e.candidate } }));
            pc.ontrack = (e) => { const a = new Audio(); a.srcObject = e.streams[0]; a.autoplay = true; };
          }
          if (msg.signal.kind === "sdp") {
            await pc.setRemoteDescription(msg.signal.sdp);
            if (msg.signal.sdp.type === "offer") {
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              ws.send(JSON.stringify({ type: "rtc-signal", targetId: msg.fromId, signal: { kind: "sdp", sdp: ans } }));
            }
          } else if (msg.signal.kind === "candidate") {
            await pc.addIceCandidate(msg.signal.candidate);
          }
        }
      };
    };
  </script>
</body>
</html>`;

  const renderYaml = `services:
  - type: web
    name: voicecraft-bridge
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /api/health
`;

  const dockerfile = `FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;

  const gitignore = `node_modules/
.env
`;

  const envExample = `PORT=3000
PACKET_BRIDGE_SECRET=
`;

  const readmeMd = `# VoiceCraft

In-game Minecraft Bedrock voice chat addon (\`.mcaddon\`) and external WebSocket + WebRTC voice bridge.

## Contents
- \`addon/VoiceCraft.mcaddon\` — Ready-to-import Minecraft Bedrock pack (Emote-adjacent HUD button, one-time Enable WebSockets popup, hotbar quick-toggles, \`!vc\` commands) pre-configured for \`${safeExternalUrl}\`.
- \`addon/VoiceCraft_BP/\` & \`addon/VoiceCraft_RP/\` — Unpacked Behavior & Resource pack source.
- \`server.mjs\` & \`public/index.html\` — Standalone Node.js WebSocket + WebRTC Voice Bridge website.

## Host Free Outside AI Studio (Render — No Credit Card)
1. Push all files in this folder to your **VoiceCraft** GitHub repository.
2. Open [Render](https://render.com) → **New +** → **Blueprint** (or **Web Service**) → connect your \`VoiceCraft\` GitHub repo.
3. Render reads \`render.yaml\` automatically and launches your live \`https://<your-service>.onrender.com\` bridge.
4. Players can download \`/download/VoiceCraft.mcaddon\` straight from your live site or from \`addon/\` in GitHub.

## Minecraft Bedrock Setup
1. Import \`VoiceCraft.mcaddon\` and enable both **VoiceCraft Behavior** and **VoiceCraft Minecraft UI** in your World/Server/Realm.
2. In Minecraft **Settings → Network Settings**, turn **ON** \`Enable WebSockets\`.
3. Run the \`/wsserver\` command shown in chat on spawn, keep your live external VoiceCraft website open in the background, and use the HUD button next to Emote or \`!vc menu\`.
`;

  return [
    {
      path: 'server.mjs',
      language: 'javascript',
      description: 'Standalone external Node.js WebSocket + Bedrock /wsserver + WebRTC bridge with keepalive',
      content: serverMjs,
    },
    {
      path: 'public/index.html',
      language: 'html',
      description: 'Pixelated VoiceCraft external background audio carrier page',
      content: clientHtml,
    },
    {
      path: 'package.json',
      language: 'json',
      description: 'Node.js runtime manifest for Render / Docker hosting',
      content: JSON.stringify(pkgJson, null, 2),
    },
    {
      path: 'render.yaml',
      language: 'yaml',
      description: 'Zero-config Render Free Web Service blueprint (wss:// WebSockets)',
      content: renderYaml,
    },
    {
      path: 'Dockerfile',
      language: 'text',
      description: 'Container image for Koyeb, Railway, Fly.io, or VPS hosting',
      content: dockerfile,
    },
    {
      path: '.env.example',
      language: 'text',
      description: 'Environment variables template',
      content: envExample,
    },
    {
      path: '.gitignore',
      language: 'text',
      description: 'Git ignore rules',
      content: gitignore,
    },
    {
      path: 'README.md',
      language: 'markdown',
      description: 'VoiceCraft GitHub repository & free Render deployment guide',
      content: readmeMd,
    },
  ];
}

