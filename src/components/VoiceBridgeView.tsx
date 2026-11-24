import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Mic, MicOff, MessageSquare, Pause, Smile } from 'lucide-react';
import {
  formatScopeLabel,
  InGameHudPayload,
  PlayerVoiceState,
  RoomPublicState,
  sanitizeHttpUrl,
  toWebSocketUrl,
} from '../shared/voiceProtocol';
import { ConnectionStatus, JoinOptions } from '../hooks/useVoiceBridge';

interface VoiceBridgeViewProps {
  status: ConnectionStatus;
  errorMessage: string | null;
  room: RoomPublicState | null;
  selfPlayer: PlayerVoiceState | null;
  hudPayload: InGameHudPayload | null;
  micEnabled: boolean;
  micLevel: number;
  micError: string | null;
  defaultRoomCode: string;
  configuredBridgeUrl: string;
  onJoin: (opts: JoinOptions) => void;
  onDisconnect: () => void;
  onEnableMic: () => Promise<boolean>;
  onStopMic: () => void;
  onDownloadAddon: () => void;
  onOpenAddonSetup: () => void;
  downloading: boolean;
}

export const VoiceBridgeView: React.FC<VoiceBridgeViewProps> = ({
  status,
  errorMessage,
  room,
  selfPlayer,
  hudPayload,
  micEnabled,
  micLevel,
  micError,
  defaultRoomCode,
  configuredBridgeUrl,
  onJoin,
  onDisconnect,
  onEnableMic,
  onStopMic,
  onDownloadAddon,
  onOpenAddonSetup,
  downloading,
}) => {
  const [gamertag, setGamertag] = useState(selfPlayer?.gamertag || 'Steve_Bedrock');
  const [roomCode, setRoomCode] = useState(room?.code || defaultRoomCode || 'CRAFT1');
  const [pin, setPin] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://voicecraft-bridge.onrender.com';
  const targetBridgeUrl = sanitizeHttpUrl(configuredBridgeUrl || currentOrigin);
  const hasCustomExternalUrl = targetBridgeUrl !== currentOrigin;
  const wsCommand = `/wsserver ${toWebSocketUrl(targetBridgeUrl)}/ws/bedrock?code=${(roomCode || 'CRAFT1').toUpperCase()}&tag=${gamertag || 'Steve_Bedrock'}`;
  const isConnected = status === 'connected';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoin({
      roomCode,
      gamertag,
      scope: 'proximity',
      privateChannel: 'squad',
      pin,
      range: 48,
    });
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(wsCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard blocked in headless mode
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Background Voice Bridge */}
        <section className="lg:col-span-7 mc-panel p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#16181e] pb-4">
            <div>
              <h1 className="font-pixel-display text-xl sm:text-2xl text-white">
                VoiceCraft Voice Bridge
              </h1>
              <p className="text-sm text-[#aeb5c4] mt-1">
                Link your microphone once and leave this tab open. All mute, voices, speaking, and channel controls happen inside Minecraft.
              </p>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 mc-slot">
              <strong
                className={
                  isConnected
                    ? 'text-[#63d446]'
                    : status === 'error'
                      ? 'text-[#e86464]'
                      : 'text-[#e0a836]'
                }
              >
                {status === 'connected'
                  ? 'Connected'
                  : status === 'connecting'
                    ? 'Connecting...'
                    : status === 'error'
                      ? 'Error'
                      : 'Disconnected'}
              </strong>
            </span>
          </div>

          {hasCustomExternalUrl && (
            <div className="mc-panel-dark p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[#63d446] font-semibold">Saved External VoiceCraft Host</div>
                <div className="font-mono text-[#d5dbe6] truncate">{targetBridgeUrl}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={targetBridgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mc-btn px-3 py-1.5 text-xs no-underline whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Site</span>
                </a>
                <button
                  type="button"
                  onClick={onOpenAddonSetup}
                  className="mc-btn px-3 py-1.5 text-xs whitespace-nowrap"
                >
                  Change URL
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="bridge-gamertag" className="block text-sm font-semibold text-[#d5dbe6]">
                  Minecraft Gamertag
                </label>
                <input
                  id="bridge-gamertag"
                  type="text"
                  value={gamertag}
                  onChange={(e) => setGamertag(e.target.value)}
                  placeholder="Steve_Bedrock"
                  required
                  className="mc-input w-full px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bridge-room" className="block text-sm font-semibold text-[#d5dbe6]">
                  Room / Server Code
                </label>
                <input
                  id="bridge-room"
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="CRAFT1"
                  required
                  className="mc-input w-full px-3 py-2 text-sm font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bridge-pin" className="block text-sm font-semibold text-[#d5dbe6]">
                  Private PIN (Optional)
                </label>
                <input
                  id="bridge-pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Open if blank"
                  className="mc-input w-full px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="bg-[#381d20] border-2 border-[#b83b3b] text-[#ffd4d4] px-4 py-2 text-sm"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={status === 'connecting'}
                className="mc-btn mc-btn-emerald px-5 py-2.5 text-sm whitespace-nowrap"
              >
                {isConnected ? 'Re-Link Bridge' : status === 'connecting' ? 'Connecting...' : 'Connect Voice Bridge'}
              </button>

              {isConnected && (
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="mc-btn mc-btn-redstone px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  Disconnect
                </button>
              )}

              <button
                type="button"
                onClick={micEnabled ? onStopMic : onEnableMic}
                className={`mc-btn px-4 py-2.5 text-sm whitespace-nowrap ${
                  micEnabled ? 'mc-btn-amber' : ''
                }`}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                <span>{micEnabled ? 'Disable Mic' : 'Enable Microphone'}</span>
              </button>
            </div>
          </form>

          {/* Mic Audio Level Bar */}
          <div className="mc-panel-dark p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#aeb5c4]">
              <span>Microphone Audio Carrier</span>
              <span className="tabular-nums">{micEnabled ? `${micLevel}%` : 'Standby'}</span>
            </div>
            <div className="h-2.5 w-full bg-[#111318] border border-[#0a0b0e] flex gap-0.5 p-0.5">
              {Array.from({ length: 20 }).map((_, idx) => {
                const threshold = (idx + 1) * 5;
                const lit = micLevel >= threshold;
                const barColor =
                  idx > 15 ? 'bg-[#d64545]' : idx > 11 ? 'bg-[#e09f24]' : 'bg-[#5bc242]';
                return <div key={idx} className={`flex-1 h-full ${lit ? barColor : 'bg-[#22252e]'}`} />;
              })}
            </div>
            {micError && <p className="text-xs text-[#f0b459]">{micError}</p>}
          </div>

          {/* Copy-Ready /wsserver Command */}
          <div className="mc-panel-dark p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                In-Game WebSocket Command (Also shown in Minecraft chat on spawn)
              </span>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="mc-btn px-2.5 py-1 text-xs whitespace-nowrap"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-[#63d446]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="mc-slot p-2.5 font-mono text-xs text-[#7ce861] break-all select-all">
              {wsCommand}
            </div>
          </div>

          {/* Read-Only Synced In-Game Status (Only shown when linked) */}
          {room && selfPlayer && (
            <div className="mc-panel-dark p-4 space-y-3" data-testid="synced-ingame-status">
              <div className="flex items-center justify-between border-b border-[#252831] pb-2">
                <span className="text-xs font-semibold text-[#63d446] font-mono">
                  Synced In-Game State · Room {room.code}
                </span>
                <span className="text-xs font-mono text-[#aeb5c4] tabular-nums">
                  {room.players.length} linked
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="mc-slot p-2">
                  <div className="text-[#8c94a6]">Mic</div>
                  <div className={selfPlayer.muted ? 'text-[#e86464]' : 'text-[#63d446]'}>
                    {selfPlayer.muted ? 'OFF' : 'ON'}
                  </div>
                </div>
                <div className="mc-slot p-2">
                  <div className="text-[#8c94a6]">People&apos;s Voices</div>
                  <div className={selfPlayer.deafened ? 'text-[#e86464]' : 'text-[#63d446]'}>
                    {selfPlayer.deafened ? 'OFF' : 'ON'}
                  </div>
                </div>
                <div className="mc-slot p-2">
                  <div className="text-[#8c94a6]">Speaking</div>
                  <div className={selfPlayer.speakingDisabled ? 'text-[#e0a836]' : 'text-[#63d446]'}>
                    {selfPlayer.speakingDisabled ? 'OFF' : 'ON'}
                  </div>
                </div>
                <div className="mc-slot p-2">
                  <div className="text-[#8c94a6]">Channel</div>
                  <div className="text-white truncate">
                    {formatScopeLabel(selfPlayer.scope, selfPlayer.privateChannel)}
                  </div>
                </div>
              </div>

              {hudPayload && hudPayload.speakers.length > 0 && (
                <div className="text-xs font-mono text-[#c8cedb] pt-1">
                  Linked Players:{' '}
                  {hudPayload.speakers.map((s) => `${s.gamertag}${s.muted ? ' (Muted)' : ''}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: Minecraft Emote-Adjacent Button & Addon Download */}
        <aside className="lg:col-span-5 mc-panel p-6 space-y-5">
          <div className="border-b-2 border-[#16181e] pb-4">
            <h2 className="font-pixel-display text-lg text-white">In-Game Minecraft UI</h2>
            <p className="text-sm text-[#aeb5c4] mt-1">
              Adds a locked VoiceCraft Menu in Hotbar Slot 9 (cannot drop or lose on death, Right-Click on PC) plus a HUD button next to Emote for touch.
            </p>
          </div>

          {/* Authentic Pixelated Minecraft Top-Bar Preview */}
          <div className="relative border-2 border-[#0a0b0e] overflow-hidden bg-[#101217] p-4 min-h-[215px]">
            <img
              src="/src/assets/images/pixel_overworld_backdrop_1795527084985.jpg"
              alt="Minecraft Bedrock sky and landscape backdrop"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover pixelated opacity-55"
            />
            <div className="relative z-10 flex flex-col items-center gap-2">
              {/* Top-Center Native Minecraft Button Row: Pause, Chat, Emote, VoiceCraft Voice */}
              <div className="flex items-center gap-1 bg-black/30 p-1">
                <span
                  aria-label="Minecraft Pause button"
                  className="w-8 h-8 bg-[#31343c]/90 border-2 border-[#0e1014] flex items-center justify-center text-[#d8dde8]"
                >
                  <Pause className="w-4 h-4" />
                </span>
                <span
                  aria-label="Minecraft Chat button"
                  className="w-8 h-8 bg-[#31343c]/90 border-2 border-[#0e1014] flex items-center justify-center text-[#d8dde8]"
                >
                  <MessageSquare className="w-4 h-4" />
                </span>
                <span
                  aria-label="Minecraft Emote button"
                  className="w-8 h-8 bg-[#31343c]/90 border-2 border-[#0e1014] flex items-center justify-center text-[#d8dde8]"
                >
                  <Smile className="w-4 h-4" />
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen((o) => !o)}
                  aria-expanded={drawerOpen}
                  title="VoiceCraft HUD Button (right next to Emote)"
                  className="w-8 h-8 bg-[#3a3f4d] hover:bg-[#495062] border-2 border-[#0e1014] shadow-[inset_1px_1px_0_rgba(255,255,255,0.2)] flex items-center justify-center text-[#63d446] cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>

              {/* All-in-one HUD Drawer Preview */}
              {drawerOpen && (
                <div className="w-72 max-w-full bg-[#1a1c23]/95 border-2 border-[#090a0d] p-2.5 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2 text-[#63d446] px-1">
                    <span className="truncate">VOICECRAFT · {(roomCode || 'CRAFT1').toUpperCase()}</span>
                    <span className="text-[#aeb5c4] shrink-0">Next to Emote</span>
                  </div>
                  <div className="mc-slot px-2 py-1.5 text-[#f0f2f5]">Mic: ON / OFF</div>
                  <div className="mc-slot px-2 py-1.5 text-[#f0f2f5]">People&apos;s Voices: ON / OFF</div>
                  <div className="mc-slot px-2 py-1.5 text-[#f0f2f5]">Speaking: ON / OFF</div>
                  <div className="mc-slot px-2 py-1.5 text-[#f0f2f5]">Mute Player / Channels (!vc menu)</div>
                </div>
              )}
            </div>
          </div>

          {/* Required In-Game Network Setting Reminder */}
          <div className="mc-panel-dark p-4 space-y-1.5 text-sm">
            <div className="font-semibold text-white">Required In-Game Setting</div>
            <p className="text-xs text-[#aeb5c4]">
              On first spawn, the addon shows a one-time popup + chat guide telling players to turn{' '}
              <strong className="text-[#63d446]">ON &ldquo;Enable WebSockets&rdquo;</strong> under{' '}
              <strong>Settings → Network Settings</strong> and run the <code>/wsserver</code> command.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onDownloadAddon}
              disabled={downloading}
              className="mc-btn mc-btn-emerald flex-1 py-2.5 text-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{downloading ? 'Building...' : 'Download .mcaddon'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddonSetup}
              className="mc-btn px-4 py-2.5 text-sm whitespace-nowrap"
            >
              Host Outside AI Studio
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
