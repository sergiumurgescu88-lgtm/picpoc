import { MarketBias, TechnicalAnalysisReport } from '../types/trading';

interface TechnicalAnalysisPanelProps {
  analysis: TechnicalAnalysisReport | null;
  compact?: boolean;
}

const BIAS_LABELS: Record<MarketBias, string> = {
  BULLISH: 'Bullish (Cumpărare)',
  BEARISH: 'Bearish (Vânzare)',
  NEUTRAL: 'Neutru / Consolidare',
};

const RSI_LABELS = {
  OVERBOUGHT: 'Supracumpărat (≥70)',
  OVERSOLD: 'Supravândut (≤30)',
  BULLISH_ZONE: 'Zonă Bullish',
  BEARISH_ZONE: 'Zonă Bearish',
  NEUTRAL: 'Neutru',
};

export function TechnicalAnalysisPanel({ analysis, compact = false }: TechnicalAnalysisPanelProps) {
  if (!analysis) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-6 text-xs text-slate-500">
        Se calculează indicatorii tehnici și structura Smart Money Concepts...
      </div>
    );
  }

  const { indicators, structure, mtfMatrix, overallBias, confluenceScore } = analysis;

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Analiză Tehnică Detaliată · {analysis.timeframe}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Confluență multi-timeframe, oscilatori cantitativi și structură instituțională SMC
            </p>
          </div>

          <div className="flex items-center gap-6 font-mono tabular-nums">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Direcție Dominantă</div>
              <div
                className={`text-sm font-bold ${
                  overallBias === 'BULLISH'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : overallBias === 'BEARISH'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {BIAS_LABELS[overallBias]}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Indice Confluență</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {confluenceScore > 0 ? `+${confluenceScore}` : confluenceScore} / 100
              </div>
            </div>
          </div>
        </div>

        {/* Core Indicator Metrics Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t border-slate-100 dark:border-[#182030]">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">RSI (14)</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {indicators.rsi14.toFixed(1)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {RSI_LABELS[indicators.rsiState]}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">MACD (12,26,9)</div>
            <div
              className={`mt-1 font-mono text-base font-bold tabular-nums ${
                indicators.macd.histogram >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {indicators.macd.histogram >= 0 ? '+' : ''}
              {indicators.macd.histogram.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Linie {indicators.macd.line.toFixed(2)} · Sig {indicators.macd.signal.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Stochastic RSI</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {indicators.stochRsi.k.toFixed(1)} / {indicators.stochRsi.d.toFixed(1)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">%K / %D Raport</div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">ADX (14) Trend</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {indicators.adx14.toFixed(1)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {indicators.adx14 >= 25 ? 'Trend Puternic' : 'Trend Moderat / Range'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">ATR (14) Volatilitate</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              ${indicators.atr14.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              SL Recomandat ~${(indicators.atr14 * 1.45).toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Bollinger %B</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
              {indicators.bollinger.percentB.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {indicators.bollinger.squeeze ? 'Compresie (Squeeze Activ)' : `Bandă ${indicators.bollinger.bandwidth.toFixed(2)}%`}
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Timeframe Matrix & SMC Structure */}
      <div className={`grid grid-cols-1 ${compact ? 'xl:grid-cols-2' : 'lg:grid-cols-2'} gap-6`}>
        {/* MTF Confluence Table */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Matrice Confluență Multi-Timeframe
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 text-left font-medium">Interval</th>
                  <th className="py-2.5 px-4 text-left font-medium">Aliniere EMA</th>
                  <th className="py-2.5 px-4 text-right font-medium">RSI(14)</th>
                  <th className="py-2.5 px-4 text-left font-medium">MACD</th>
                  <th className="py-2.5 px-4 text-right font-medium">Bias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                {mtfMatrix.map((row) => (
                  <tr key={row.timeframe} className="hover:bg-slate-50 dark:hover:bg-[#111622]">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                      {row.timeframe}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {row.emaAlignment === 'BULLISH'
                        ? 'Bullish (20>50)'
                        : row.emaAlignment === 'BEARISH'
                          ? 'Bearish (20<50)'
                          : 'Mixtă'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-200">
                      {row.rsi14.toFixed(1)}
                    </td>
                    <td
                      className={`py-2.5 px-4 ${
                        row.macdState === 'BULLISH'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.macdState}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-semibold ${
                        row.bias === 'BULLISH'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.bias === 'BEARISH'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {row.bias}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Smart Money Concepts (SMC) */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331] flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Smart Money Concepts (SMC) · {structure.timeframe}
            </h3>
            <span
              className={`text-xs font-mono font-semibold ${
                structure.bias === 'BULLISH'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : structure.bias === 'BEARISH'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500'
              }`}
            >
              Structură {structure.bias}
            </span>
          </div>

          <div className="p-4 space-y-4 text-xs">
            {/* Structure Events */}
            <div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Evenimente Recente BOS / CHoCH / Lichiditate
              </div>
              {structure.events.length === 0 ? (
                <p className="text-slate-500">Nicio ruptură structurală recentă pe acest interval.</p>
              ) : (
                <ul className="space-y-1.5">
                  {structure.events.slice(0, 4).map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-center justify-between gap-3 py-1 border-b border-slate-100 dark:border-[#182030] last:border-0"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{ev.description}</span>
                      <span
                        className={`font-mono font-semibold shrink-0 ${
                          ev.direction === 'BULLISH'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ev.type}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Order Blocks & FVGs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-[#182030]">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Order Blocks Active
                </div>
                {structure.orderBlocks.length === 0 ? (
                  <p className="text-slate-500">Fără OB nemitigate.</p>
                ) : (
                  <ul className="space-y-1 font-mono tabular-nums">
                    {structure.orderBlocks.slice(0, 3).map((ob) => (
                      <li key={ob.id} className="flex justify-between">
                        <span
                          className={
                            ob.direction === 'BULLISH'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          OB {ob.direction === 'BULLISH' ? 'Cerere' : 'Ofertă'}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200">
                          {ob.bottom.toFixed(2)} – {ob.top.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Fair Value Gaps (FVG)
                </div>
                {structure.fairValueGaps.length === 0 ? (
                  <p className="text-slate-500">Fără dezechilibre FVG deschise.</p>
                ) : (
                  <ul className="space-y-1 font-mono tabular-nums">
                    {structure.fairValueGaps.slice(0, 3).map((fvg) => (
                      <li key={fvg.id} className="flex justify-between">
                        <span
                          className={
                            fvg.direction === 'BULLISH'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          FVG {fvg.direction === 'BULLISH' ? 'Bull' : 'Bear'}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200">
                          {fvg.bottom.toFixed(2)} – {fvg.top.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pivot Points, Fibonacci & Session Liquidity Levels */}
      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pivot Points */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Puncte Pivot Clasice
            </h3>
            <div className="space-y-1.5 text-xs font-mono tabular-nums">
              {[
                { label: 'Rezistență R3', val: indicators.pivots.r3, tone: 'text-rose-600 dark:text-rose-400' },
                { label: 'Rezistență R2', val: indicators.pivots.r2, tone: 'text-rose-600 dark:text-rose-400' },
                { label: 'Rezistență R1', val: indicators.pivots.r1, tone: 'text-rose-500 dark:text-rose-300' },
                { label: 'Pivot Central (P)', val: indicators.pivots.p, tone: 'text-amber-600 dark:text-amber-400 font-bold' },
                { label: 'Suport S1', val: indicators.pivots.s1, tone: 'text-emerald-500 dark:text-emerald-300' },
                { label: 'Suport S2', val: indicators.pivots.s2, tone: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Suport S3', val: indicators.pivots.s3, tone: 'text-emerald-600 dark:text-emerald-400' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#182030] last:border-0"
                >
                  <span className="text-slate-500 dark:text-slate-400 font-sans">{row.label}</span>
                  <span className={row.tone}>{row.val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fibonacci Retracement */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Retrageri Fibonacci
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {indicators.fibonacci.direction === 'UPSWING' ? 'Impuls Ascendent' : 'Impuls Descendent'}
              </span>
            </div>
            <div className="space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#182030]">
                <span className="text-slate-500 font-sans">Swing High (1.000)</span>
                <span className="text-slate-900 dark:text-white">{indicators.fibonacci.swingHigh.toFixed(2)}</span>
              </div>
              {indicators.fibonacci.levels.map((lvl) => (
                <div
                  key={lvl.level}
                  className="flex justify-between py-1 border-b border-slate-100 dark:border-[#182030]"
                >
                  <span className="text-slate-500 font-sans">Fib {lvl.level}</span>
                  <span className={lvl.level.includes('0.618') ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-800 dark:text-slate-200'}>
                    {lvl.price.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-sans">Swing Low (0.000)</span>
                <span className="text-slate-900 dark:text-white">{indicators.fibonacci.swingLow.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Session Liquidity Levels */}
          <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Lichiditate Sesiuni & Extreme
            </h3>
            <div className="space-y-1.5 text-xs font-mono tabular-nums">
              {[
                { label: 'Maxim Ziua Anterioară (PDH)', val: structure.sessionLevels.prevDayHigh },
                { label: 'Minim Ziua Anterioară (PDL)', val: structure.sessionLevels.prevDayLow },
                { label: 'Maxim Sesiune Londra', val: structure.sessionLevels.londonHigh },
                { label: 'Minim Sesiune Londra', val: structure.sessionLevels.londonLow },
                { label: 'Maxim Sesiune Asia', val: structure.sessionLevels.asiaHigh },
                { label: 'Minim Sesiune Asia', val: structure.sessionLevels.asiaLow },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[#182030] last:border-0"
                >
                  <span className="text-slate-500 dark:text-slate-400 font-sans">{row.label}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {row.val.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
