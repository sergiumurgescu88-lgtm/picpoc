import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Timeframe } from '../types/trading';

interface MarketSentimentData {
  symbol: string;
  timeframe: Timeframe;
  price: number;
  bullishPct: number;
  bearishPct: number;
  label: 'BULLISH_PUTERNIC' | 'BULLISH' | 'NEUTRU' | 'BEARISH' | 'BEARISH_PUTERNIC';
  labelText: string;
  components: {
    trendBullPct: number;
    momentumBullPct: number;
    structureBullPct: number;
  };
  timestamp: number;
}

interface MarketSentimentIndicatorProps {
  timeframe: Timeframe;
}

export function MarketSentimentIndicator({ timeframe }: MarketSentimentIndicatorProps) {
  const [sentiment, setSentiment] = useState<MarketSentimentData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSentiment = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) setRefreshing(true);
        const res = await fetch(`/api/market/sentiment?timeframe=${timeframe}`);
        if (!res.ok) throw new Error('Nu s-a putut prelua sentimentul pieței.');
        const data = (await res.json()) as MarketSentimentData;
        setSentiment(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Eroare sentiment');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [timeframe]
  );

  useEffect(() => {
    setLoading(true);
    void fetchSentiment(false);
    const interval = window.setInterval(() => {
      void fetchSentiment(false);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [fetchSentiment]);

  const isBullish = (sentiment?.bullishPct ?? 50) >= 55;
  const isBearish = (sentiment?.bullishPct ?? 50) <= 45;

  return (
    <section
      aria-label="Indicator Sentiment Piață XAU/USD"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Sentiment Piață XAU/USD
          </h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{timeframe}</span>
            <span aria-hidden="true">·</span>
            <span>
              {sentiment
                ? `Actualizat ${new Date(sentiment.timestamp).toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}`
                : 'Se sincronizează...'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchSentiment(true)}
          disabled={refreshing}
          aria-label="Reîmprospătează sentimentul pieței"
          className="p-2 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Actualizează sentiment"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && !sentiment && (
        <div className="mt-4 space-y-3 animate-pulse">
          <div className="h-5 w-36 rounded bg-slate-200 dark:bg-[#182030]" />
          <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-[#182030]" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="h-8 rounded bg-slate-100 dark:bg-[#141A26]" />
            <div className="h-8 rounded bg-slate-100 dark:bg-[#141A26]" />
            <div className="h-8 rounded bg-slate-100 dark:bg-[#141A26]" />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !sentiment && (
        <div className="mt-4 py-3 text-xs text-rose-500 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchSentiment(true)}
            className="font-semibold underline cursor-pointer"
          >
            Reîncearcă
          </button>
        </div>
      )}

      {/* Populated Progress Gauge */}
      {sentiment && (
        <div className="mt-4 space-y-3.5">
          {/* Dominant Classification + Percentages */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {isBullish ? (
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : isBearish ? (
                <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              ) : null}
              <span
                className={`text-sm font-semibold ${
                  isBullish
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isBearish
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {sentiment.labelText}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Bull {sentiment.bullishPct}%
              </span>
              <span className="text-slate-400" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                Bear {sentiment.bearishPct}%
              </span>
            </div>
          </div>

          {/* Dual Opposing Progress Gauge */}
          <div className="space-y-1.5">
            <div
              className="relative h-2.5 w-full rounded-full overflow-hidden bg-rose-500/85 dark:bg-rose-500/75 flex"
              role="progressbar"
              aria-valuenow={sentiment.bullishPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Sentiment Bullish ${sentiment.bullishPct}% față de Bearish ${sentiment.bearishPct}%`}
            >
              <div
                className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
                style={{ width: `${sentiment.bullishPct}%` }}
              />
              {/* Neutral equilibrium midpoint tick */}
              <div
                className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/80 dark:bg-[#090C12]"
                aria-hidden="true"
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
              <span>100% Bullish</span>
              <span>50% Echilibru</span>
              <span>100% Bearish</span>
            </div>
          </div>

          {/* Sub-factor Breakdown */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-[#182030] text-xs font-mono tabular-nums">
            <div>
              <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">Trend EMA</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {sentiment.components.trendBullPct}% Bull
              </div>
            </div>
            <div>
              <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">Momentum</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {sentiment.components.momentumBullPct}% Bull
              </div>
            </div>
            <div>
              <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">Structură SMC</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {sentiment.components.structureBullPct}% Bull
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
