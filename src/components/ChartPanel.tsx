import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineSeries,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  Candle,
  TechnicalAnalysisReport,
  Timeframe,
  TradingSignal,
} from '../types/trading';
import { RSIIndicator } from './RSIIndicator';

interface ChartPanelProps {
  candles: Candle[];
  analysis: TechnicalAnalysisReport | null;
  selectedSignal: TradingSignal | null;
  timeframe: Timeframe;
  isDark: boolean;
  isLoading: boolean;
  sourceDetail?: string;
}

export function ChartPanel({
  candles,
  analysis,
  selectedSignal,
  timeframe,
  isDark,
  isLoading,
  sourceDetail,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const [showEma, setShowEma] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(true);

  // Initialize Lightweight Charts v5 instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0D111A' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(226, 232, 240, 0.7)' },
        horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(226, 232, 240, 0.7)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(212, 175, 55, 0.5)',
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(212, 175, 55, 0.5)',
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#1C2331' : '#E2E8F0',
      },
      timeScale: {
        borderColor: isDark ? '#1C2331' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: 460,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    const ema20 = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema50 = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema200 = chart.addSeries(LineSeries, {
      color: '#A855F7',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(148, 163, 184, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(148, 163, 184, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20;
    ema50SeriesRef.current = ema50;
    ema200SeriesRef.current = ema200;
    bbUpperRef.current = bbUpper;
    bbLowerRef.current = bbLower;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // Update theme colors smoothly
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0D111A' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(226, 232, 240, 0.7)' },
        horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(226, 232, 240, 0.7)' },
      },
      rightPriceScale: { borderColor: isDark ? '#1C2331' : '#E2E8F0' },
      timeScale: { borderColor: isDark ? '#1C2331' : '#E2E8F0' },
    });
  }, [isDark]);

  // Sync candles & indicator overlays
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
    candleSeriesRef.current.setData(
      sortedCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (analysis && showEma) {
      ema20SeriesRef.current?.setData(
        analysis.emaSeries.ema20.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
      ema50SeriesRef.current?.setData(
        analysis.emaSeries.ema50.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
      ema200SeriesRef.current?.setData(
        analysis.emaSeries.ema200.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
    } else {
      ema20SeriesRef.current?.setData([]);
      ema50SeriesRef.current?.setData([]);
      ema200SeriesRef.current?.setData([]);
    }

    if (analysis && showBollinger) {
      bbUpperRef.current?.setData(
        analysis.emaSeries.bbUpper.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
      bbLowerRef.current?.setData(
        analysis.emaSeries.bbLower.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      );
    } else {
      bbUpperRef.current?.setData([]);
      bbLowerRef.current?.setData([]);
    }
  }, [candles, analysis, showEma, showBollinger]);

  // Draw Entry / SL / TP1 / TP2 / TP3 price lines for the selected signal
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // Ignore stale line
      }
    }
    priceLinesRef.current = [];

    if (!selectedSignal) return;

    const linesConfig = [
      {
        price: selectedSignal.entry,
        color: '#F59E0B',
        lineStyle: LineStyle.Solid,
        title: `ENTRY ${selectedSignal.direction}`,
      },
      {
        price: selectedSignal.stopLoss,
        color: '#EF4444',
        lineStyle: LineStyle.Dashed,
        title: 'SL',
      },
      {
        price: selectedSignal.tp1,
        color: '#10B981',
        lineStyle: LineStyle.Dotted,
        title: 'TP1',
      },
      {
        price: selectedSignal.tp2,
        color: '#10B981',
        lineStyle: LineStyle.Dashed,
        title: 'TP2',
      },
      {
        price: selectedSignal.tp3,
        color: '#059669',
        lineStyle: LineStyle.Solid,
        title: 'TP3',
      },
      {
        price: selectedSignal.tp4,
        color: '#047857',
        lineStyle: LineStyle.Solid,
        title: 'TP4',
      },
    ];

    priceLinesRef.current = linesConfig.map((cfg) =>
      series.createPriceLine({
        price: cfg.price,
        color: cfg.color,
        lineWidth: 1,
        lineStyle: cfg.lineStyle,
        axisLabelVisible: true,
        title: cfg.title,
      })
    );
  }, [selectedSignal]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] overflow-hidden">
      {/* Chart Header Bar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Grafic Instituțional XAU/USD · {timeframe}
          </h2>
          {sourceDetail && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sourceDetail}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showEma
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-slate-200 dark:border-[#1E2738] text-slate-500 dark:text-slate-400'
            }`}
          >
            EMA 20 / 50 / 200
          </button>
          <button
            type="button"
            onClick={() => setShowBollinger((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showBollinger
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                : 'border-slate-200 dark:border-[#1E2738] text-slate-500 dark:text-slate-400'
            }`}
          >
            Benzi Bollinger
          </button>
          <button
            type="button"
            onClick={() => setShowRsi((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showRsi
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-slate-200 dark:border-[#1E2738] text-slate-500 dark:text-slate-400'
            }`}
          >
            RSI (14)
          </button>
        </div>
      </div>

      {/* EMA Legend */}
      {showEma && analysis && (
        <div className="px-4 py-1.5 border-b border-slate-100 dark:border-[#151B26] flex flex-wrap items-center gap-4 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span>
            <span className="text-amber-500 font-semibold">EMA20</span> {analysis.indicators.ema20.toFixed(2)}
          </span>
          <span>
            <span className="text-sky-400 font-semibold">EMA50</span> {analysis.indicators.ema50.toFixed(2)}
          </span>
          <span>
            <span className="text-purple-400 font-semibold">EMA200</span> {analysis.indicators.ema200.toFixed(2)}
          </span>
          <span>
            RSI(14) <strong className="text-slate-900 dark:text-slate-200">{analysis.indicators.rsi14.toFixed(1)}</strong>
          </span>
          <span>
            ATR(14) <strong className="text-slate-900 dark:text-slate-200">{analysis.indicators.atr14.toFixed(2)}</strong>
          </span>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="relative w-full h-[460px]">
        {isLoading && candles.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-[#0D111A]/80 text-xs text-slate-500">
            Se încarcă datele istorice XAU/USD...
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Integrated RSI (14) Sub-Pane */}
      {showRsi && <RSIIndicator candles={candles} isDark={isDark} timeframe={timeframe} />}
    </div>
  );
}
