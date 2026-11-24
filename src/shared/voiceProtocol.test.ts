import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInGameHudPayload,
  computeSpatialAudio,
  generateAddonFiles,
  generateExternalRepoFiles,
  parseBedrockCommand,
  RoomPublicState,
} from './voiceProtocol';

test('computeSpatialAudio respects per-player mute, speakingDisabled, deafen, and 3D proximity', () => {
  const listener = {
    x: 0,
    y: 64,
    z: 0,
    yaw: 0,
    dimension: 'overworld' as const,
    scope: 'proximity' as const,
    privateChannel: 'squad',
    range: 40,
    deafened: false,
    mutedPlayers: ['ToxicGuy'],
  };

  const normalSpeaker = {
    gamertag: 'Alex',
    x: -10,
    y: 64,
    z: 0,
    dimension: 'overworld' as const,
    scope: 'proximity' as const,
    privateChannel: 'squad',
    range: 40,
    muted: false,
    speakingDisabled: false,
    volume: 100,
  };

  const res = computeSpatialAudio(listener, normalSpeaker, 40);
  assert.equal(res.audible, true);
  assert.equal(res.pan, 1);

  const blockedSpeaker = { ...normalSpeaker, gamertag: 'ToxicGuy' };
  assert.equal(computeSpatialAudio(listener, blockedSpeaker, 40).reason, 'peer_muted_by_listener');

  const speakOffSpeaker = { ...normalSpeaker, speakingDisabled: true };
  assert.equal(computeSpatialAudio(listener, speakOffSpeaker, 40).audible, false);
});

test('parseBedrockCommand handles in-game Mic, Voices, Speak, and per-player mute commands', () => {
  assert.deepEqual(parseBedrockCommand('!vc toggle_mic'), { valid: true, action: 'toggle_mic' });
  assert.deepEqual(parseBedrockCommand('!vc toggle_voices'), { valid: true, action: 'toggle_voices' });
  assert.deepEqual(parseBedrockCommand('!vc toggle_speak'), { valid: true, action: 'toggle_speak' });
  assert.deepEqual(parseBedrockCommand('!vc mute Alex_MC'), {
    valid: true,
    action: 'mute_player',
    targetPlayer: 'Alex_MC',
  });
  assert.deepEqual(parseBedrockCommand('!vc private vault99'), {
    valid: true,
    action: 'private',
    scope: 'private',
    channel: 'vault99',
    pin: undefined,
  });
});

test('buildInGameHudPayload reflects Mic OFF, Voices OFF, and Speak OFF states', () => {
  const room: RoomPublicState = {
    code: 'CRAFT1',
    scope: 'proximity',
    hostGamertag: 'Steve',
    hasPin: false,
    maxRange: 48,
    hudCorner: 'top-left',
    hudVisible: true,
    recentEvents: [],
    players: [
      {
        id: '1',
        gamertag: 'Steve',
        x: 0,
        y: 64,
        z: 0,
        yaw: 0,
        dimension: 'overworld',
        scope: 'proximity',
        privateChannel: 'squad',
        range: 48,
        muted: false,
        deafened: false,
        speakingDisabled: true,
        mutedPlayers: [],
        speaking: false,
        volume: 100,
        bedrockLinked: true,
        packetSource: 'wsserver',
        lastSeen: Date.now(),
      },
    ],
  };

  const hud = buildInGameHudPayload(room, 'Steve');
  assert.equal(hud.selfSpeakingDisabled, true);
  assert.ok(hud.actionBarText.includes('[SPEAK OFF]'));
});

test('generateAddonFiles outputs VoiceCraft packs, Emote-adjacent HUD button, onboarding popup, and external WSS URL', () => {
  const files = generateAddonFiles({
    packName: 'VoiceCraft',
    bridgeTarget: 'external',
    externalServerUrl: 'https://voicecraft-bridge.onrender.com',
    roomCode: 'REALM7',
    enableServerNetPackets: false,
    includeHudButtons: true,
    includePauseButton: true,
    giveHotbarToggles: true,
    defaultScope: 'realm',
    defaultRange: 48,
    hudCorner: 'top-left',
    syncIntervalTicks: 10,
  });

  const hudJson = JSON.parse(files.find((f) => f.path === 'VoiceCraft_RP/ui/hud_screen.json')!.content);
  const pauseJson = JSON.parse(files.find((f) => f.path === 'VoiceCraft_RP/ui/pause_screen.json')!.content);
  const mainJs = files.find((f) => f.path === 'VoiceCraft_BP/scripts/main.js')!.content;

  assert.ok(hudJson['voicecraft_emote_adjacent_btn@hud.voicecraft_top_btn_base']);
  assert.ok(hudJson['voicecraft_mic_toggle_btn@hud.voicecraft_drawer_row_btn']);
  assert.ok(hudJson['voicecraft_voices_toggle_btn@hud.voicecraft_drawer_row_btn']);
  assert.ok(hudJson['voicecraft_speak_toggle_btn@hud.voicecraft_drawer_row_btn']);
  assert.ok(hudJson.chat_stack.modifications[0].where.emote_button);
  assert.ok(pauseJson['voicecraft_pause_voice_btn@common_buttons.light_text_button']);
  assert.ok(mainJs.includes('wss://voicecraft-bridge.onrender.com/ws/bedrock'));
  assert.ok(mainJs.includes('Enable WebSockets'));
  assert.ok(mainJs.includes('voicecraft:onboarded'));
  assert.ok(mainJs.includes('ItemLockMode.slot'));
  assert.ok(mainJs.includes('keepOnDeath = true'));
  assert.ok(mainJs.includes('hotbarNineIndex = 8'));
  assert.ok(files.some((f) => f.path === 'VoiceCraft_BP/items/voice_menu.json'));
});

test('generateExternalRepoFiles outputs Render/Docker VoiceCraft GitHub repository files', () => {
  const repoFiles = generateExternalRepoFiles({
    packName: 'VoiceCraft',
    bridgeTarget: 'external',
    externalServerUrl: 'https://voicecraft-bridge.onrender.com',
    roomCode: 'SQUAD9',
    enableServerNetPackets: false,
    includeHudButtons: true,
    includePauseButton: true,
    giveHotbarToggles: true,
    defaultScope: 'proximity',
    defaultRange: 48,
    hudCorner: 'top-left',
    syncIntervalTicks: 10,
  });
  const serverMjs = repoFiles.find((f) => f.path === 'server.mjs')!.content;
  const renderYaml = repoFiles.find((f) => f.path === 'render.yaml')!.content;
  assert.ok(serverMjs.includes('VoiceCraft External Bridge'));
  assert.ok(renderYaml.includes('plan: free'));
  assert.ok(repoFiles.some((f) => f.path === 'public/index.html'));
  assert.ok(repoFiles.some((f) => f.path === 'Dockerfile'));
  assert.ok(repoFiles.some((f) => f.path === 'README.md'));
});
