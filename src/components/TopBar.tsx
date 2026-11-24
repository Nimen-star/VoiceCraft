import React from 'react';
import { Download } from 'lucide-react';

export type AppTab = 'bridge' | 'addon';

interface TopBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onDownloadAddon: () => void;
  downloading: boolean;
}

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: 'bridge', label: 'Voice Bridge' },
  { id: 'addon', label: 'Addon & Setup' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onDownloadAddon,
  downloading,
}) => {
  return (
    <header className="w-full bg-[#1e2028] border-b-2 border-[#0a0b0e]">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 md:gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('bridge');
          }}
          className="font-pixel-display text-sm sm:text-xl font-bold tracking-tight text-[#63d446] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#63d446]"
        >
          VoiceCraft
        </a>

        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`text-base font-medium whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-white border-[#63d446]'
                    : 'text-[#aeb5c4] border-transparent hover:text-white hover:border-[#4c5263]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onDownloadAddon}
            disabled={downloading}
            className="mc-btn mc-btn-emerald px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
            <span>{downloading ? 'Building...' : 'Download .mcaddon'}</span>
          </button>
        </div>
      </div>

      {/* Mobile secondary nav strip */}
      <nav
        className="flex md:hidden items-center gap-2 px-3 py-2 border-t border-[#121318]"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`px-3 py-1.5 text-sm whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-[#2f3440] text-white border-[#63d446]'
                  : 'bg-[#1a1c22] text-[#aeb5c4] border-[#0e1014]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
