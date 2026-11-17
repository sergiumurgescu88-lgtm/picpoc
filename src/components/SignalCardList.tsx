import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, XCircle } from 'lucide-react';
import { TradingSignal } from '../types/trading';

interface SignalCardListProps {
  signals: TradingSignal[];
  selectedSignalId: string | null;
  onSelectSignal: (id: string) => void;
  onCloseSignal: (id: string) => void;
  onLoadInCalculator?: (signal: TradingSignal) => void;
  onOpenResolution?: () => void;
}

const STATUS_LABELS: Record<TradingSignal['status'], string> = {
  ACTIVE: 'Activ',
  TP1_HIT: 'TP1 Atins',
  TP2_HIT: 'TP2 Atins',
  TP3_HIT: 'TP3 Atins',
  TP4_HIT: 'TP4 Atins',
  SL_HIT: 'SL Atins',
  CLOSED: 'Închis',
};

export function SignalCardList({
  signals,
  selectedSignalId,
  onSelectSignal,
  onCloseSignal,
  onLoadInCalculator,
  onOpenResolution,
}: SignalCardListProps) {
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');

  const filtered = signals.filter((s) => {
    const isOpen = !s.closedAt && s.status !== 'TP4_HIT' && s.status !== 'SL_HIT' && s.status !== 'CLOSED';
    if (filter === 'ACTIVE') return isOpen;
    if (filter === 'CLOSED') return !isOpen;
    return true;
  });

  const longCount = signals.filter((s) => s.direction === 'BUY').length;
  const shortCount = signals.filter((s) => s.direction === 'SELL').length;
  const wonCount = signals.filter((s) => s.resolution === 'WON').length;
  const lostCount = signals.filter((s) => s.resolution === 'LOST').length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] flex flex-col">
      {/* Header + Segmented Filter */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#1C2331] flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Semnale XAU/USD
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Selectați un semnal pentru vizualizare pe grafic
          </p>
        </div>

        <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
          {(
            [
              { id: 'ALL', label: 'Toate' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'CLOSED', label: 'Închise' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Resolution Strip */}
      <div className="px-4 py-2 border-b border-slate-100 dark:border-[#182030] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Long <strong className="text-emerald-600 dark:text-emerald-400">{longCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Short <strong className="text-rose-600 dark:text-rose-400">{shortCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Câștigate <strong className="text-emerald-600 dark:text-emerald-400">{wonCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Pierdute <strong className="text-rose-600 dark:text-rose-400">{lostCount}</strong>
          </span>
        </div>
        {onOpenResolution && (
          <button
            type="button"
            onClick={onOpenResolution}
            className="font-sans font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
          >
            Audit Rezoluție →
          </button>
        )}
      </div>

      {/* Signal List */}
      <div className="divide-y divide-slate-200 dark:divide-[#1C2331] max-h-[680px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nu există semnale în această categorie. Apăsați „Scanează XAU/USD” pentru o evaluare imediată.
          </div>
        ) : (
          filtered.map((sig) => {
            const isSelected = sig.id === selectedSignalId;
            const isBuy = sig.direction === 'BUY';
            const isPositivePnl = sig.pnlPips >= 0;
            const isOpen =
              !sig.closedAt &&
              sig.status !== 'TP4_HIT' &&
              sig.status !== 'SL_HIT' &&
              sig.status !== 'CLOSED';

            return (
              <article
                key={sig.id}
                onClick={() => onSelectSignal(sig.id)}
                className={`p-4 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50/60 dark:bg-[#131926]'
                    : 'hover:bg-slate-50 dark:hover:bg-[#111622]'
                }`}
              >
                {/* Row 1: Direction + Setup + Status text (zero-pill) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-mono font-bold ${
                          isBuy
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isBuy ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        {sig.direction}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {sig.setupType}
                      </h3>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{sig.timeframe}</span>
                      <span aria-hidden="true">·</span>
                      <span>R:R 1:{sig.riskReward.toFixed(1)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Confluență {sig.confidence}%</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {new Date(sig.createdAt).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-semibold ${
                        sig.status === 'SL_HIT'
                          ? 'text-rose-600 dark:text-rose-400'
                          : sig.status.startsWith('TP')
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sig.status === 'ACTIVE'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                      }`}
                    >
                      {STATUS_LABELS[sig.status]}
                    </div>
                    <div
                      className={`mt-0.5 text-xs font-mono font-semibold tabular-nums ${
                        isPositivePnl
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPositivePnl ? '+' : ''}
                      {sig.pnlPips.toFixed(1)} pips ({sig.rMultiple >= 0 ? '+' : ''}
                      {sig.rMultiple.toFixed(2)}R)
                    </div>
                  </div>
                </div>

                {/* Row 2: Entry / SL / TP1 / TP2 / TP3 / TP4 Grid */}
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2 py-2 border-y border-slate-100 dark:border-[#182030] text-[11px] font-mono tabular-nums">
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">Entry</div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {sig.entry.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      SL{sig.reachedTargets.includes('SL') ? ' ✗' : ''}
                    </div>
                    <div className="font-semibold text-rose-600 dark:text-rose-400">
                      {sig.stopLoss.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      TP1{sig.reachedTargets.includes('TP1') ? ' ✓' : ''}
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {sig.tp1.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      TP2{sig.reachedTargets.includes('TP2') ? ' ✓' : ''}
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {sig.tp2.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      TP3{sig.reachedTargets.includes('TP3') ? ' ✓' : ''}
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {sig.tp3.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      TP4{sig.reachedTargets.includes('TP4') ? ' ✓' : ''}
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {sig.tp4.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Row 3: Detailed Rationale when selected */}
                {isSelected && (
                  <div className="mt-3 space-y-2.5 text-xs">
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                      {sig.reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-700 dark:text-slate-300">Invalidare:</strong>{' '}
                      {sig.invalidation}
                    </div>

                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      {onLoadInCalculator && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLoadInCalculator(sig);
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-[#243045] text-slate-700 dark:text-slate-200 hover:border-amber-500/60 transition-colors cursor-pointer"
                        >
                          Calculează Lotaj
                        </button>
                      )}
                      {isOpen && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseSignal(sig.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Închide Semnal</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
