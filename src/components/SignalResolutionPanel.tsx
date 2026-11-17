import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  EquityCurvePoint,
  SignalResolutionReport,
  TargetMilestone,
  TradingSignal,
} from '../types/trading';

interface SignalResolutionPanelProps {
  signals: TradingSignal[];
  isDark: boolean;
  onInspectSignal: (signalId: string) => void;
}

type StatusFilter = 'ALL' | 'WON' | 'LOST' | 'TP4' | 'ACTIVE';
type DirectionFilter = 'ALL' | 'BUY' | 'SELL';
type EquityMetric = 'R' | 'PIPS' | 'USD';

const STATUS_LABELS: Record<TradingSignal['status'], string> = {
  ACTIVE: 'Activ (În așteptare)',
  TP1_HIT: 'TP1 Atins',
  TP2_HIT: 'TP2 Atins',
  TP3_HIT: 'TP3 Atins',
  TP4_HIT: 'TP4 Atins (Full)',
  SL_HIT: 'SL Atins',
  CLOSED: 'Închis Manual',
};

function formatDuration(startMs: number, endMs?: number): string {
  if (!endMs || endMs < startMs) return 'În curs';
  const totalMin = Math.max(1, Math.round((endMs - startMs) / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatMetricValue(val: number, metric: EquityMetric, showPlus = true): string {
  const sign = val > 0 && showPlus ? '+' : val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (metric === 'R') return `${sign}${abs.toFixed(2)}R`;
  if (metric === 'PIPS') return `${sign}${abs.toFixed(1)}p`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function SignalResolutionPanel({
  signals,
  isDark,
  onInspectSignal,
}: SignalResolutionPanelProps) {
  const [report, setReport] = useState<SignalResolutionReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [equityMetric, setEquityMetric] = useState<EquityMetric>('R');

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(600);
  const [hoveredPoint, setHoveredPoint] = useState<{
    point: EquityCurvePoint;
    x: number;
    y: number;
  } | null>(null);

  // Key that changes whenever signal count or any signal's status/milestone changes
  const signalSyncKey = useMemo(
    () => signals.map((s) => `${s.id}:${s.status}:${s.reachedTargets.length}`).join('|'),
    [signals]
  );

  const fetchResolution = useCallback(async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      const res = await fetch('/api/signals/resolution');
      if (!res.ok) throw new Error('Nu s-a putut prelua raportul de rezoluție al semnalelor.');
      const json = (await res.json()) as SignalResolutionReport;
      setReport(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcarea rezoluției');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchResolution(false);
  }, [fetchResolution, signalSyncKey]);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    setChartWidth(el.clientWidth || 600);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setChartWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw D3 Time-Based Dual-Pane Equity Curve (Total Profit + High-Water Mark + Underwater Drawdown)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !report || report.equityCurve.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const rawPoints = report.equityCurve;
    const getCum = (p: EquityCurvePoint): number =>
      equityMetric === 'R' ? p.cumulativeR : p.cumulativePips;
    const getPeak = (p: EquityCurvePoint): number =>
      equityMetric === 'R' ? p.peakR : p.peakPips;
    const getDd = (p: EquityCurvePoint): number =>
      equityMetric === 'R' ? p.drawdownR : p.drawdownPips;

    // Ensure strictly monotonic timestamps for clean time-scale rendering
    const plotPoints = rawPoints.map((p, i) => {
      const prevTs = i > 0 ? rawPoints[i - 1].timestamp : p.timestamp - 60_000;
      const safeTs = i > 0 && p.timestamp <= prevTs ? prevTs + 60_000 : p.timestamp;
      return {
        ...p,
        plotDate: new Date(safeTs),
        val: getCum(p),
        peakVal: getPeak(p),
        ddVal: getDd(p),
      };
    });

    const firstTs = plotPoints[0].plotDate.getTime();
    const lastTs = plotPoints[plotPoints.length - 1].plotDate.getTime();
    const originTs = firstTs - Math.max(3_600_000, Math.round((lastTs - firstTs) * 0.06));
    const originNode = {
      plotDate: new Date(originTs),
      val: 0,
      peakVal: 0,
      ddVal: 0,
    };

    const fullSeries = [
      originNode,
      ...plotPoints.map((p) => ({
        plotDate: p.plotDate,
        val: p.val,
        peakVal: p.peakVal,
        ddVal: p.ddVal,
      })),
    ];

    const margin = { top: 14, right: 16, bottom: 26, left: 54 };
    const totalWidth = Math.max(320, chartWidth);
    const totalHeight = 296;
    const width = totalWidth - margin.left - margin.right;

    const equityTop = 0;
    const equityHeight = 166;
    const paneGap = 24;
    const ddTop = equityTop + equityHeight + paneGap;
    const ddHeight = totalHeight - margin.top - margin.bottom - ddTop;

    svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleTime()
      .domain([originNode.plotDate, plotPoints[plotPoints.length - 1].plotDate])
      .range([0, width]);

    const eqValues = [0, ...plotPoints.flatMap((p) => [p.val, p.peakVal])];
    const minEq = Math.min(...eqValues);
    const maxEq = Math.max(...eqValues);
    const eqPad = Math.max(equityMetric === 'R' ? 0.6 : 25, (maxEq - minEq) * 0.16);
    const yEqScale = d3
      .scaleLinear()
      .domain([Math.min(0, minEq - eqPad), Math.max(equityMetric === 'R' ? 1 : 40, maxEq + eqPad)])
      .nice()
      .range([equityTop + equityHeight, equityTop]);

    const minDd = Math.min(0, ...plotPoints.map((p) => p.ddVal));
    const ddFloor = minDd < 0 ? minDd * 1.2 : equityMetric === 'R' ? -1 : -30;
    const yDdScale = d3
      .scaleLinear()
      .domain([ddFloor, 0])
      .nice()
      .range([ddTop + ddHeight, ddTop]);

    const tickFormatter = (val: d3.NumberValue) => {
      const n = Number(val);
      if (equityMetric === 'R') return `${n > 0 ? '+' : ''}${n.toFixed(1)}R`;
      if (equityMetric === 'PIPS') return `${n > 0 ? '+' : ''}${Math.round(n)}p`;
      return `${n > 0 ? '+' : n < 0 ? '-' : ''}$${Math.abs(Math.round(n))}`;
    };

    // Upper Pane Gridlines
    g.append('g')
      .call(
        d3
          .axisLeft(yEqScale)
          .ticks(4)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.08)');

    // Zero Equity Baseline
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yEqScale(0))
      .attr('y2', yEqScale(0))
      .attr('stroke', isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)')
      .attr('stroke-dasharray', '4 4');

    const finalVal = plotPoints[plotPoints.length - 1]?.val ?? 0;
    const eqColor = finalVal >= 0 ? '#10B981' : '#EF4444';

    const defs = svg.append('defs');
    const eqGradId = `eq-grad-${equityMetric}-${isDark ? 'dark' : 'light'}`;
    const eqGrad = defs
      .append('linearGradient')
      .attr('id', eqGradId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    eqGrad.append('stop').attr('offset', '0%').attr('stop-color', eqColor).attr('stop-opacity', 0.25);
    eqGrad.append('stop').attr('offset', '100%').attr('stop-color', eqColor).attr('stop-opacity', 0.02);

    // Equity profit fill to zero
    const eqArea = d3
      .area<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y0(yEqScale(0))
      .y1((d) => yEqScale(d.val))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(fullSeries).attr('fill', `url(#${eqGradId})`).attr('d', eqArea);

    // Drawdown underwater gap area between High-Water Mark (peak) and Equity line
    const ddGapArea = d3
      .area<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y0((d) => yEqScale(d.peakVal))
      .y1((d) => yEqScale(d.val))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(fullSeries)
      .attr('fill', isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.14)')
      .attr('d', ddGapArea);

    // High-Water Mark (Peak) dashed line
    const peakLine = d3
      .line<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y((d) => yEqScale(d.peakVal))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(fullSeries)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 1.25)
      .attr('stroke-dasharray', '4 3')
      .attr('opacity', 0.75)
      .attr('d', peakLine);

    // Main Cumulative Equity Line
    const eqLine = d3
      .line<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y((d) => yEqScale(d.val))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(fullSeries)
      .attr('fill', 'none')
      .attr('stroke', eqColor)
      .attr('stroke-width', 2.25)
      .attr('d', eqLine);

    // Lower Drawdown Sub-Pane Label & Grid
    g.append('text')
      .attr('x', 0)
      .attr('y', ddTop - 7)
      .attr('fill', isDark ? '#94A3B8' : '#64748B')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .text('DRAWDOWN');

    g.append('g')
      .call(
        d3
          .axisLeft(yDdScale)
          .ticks(2)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.08)');

    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', yDdScale(0))
      .attr('y2', yDdScale(0))
      .attr('stroke', isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)');

    // Underwater Drawdown Area & Stroke
    const ddArea = d3
      .area<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y0(yDdScale(0))
      .y1((d) => yDdScale(d.ddVal))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(fullSeries)
      .attr('fill', isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.22)')
      .attr('d', ddArea);

    const ddLine = d3
      .line<typeof originNode>()
      .x((d) => xScale(d.plotDate))
      .y((d) => yDdScale(d.ddVal))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(fullSeries)
      .attr('fill', 'none')
      .attr('stroke', '#EF4444')
      .attr('stroke-width', 1.6)
      .attr('d', ddLine);

    // Highlight Max Drawdown point if drawdown occurred
    const maxDdPoint = plotPoints.reduce(
      (minP, cur) => (cur.ddVal < minP.ddVal ? cur : minP),
      plotPoints[0]
    );
    if (maxDdPoint && maxDdPoint.ddVal < 0) {
      g.append('circle')
        .attr('cx', xScale(maxDdPoint.plotDate))
        .attr('cy', yDdScale(maxDdPoint.ddVal))
        .attr('r', 4)
        .attr('fill', '#EF4444')
        .attr('stroke', isDark ? '#0D111A' : '#FFFFFF')
        .attr('stroke-width', 1.5);
    }

    // Trade dots on Equity Curve
    const dots = g
      .selectAll<SVGCircleElement, (typeof plotPoints)[number]>('circle.eq-dot')
      .data(plotPoints)
      .enter()
      .append('circle')
      .attr('class', 'eq-dot')
      .attr('cx', (d) => xScale(d.plotDate))
      .attr('cy', (d) => yEqScale(d.val))
      .attr('r', 3.5)
      .attr('fill', (d) => (d.resolution === 'WON' ? '#10B981' : '#EF4444'))
      .attr('stroke', isDark ? '#0D111A' : '#FFFFFF')
      .attr('stroke-width', 1.4);

    // Y Axes
    const yEqAxisG = g.append('g').call(d3.axisLeft(yEqScale).ticks(4).tickFormat(tickFormatter));
    yEqAxisG.select('.domain').remove();
    yEqAxisG
      .selectAll('text')
      .attr('fill', isDark ? '#94A3B8' : '#475569')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    const yDdAxisG = g.append('g').call(d3.axisLeft(yDdScale).ticks(2).tickFormat(tickFormatter));
    yDdAxisG.select('.domain').remove();
    yDdAxisG
      .selectAll('text')
      .attr('fill', isDark ? '#94A3B8' : '#475569')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    // Bottom Time X-Axis
    const timeFormat = d3.timeFormat('%d.%m %H:%M');
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(5, Math.max(2, Math.floor(width / 115))))
      .tickFormat((d) => timeFormat(d as Date));
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${ddTop + ddHeight})`)
      .call(xAxis);
    xAxisG.select('.domain').attr('stroke', isDark ? '#1E293B' : '#CBD5E1');
    xAxisG
      .selectAll('text')
      .attr('fill', isDark ? '#94A3B8' : '#475569')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    // Shared Vertical Crosshair (hidden until hover)
    const crosshair = g
      .append('line')
      .attr('y1', equityTop)
      .attr('y2', ddTop + ddHeight)
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3')
      .style('opacity', 0)
      .style('pointer-events', 'none');

    const bisectDate = d3.bisector<(typeof plotPoints)[number], Date>((d) => d.plotDate).left;

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', ddTop + ddHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event: MouseEvent) {
        const [mx] = d3.pointer(event, this);
        const hoveredDate = xScale.invert(mx);
        const idx = bisectDate(plotPoints, hoveredDate, 1);
        const d0 = plotPoints[idx - 1];
        const d1 = plotPoints[idx];
        let nearest = d0;
        if (d1 && d0) {
          nearest =
            hoveredDate.getTime() - d0.plotDate.getTime() >
            d1.plotDate.getTime() - hoveredDate.getTime()
              ? d1
              : d0;
        }
        if (!nearest) return;

        const cx = xScale(nearest.plotDate);
        crosshair.attr('x1', cx).attr('x2', cx).style('opacity', 1);
        dots.attr('r', (d) => (d.signalId === nearest.signalId ? 6 : 3.5));

        const rect = chartContainerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredPoint({
            point: nearest,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mouseleave', () => {
        crosshair.style('opacity', 0);
        dots.attr('r', 3.5);
        setHoveredPoint(null);
      });
  }, [report, chartWidth, isDark, equityMetric]);

  const filteredSignals = useMemo(() => {
    const list = report?.signals ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((s) => {
      if (statusFilter === 'WON' && s.resolution !== 'WON') return false;
      if (statusFilter === 'LOST' && s.resolution !== 'LOST') return false;
      if (statusFilter === 'TP4' && !s.reachedTargets.includes('TP4')) return false;
      if (statusFilter === 'ACTIVE' && s.resolution !== 'ACTIVE') return false;
      if (directionFilter !== 'ALL' && s.direction !== directionFilter) return false;
      if (
        q &&
        !s.setupType.toLowerCase().includes(q) &&
        !s.timeframe.toLowerCase().includes(q) &&
        !s.id.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [report, statusFilter, directionFilter, searchQuery]);

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      'ID',
      'Data_Creare',
      'Directie',
      'Timeframe',
      'Setup',
      'Entry',
      'StopLoss',
      'TP1',
      'TP2',
      'TP3',
      'TP4',
      'Tinte_Atinse',
      'Status_Final',
      'Rezolutie',
      'Pips',
      'R_Multiple',
    ];
    const rows = filteredSignals.map((s) => [
      s.id,
      new Date(s.createdAt).toISOString(),
      s.direction,
      s.timeframe,
      `"${s.setupType.replace(/"/g, '""')}"`,
      s.entry.toFixed(2),
      s.stopLoss.toFixed(2),
      s.tp1.toFixed(2),
      s.tp2.toFixed(2),
      s.tp3.toFixed(2),
      s.tp4.toFixed(2),
      `"${s.reachedTargets.join(' -> ')}"`,
      s.status,
      s.resolution,
      s.pnlPips.toFixed(1),
      s.rMultiple.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssociety-rezolutie-semnale-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] animate-pulse" />
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 flex items-center justify-between text-xs text-rose-600 dark:text-rose-300">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void fetchResolution(true)}
          className="font-semibold underline cursor-pointer"
        >
          Reîncearcă
        </button>
      </div>
    );
  }

  if (!report) return null;

  const { overview, byDirection, milestones, byTimeframe } = report;
  const totalDir = Math.max(1, byDirection.long.total + byDirection.short.total);
  const longSharePct = Math.round((byDirection.long.total / totalDir) * 100);
  const shortSharePct = 100 - longSharePct;

  const milestoneRows: {
    key: string;
    label: string;
    count: number;
    pct: number;
    barClass: string;
    textClass: string;
  }[] = [
    {
      key: 'tp1',
      label: 'TP1 Atins (Primul Prag Securizat)',
      count: milestones.tp1HitCount,
      pct: milestones.tp1HitRatePct,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'tp2',
      label: 'TP2 Atins (Țintă Principală)',
      count: milestones.tp2HitCount,
      pct: milestones.tp2HitRatePct,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'tp3',
      label: 'TP3 Atins (Extensie Trend)',
      count: milestones.tp3HitCount,
      pct: milestones.tp3HitRatePct,
      barClass: 'bg-teal-500',
      textClass: 'text-teal-600 dark:text-teal-400',
    },
    {
      key: 'tp4',
      label: 'TP4 Atins (Full Target Maxim)',
      count: milestones.tp4HitCount,
      pct: milestones.tp4HitRatePct,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'sl',
      label: 'Stop-Loss (SL) Atins',
      count: milestones.slHitCount,
      pct: milestones.slHitRatePct,
      barClass: 'bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Title & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Rezoluție & Audit Complet Semnale XAU/USD
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evaluare automată walk-forward și urmărire live pe fiecare prag: TP1, TP2, TP3, TP4 și SL · Protecție Breakeven activată după TP1
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchResolution(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-white dark:bg-[#0D111A] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Actualizează Audit</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Row 1: 4 Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Semnale Emise</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.totalSignals}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {byDirection.long.total} Long · {byDirection.short.total} Short · {overview.openRunningCount} Deschise
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Câștigate vs Pierdute</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            <span className="text-emerald-600 dark:text-emerald-400">{overview.wonCount} W</span>
            <span className="mx-1.5 text-slate-400">/</span>
            <span className="text-rose-600 dark:text-rose-400">{overview.lostCount} L</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Win Rate {overview.winRatePct.toFixed(1)}% · {overview.activePendingCount} în așteptare
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Randament Net Cumulat</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              overview.netR >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {overview.netR >= 0 ? '+' : ''}
            {overview.netR.toFixed(2)}R
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {overview.netPips >= 0 ? '+' : ''}
            {overview.netPips.toFixed(1)} pips · Medie {overview.expectancyR >= 0 ? '+' : ''}
            {overview.expectancyR.toFixed(2)}R/trade
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Profit Factor & Full TP4</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            PF {overview.profitFactor.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {milestones.tp4HitCount} atinse TP4 · Durată medie {overview.avgDurationMinutes}m
          </div>
        </div>
      </div>

      {/* Row 2: Direction Breakdown (Long vs Short) + Target Milestones Funnel (TP1-TP4 & SL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Long vs Short */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#182030]">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Distribuție Direcțională: Long vs Short
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Performanță defalcată pe semnale BUY (Long) și SELL (Short)
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {longSharePct}% / {shortSharePct}%
            </span>
          </div>

          {/* Combined Proportion Bar */}
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-[#141A26]">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${longSharePct}%` }}
                title={`Long BUY: ${byDirection.long.total}`}
              />
              <div
                className="bg-rose-500 transition-all duration-300"
                style={{ width: `${shortSharePct}%` }}
                title={`Short SELL: ${byDirection.short.total}`}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                LONG (BUY): {byDirection.long.total}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                SHORT (SELL): {byDirection.short.total}
              </span>
            </div>
          </div>

          {/* Detailed Direction Comparison Rows (Hairline separated, no nested cards) */}
          <div className="divide-y divide-slate-100 dark:divide-[#182030]">
            {[
              {
                label: 'Poziții LONG (BUY)',
                isBuy: true,
                stats: byDirection.long,
              },
              {
                label: 'Poziții SHORT (SELL)',
                isBuy: false,
                stats: byDirection.short,
              },
            ].map((item) => (
              <div key={item.label} className="py-3.5 first:pt-1 last:pb-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      item.isBuy
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {item.isBuy ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {item.label}
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    Win Rate {item.stats.winRatePct.toFixed(1)}%
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[11px] text-slate-500">Total</div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {item.stats.total}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[11px] text-slate-500">Câștigate</div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {item.stats.won}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[11px] text-slate-500">Pierdute</div>
                    <div className="font-semibold text-rose-600 dark:text-rose-400">
                      {item.stats.lost}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-sans text-[11px] text-slate-500">Net R / Pips</div>
                    <div
                      className={`font-semibold ${
                        item.stats.netR >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {item.stats.netR >= 0 ? '+' : ''}
                      {item.stats.netR.toFixed(1)}R
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Target Milestones Hit Funnel (TP1, TP2, TP3, TP4, SL) */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#182030]">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Rezoluție Ținte Atinse: TP1 · TP2 · TP3 · TP4 & Stop-Loss
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rata de atingere calculată pe cele {overview.resolvedCount} semnale evaluate · {milestones.activePendingCount} active în așteptare · {milestones.manualClosedCount} închise manual
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {milestoneRows.map((row) => (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{row.label}</span>
                  <div className="font-mono tabular-nums flex items-center gap-3">
                    <span className={`font-bold ${row.textClass}`}>{row.count} semnale</span>
                    <span className="w-12 text-right text-slate-500 dark:text-slate-400">
                      {row.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#141A26] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${row.barClass}`}
                    style={{ width: `${Math.min(100, Math.max(row.count > 0 ? 3 : 0, row.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#182030] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>
              Win mediu: <strong className="text-emerald-600 dark:text-emerald-400">+{overview.avgWinR.toFixed(2)}R</strong>
            </span>
            <span>
              Loss mediu: <strong className="text-rose-600 dark:text-rose-400">{overview.avgLossR.toFixed(2)}R</strong>
            </span>
            <span>
              Expectancy: <strong className="text-slate-900 dark:text-white">{overview.expectancyR >= 0 ? '+' : ''}{overview.expectancyR.toFixed(2)}R / semnal</strong>
            </span>
          </div>
        </section>
      </div>

      {/* Row 3: D3 Equity Curve (Total Profit + Drawdown) + Timeframe Performance Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Equity Curve & Drawdown */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#182030]">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Curba de Echitate, Profit Total & Drawdown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evoluția cumulată în timp a celor {report.equityCurve.length} semnale rezolvate
              </p>
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
              {(
                [
                  { id: 'R', label: 'R-Multiple' },
                  { id: 'PIPS', label: 'Pips' },
                  { id: 'USD', label: 'USD (0.10L)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEquityMetric(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    equityMetric === opt.id
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Profit Total / Peak / Max Drawdown Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-1 text-xs font-mono tabular-nums">
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                  Profit Total:
                </span>
                <strong
                  className={
                    (equityMetric === 'R' ? overview.netR : overview.netPips) >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {formatMetricValue(
                    equityMetric === 'R' ? overview.netR : overview.netPips,
                    equityMetric
                  )}
                </strong>
              </div>
              <div>
                <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                  Vârf (HWM):
                </span>
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatMetricValue(
                    equityMetric === 'R' ? overview.peakR : overview.peakPips,
                    equityMetric
                  )}
                </strong>
              </div>
              <div>
                <span className="font-sans text-slate-500 dark:text-slate-400 mr-1.5">
                  Max Drawdown:
                </span>
                <strong className="text-rose-600 dark:text-rose-400">
                  {formatMetricValue(
                    equityMetric === 'R' ? overview.maxDrawdownR : overview.maxDrawdownPips,
                    equityMetric,
                    false
                  )}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-3 font-sans text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
                Echitate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-amber-500 inline-block" />
                Vârf (HWM)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500/40 border border-rose-500 inline-block" />
                Drawdown
              </span>
            </div>
          </div>

          <div ref={chartContainerRef} className="relative w-full">
            {report.equityCurve.length === 0 ? (
              <div className="h-[296px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                Nu există încă semnale rezolvate pentru trasarea curbei de echitate.
              </div>
            ) : (
              <>
                <svg ref={svgRef} className="w-full h-[296px] block overflow-visible" />
                {hoveredPoint && (
                  <div
                    className="pointer-events-none absolute z-20 rounded-lg border border-slate-200 dark:border-[#243045] bg-white/95 dark:bg-[#111622]/95 px-3 py-2 shadow-md text-[11px] font-mono tabular-nums whitespace-nowrap"
                    style={{
                      left: Math.min(Math.max(8, hoveredPoint.x + 12), Math.max(12, chartWidth - 255)),
                      top: Math.max(4, hoveredPoint.y - 84),
                    }}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">
                      #{hoveredPoint.point.index} · {hoveredPoint.point.direction} {hoveredPoint.point.timeframe} ·{' '}
                      {new Date(hoveredPoint.point.timestamp).toLocaleString('ro-RO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                      {hoveredPoint.point.setupType}
                    </div>
                    <div
                      className={`mt-1 font-bold ${
                        hoveredPoint.point.resolution === 'WON'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      Trade: {hoveredPoint.point.tradeR >= 0 ? '+' : ''}
                      {hoveredPoint.point.tradeR.toFixed(2)}R ({hoveredPoint.point.tradePips >= 0 ? '+' : ''}
                      {hoveredPoint.point.tradePips.toFixed(1)}p)
                    </div>
                    <div className="text-slate-700 dark:text-slate-200">
                      Profit Total: {hoveredPoint.point.cumulativeR >= 0 ? '+' : ''}
                      {hoveredPoint.point.cumulativeR.toFixed(2)}R ({hoveredPoint.point.cumulativePips >= 0 ? '+' : ''}
                      {hoveredPoint.point.cumulativePips.toFixed(1)}p /{' '}
                      {hoveredPoint.point.cumulativePips >= 0 ? '+' : '-'}$
                      {Math.abs(hoveredPoint.point.cumulativePips).toFixed(2)})
                    </div>
                    <div className="text-rose-600 dark:text-rose-400">
                      Drawdown: {hoveredPoint.point.drawdownR.toFixed(2)}R (
                      {hoveredPoint.point.drawdownPips.toFixed(1)}p)
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Timeframe Breakdown */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-3">
          <div className="pb-2 border-b border-slate-100 dark:border-[#182030]">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Performanță pe Timeframe
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparativ semnale Long / Short și Win Rate per interval
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                  <th className="py-2 text-left font-medium">TF</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">L / S</th>
                  <th className="py-2 text-right font-medium">W / L</th>
                  <th className="py-2 text-right font-medium">Win %</th>
                  <th className="py-2 text-right font-medium">Net R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                {byTimeframe.map((row) => (
                  <tr key={row.timeframe}>
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-white">
                      {row.timeframe}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">
                      {row.total}
                    </td>
                    <td className="py-2.5 text-right text-slate-500 dark:text-slate-400">
                      {row.longCount}/{row.shortCount}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-emerald-600 dark:text-emerald-400">{row.won}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-rose-600 dark:text-rose-400">{row.lost}</span>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-900 dark:text-white">
                      {row.won + row.lost > 0 ? `${row.winRatePct.toFixed(0)}%` : '—'}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        row.netR > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.netR < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.won + row.lost > 0
                        ? `${row.netR >= 0 ? '+' : ''}${row.netR.toFixed(1)}R`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Row 4: Full Filterable Audit Ledger of All Signals */}
      <section className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#1C2331] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Registru Individual de Rezoluție ({filteredSignals.length} / {overview.totalSignals})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fiecare semnal afișează progresul exact atins pe pragurile TP1, TP2, TP3, TP4 și Stop-Loss
            </p>
          </div>

          {/* Interactive Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
              {(
                [
                  { id: 'ALL', label: 'Toate' },
                  { id: 'WON', label: 'Câștigate' },
                  { id: 'LOST', label: 'Pierdute' },
                  { id: 'TP4', label: 'TP4 Full' },
                  { id: 'ACTIVE', label: 'Active' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
              {(
                [
                  { id: 'ALL', label: 'L+S' },
                  { id: 'BUY', label: 'Long' },
                  { id: 'SELL', label: 'Short' },
                ] as const
              ).map((dir) => (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => setDirectionFilter(dir.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    directionFilter === dir.id
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {dir.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Caută setup / TF..."
                className="pl-8 pr-3 py-1.5 w-40 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 text-left font-medium">Data / Oră</th>
                <th className="py-2.5 px-3 text-left font-medium">Tip</th>
                <th className="py-2.5 px-3 text-left font-medium">Setup / TF</th>
                <th className="py-2.5 px-3 text-right font-medium">Entry</th>
                <th className="py-2.5 px-3 text-right font-medium">SL</th>
                <th className="py-2.5 px-3 text-center font-medium">Ținte Atinse (TP1–TP4 / SL)</th>
                <th className="py-2.5 px-3 text-left font-medium">Rezoluție</th>
                <th className="py-2.5 px-3 text-right font-medium">Rezultat</th>
                <th className="py-2.5 px-3 text-right font-medium">Durată</th>
                <th className="py-2.5 px-4 text-right font-medium">Grafic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center font-sans text-slate-500 dark:text-slate-400">
                    Niciun semnal nu corespunde filtrelor selectate.
                  </td>
                </tr>
              ) : (
                filteredSignals.map((sig) => {
                  const isBuy = sig.direction === 'BUY';
                  const isWin = sig.resolution === 'WON';
                  const isLoss = sig.resolution === 'LOST';
                  const milestonesOrder: TargetMilestone[] = ['TP1', 'TP2', 'TP3', 'TP4'];

                  return (
                    <tr
                      key={sig.id}
                      className="hover:bg-slate-50 dark:hover:bg-[#111622] transition-colors"
                    >
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {new Date(sig.createdAt).toLocaleString('ro-RO', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold whitespace-nowrap ${
                          isBuy
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isBuy ? 'LONG' : 'SHORT'}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {sig.setupType}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {sig.timeframe} · Conf. {sig.confidence}%
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-900 dark:text-white">
                        {sig.entry.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">
                        {sig.stopLoss.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-2 text-[11px]">
                          {milestonesOrder.map((tp) => {
                            const hit = sig.reachedTargets.includes(tp);
                            return (
                              <span
                                key={tp}
                                title={`${tp}: ${sig[tp.toLowerCase() as 'tp1' | 'tp2' | 'tp3' | 'tp4'].toFixed(2)}`}
                                className={`inline-flex items-center gap-0.5 ${
                                  hit
                                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                    : 'text-slate-400 dark:text-slate-600'
                                }`}
                              >
                                {tp}
                                {hit ? <Check className="w-3 h-3" /> : ''}
                              </span>
                            );
                          })}
                          {sig.reachedTargets.includes('SL') && (
                            <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold">
                              SL
                              <X className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            isWin
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isLoss
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isWin ? 'Câștigat' : isLoss ? 'Pierdut' : 'Activ'}
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          · {STATUS_LABELS[sig.status]}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${
                          sig.pnlPips >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {sig.pnlPips >= 0 ? '+' : ''}
                        {sig.pnlPips.toFixed(1)}p ({sig.rMultiple >= 0 ? '+' : ''}
                        {sig.rMultiple.toFixed(2)}R)
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDuration(sig.createdAt, sig.closedAt)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => onInspectSignal(sig.id)}
                          title="Vezi semnalul pe graficul principal"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-[#222C40] text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <span>Grafic</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
