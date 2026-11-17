import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Crosshair, RotateCcw } from 'lucide-react';

export interface AppliedTargetLevels {
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
}

interface ProfitTargetCalculatorProps {
  currentPrice: number | null;
  selectedSignalEntry?: number | null;
  selectedSignalDirection?: 'BUY' | 'SELL' | null;
  accountBalance?: number;
  riskPercent?: number;
  onApplyLevels: (levels: AppliedTargetLevels) => void;
}

const FIXED_RR_RATIOS = [1, 1.5, 2, 2.5, 3, 4] as const;
const SL_DISTANCE_PRESETS = [
  { label: '$4.00 (40p)', value: '4.00' },
  { label: '$6.00 (60p)', value: '6.00' },
  { label: '$10.00 (100p)', value: '10.00' },
  { label: '$15.00 (150p)', value: '15.00' },
] as const;

export function ProfitTargetCalculator({
  currentPrice,
  selectedSignalEntry,
  selectedSignalDirection,
  accountBalance = 10000,
  riskPercent = 1,
  onApplyLevels,
}: ProfitTargetCalculatorProps) {
  const defaultEntry = selectedSignalEntry ?? currentPrice ?? 2635;

  const [direction, setDirection] = useState<'BUY' | 'SELL'>(selectedSignalDirection ?? 'BUY');
  const [entryInput, setEntryInput] = useState<string>(() => defaultEntry.toFixed(2));
  const [slDistanceInput, setSlDistanceInput] = useState<string>('6.00');
  const [selectedPrimaryRr, setSelectedPrimaryRr] = useState<number>(2);
  const [appliedTag, setAppliedTag] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSignalEntry && Number.isFinite(selectedSignalEntry)) {
      setEntryInput(selectedSignalEntry.toFixed(2));
    }
  }, [selectedSignalEntry]);

  useEffect(() => {
    if (selectedSignalDirection) {
      setDirection(selectedSignalDirection);
    }
  }, [selectedSignalDirection]);

  const parsedEntry = Number(entryInput);
  const parsedSlDist = Number(slDistanceInput);

  const isEntryValid = Number.isFinite(parsedEntry) && parsedEntry >= 100 && parsedEntry <= 100000;
  const isSlDistValid = Number.isFinite(parsedSlDist) && parsedSlDist >= 0.2 && parsedSlDist <= 500;
  const isValid = isEntryValid && isSlDistValid;

  const calculations = useMemo(() => {
    if (!isValid) return null;

    const sign = direction === 'BUY' ? 1 : -1;
    const stopLossPrice = Math.round((parsedEntry - sign * parsedSlDist) * 100) / 100;
    const slPips = Math.round(parsedSlDist * 10 * 10) / 10;

    // XAU/USD standard lot sizing estimate synced with accountBalance & riskPercent
    const safeBalance = Number.isFinite(accountBalance) && accountBalance > 0 ? accountBalance : 10000;
    const safeRiskPct =
      Number.isFinite(riskPercent) && riskPercent > 0 && riskPercent <= 50 ? riskPercent : 1;
    const riskUsd = Math.round(safeBalance * (safeRiskPct / 100) * 100) / 100;
    const estimatedLots = Math.max(0.01, Math.floor((riskUsd / (parsedSlDist * 100)) * 100) / 100);

    const targets = FIXED_RR_RATIOS.map((ratio) => {
      const distanceUsd = Math.round(parsedSlDist * ratio * 100) / 100;
      const targetPrice = Math.round((parsedEntry + sign * distanceUsd) * 100) / 100;
      const distancePips = Math.round(distanceUsd * 10 * 10) / 10;
      const estimatedProfitUsd = Math.round(distanceUsd * estimatedLots * 100 * 100) / 100;
      return {
        ratio,
        label: `1:${Number.isInteger(ratio) ? ratio.toFixed(0) : ratio.toFixed(1)}`,
        targetPrice,
        distanceUsd,
        distancePips,
        estimatedProfitUsd,
      };
    });

    return {
      stopLossPrice,
      slPips,
      riskUsd,
      estimatedLots,
      targets,
    };
  }, [isValid, direction, parsedEntry, parsedSlDist, accountBalance, riskPercent]);

  const handleUseLivePrice = () => {
    if (currentPrice && Number.isFinite(currentPrice)) {
      setEntryInput(currentPrice.toFixed(2));
    }
  };

  const handleReset = () => {
    const base = currentPrice ?? 2635;
    setDirection('BUY');
    setEntryInput(base.toFixed(2));
    setSlDistanceInput('6.00');
    setSelectedPrimaryRr(2);
    setAppliedTag(null);
  };

  const handleApplySet = (primaryRatio: number) => {
    if (!calculations || !isValid) return;
    setSelectedPrimaryRr(primaryRatio);

    const byRatio = (r: number) =>
      calculations.targets.find((t) => t.ratio === r)?.targetPrice ??
      Math.round((parsedEntry + (direction === 'BUY' ? 1 : -1) * parsedSlDist * r) * 100) / 100;

    // Build progressive TP1 / TP2 / TP3 anchored around the chosen R:R target
    const tp1 = primaryRatio <= 1.5 ? byRatio(1) : byRatio(1.5);
    const tp2 = byRatio(primaryRatio);
    const tp3 = primaryRatio >= 3 ? byRatio(4) : byRatio(3);

    onApplyLevels({
      direction,
      entry: Math.round(parsedEntry * 100) / 100,
      stopLoss: calculations.stopLossPrice,
      tp1,
      tp2,
      tp3,
    });

    const tag = `1:${Number.isInteger(primaryRatio) ? primaryRatio.toFixed(0) : primaryRatio.toFixed(1)}`;
    setAppliedTag(tag);
    window.setTimeout(() => {
      setAppliedTag((prev) => (prev === tag ? null : prev));
    }, 2200);
  };

  return (
    <section
      aria-label="Calculator Niveluri Automate Take-Profit și Stop-Loss (R:R)"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#182030]">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Calculator Ținte Profit & Stop-Loss (R:R Fix)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Introduceți prețul de intrare și distanța de risc pentru calcul automat SL / TP pe rapoarte R:R fixe
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentPrice !== null && (
            <button
              type="button"
              onClick={handleUseLivePrice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">Preț Live ({currentPrice.toFixed(2)})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            title="Resetează la valorile implicite"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetează</span>
          </button>
        </div>
      </div>

      {/* Main Split: Inputs + Stop Loss Summary (left) | Fixed R:R Target Ladder Table (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Direction Segmented Control */}
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Direcție Poziție</span>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#222C40]">
              <button
                type="button"
                onClick={() => setDirection('BUY')}
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  direction === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>BUY (Long)</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('SELL')}
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  direction === 'SELL'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>SELL (Short)</span>
              </button>
            </div>
          </div>

          {/* Numeric Inputs */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Preț Intrare (XAU/USD)</span>
              <input
                type="number"
                step="0.01"
                value={entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
                placeholder="ex. 2635.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Distanță Stop-Loss (USD)</span>
              <input
                type="number"
                step="0.10"
                min="0.20"
                value={slDistanceInput}
                onChange={(e) => setSlDistanceInput(e.target.value)}
                placeholder="ex. 6.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>
          </div>

          {/* Quick SL Distance Presets */}
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Distanțe SL Rapide</span>
            <div className="flex flex-wrap gap-1.5">
              {SL_DISTANCE_PRESETS.map((preset) => {
                const isActive = Math.abs(parsedSlDist - Number(preset.value)) < 0.01;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSlDistanceInput(preset.value)}
                    className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                        : 'border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Validation Error or Automated Stop-Loss Summary */}
          {!isValid ? (
            <div className="pt-3 border-t border-slate-100 dark:border-[#182030] text-xs text-rose-500">
              {!isEntryValid
                ? 'Introduceți un preț de intrare valid între 100 și 100,000 USD.'
                : 'Distanța Stop-Loss trebuie să fie între $0.20 (2 pips) și $500.00.'}
            </div>
          ) : (
            calculations && (
              <div className="pt-3 border-t border-slate-100 dark:border-[#182030] space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-slate-500 dark:text-slate-400">
                      Stop-Loss Calculat ({direction === 'BUY' ? 'Sub Entry' : 'Peste Entry'})
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-rose-600 dark:text-rose-400">
                      {calculations.stopLossPrice.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      -{parsedSlDist.toFixed(2)} USD · {calculations.slPips} pips
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-slate-500 dark:text-slate-400">
                      Volum & Risc ({riskPercent}%)
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                      {calculations.estimatedLots.toFixed(2)} Loturi
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400">
                      Risc: -${calculations.riskUsd.toFixed(2)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplySet(selectedPrimaryRr)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  {appliedTag ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Niveluri aplicate în Calculatorul de Poziție ({appliedTag})</span>
                    </>
                  ) : (
                    <span>
                      Aplică Entry, SL & TP (1:{Number.isInteger(selectedPrimaryRr) ? selectedPrimaryRr : selectedPrimaryRr.toFixed(1)}) în Poziție
                    </span>
                  )}
                </button>
              </div>
            )
          )}
        </div>

        {/* Right: Automated Fixed R:R Targets Table */}
        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#182030] pt-4 lg:pt-0 lg:pl-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              Niveluri Automate Take-Profit pe Rapoarte R:R Fixe
            </span>
            {calculations && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                SL: {calculations.stopLossPrice.toFixed(2)} · Entry: {parsedEntry.toFixed(2)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 text-left font-medium">R:R Fix</th>
                  <th className="py-2 px-3 text-right font-medium">Preț Take-Profit</th>
                  <th className="py-2 px-3 text-right font-medium">Distanță</th>
                  <th className="py-2 px-3 text-right font-medium">Profit Est.</th>
                  <th className="py-2 pl-3 text-right font-medium">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                {calculations ? (
                  calculations.targets.map((row) => {
                    const isSelected = row.ratio === selectedPrimaryRr;
                    return (
                      <tr
                        key={row.label}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-amber-500/8 dark:bg-amber-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-[#111622]'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-white">
                          <span>{row.label}</span>
                          {isSelected && (
                            <span className="ml-2 font-sans text-[10px] font-medium text-amber-600 dark:text-amber-400">
                              · Activ
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {row.targetPrice.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                          +${row.distanceUsd.toFixed(2)} ({row.distancePips}p)
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          +${row.estimatedProfitUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => handleApplySet(row.ratio)}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              appliedTag === row.label
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-[#222C40] bg-white dark:bg-[#141A26] text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400'
                            }`}
                          >
                            {appliedTag === row.label ? 'Aplicat' : 'Setează'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center font-sans text-slate-500 dark:text-slate-400">
                      Completați valori valide pentru Preț Intrare și Distanță Stop-Loss.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
