import { FormEvent, useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import { TradingSignal } from '../types/trading';
import { AppliedTargetLevels, ProfitTargetCalculator } from './ProfitTargetCalculator';

interface RiskCalculatorPanelProps {
  signals: TradingSignal[];
  selectedSignal: TradingSignal | null;
  currentPrice: number | null;
}

interface RiskCalcResult {
  riskAmountUsd: number;
  recommendedLots: number;
  slDistanceUsd: number;
  slPips: number;
  pipValuePerLot: number;
  projectedTp1: { price: number; rewardUsd: number; rr: number } | null;
  projectedTp2: { price: number; rewardUsd: number; rr: number } | null;
  projectedTp3: { price: number; rewardUsd: number; rr: number } | null;
}

export function RiskCalculatorPanel({
  signals,
  selectedSignal,
  currentPrice,
}: RiskCalculatorPanelProps) {
  const [accountBalance, setAccountBalance] = useState('10000');
  const [riskPercent, setRiskPercent] = useState('1.0');
  const [entryPrice, setEntryPrice] = useState(() =>
    selectedSignal ? selectedSignal.entry.toFixed(2) : (currentPrice ?? 2635).toFixed(2)
  );
  const [stopLoss, setStopLoss] = useState(() =>
    selectedSignal ? selectedSignal.stopLoss.toFixed(2) : ((currentPrice ?? 2635) - 6).toFixed(2)
  );
  const [tp1, setTp1] = useState(() =>
    selectedSignal ? selectedSignal.tp1.toFixed(2) : ((currentPrice ?? 2635) + 7.5).toFixed(2)
  );
  const [tp2, setTp2] = useState(() =>
    selectedSignal ? selectedSignal.tp2.toFixed(2) : ((currentPrice ?? 2635) + 13).toFixed(2)
  );
  const [tp3, setTp3] = useState(() =>
    selectedSignal ? selectedSignal.tp3.toFixed(2) : ((currentPrice ?? 2635) + 20).toFixed(2)
  );
  const [result, setResult] = useState<RiskCalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromSignal = (sig: TradingSignal) => {
    setEntryPrice(sig.entry.toFixed(2));
    setStopLoss(sig.stopLoss.toFixed(2));
    setTp1(sig.tp1.toFixed(2));
    setTp2(sig.tp2.toFixed(2));
    setTp3(sig.tp3.toFixed(2));
  };

  const calculateOnServer = async (
    e?: FormEvent,
    overrides?: {
      entryPrice: string;
      stopLoss: string;
      tp1: string;
      tp2: string;
      tp3: string;
    }
  ) => {
    if (e) e.preventDefault();
    setError(null);
    const activeEntry = overrides?.entryPrice ?? entryPrice;
    const activeSl = overrides?.stopLoss ?? stopLoss;
    const activeTp1 = overrides?.tp1 ?? tp1;
    const activeTp2 = overrides?.tp2 ?? tp2;
    const activeTp3 = overrides?.tp3 ?? tp3;

    try {
      const res = await fetch('/api/risk/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountBalance: Number(accountBalance),
          riskPercent: Number(riskPercent),
          entryPrice: Number(activeEntry),
          stopLoss: Number(activeSl),
          tp1: activeTp1 ? Number(activeTp1) : undefined,
          tp2: activeTp2 ? Number(activeTp2) : undefined,
          tp3: activeTp3 ? Number(activeTp3) : undefined,
        }),
      });
      const data = (await res.json()) as RiskCalcResult & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Date invalide pentru calcul');
        return;
      }
      setResult(data);
    } catch {
      setError('Eroare de comunicare cu serverul.');
    }
  };

  const handleApplyTargetLevels = (levels: AppliedTargetLevels) => {
    const next = {
      entryPrice: levels.entry.toFixed(2),
      stopLoss: levels.stopLoss.toFixed(2),
      tp1: levels.tp1.toFixed(2),
      tp2: levels.tp2.toFixed(2),
      tp3: levels.tp3.toFixed(2),
    };
    setEntryPrice(next.entryPrice);
    setStopLoss(next.stopLoss);
    setTp1(next.tp1);
    setTp2(next.tp2);
    setTp3(next.tp3);
    void calculateOnServer(undefined, next);
  };

  useEffect(() => {
    void calculateOnServer();
  }, [selectedSignal?.id]);

  // Signal Journal KPI summary synced with signal resolution model
  const totalSignals = signals.length;
  const tpHits = signals.filter((s) => s.resolution === 'WON').length;
  const slHits = signals.filter((s) => s.resolution === 'LOST').length;
  const resolved = tpHits + slHits;
  const winRate = resolved > 0 ? Math.round((tpHits / resolved) * 100) : 0;
  const totalR = signals
    .filter((s) => s.resolution !== 'ACTIVE')
    .reduce((acc, s) => acc + s.rMultiple, 0);

  return (
    <div className="space-y-6">
      {/* Performance Journal KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Semnale Emise</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalSignals}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Rată de Succes (TP vs SL)</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {resolved > 0 ? `${winRate}%` : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Randament Cumulat (R)</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              totalR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {totalR >= 0 ? '+' : ''}
            {totalR.toFixed(2)}R
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Valoare Pip (1.00 Lot XAU)</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            $10.00
          </div>
        </div>
      </div>

      {/* Automated R:R Profit Target & Stop-Loss Calculator */}
      <ProfitTargetCalculator
        currentPrice={currentPrice}
        selectedSignalEntry={selectedSignal?.entry ?? null}
        selectedSignalDirection={selectedSignal?.direction ?? null}
        accountBalance={Number(accountBalance) || 10000}
        riskPercent={Number(riskPercent) || 1}
        onApplyLevels={handleApplyTargetLevels}
      />

      {/* Calculator + Signal History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Risk Calculator Form */}
        <form
          onSubmit={calculateOnServer}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Calculator Poziție & Risc XAU/USD
            </h2>
            {selectedSignal && (
              <button
                type="button"
                onClick={() => loadFromSignal(selectedSignal)}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                Încarcă semnal selectat
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Capital Cont (USD)</span>
              <input
                type="number"
                step="100"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Risc per Tranzacție (%)</span>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Preț Intrare (Entry)</span>
              <input
                type="number"
                step="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Stop Loss (SL)</span>
              <input
                type="number"
                step="0.01"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">TP1</span>
              <input
                type="number"
                step="0.01"
                value={tp1}
                onChange={(e) => setTp1(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">TP2</span>
              <input
                type="number"
                step="0.01"
                value={tp2}
                onChange={(e) => setTp2(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
          </div>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>Calculează Dimensionarea Poziției</span>
          </button>

          {result && (
            <div className="pt-3 border-t border-slate-100 dark:border-[#182030] grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="text-slate-500 font-sans">Volum Recomandat</div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {result.recommendedLots.toFixed(2)} Loturi
                </div>
              </div>
              <div>
                <div className="text-slate-500 font-sans">Risc Financiar Maxim</div>
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                  -${result.riskAmountUsd.toFixed(2)} ({result.slPips} pips)
                </div>
              </div>
              {result.projectedTp1 && (
                <div>
                  <div className="text-slate-500 font-sans">Profit Estimativ TP1</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +${result.projectedTp1.rewardUsd.toFixed(2)} (1:{result.projectedTp1.rr})
                  </div>
                </div>
              )}
              {result.projectedTp2 && (
                <div>
                  <div className="text-slate-500 font-sans">Profit Estimativ TP2</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +${result.projectedTp2.rewardUsd.toFixed(2)} (1:{result.projectedTp2.rr})
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Historical Signals Table */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331]">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Jurnal Complet Semnale XAU/USD
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 text-left font-medium">Tip</th>
                  <th className="py-2.5 px-4 text-left font-medium">Setup / Interval</th>
                  <th className="py-2.5 px-4 text-right font-medium">Entry</th>
                  <th className="py-2.5 px-4 text-right font-medium">SL</th>
                  <th className="py-2.5 px-4 text-right font-medium">TP2</th>
                  <th className="py-2.5 px-4 text-right font-medium">TP4</th>
                  <th className="py-2.5 px-4 text-right font-medium">Rezultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                {signals.map((sig) => (
                  <tr key={sig.id} className="hover:bg-slate-50 dark:hover:bg-[#111622]">
                    <td
                      className={`py-2.5 px-4 font-bold ${
                        sig.direction === 'BUY'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {sig.direction}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-800 dark:text-slate-200">
                      <div>{sig.setupType}</div>
                      <div className="text-[11px] text-slate-500">{sig.timeframe} · {sig.status}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-900 dark:text-white">
                      {sig.entry.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-rose-600 dark:text-rose-400">
                      {sig.stopLoss.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      {sig.tp2.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      {sig.tp4.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-semibold ${
                        sig.pnlPips >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {sig.pnlPips >= 0 ? '+' : ''}
                      {sig.pnlPips.toFixed(1)}p
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
