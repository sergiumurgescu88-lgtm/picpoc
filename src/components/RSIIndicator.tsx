import { useEffect, useMemo, useRef } from 'react';
import {
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import { Candle, Timeframe } from '../types/trading';

interface RSIIndicatorProps {
  candles: Candle[];
  isDark: boolean;
  timeframe: Timeframe;
}

function computeWilderRSI(candles: Candle[], period = 14): { time: number; value: number }[] {
  if (candles.length < 2) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const closes = sorted.map((c) => c.close);
  const rsi: number[] = new Array(closes.length).fill(50);

  let gainSum = 0;
  let lossSum = 0;
  const initLen = Math.min(period, closes.length - 1);

  for (let i = 1; i <= initLen; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / initLen;
  let avgLoss = lossSum / initLen;

  for (let i = initLen; i < closes.length; i++) {
    if (i > initLen) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      rsi[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = Math.round((100 - 100 / (1 + rs)) * 100) / 100;
    }
  }

  return sorted.map((c, idx) => ({ time: c.time, value: rsi[idx] }));
}

export function RSIIndicator({ candles, isDark, timeframe }: RSIIndicatorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiSeriesData = useMemo(() => computeWilderRSI(candles, 14), [candles]);
  const currentRsi = rsiSeriesData[rsiSeriesData.length - 1]?.value ?? 50;

  let rsiZoneLabel = 'Neutru';
  let rsiColorClass = 'text-slate-600 dark:text-slate-300';
  if (currentRsi >= 70) {
    rsiZoneLabel = 'Supracumpărat (≥70)';
    rsiColorClass = 'text-rose-600 dark:text-rose-400';
  } else if (currentRsi <= 30) {
    rsiZoneLabel = 'Supravândut (≤30)';
    rsiColorClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (currentRsi >= 55) {
    rsiZoneLabel = 'Momentum Bullish';
    rsiColorClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (currentRsi <= 45) {
    rsiZoneLabel = 'Momentum Bearish';
    rsiColorClass = 'text-rose-600 dark:text-rose-400';
  }

  // Initialize RSI sub-chart with 70 (Overbought) and 30 (Oversold) visual markers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0D111A' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(226, 232, 240, 0.6)' },
        horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(226, 232, 240, 0.6)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(212, 175, 55, 0.45)', style: LineStyle.Dashed },
        horzLine: { color: 'rgba(212, 175, 55, 0.45)', style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: isDark ? '#1C2331' : '#E2E8F0',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: isDark ? '#1C2331' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: 132,
    });

    const rsiLine = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: 18,
          maxValue: 82,
        },
      }),
    });

    // Visual marker: Overbought (70)
    rsiLine.createPriceLine({
      price: 70,
      color: '#EF4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'OB 70',
    });

    // Visual marker: Equilibrium Midline (50)
    rsiLine.createPriceLine({
      price: 50,
      color: 'rgba(148, 163, 184, 0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    });

    // Visual marker: Oversold (30)
    rsiLine.createPriceLine({
      price: 30,
      color: '#10B981',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'OS 30',
    });

    chartRef.current = chart;
    rsiSeriesRef.current = rsiLine;

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
      rsiSeriesRef.current = null;
    };
  }, []);

  // Theme sync
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0D111A' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(226, 232, 240, 0.6)' },
        horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.35)' : 'rgba(226, 232, 240, 0.6)' },
      },
      rightPriceScale: { borderColor: isDark ? '#1C2331' : '#E2E8F0' },
      timeScale: { borderColor: isDark ? '#1C2331' : '#E2E8F0' },
    });
  }, [isDark]);

  // Update RSI data on tick / timeframe change
  useEffect(() => {
    if (!rsiSeriesRef.current || rsiSeriesData.length === 0) return;
    rsiSeriesRef.current.setData(
      rsiSeriesData.map((pt) => ({
        time: pt.time as UTCTimestamp,
        value: pt.value,
      }))
    );
  }, [rsiSeriesData]);

  return (
    <div className="border-t border-slate-200 dark:border-[#1C2331]">
      <div className="px-4 py-2 border-b border-slate-100 dark:border-[#151B26] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="font-semibold text-slate-900 dark:text-white">
            RSI (14) · {timeframe}
          </span>
          <span className={`font-bold ${rsiColorClass}`}>{currentRsi.toFixed(1)}</span>
          <span className={`font-sans text-[11px] font-medium ${rsiColorClass}`}>
            {rsiZoneLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span className="text-rose-500 font-medium">Supracumpărat 70</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-500 font-medium">Supravândut 30</span>
        </div>
      </div>

      <div className="relative w-full h-[132px]">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
