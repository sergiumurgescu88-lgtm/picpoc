import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { RefreshCw } from 'lucide-react';

interface MacroAssetPerformance {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePct24h: number;
  changePct7d: number;
}

interface CorrelationCell {
  rowId: string;
  colId: string;
  rowLabel: string;
  colLabel: string;
  value: number;
}

interface CorrelationMatrixReport {
  assets: MacroAssetPerformance[];
  matrix: CorrelationCell[];
  windowLabel: string;
  source: 'LIVE_MACRO' | 'ANCHORED_MODEL';
  timestamp: number;
}

interface CorrelationMatrixProps {
  isDark: boolean;
}

function describeCorrelation(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r >= 0 ? 'Corelație pozitivă puternică' : 'Corelație inversă puternică';
  if (abs >= 0.35) return r >= 0 ? 'Corelație pozitivă moderată' : 'Corelație inversă moderată';
  return 'Corelație slabă / neutră';
}

export function CorrelationMatrix({ isDark }: CorrelationMatrixProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [data, setData] = useState<CorrelationMatrixReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    cell: CorrelationCell;
    x: number;
    y: number;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(420);

  const fetchCorrelations = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const url = forceRefresh ? '/api/market/correlations?refresh=true' : '/api/market/correlations';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Nu s-a putut prelua matricea de corelații.');
      const json = (await res.json()) as CorrelationMatrixReport;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare corelații');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchCorrelations(false);
    const id = window.setInterval(() => {
      void fetchCorrelations(false);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [fetchCorrelations]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth || 420);
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

  // Draw D3 Diverging Correlation Matrix Heatmap
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || data.assets.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const labels = data.assets.map((a) => a.symbol);
    const margin = { top: 28, right: 12, bottom: 10, left: 66 };
    const totalWidth = Math.max(300, containerWidth);
    const totalHeight = 250;
    const width = totalWidth - margin.left - margin.right;
    const height = totalHeight - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand<string>().domain(labels).range([0, width]).padding(0.08);
    const yScale = d3.scaleBand<string>().domain(labels).range([0, height]).padding(0.08);

    const colorScale = d3
      .scaleDiverging<string>()
      .domain([-1, 0, 1])
      .interpolator(
        isDark
          ? d3.interpolateRgbBasis(['#DC2626', '#991B1B', '#1E293B', '#065F46', '#10B981'])
          : d3.interpolateRgbBasis(['#EF4444', '#FCA5A5', '#F1F5F9', '#6EE7B7', '#10B981'])
      );

    // Heatmap Cells
    g.selectAll<SVGRectElement, CorrelationCell>('rect.corr-cell')
      .data(data.matrix, (d) => `${d.rowId}-${d.colId}`)
      .enter()
      .append('rect')
      .attr('class', 'corr-cell')
      .attr('x', (d) => xScale(d.colLabel) ?? 0)
      .attr('y', (d) => yScale(d.rowLabel) ?? 0)
      .attr('width', Math.max(12, xScale.bandwidth()))
      .attr('height', Math.max(12, yScale.bandwidth()))
      .attr('rx', 5)
      .attr('fill', (d) => colorScale(d.value))
      .attr('stroke', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d: CorrelationCell) {
        d3.select(this)
          .attr('stroke', '#F59E0B')
          .attr('stroke-width', 1.75);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredCell({
            cell: d,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mousemove', function (event: MouseEvent, d: CorrelationCell) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredCell({
            cell: d,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mouseleave', function () {
        d3.select(this)
          .attr('stroke', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)')
          .attr('stroke-width', 1);
        setHoveredCell(null);
      });

    // Numeric Pearson correlation labels centered inside cells
    g.selectAll<SVGTextElement, CorrelationCell>('text.corr-val')
      .data(data.matrix, (d) => `${d.rowId}-${d.colId}`)
      .enter()
      .append('text')
      .attr('class', 'corr-val')
      .attr('x', (d) => (xScale(d.colLabel) ?? 0) + xScale.bandwidth() / 2)
      .attr('y', (d) => (yScale(d.rowLabel) ?? 0) + yScale.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .attr('fill', (d) => {
        if (Math.abs(d.value) >= 0.45) return '#FFFFFF';
        return isDark ? '#CBD5E1' : '#1E293B';
      })
      .text((d) => (d.value > 0 ? `+${(d.value ?? 0).toFixed(2)}` : (d.value ?? 0).toFixed(2)));

    // Top X-Axis
    const xAxis = d3.axisTop(xScale).tickSize(0);
    const xAxisG = g.append('g').attr('transform', 'translate(0,-6)').call(xAxis);
    xAxisG.select('.domain').remove();
    xAxisG
      .selectAll('text')
      .attr('fill', isDark ? '#94A3B8' : '#334155')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('font-weight', '600');

    // Left Y-Axis
    const yAxis = d3.axisLeft(yScale).tickSize(0);
    const yAxisG = g.append('g').attr('transform', 'translate(-6,0)').call(yAxis);
    yAxisG.select('.domain').remove();
    yAxisG
      .selectAll('text')
      .attr('fill', isDark ? '#94A3B8' : '#334155')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('font-weight', '600');
  }, [data, containerWidth, isDark]);

  return (
    <section
      aria-label="Matrice Corelație Macro XAU/USD"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#182030]">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Matrice Corelație Macro · XAU/USD vs Active Cheie
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Coeficient Pearson (r ∈ [-1, +1]) față de DXY, Argint (XAG), Mineri Aur (GDX) și US10Y
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {data.windowLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchCorrelations(true)}
            disabled={refreshing}
            aria-label="Reîmprospătează matricea de corelații"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#1E2738] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Actualizează corelațiile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading / Error / Split Matrix + Asset Performance Table */}
      {loading && !data ? (
        <div className="mt-4 h-[250px] rounded-lg bg-slate-100 dark:bg-[#141A26] animate-pulse" />
      ) : error && !data ? (
        <div className="mt-4 py-6 text-xs text-rose-500 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchCorrelations(true)}
            className="font-semibold underline cursor-pointer"
          >
            Reîncearcă
          </button>
        </div>
      ) : (
        data && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: D3 Correlation Heatmap */}
            <div ref={containerRef} className="lg:col-span-7 relative w-full">
              <svg ref={svgRef} className="w-full h-[250px] block overflow-visible" />

              {hoveredCell && (
                <div
                  className="pointer-events-none absolute z-20 rounded-lg border border-slate-200 dark:border-[#243045] bg-white/95 dark:bg-[#111622]/95 px-3 py-2 shadow-md text-[11px] font-mono tabular-nums whitespace-nowrap"
                  style={{
                    left: Math.min(Math.max(8, hoveredCell.x + 12), Math.max(12, containerWidth - 220)),
                    top: Math.max(4, hoveredCell.y - 54),
                  }}
                >
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {hoveredCell.cell.rowLabel} ↔ {hoveredCell.cell.colLabel}
                  </div>
                  <div
                    className={`mt-0.5 font-bold ${
                      hoveredCell.cell.value >= 0.35
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : hoveredCell.cell.value <= -0.35
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500'
                    }`}
                  >
                    r = {hoveredCell.cell.value > 0 ? '+' : ''}
                    {(hoveredCell.cell.value ?? 0).toFixed(2)} · {describeCorrelation(hoveredCell.cell.value)}
                  </div>
                </div>
              )}

              {/* Diverging Scale Legend */}
              <div className="mt-2 flex items-center justify-end gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span>-1.00 Inversă</span>
                <div
                  className="h-2 w-28 rounded-sm"
                  style={{
                    background: isDark
                      ? 'linear-gradient(90deg, #DC2626 0%, #1E293B 50%, #10B981 100%)'
                      : 'linear-gradient(90deg, #EF4444 0%, #F1F5F9 50%, #10B981 100%)',
                  }}
                />
                <span>+1.00 Directă</span>
              </div>
            </div>

            {/* Right: Macro Assets Performance Comparison Table */}
            <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#182030] pt-4 lg:pt-0 lg:pl-5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white mb-2.5">
                Performanță Relativă Active Macro
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                    <th className="py-1.5 text-left font-medium">Activ</th>
                    <th className="py-1.5 text-right font-medium">Cotație</th>
                    <th className="py-1.5 text-right font-medium">24h</th>
                    <th className="py-1.5 text-right font-medium">Fereastră</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                  {data.assets.map((asset) => {
                    const pos24 = asset.changePct24h >= 0;
                    const pos7d = asset.changePct7d >= 0;
                    return (
                      <tr key={asset.id}>
                        <td className="py-2 pr-2">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {asset.symbol}
                          </div>
                          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                            {asset.name}
                          </div>
                        </td>
                        <td className="py-2 text-right text-slate-900 dark:text-slate-200">
                          {(asset.price ?? 0).toFixed(2)}
                        </td>
                        <td
                          className={`py-2 text-right font-semibold ${
                            pos24
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pos24 ? '+' : ''}
                          {(asset.changePct24h ?? 0).toFixed(2)}%
                        </td>
                        <td
                          className={`py-2 text-right ${
                            pos7d
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pos7d ? '+' : ''}
                          {(asset.changePct7d ?? 0).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </section>
  );
}
