import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { RefreshCw } from 'lucide-react';

interface VolatilityInterval {
  time: number;
  hourKey: string;
  hourIndex: number;
  quarterLabel: string;
  quarterIndex: number;
  fullTimeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rangeUsd: number;
  rangePips: number;
  rangePct: number;
  session: string;
}

interface Volatility24hResponse {
  symbol: string;
  windowHours: number;
  intervalMinutes: number;
  intervals: VolatilityInterval[];
  summary: {
    avgRangeUsd: number;
    maxRangeUsd: number;
    peakTimeLabel: string;
    currentRangeUsd: number;
  };
  timestamp: number;
}

interface VolatilityHeatmapProps {
  isDark: boolean;
}

const QUARTERS = [':00', ':15', ':30', ':45'];

export function VolatilityHeatmap({ isDark }: VolatilityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [data, setData] = useState<Volatility24hResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{
    item: VolatilityInterval;
    x: number;
    y: number;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);

  const fetchVolatility = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const res = await fetch('/api/market/volatility-24h');
      if (!res.ok) throw new Error('Nu s-au putut prelua datele de volatilitate.');
      const json = (await res.json()) as Volatility24hResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare volatilitate');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchVolatility(false);
    const id = window.setInterval(() => {
      void fetchVolatility(false);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [fetchVolatility]);

  // Track responsive container width for D3 redraw
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth || 760);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render D3 heatmap matrix
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || data.intervals.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 12, bottom: 26, left: 38 };
    const totalWidth = Math.max(340, containerWidth);
    const totalHeight = 168;
    const width = totalWidth - margin.left - margin.right;
    const height = totalHeight - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Group sequential 15m bars into ordered column indices (0..23)
    const uniqueColIndices = Array.from(new Set(data.intervals.map((d) => d.hourIndex))).sort(
      (a, b) => a - b
    );
    const colLabelMap = new Map<number, string>();
    for (const item of data.intervals) {
      if (!colLabelMap.has(item.hourIndex)) {
        colLabelMap.set(item.hourIndex, item.hourKey);
      }
    }

    const xScale = d3
      .scaleBand<number>()
      .domain(uniqueColIndices)
      .range([0, width])
      .padding(0.12);

    const yScale = d3
      .scaleBand<string>()
      .domain(QUARTERS)
      .range([0, height])
      .padding(0.14);

    const maxRange = Math.max(2, data.summary.maxRangeUsd);
    const colorScale = d3
      .scaleSequential<string>()
      .domain([0, maxRange])
      .interpolator(
        isDark
          ? d3.interpolateRgbBasis(['#131B2B', '#1E3A5F', '#D97706', '#F59E0B', '#EF4444'])
          : d3.interpolateRgbBasis(['#E2E8F0', '#BAE6FD', '#FCD34D', '#F59E0B', '#DC2626'])
      );

    // Draw cells
    g.selectAll<SVGRectElement, VolatilityInterval>('rect.vol-cell')
      .data(data.intervals, (d) => String(d.time))
      .enter()
      .append('rect')
      .attr('class', 'vol-cell')
      .attr('x', (d) => xScale(d.hourIndex) ?? 0)
      .attr('y', (d) => yScale(d.quarterLabel) ?? 0)
      .attr('width', Math.max(4, xScale.bandwidth()))
      .attr('height', Math.max(4, yScale.bandwidth()))
      .attr('rx', 3)
      .attr('fill', (d) => colorScale(d.rangeUsd))
      .attr('stroke', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d: VolatilityInterval) {
        d3.select(this)
          .attr('stroke', isDark ? '#FBBF24' : '#0F172A')
          .attr('stroke-width', 1.5);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHovered({
            item: d,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mousemove', function (event: MouseEvent, d: VolatilityInterval) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHovered({
            item: d,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mouseleave', function () {
        d3.select(this)
          .attr('stroke', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)')
          .attr('stroke-width', 1);
        setHovered(null);
      });

    // X-Axis (show every 3rd hour tick for crisp legibility)
    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(uniqueColIndices.filter((_, i) => i % 3 === 0))
      .tickFormat((idx) => (colLabelMap.get(Number(idx)) ?? '').slice(0, 2) + 'h')
      .tickSize(0);

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${height + 4})`)
      .call(xAxis);
    xAxisGroup.select('.domain').remove();
    xAxisGroup
      .selectAll('text')
      .attr('fill', isDark ? '#64748B' : '#475569')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    // Y-Axis (:00, :15, :30, :45)
    const yAxis = d3.axisLeft(yScale).tickSize(0);
    const yAxisGroup = g.append('g').attr('transform', 'translate(-4,0)').call(yAxis);
    yAxisGroup.select('.domain').remove();
    yAxisGroup
      .selectAll('text')
      .attr('fill', isDark ? '#64748B' : '#475569')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');
  }, [data, containerWidth, isDark]);

  return (
    <section
      aria-label="Heatmap Volatilitate 24h XAU/USD"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4"
    >
      {/* Header + Summary Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#182030]">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Heatmap Volatilitate Istorică 24h · Intervale M15
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Amplitudinea True Range (USD / interval 15m) pe ultimele 24 de ore (UTC)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {data && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>
                Medie 15m{' '}
                <strong className="text-slate-900 dark:text-white">
                  ${data.summary.avgRangeUsd.toFixed(2)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Vârf 24h{' '}
                <strong className="text-amber-600 dark:text-amber-400">
                  ${data.summary.maxRangeUsd.toFixed(2)}
                </strong>{' '}
                ({data.summary.peakTimeLabel})
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Actual{' '}
                <strong className="text-slate-900 dark:text-white">
                  ${data.summary.currentRangeUsd.toFixed(2)}
                </strong>
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void fetchVolatility(true)}
            disabled={refreshing}
            aria-label="Reîmprospătează heatmap volatilitate"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Actualizează heatmap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading / Error / D3 Heatmap Body */}
      {loading && !data ? (
        <div className="mt-4 h-[168px] rounded-lg bg-slate-100 dark:bg-[#141A26] animate-pulse" />
      ) : error && !data ? (
        <div className="mt-4 py-6 text-xs text-rose-500 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchVolatility(true)}
            className="font-semibold underline cursor-pointer"
          >
            Reîncearcă
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="relative mt-3 w-full">
          <svg ref={svgRef} className="w-full h-[168px] block overflow-visible" />

          {/* Hover Tooltip */}
          {hovered && (
            <div
              className="pointer-events-none absolute z-20 rounded-lg border border-slate-200 dark:border-[#243045] bg-white/95 dark:bg-[#111622]/95 px-3 py-2 shadow-md text-[11px] font-mono tabular-nums whitespace-nowrap"
              style={{
                left: Math.min(Math.max(8, hovered.x + 12), Math.max(12, containerWidth - 210)),
                top: Math.max(4, hovered.y - 68),
              }}
            >
              <div className="font-semibold text-slate-900 dark:text-white">
                {hovered.item.fullTimeLabel} · {hovered.item.session}
              </div>
              <div className="mt-1 text-amber-600 dark:text-amber-400 font-semibold">
                Volatilitate: ${hovered.item.rangeUsd.toFixed(2)} ({hovered.item.rangePips.toFixed(0)} pips · {hovered.item.rangePct.toFixed(2)}%)
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                Range: {hovered.item.low.toFixed(2)} – {hovered.item.high.toFixed(2)}
              </div>
            </div>
          )}

          {/* Legend Scale */}
          <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>Calm</span>
            <div
              className="h-2 w-28 rounded-sm"
              style={{
                background: isDark
                  ? 'linear-gradient(90deg, #131B2B 0%, #1E3A5F 25%, #D97706 60%, #F59E0B 80%, #EF4444 100%)'
                  : 'linear-gradient(90deg, #E2E8F0 0%, #BAE6FD 25%, #FCD34D 60%, #F59E0B 80%, #DC2626 100%)',
              }}
            />
            <span>Extrem (${data?.summary.maxRangeUsd.toFixed(2) ?? '--'})</span>
          </div>
        </div>
      )}
    </section>
  );
}
