import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, Landmark, Newspaper, RefreshCw } from 'lucide-react';

interface GroundedNewsItem {
  id: string;
  title: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  catalyst: string;
  summary: string;
  sourceName: string;
  url: string;
  publishedAt: number;
}

interface MacroCalendarEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  timestamp: number;
  impact: 'HIGH' | 'MEDIUM';
  forecast: string;
  previous: string;
}

interface FredMacroMetric {
  seriesId: 'DFII10' | 'DGS10' | 'T10YIE';
  label: string;
  value: number;
  changeBps: number;
  observationDate: string;
  goldImpact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
}

interface GroundingSource {
  title: string;
  uri: string;
}

interface MarketNewsResult {
  symbol: string;
  items: GroundedNewsItem[];
  macroEvents: MacroCalendarEvent[];
  macroPulse?: FredMacroMetric[];
  sentimentSummary?: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  };
  sources: GroundingSource[];
  activeProviders: string[];
  aiTranslated: boolean;
  generatedAt: number;
  cached: boolean;
}

function formatRelativeTime(ts: number): string {
  const diffMin = Math.round((Date.now() - ts) / 60_000);
  if (diffMin < -5) {
    return new Date(ts).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  }
  if (diffMin < 1) return 'acum';
  if (diffMin < 60) return `acum ${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `acum ${diffH}h`;
  return new Date(ts).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
}

export function MarketNewsFeed() {
  const [data, setData] = useState<MarketNewsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');

  const fetchNews = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const url = forceRefresh ? '/api/market/news?refresh=true' : '/api/market/news';
      const res = await fetch(url);
      const body = (await res.json()) as MarketNewsResult & { error?: string };

      if (!res.ok) {
        throw new Error(body.error || 'Nu s-au putut prelua știrile financiare XAU/USD.');
      }

      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcarea știrilor');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchNews(false);
    const interval = window.setInterval(() => {
      void fetchNews(false);
    }, 180_000);
    return () => window.clearInterval(interval);
  }, [fetchNews]);

  const filteredItems =
    data?.items.filter((item) => (impactFilter === 'ALL' ? true : item.impact === impactFilter)) ??
    [];

  return (
    <section
      aria-label="Flux Știri Financiare, Randamente FRED & Calendar Macro XAU/USD"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Știri Live, Randamente FRED & Calendar Macro
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Fed · BCE · FRED St. Louis · Dow Jones · Investing · CNBC · Reuters Wire
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchNews(true)}
          disabled={refreshing || loading}
          aria-label="Reîmprospătează știrile XAU/USD"
          className="p-2 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Actualizează știri și date macro"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Official St. Louis Fed (FRED) Real Yield & Treasury Macro Pulse */}
      {data?.macroPulse && data.macroPulse.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[#182030] bg-slate-50/70 dark:bg-[#0B0F17] space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
              <Landmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Fundamente Oficiale SUA (FRED · St. Louis Fed)</span>
            </span>
            <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500">
              {data.macroPulse[0]?.observationDate}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5 font-mono tabular-nums">
            {data.macroPulse.map((m) => {
              const impactColor =
                m.goldImpact === 'BULLISH'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : m.goldImpact === 'BEARISH'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400';

              return (
                <div
                  key={m.seriesId}
                  className="py-1.5 px-2 rounded-lg border border-slate-200/80 dark:border-[#1A2232] bg-white dark:bg-[#101622]"
                >
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400 truncate">
                    {m.seriesId === 'DFII10'
                      ? 'US10Y Real (TIPS)'
                      : m.seriesId === 'DGS10'
                        ? 'US10Y Nominal'
                        : 'Inflație 10Y'}
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-slate-900 dark:text-white">
                    {m.value.toFixed(2)}%
                  </div>
                  <div className={`text-[10px] font-semibold ${impactColor}`}>
                    {m.changeBps > 0 ? `+${m.changeBps}` : m.changeBps} bps ·{' '}
                    {m.goldImpact === 'BULLISH'
                      ? 'Bull Aur'
                      : m.goldImpact === 'BEARISH'
                        ? 'Bear Aur'
                        : 'Neutru'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Bar + Aggregate News Sentiment Summary */}
      {data && data.items.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-[#182030] flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
            {(
              [
                { id: 'ALL', label: `Toate (${data.items.length})` },
                {
                  id: 'BULLISH',
                  label: `Bullish (${data.sentimentSummary?.bullishCount ?? 0})`,
                },
                {
                  id: 'BEARISH',
                  label: `Bearish (${data.sentimentSummary?.bearishCount ?? 0})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setImpactFilter(tab.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  impactFilter === tab.id
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
            {data.activeProviders.length} fluxuri active
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-4 space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="space-y-1.5 py-2 border-b border-slate-100 dark:border-[#182030] last:border-0"
            >
              <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-[#182030]" />
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-[#141A26]" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !data && (
        <div className="p-4 text-xs space-y-2.5">
          <p className="text-rose-600 dark:text-rose-400 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => void fetchNews(true)}
            className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#243045] text-slate-700 dark:text-slate-200 font-medium hover:border-amber-500/50 transition-colors cursor-pointer"
          >
            Reîncearcă
          </button>
        </div>
      )}

      {/* Populated News Feed */}
      {data && (
        <div className="divide-y divide-slate-100 dark:divide-[#182030]">
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100 dark:divide-[#182030]">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Nicio știre nu corespunde filtrului selectat în acest moment.
              </div>
            ) : (
              filteredItems.map((item) => {
                const impactColor =
                  item.impact === 'BULLISH'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : item.impact === 'BEARISH'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400';

                return (
                  <article
                    key={item.id}
                    className="p-4 space-y-1.5 hover:bg-slate-50/70 dark:hover:bg-[#111622] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 min-w-0">
                        <span className="truncate">{item.sourceName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{formatRelativeTime(item.publishedAt)}</span>
                      </div>
                      <span className={`font-bold shrink-0 ${impactColor}`}>{item.impact}</span>
                    </div>

                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-amber-600 dark:hover:text-amber-400 inline-flex items-start gap-1"
                        >
                          <span>{item.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
                        </a>
                      ) : (
                        item.title
                      )}
                    </h3>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.summary}
                    </p>

                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      Catalizator: {item.catalyst}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Upcoming USD High/Medium Impact Macro Calendar Strip */}
          {data.macroEvents && data.macroEvents.length > 0 && (
            <div className="p-4 bg-slate-50/60 dark:bg-[#0A0E15] space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <CalendarClock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Calendar Macro SUA cu Impact pe Aur (USD)</span>
              </div>
              <div className="space-y-1.5">
                {data.macroEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span
                        className={
                          ev.impact === 'HIGH'
                            ? 'text-rose-600 dark:text-rose-400 font-bold shrink-0'
                            : 'text-amber-600 dark:text-amber-400 font-semibold shrink-0'
                        }
                      >
                        {ev.impact}
                      </span>
                      <span className="font-sans text-slate-700 dark:text-slate-200 truncate">
                        {ev.title}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 shrink-0">
                      {ev.forecast !== '—' ? `Est: ${ev.forecast} · ` : ''}
                      {new Date(ev.timestamp).toLocaleString('ro-RO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Timestamp */}
          <div className="px-4 py-2 text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 flex items-center justify-between">
            <span>
              Actualizat{' '}
              {new Date(data.generatedAt).toLocaleTimeString('ro-RO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {error && (
              <span className="text-rose-500 font-sans truncate max-w-[180px]">{error}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
