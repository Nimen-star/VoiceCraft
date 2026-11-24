import React, { useMemo, useState } from 'react';
import { Check, Download, FileCode, FolderGit2, RotateCcw } from 'lucide-react';
import {
  AddonConfig,
  generateAddonFiles,
  generateExternalRepoFiles,
  HudCorner,
  VoiceScope,
} from '../shared/voiceProtocol';

interface AddonSetupViewProps {
  config: AddonConfig;
  defaultOrigin: string;
  onChangeConfig: (next: AddonConfig) => void;
  onSaveExternalUrl: (rawUrl: string) => string;
  onResetExternalUrl: () => string;
  onDownloadAddon: (cfg: AddonConfig) => Promise<void>;
  onDownloadRepo: (cfg: AddonConfig) => Promise<void>;
  downloading: boolean;
  downloadingRepo: boolean;
}

export const AddonSetupView: React.FC<AddonSetupViewProps> = ({
  config,
  defaultOrigin,
  onChangeConfig,
  onSaveExternalUrl,
  onResetExternalUrl,
  onDownloadAddon,
  onDownloadRepo,
  downloading,
  downloadingRepo,
}) => {
  const [inspectMode, setInspectMode] = useState<'addon' | 'repo'>('addon');
  const [urlInput, setUrlInput] = useState(config.externalServerUrl);
  const [urlSaved, setUrlSaved] = useState(false);

  const addonFiles = useMemo(() => generateAddonFiles(config), [config]);
  const repoFiles = useMemo(() => generateExternalRepoFiles(config), [config]);
  const files = inspectMode === 'addon' ? addonFiles : repoFiles;

  const [selectedPath, setSelectedPath] = useState<string>(addonFiles[0]?.path || '');
  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const update = <K extends keyof AddonConfig>(key: K, val: AddonConfig[K]) => {
    onChangeConfig({ ...config, [key]: val });
  };

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = onSaveExternalUrl(urlInput);
    setUrlInput(saved);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

  const handleResetUrl = () => {
    const resetVal = onResetExternalUrl();
    setUrlInput(resetVal);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: External Website Configurator & GitHub Repo Export */}
      <section className="lg:col-span-5 mc-panel p-6 space-y-5">
        <div className="border-b-2 border-[#16181e] pb-4">
          <h1 className="font-pixel-display text-lg text-white">VoiceCraft Setup &amp; GitHub Repo</h1>
          <p className="text-sm text-[#aeb5c4] mt-1">
            Configure your public VoiceCraft website URL and export the complete GitHub repository bundle with the .mcaddon pack included.
          </p>
        </div>

        <div className="space-y-4">
          {/* Persistent External Website Bridge URL */}
          <form onSubmit={handleSaveUrl} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="setup-ext-url" className="block text-sm font-semibold text-[#d5dbe6]">
                External VoiceCraft Website URL
              </label>
              {urlSaved && (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-[#63d446]">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Saved</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="setup-ext-url"
                type="url"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  update('externalServerUrl', e.target.value);
                }}
                placeholder="https://voicecraft-bridge.onrender.com"
                required
                className="mc-input flex-1 min-w-0 px-3 py-2 text-xs font-mono"
              />
              <button
                type="submit"
                className="mc-btn mc-btn-emerald px-3.5 py-2 text-xs whitespace-nowrap shrink-0"
              >
                Save URL
              </button>
              {config.externalServerUrl !== defaultOrigin && (
                <button
                  type="button"
                  onClick={handleResetUrl}
                  title="Reset to current preview URL"
                  className="mc-btn px-2.5 py-2 text-xs whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-xs text-[#9aa3b2]">
              Saved in your browser for .mcaddon builds and /wsserver commands. Paste your live Render or VPS URL here after deploying your VoiceCraft repo.
            </p>
          </form>

          {/* Free Hosting Outside AI Studio Guide */}
          <div className="mc-panel-dark p-4 space-y-2 text-xs">
            <div className="font-semibold text-[#63d446]">Run Outside AI Studio (Free on Render · No Card)</div>
            <ol className="list-decimal list-inside space-y-1 text-[#c8cedb]">
              <li>
                Download <strong>VoiceCraft GitHub Repo (.zip)</strong> below and upload it to your{' '}
                <strong>VoiceCraft</strong> GitHub repository.
              </li>
              <li>
                On <strong>Render.com</strong>, create a free Web Service from your GitHub repo (reads{' '}
                <code>render.yaml</code> automatically with <code>wss://</code> WebSockets).
              </li>
              <li>
                Paste your live <code>https://...onrender.com</code> URL above and click{' '}
                <strong>Save URL</strong>, or grab <code>addon/VoiceCraft.mcaddon</code> straight from GitHub.
              </li>
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="setup-room" className="block text-sm font-semibold text-[#d5dbe6]">
                Default Room Code
              </label>
              <input
                id="setup-room"
                type="text"
                value={config.roomCode}
                onChange={(e) => update('roomCode', e.target.value.toUpperCase())}
                className="mc-input w-full px-3 py-2 text-sm font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-scope" className="block text-sm font-semibold text-[#d5dbe6]">
                Default Channel
              </label>
              <select
                id="setup-scope"
                value={config.defaultScope}
                onChange={(e) => update('defaultScope', e.target.value as VoiceScope)}
                className="mc-input w-full px-3 py-2 text-sm"
              >
                <option value="proximity">World Proximity</option>
                <option value="server">Server Global</option>
                <option value="realm">Realm Party</option>
                <option value="private">Private Channel</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="setup-hud-corner" className="block text-sm font-semibold text-[#d5dbe6]">
                HUD Drawer Anchor
              </label>
              <select
                id="setup-hud-corner"
                value={config.hudCorner}
                onChange={(e) => update('hudCorner', e.target.value as HudCorner)}
                className="mc-input w-full px-3 py-2 text-sm"
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-range" className="block text-sm font-semibold text-[#d5dbe6]">
                Proximity Range (Blocks)
              </label>
              <input
                id="setup-range"
                type="number"
                min={8}
                max={128}
                step={4}
                value={config.defaultRange}
                onChange={(e) => update('defaultRange', Number(e.target.value))}
                className="mc-input w-full px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="mc-panel-dark p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#e0e5ee]">HUD Button Next to Emote + Drawer</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.includeHudButtons}
                onClick={() => update('includeHudButtons', !config.includeHudButtons)}
                className={`mc-btn px-2.5 py-1 text-xs ${config.includeHudButtons ? 'mc-btn-emerald' : ''}`}
              >
                {config.includeHudButtons ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#e0e5ee]">Locked Hotbar Slot 9 Menu (No Drop / Keep on Death)</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.giveHotbarToggles}
                onClick={() => update('giveHotbarToggles', !config.giveHotbarToggles)}
                className={`mc-btn px-2.5 py-1 text-xs ${config.giveHotbarToggles ? 'mc-btn-emerald' : ''}`}
              >
                {config.giveHotbarToggles ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#e0e5ee]">@minecraft/server-net HTTP Packets (BDS)</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.enableServerNetPackets}
                onClick={() => update('enableServerNetPackets', !config.enableServerNetPackets)}
                className={`mc-btn px-2.5 py-1 text-xs ${config.enableServerNetPackets ? 'mc-btn-emerald' : ''}`}
              >
                {config.enableServerNetPackets ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => onDownloadAddon(config)}
              disabled={downloading}
              className="mc-btn mc-btn-emerald w-full py-2.5 text-sm"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>
                {downloading ? 'Packaging...' : `Download VoiceCraft_Bedrock_${config.roomCode || 'CRAFT1'}.mcaddon`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDownloadRepo(config)}
              disabled={downloadingRepo}
              className="mc-btn w-full py-2.5 text-sm"
            >
              <FolderGit2 className="w-4 h-4" aria-hidden="true" />
              <span>
                {downloadingRepo ? 'Packaging Repo...' : 'Download VoiceCraft GitHub Repo (.zip)'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Right: Pack & GitHub Repo Source Inspector */}
      <section className="lg:col-span-7 mc-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#16181e] pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-[#63d446]" aria-hidden="true" />
            <h2 className="font-pixel-display text-base text-white">Addon &amp; GitHub Repo Inspector</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setInspectMode('addon');
                setSelectedPath(addonFiles[0]?.path || '');
              }}
              className={`mc-btn px-3 py-1 text-xs ${inspectMode === 'addon' ? 'mc-btn-emerald' : ''}`}
            >
              .mcaddon Files ({addonFiles.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectMode('repo');
                setSelectedPath(repoFiles[0]?.path || '');
              }}
              className={`mc-btn px-3 py-1 text-xs ${inspectMode === 'repo' ? 'mc-btn-emerald' : ''}`}
            >
              GitHub Repo Files ({repoFiles.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {files.map((file) => {
            const isSelected = activeFile?.path === file.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`mc-btn px-2.5 py-1 text-xs font-mono ${isSelected ? 'mc-btn-emerald' : ''}`}
              >
                {file.path}
              </button>
            );
          })}
        </div>

        {activeFile && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#aeb5c4] px-1">
              <span>{activeFile.description}</span>
              <span className="font-mono uppercase">{activeFile.language}</span>
            </div>
            <pre className="mc-slot p-4 text-xs font-mono text-[#d8e0ee] overflow-x-auto max-h-[480px] overflow-y-auto leading-relaxed">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
