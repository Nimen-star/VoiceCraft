import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
// Universal mode: works on Realms, Worlds, and Servers via /wsserver + Script UI

const CONFIG = {
  serverUrl: "https://ais-dev-y4yn7xsfbwoxkdgpqkyywa-11612436337.asia-southeast1.run.app",
  wsUrl: "wss://ais-dev-y4yn7xsfbwoxkdgpqkyywa-11612436337.asia-southeast1.run.app/ws/bedrock",
  roomCode: "CRAFT1",
  defaultScope: "proximity",
  defaultRange: 48,
  syncIntervalTicks: 10,
  useServerNet: false,
  giveHotbarToggles: true
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
  player.sendMessage("§e1.§f Open §lSettings -> Network Settings§r -> turn §aON \"Enable WebSockets\"§f.");
  player.sendMessage("§e2.§f Run in chat: §b" + wsCommand);
  player.sendMessage("§e3.§f Open §b" + CONFIG.serverUrl + "§f in the background for mic/audio, then control everything in-game via §a!vc menu§f or the HUD button next to Emote.");
}

async function showWebSocketsOnboarding(player) {
  const form = new ActionFormData()
    .title("§lVoiceCraft: Enable WebSockets")
    .body(
      "To let Minecraft send & receive voice chat packets:\n\n" +
      "§a1.§f Open §lSettings -> Network Settings§r and toggle §aEnable WebSockets ON§f.\n" +
      "§a2.§f Copy & run the §b/wsserver§f command posted in chat.\n" +
      "§a3.§f Keep §b" + CONFIG.serverUrl + "§f open in the background for audio.\n\n" +
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
      "\nChannel: " + formatScope(state) +
      "\nMic: " + (state.muted ? "§cOFF" : "§aON") +
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
  // Syncs via /wsserver wss://ais-dev-y4yn7xsfbwoxkdgpqkyywa-11612436337.asia-southeast1.run.app/ws/bedrock?code=CRAFT1
}

world.beforeEvents.chatSend.subscribe((event) => {
  const msg = event.message.trim();
  if (!msg.toLowerCase().startsWith("!vc")) return;
  event.cancel = true;

  const player = event.sender;
  const state = getState(player);
  const parts = msg.slice(3).trim().split(/\s+/);
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
