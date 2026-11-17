import { FormEvent, useState } from 'react';
import { Bell, BellOff, Check, Moon, Plus, Sun, Volume2, VolumeX } from 'lucide-react';
import { ConnectionState } from '../services/wsClient';
import { AlertRule, MarketTick, Timeframe, TradingSession } from '../types/trading';

interface WorkspaceToolbarProps {
  tick: MarketTick | null;
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  connectionState: ConnectionState;
  soundEnabled: boolean;
  onToggleSound: () => void;
  browserPushEnabled: boolean;
  onEnablePush: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onQuickAddPriceAlert: (payload: {
    type: Extract<AlertRule['type'], 'PRICE_ABOVE' | 'PRICE_BELOW'>;
    threshold: number;
    note: string;
  }) => Promise<void>;
}

const TIMEFRAMES: Timeframe[] = ['M5', 'M15', 'H1', 'H4', 'D1'];

const SESSION_LABELS: Record<TradingSession, string> = {
  ASIA: 'Sesiune Asia',
  LONDON: 'Sesiune Londra',
  NEW_YORK: 'Sesiune New York',
  OVERLAP_LDN_NY: 'Overlap Londra / NY',
};

export function WorkspaceToolbar({
  tick,
  timeframe,
  onSelectTimeframe,
  connectionState,
  soundEnabled,
  onToggleSound,
  browserPushEnabled,
  onEnablePush,
  isDark,
  onToggleTheme,
  onQuickAddPriceAlert,
}: WorkspaceToolbarProps) {
  const isPositive = (tick?.change24h ?? 0) >= 0;
  const isOpenDeltaPositive = (tick?.openDelta ?? 0) >= 0;

  const [triggerMode, setTriggerMode] = useState<'PRICE_ABOVE' | 'PRICE_BELOW'>('PRICE_ABOVE');
  const [priceInput, setPriceInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSaved, setTriggerSaved] = useState<string | null>(null);

  const suggestedPrice = tick
    ? (triggerMode === 'PRICE_ABOVE' ? tick.mid + 5 : tick.mid - 5).toFixed(2)
    : '2640.00';

  const handleQuickTriggerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTriggerError(null);
    setTriggerSaved(null);

    const parsed = Number(priceInput);
    if (!priceInput.trim() || !Number.isFinite(parsed) || parsed <= 0 || parsed > 50_000) {
      setTriggerError('Preț invalid');
      return;
    }

    const label = triggerMode === 'PRICE_ABOVE' ? 'Buy Above' : 'Sell Below';
    try {
      setIsSubmitting(true);
      await onQuickAddPriceAlert({
        type: triggerMode,
        threshold: Math.round(parsed * 100) / 100,
        note: `Trigger rapid ${label} XAU/USD @ ${parsed.toFixed(2)}`,
      });
      setPriceInput('');
      setTriggerSaved(`${label} @ ${parsed.toFixed(2)}`);
      window.setTimeout(() => setTriggerSaved(null), 3000);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Eroare alertă');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="border-b border-slate-200 dark:border-[#1C2331] bg-slate-50/70 dark:bg-[#0D111A]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Live XAU/USD Market Quote & Session Telemetry */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-display text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              XAU/USD
            </span>
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {tick ? tick.mid.toFixed(2) : '----.--'}
            </span>
            {tick && (
              <>
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    isOpenDeltaPositive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                  title={`Price Delta față de deschiderea pieței (${tick.marketOpen.toFixed(2)} USD)`}
                >
                  Price Delta {isOpenDeltaPositive ? '▲ +' : '▼ '}
                  {tick.openDeltaPct.toFixed(2)}% ({isOpenDeltaPositive ? '+' : ''}
                  {tick.openDelta.toFixed(2)})
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-mono text-xs font-medium tabular-nums ${
                    isPositive
                      ? 'text-emerald-600/80 dark:text-emerald-400/80'
                      : 'text-rose-600/80 dark:text-rose-400/80'
                  }`}
                  title="Variație 24h"
                >
                  24h {isPositive ? '+' : ''}
                  {tick.change24hPct.toFixed(2)}%
                </span>
              </>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>
              Bid <strong className="text-slate-800 dark:text-slate-200">{tick ? tick.bid.toFixed(2) : '--'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Ask <strong className="text-slate-800 dark:text-slate-200">{tick ? tick.ask.toFixed(2) : '--'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Spread <strong className="text-slate-800 dark:text-slate-200">{tick ? tick.spread.toFixed(2) : '--'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              24h L/H{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {tick ? `${tick.low24h.toFixed(1)} / ${tick.high24h.toFixed(1)}` : '--'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{tick ? SESSION_LABELS[tick.session] : 'Sesiune Activă'}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : connectionState === 'reconnecting' || connectionState === 'connecting'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-rose-500'
                }`}
              />
              <span>
                {connectionState === 'connected'
                  ? 'WebSocket Live'
                  : connectionState === 'reconnecting'
                    ? 'Reconectare...'
                    : connectionState === 'connecting'
                      ? 'Conectare...'
                      : 'Deconectat'}
              </span>
            </span>
          </div>
        </div>

        {/* Right: Quick Price Trigger + Timeframe Selector + Notification & Theme Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick-Add Price Trigger */}
          <form
            onSubmit={handleQuickTriggerSubmit}
            className="inline-flex items-center gap-1.5 p-0.5 rounded-lg bg-white dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]"
            aria-label="Trigger rapid preț XAU/USD"
          >
            <div className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D111A] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setTriggerMode('PRICE_ABOVE');
                  setTriggerError(null);
                }}
                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  triggerMode === 'PRICE_ABOVE'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Buy Above
              </button>
              <button
                type="button"
                onClick={() => {
                  setTriggerMode('PRICE_BELOW');
                  setTriggerError(null);
                }}
                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  triggerMode === 'PRICE_BELOW'
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Sell Below
              </button>
            </div>

            <input
              type="number"
              step="0.01"
              min="1"
              max="50000"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                if (triggerError) setTriggerError(null);
              }}
              placeholder={suggestedPrice}
              aria-label="Preț alertă XAU/USD"
              className="w-24 px-2 py-1 text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              title="Setează alertă rapidă de preț"
            >
              {triggerSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              <span>{triggerSaved ? 'Salvat' : 'Setează'}</span>
            </button>

            {triggerError && (
              <span className="pr-2 text-[11px] text-rose-500 font-medium whitespace-nowrap">
                {triggerError}
              </span>
            )}
            {triggerSaved && !triggerError && (
              <span className="pr-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono tabular-nums whitespace-nowrap">
                {triggerSaved}
              </span>
            )}
          </form>

          {/* Timeframe Selector */}
          <div
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-[#141A26] border border-slate-300/60 dark:border-[#1E2738]"
            role="group"
            aria-label="Selector interval de timp"
          >
            {TIMEFRAMES.map((tf) => {
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onSelectTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#1F293B] text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onEnablePush}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              browserPushEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-[#1E2738] bg-white dark:bg-[#141A26] text-slate-700 dark:text-slate-300 hover:border-amber-500/50'
            }`}
            title="Activează notificările push ale browserului"
          >
            {browserPushEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span>{browserPushEnabled ? 'Notificări Active' : 'Activează Push'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Dezactivează sunet alerte' : 'Activează sunet alerte'}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-white dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? 'Sunet alerte activ' : 'Sunet alerte oprit'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Comută la temă luminoasă' : 'Comută la temă întunecată'}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-white dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title={isDark ? 'Temă Light' : 'Temă Dark'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </section>
  );
}
