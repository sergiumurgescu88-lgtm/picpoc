import { TradingSignal } from '../types/trading';

interface StrategyStatusBannerProps {
  atr14: number | null;
  currentPrice: number | null;
  ema200M15: number | null;
  activeSignal: TradingSignal | null;
  isScanning: boolean;
}

export function StrategyStatusBanner({
  atr14,
  currentPrice,
  ema200M15,
  activeSignal,
  isScanning,
}: StrategyStatusBannerProps) {
  const slDist = atr14 ? Math.max(2.2, atr14) * 1.5 : null;
  const tpDist = slDist ? slDist * 1.5 : null;
  const distToEma200 = currentPrice && ema200M15 ? currentPrice - ema200M15 : null;
  const trendBias = distToEma200 !== null ? (distToEma200 > 0 ? 'BULLISH' : 'BEARISH') : 'NEUTRU';

  const pipsToTP = activeSignal && currentPrice && activeSignal.tp1
    ? activeSignal.direction === 'BUY' ? activeSignal.tp1 - currentPrice : currentPrice - activeSignal.tp1
    : null;

  const pipsToSL = activeSignal && currentPrice && activeSignal.stopLoss
    ? activeSignal.direction === 'BUY' ? currentPrice - activeSignal.stopLoss : activeSignal.stopLoss - currentPrice
    : null;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/5 dark:via-emerald-500/10 dark:to-emerald-500/5 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🚀</span>
          <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
            FTMO 50K SPEEDRUN · Strategie Activă
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${isScanning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-slate-600 dark:text-slate-400">Auto-scan: <strong>60s</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <div className="rounded-lg bg-white/50 dark:bg-[#0F1419] p-3 border border-slate-200 dark:border-[#1C2331]">
          <div className="text-slate-500 dark:text-slate-400 mb-1">Setup Intrare</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">M15 EMA 9/21 Cross</div>
          <div className="text-emerald-600 dark:text-emerald-400 text-[10px] mt-1">+ Filtru H1 200 EMA</div>
        </div>

        <div className="rounded-lg bg-white/50 dark:bg-[#0F1419] p-3 border border-slate-200 dark:border-[#1C2331]">
          <div className="text-slate-500 dark:text-slate-400 mb-1">ATR(14) Live</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{atr14 ? `$${atr14.toFixed(2)}` : '—'}</div>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">Volatilitate</div>
        </div>

        <div className="rounded-lg bg-rose-500/5 dark:bg-rose-500/10 p-3 border border-rose-500/20">
          <div className="text-rose-600 dark:text-rose-400 mb-1">Stop Loss</div>
          <div className="font-bold text-rose-700 dark:text-rose-300">{slDist ? `$${slDist.toFixed(2)}` : '—'}</div>
          <div className="text-rose-500/70 dark:text-rose-400/70 text-[10px] mt-1">1.5 × ATR</div>
        </div>

        <div className="rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 p-3 border border-emerald-500/20">
          <div className="text-emerald-600 dark:text-emerald-400 mb-1">Take Profit</div>
          <div className="font-bold text-emerald-700 dark:text-emerald-300">{tpDist ? `$${tpDist.toFixed(2)}` : '—'}</div>
          <div className="text-emerald-500/70 dark:text-emerald-400/70 text-[10px] mt-1">Single TP · 1.5R</div>
        </div>

        <div className="rounded-lg bg-white/50 dark:bg-[#0F1419] p-3 border border-slate-200 dark:border-[#1C2331]">
          <div className="text-slate-500 dark:text-slate-400 mb-1">Trend H1</div>
          <div className={`font-semibold ${trendBias === 'BULLISH' ? 'text-emerald-600 dark:text-emerald-400' : trendBias === 'BEARISH' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
            {trendBias}
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] mt-1">
            {distToEma200 !== null ? `${distToEma200 > 0 ? '+' : ''}${distToEma200.toFixed(2)} vs EMA200` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-white/50 dark:bg-[#0F1419] p-3 border border-slate-200 dark:border-[#1C2331]">
          <div className="text-slate-500 dark:text-slate-400 mb-1">Progres Trade</div>
          {activeSignal && pipsToTP !== null && pipsToSL !== null ? (
            <>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                <span className="text-emerald-600 dark:text-emerald-400">TP: {pipsToTP.toFixed(1)}p</span>
              </div>
              <div className="text-rose-500 dark:text-rose-400 text-[10px] mt-1">SL: {pipsToSL.toFixed(1)}p</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-slate-500 dark:text-slate-400">Aștept setup</div>
              <div className="text-slate-400 dark:text-slate-500 text-[10px] mt-1">Fără poziție activă</div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-[#1C2331]/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span>📊 Risc per trade: <strong>1% din capital</strong> · RR fix 1:1.5 · Copy manual în contul LIVE FTMO</span>
        <span>🛡️ Toate TP-urile (1-4) setate identic pentru închidere completă la atingerea țintei</span>
      </div>
    </div>
  );
}
