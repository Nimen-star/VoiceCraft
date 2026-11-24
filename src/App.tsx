/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { TopBar, AppTab } from './components/TopBar';
import { VoiceBridgeView } from './components/VoiceBridgeView';
import { AddonSetupView } from './components/AddonSetupView';
import { useVoiceBridge } from './hooks/useVoiceBridge';
import { AddonConfig, normalizeRoomCode, sanitizeHttpUrl } from './shared/voiceProtocol';

const EXTERNAL_URL_STORAGE_KEY = 'voicecraft_external_url';

function loadInitialExternalUrl(fallbackOrigin: string): string {
  if (typeof window === 'undefined') return fallbackOrigin;
  try {
    const saved = window.localStorage.getItem(EXTERNAL_URL_STORAGE_KEY);
    if (saved && saved.trim()) {
      return sanitizeHttpUrl(saved);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return fallbackOrigin;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('bridge');
  const [downloading, setDownloading] = useState(false);
  const [downloadingRepo, setDownloadingRepo] = useState(false);

  const defaultOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://voicecraft-bridge.onrender.com';

  const [addonConfig, setAddonConfig] = useState<AddonConfig>(() => ({
    packName: 'VoiceCraft',
    bridgeTarget: 'external',
    externalServerUrl: loadInitialExternalUrl(defaultOrigin),
    roomCode: 'CRAFT1',
    enableServerNetPackets: false,
    includeHudButtons: true,
    includePauseButton: true,
    giveHotbarToggles: true,
    defaultScope: 'proximity',
    defaultRange: 48,
    hudCorner: 'top-left',
    syncIntervalTicks: 10,
  }));

  const bridge = useVoiceBridge();

  const handleSaveExternalUrl = useCallback((rawUrl: string) => {
    const clean = sanitizeHttpUrl(rawUrl);
    setAddonConfig((prev) => ({ ...prev, externalServerUrl: clean }));
    try {
      window.localStorage.setItem(EXTERNAL_URL_STORAGE_KEY, clean);
    } catch {
      // Ignore storage errors
    }
    return clean;
  }, []);

  const handleResetExternalUrl = useCallback(() => {
    setAddonConfig((prev) => ({ ...prev, externalServerUrl: defaultOrigin }));
    try {
      window.localStorage.removeItem(EXTERNAL_URL_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    return defaultOrigin;
  }, [defaultOrigin]);

  const handleJoin = useCallback(
    (opts: Parameters<typeof bridge.joinRoom>[0]) => {
      bridge.joinRoom(opts);
      setAddonConfig((prev) => ({
        ...prev,
        roomCode: normalizeRoomCode(opts.roomCode) || prev.roomCode,
      }));
    },
    [bridge]
  );

  const handleDownloadAddon = useCallback(
    async (customConfig?: AddonConfig) => {
      const cfg = customConfig || {
        ...addonConfig,
        roomCode: bridge.room?.code || addonConfig.roomCode,
      };
      setDownloading(true);
      try {
        const response = await fetch('/api/addon/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `VoiceCraft_Bedrock_${cfg.roomCode || 'CRAFT1'}.mcaddon`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } finally {
        setDownloading(false);
      }
    },
    [addonConfig, bridge.room]
  );

  const handleDownloadRepo = useCallback(
    async (customConfig?: AddonConfig) => {
      const cfg = customConfig || {
        ...addonConfig,
        roomCode: bridge.room?.code || addonConfig.roomCode,
      };
      setDownloadingRepo(true);
      try {
        const response = await fetch('/api/repo/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'VoiceCraft_GitHub_Repo.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } finally {
        setDownloadingRepo(false);
      }
    },
    [addonConfig, bridge.room]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#16181d] text-[#f0f2f5]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onDownloadAddon={() => handleDownloadAddon()}
        downloading={downloading}
      />

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'bridge' && (
          <VoiceBridgeView
            status={bridge.status}
            errorMessage={bridge.errorMessage}
            room={bridge.room}
            selfPlayer={bridge.selfPlayer}
            hudPayload={bridge.hudPayload}
            micEnabled={bridge.micEnabled}
            micLevel={bridge.micLevel}
            micError={bridge.micError}
            defaultRoomCode={addonConfig.roomCode}
            configuredBridgeUrl={addonConfig.externalServerUrl}
            onJoin={handleJoin}
            onDisconnect={bridge.disconnect}
            onEnableMic={bridge.enableMicrophone}
            onStopMic={bridge.stopMic}
            onDownloadAddon={() => handleDownloadAddon()}
            onOpenAddonSetup={() => setActiveTab('addon')}
            downloading={downloading}
          />
        )}

        {activeTab === 'addon' && (
          <AddonSetupView
            config={addonConfig}
            defaultOrigin={defaultOrigin}
            onChangeConfig={setAddonConfig}
            onSaveExternalUrl={handleSaveExternalUrl}
            onResetExternalUrl={handleResetExternalUrl}
            onDownloadAddon={handleDownloadAddon}
            onDownloadRepo={handleDownloadRepo}
            downloading={downloading}
            downloadingRepo={downloadingRepo}
          />
        )}
      </main>

      <footer className="border-t-2 border-[#0d0e12] bg-[#1b1d24] py-4 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-[#9aa3b2]">
          <span>VoiceCraft · In-Game Bedrock Voice Chat &amp; External WebSocket Bridge</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('bridge')}
              className="hover:text-white underline-offset-2 hover:underline cursor-pointer"
            >
              Voice Bridge
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addon')}
              className="hover:text-white underline-offset-2 hover:underline cursor-pointer"
            >
              Addon &amp; GitHub Setup
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
