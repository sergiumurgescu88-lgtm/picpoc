import { useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { StrategyPolicy, TradingSignal } from '../types/trading';

interface SignalCardListProps {
  signals: TradingSignal[];
  selectedSignalId: string | null;
  strategyPolicy: StrategyPolicy;
  onChangePolicy: (policy: StrategyPolicy) => void;
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
  REVERSAL_EXIT: 'Ieșire Reversie (+Profit)',
  SL_HIT: 'SL Atins',
  CLOSED: 'Închis',
};

export function SignalCardList({
  signals,
  selectedSignalId,
  strategyPolicy,
  onChangePolicy,
  onSelectSignal,
  onCloseSignal,
  onLoadInCalculator,
  onOpenResolution,
}: SignalCardListProps) {
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');

  const filtered = signals.filter((s) => {
    const isOpen =
      !s.closedAt &&
      s.status !== 'TP4_HIT' &&
      s.status !== 'REVERSAL_EXIT' &&
      s.status !== 'SL_HIT' &&
      s.status !== 'CLOSED';
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

      {/* Strategy Protection Policy Switcher */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#182030] bg-slate-50/60 dark:bg-[#0B0F17] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Protecție Trend & Blocare Direcție</span>
          </span>

          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-[#141A26] border border-slate-200 dark:border-[#1E2738]">
            <button
              type="button"
              onClick={() => onChangePolicy('EXIT_PROFIT_ON_REVERSAL')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                strategyPolicy === 'EXIT_PROFIT_ON_REVERSAL'
                  ? 'bg-white dark:bg-[#1F293B] text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Ieșire Profit Reversie
            </button>
            <button
              type="button"
              onClick={() => onChangePolicy('LOCK_UNTIL_RESOLUTION')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                strategyPolicy === 'LOCK_UNTIL_RESOLUTION'
                  ? 'bg-white dark:bg-[#1F293B] text-amber-700 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Strict TP4 / SL
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          {strategyPolicy === 'EXIT_PROFIT_ON_REVERSAL'
            ? 'Nu deschide direcție opusă peste poziția activă. Dacă trendul se inversează și poziția este pe plus, închide protejat pe profit; dacă e pe minus, avertizează și păstrează SL.'
            : 'Blochează orice inversare de strategie până când poziția activă atinge TP4, Breakeven (după TP1) sau SL. Emite doar avertizare la schimbarea trendului.'}
        </p>
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
              sig.status !== 'REVERSAL_EXIT' &&
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
                          : sig.status.startsWith('TP') || sig.status === 'REVERSAL_EXIT'
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

                {/* Row 2: Entry / SL (with trailed BE indicator) / TP1 / TP2 / TP3 / TP4 Grid */}
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2 py-2 border-y border-slate-100 dark:border-[#182030] text-[11px] font-mono tabular-nums">
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">Entry</div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {sig.entry.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">
                      SL
                      {sig.reachedTargets.includes('SL')
                        ? ' ✗'
                        : sig.reachedTargets.includes('TP2')
                          ? ' · Blocat'
                          : sig.reachedTargets.includes('TP1')
                            ? ' · BE'
                            : ''}
                    </div>
                    <div
                      className={`font-semibold ${
                        sig.reachedTargets.includes('TP1') && !sig.reachedTargets.includes('SL')
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {sig.stopLoss.toFixed(2)}
                    </div>
                  </div>
                  {(
                    [
                      { key: 'TP1', val: sig.tp1 },
                      { key: 'TP2', val: sig.tp2 },
                      { key: 'TP3', val: sig.tp3 },
                      { key: 'TP4', val: sig.tp4 },
                    ] as const
                  ).map((item) => {
                    const hit = sig.reachedTargets.includes(item.key);
                    return (
                      <div key={item.key}>
                        <div
                          className={
                            hit
                              ? 'font-bold text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          {item.key}
                          {hit ? ' ✓' : ''}
                        </div>
                        <div
                          className={
                            hit
                              ? 'font-bold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/50 underline-offset-2'
                              : 'font-semibold text-emerald-600/80 dark:text-emerald-400/80'
                          }
                        >
                          {item.val.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
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

                    {sig.trendWarning && isOpen && (
                      <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                        <span>{sig.trendWarning.message}</span>
                      </div>
                    )}

                    {sig.exitNote && !isOpen && (
                      <div className="rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">Rezoluție salvată:</strong>{' '}
                        {sig.exitNote}
                      </div>
                    )}

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
                          Calculează Lotaj & Demo
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
