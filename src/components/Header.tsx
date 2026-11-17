import { Loader2, Radar } from 'lucide-react';

export type ActiveTab = 'terminal' | 'analysis' | 'resolution' | 'risk' | 'alerts';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onScan: () => void;
  isScanning: boolean;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal Live' },
  { id: 'analysis', label: 'Analiză Tehnică' },
  { id: 'resolution', label: 'Rezoluție Semnale' },
  { id: 'risk', label: 'Jurnal & Risc' },
  { id: 'alerts', label: 'Alerte & Securitate' },
];

export function Header({ activeTab, onSelectTab, onScan, isScanning }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-[#1C2331] bg-white/95 dark:bg-[#090C12]/95 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('terminal');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          SSociety <span className="text-amber-500 font-semibold">Team</span>
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Navigare principală">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                  isActive
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onScan}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Radar className="w-3.5 h-3.5" />
            )}
            <span>{isScanning ? 'Se scanează...' : 'Scanează XAU/USD'}</span>
          </button>
        </div>
      </div>

      {/* Mobile compact navigation */}
      <nav
        className="flex md:hidden items-center gap-4 px-4 pb-2.5 overflow-x-auto border-t border-slate-100 dark:border-[#151B26]"
        aria-label="Navigare mobil"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`pt-2 text-xs font-medium whitespace-nowrap shrink-0 ${
                isActive
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
