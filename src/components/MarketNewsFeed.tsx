import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';

interface GroundedNewsItem {
  id: string;
  title: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  catalyst: string;
  summary: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

interface MarketNewsResult {
  symbol: string;
  items: GroundedNewsItem[];
  sources: GroundingSource[];
  searchQueries: string[];
  generatedAt: number;
  cached: boolean;
}

export function MarketNewsFeed() {
  const [data, setData] = useState<MarketNewsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [fetchNews]);

  return (
    <section
      aria-label="Flux Știri Financiare XAU/USD"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Știri Financiare XAU/USD
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Catalizatori macro și surse verificate prin Google Search Grounding
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchNews(true)}
          disabled={refreshing || loading}
          aria-label="Reîmprospătează știrile XAU/USD"
          className="p-2 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Actualizează știri"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="p-4 space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5 py-2 border-b border-slate-100 dark:border-[#182030] last:border-0">
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
          {data.items.map((item) => {
            const impactColor =
              item.impact === 'BULLISH'
                ? 'text-emerald-600 dark:text-emerald-400'
                : item.impact === 'BEARISH'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-600 dark:text-amber-400';

            return (
              <article key={item.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-slate-500 dark:text-slate-400">{item.catalyst}</span>
                  <span className={`font-bold ${impactColor}`}>{item.impact}</span>
                </div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.summary}
                </p>
              </article>
            );
          })}

          {/* Grounded Web Sources */}
          {data.sources.length > 0 && (
            <div className="p-4 bg-slate-50/60 dark:bg-[#0A0E15] space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Surse Grounding Verificate ({data.sources.length})
              </div>
              <ul className="space-y-1.5">
                {data.sources.map((src) => (
                  <li key={src.uri}>
                    <a
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline max-w-full"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{src.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer Timestamp */}
          <div className="px-4 py-2 text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 flex items-center justify-between">
            <span>
              Actualizat {new Date(data.generatedAt).toLocaleTimeString('ro-RO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {error && <span className="text-rose-500 font-sans truncate max-w-[180px]">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
