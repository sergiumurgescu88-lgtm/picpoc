import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { BrokerPublicStatus, TradingSignal } from '../types/trading';

interface BrokerAccountPanelProps {
  selectedSignal: TradingSignal | null;
  suggestedLots?: number | null;
  suggestedSlDistance?: number | null;
  suggestedTpDistance?: number | null;
  onSyncAccountContext: (ctx: {
    balance: number;
    currency: string;
    leverage: number;
    brokerLabel: string;
  }) => void;
}

const CONNECTION_LABELS: Record<BrokerPublicStatus['connectionState'], string> = {
  AUTHENTICATED: 'Autentificat Demo',
  CONNECTING: 'Conectare WebSocket...',
  DISCONNECTED: 'Deconectat',
  ERROR: 'Eroare Conexiune',
};

export function BrokerAccountPanel({
  selectedSignal,
  suggestedLots,
  suggestedSlDistance,
  suggestedTpDistance,
  onSyncAccountContext,
}: BrokerAccountPanelProps) {
  const [status, setStatus] = useState<BrokerPublicStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [closingPosId, setClosingPosId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Order ticket state (Demo execution only)
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>(selectedSignal?.direction ?? 'BUY');
  const [lotsInput, setLotsInput] = useState<string>('0.01');
  const [slDistInput, setSlDistInput] = useState<string>('6.00');
  const [tpDistInput, setTpDistInput] = useState<string>('12.00');

  const initialAutoSyncedRef = useRef(false);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/broker/status');
      if (!res.ok) return;
      const data = (await res.json()) as BrokerPublicStatus;
      setStatus(data);

      if (data.activeAccount && !initialAutoSyncedRef.current) {
        initialAutoSyncedRef.current = true;
        onSyncAccountContext({
          balance: data.activeAccount.balance,
          currency: data.activeAccount.currency,
          leverage: data.activeAccount.leverage,
          brokerLabel: `${data.activeAccount.brokerTitle} Demo`,
        });
      }
    } catch {
      if (!silent) {
        setFeedback({ type: 'err', text: 'Nu s-a putut prelua starea conexiunii Pepperstone Demo.' });
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [onSyncAccountContext]);

  useEffect(() => {
    void fetchStatus(false);
    const timer = window.setInterval(() => {
      void fetchStatus(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  useEffect(() => {
    if (selectedSignal) {
      setTradeSide(selectedSignal.direction);
    }
  }, [selectedSignal?.id, selectedSignal?.direction]);

  const handleConnect = async (accountId?: number) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountId ? { ctidTraderAccountId: accountId } : {}),
      });
      const data = (await res.json()) as BrokerPublicStatus & { error?: string; status?: BrokerPublicStatus };
      if (!res.ok) {
        if (data.status) setStatus(data.status);
        setFeedback({ type: 'err', text: data.error || 'Reconectarea a eșuat.' });
        return;
      }
      setStatus(data);
      if (data.activeAccount) {
        onSyncAccountContext({
          balance: data.activeAccount.balance,
          currency: data.activeAccount.currency,
          leverage: data.activeAccount.leverage,
          brokerLabel: `${data.activeAccount.brokerTitle} Demo`,
        });
      }
      setFeedback({ type: 'ok', text: 'Conexiunea cu contul Pepperstone Demo a fost actualizată.' });
    } catch {
      setFeedback({ type: 'err', text: 'Eroare de rețea la conectarea brokerului.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSync = async () => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/sync', { method: 'POST' });
      const data = (await res.json()) as BrokerPublicStatus & { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Sincronizarea a eșuat.' });
        return;
      }
      setStatus(data);
      if (data.activeAccount) {
        onSyncAccountContext({
          balance: data.activeAccount.balance,
          currency: data.activeAccount.currency,
          leverage: data.activeAccount.leverage,
          brokerLabel: `${data.activeAccount.brokerTitle} Demo`,
        });
      }
      setFeedback({ type: 'ok', text: 'Balanța, marja și pozițiile au fost sincronizate.' });
    } catch {
      setFeedback({ type: 'err', text: 'Eroare la sincronizarea cu serverul.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/broker/refresh-token', { method: 'POST' });
      const data = (await res.json()) as { status?: BrokerPublicStatus; error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Reînnoirea tokenului a eșuat.' });
        return;
      }
      if (data.status) setStatus(data.status);
      setFeedback({ type: 'ok', text: 'Tokenul OAuth cTrader a fost reînnoit și sesiunea reautentificată.' });
    } catch {
      setFeedback({ type: 'err', text: 'Eroare de comunicare la reînnoirea tokenului.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleApplyCalculatorToTicket = () => {
    if (suggestedLots && Number.isFinite(suggestedLots)) {
      setLotsInput(Math.max(0.01, suggestedLots).toFixed(2));
    }
    if (suggestedSlDistance && suggestedSlDistance >= 0.5) {
      setSlDistInput(suggestedSlDistance.toFixed(2));
    }
    if (suggestedTpDistance && suggestedTpDistance >= 0.5) {
      setTpDistInput(suggestedTpDistance.toFixed(2));
    } else if (selectedSignal) {
      setTradeSide(selectedSignal.direction);
      const slDist = Math.abs(selectedSignal.entry - selectedSignal.stopLoss);
      const tpDist = Math.abs(selectedSignal.tp2 - selectedSignal.entry);
      if (slDist >= 0.5) setSlDistInput(slDist.toFixed(2));
      if (tpDist >= 0.5) setTpDistInput(tpDist.toFixed(2));
    }
    setFeedback({ type: 'ok', text: 'Parametrii de risc și țintele au fost încărcați în tichetul Demo.' });
  };

  const handlePlaceDemoOrder = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const lots = Number(lotsInput);
    const slDist = slDistInput.trim() ? Number(slDistInput) : undefined;
    const tpDist = tpDistInput.trim() ? Number(tpDistInput) : undefined;

    if (!Number.isFinite(lots) || lots < 0.01 || lots > 5) {
      setFeedback({ type: 'err', text: 'Volumul trebuie să fie între 0.01 și 5.00 loturi.' });
      return;
    }
    if (slDist !== undefined && (!Number.isFinite(slDist) || slDist < 0.5)) {
      setFeedback({ type: 'err', text: 'Distanța Stop-Loss minimă este $0.50.' });
      return;
    }
    if (tpDist !== undefined && (!Number.isFinite(tpDist) || tpDist < 0.5)) {
      setFeedback({ type: 'err', text: 'Distanța Take-Profit minimă este $0.50.' });
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch('/api/broker/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeSide,
          lots: Math.round(lots * 100) / 100,
          stopLossDistanceUsd: slDist,
          takeProfitDistanceUsd: tpDist,
          comment: selectedSignal
            ? `SSociety ${selectedSignal.timeframe} ${selectedSignal.direction}`
            : 'SSociety Team Demo Order',
        }),
      });
      const data = (await res.json()) as {
        status?: BrokerPublicStatus;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Ordinul demo a fost respins.' });
        return;
      }
      if (data.status) setStatus(data.status);
      setFeedback({
        type: 'ok',
        text: `Ordin ${tradeSide} ${lots.toFixed(2)} loturi XAUUSD executat pe contul Demo Pepperstone.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Eroare de comunicare la trimiterea ordinului demo.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleClosePosition = async (positionId: number) => {
    setClosingPosId(positionId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/broker/positions/${positionId}/close`, {
        method: 'POST',
      });
      const data = (await res.json()) as { status?: BrokerPublicStatus; error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Nu s-a putut închide poziția.' });
        return;
      }
      if (data.status) setStatus(data.status);
      setFeedback({ type: 'ok', text: `Poziția #${positionId} a fost închisă pe contul Demo.` });
    } catch {
      setFeedback({ type: 'err', text: 'Eroare la închiderea poziției.' });
    } finally {
      setClosingPosId(null);
    }
  };

  const acc = status?.activeAccount ?? null;
  const sym = status?.xauSymbol ?? null;
  const isAuthenticated = status?.connectionState === 'AUTHENTICATED';
  const isDemoSafe = acc ? !acc.isLive : status?.environment === 'demo';

  // Estimate required margin on Pepperstone 1:30 XAUUSD (~3.33% margin rate -> notional / leverage)
  const parsedLots = Number(lotsInput);
  const refSpot = sym?.ask ?? sym?.bid ?? 3850;
  const estMarginUsd =
    Number.isFinite(parsedLots) && parsedLots > 0 && acc
      ? (parsedLots * (sym?.lotSizeUnits || 100) * refSpot) / Math.max(1, acc.leverage)
      : 0;

  return (
    <section
      aria-label="Cont Demo Pepperstone & Execuție cTrader Open API"
      className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-[#182030]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Cont Broker Pepperstone Demo · cTrader Open API
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  isAuthenticated
                    ? 'bg-emerald-500'
                    : status?.connectionState === 'CONNECTING'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-rose-500'
                }`}
              />
              <span>{status ? CONNECTION_LABELS[status.connectionState] : 'Se încarcă...'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conexiune securizată server-side (OAuth2 + WebSocket Spotware) · Execuție protejată exclusiv pe cont DEMO
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {status && status.accounts.length > 0 && (
            <select
              aria-label="Selectează cont cTrader"
              value={acc?.ctidTraderAccountId ?? ''}
              disabled={isBusy}
              onChange={(e) => {
                const nextId = Number(e.target.value);
                if (nextId > 0) void handleConnect(nextId);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {status.accounts.map((item) => (
                <option key={item.ctidTraderAccountId} value={item.ctidTraderAccountId}>
                  #{item.traderLogin} · {item.isLive ? 'LIVE' : 'DEMO'} · {item.brokerTitle}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500/60 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            <span>Sincronizează</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRefreshToken()}
            disabled={isBusy}
            title="Reîmprospătează tokenul OAuth pe server"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500/60 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Reîmprospătează Token</span>
          </button>

          {status?.oauthAuthorizeUrl && (
            <a
              href={status.oauthAuthorizeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Autorizează Cont OAuth</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Feedback / Error Banner */}
      {(feedback || status?.lastError) && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 ${
            feedback?.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{feedback?.text ?? status?.lastError}</span>
          {feedback && (
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="font-semibold hover:underline cursor-pointer shrink-0"
            >
              Închide
            </button>
          )}
        </div>
      )}

      {isLoading && !status ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-pulse">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-16 rounded-lg bg-slate-100 dark:bg-[#141A26]" />
          ))}
        </div>
      ) : (
        <>
          {/* Account Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pb-4 border-b border-slate-100 dark:border-[#182030]">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Broker & Cont Demo</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {acc ? `${acc.brokerTitle} #${acc.traderLogin}` : 'Neconectat'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {acc ? `ID ${acc.ctidTraderAccountId} · ${acc.accountType}` : '—'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Balanță Cont</div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {acc ? `${acc.balance.toFixed(2)} ${acc.currency}` : '—'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {isDemoSafe ? 'Mod DEMO Activ' : 'Mod LIVE (Blocat Execuție)'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Levier (Leverage)</div>
              <div className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {acc ? `1:${acc.leverage}` : '—'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Regim Retail EU (3.33%)
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Marjă Liberă / Utilizată</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {acc ? `${acc.freeMargin.toFixed(2)} ${acc.currency}` : '—'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Utilizată: {acc ? `${acc.marginUsed.toFixed(2)} ${acc.currency}` : '—'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Cotă Live {sym?.symbolName || 'XAUUSD'}</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {sym?.bid && sym?.ask ? `${sym.bid.toFixed(2)} / ${sym.ask.toFixed(2)}` : 'Așteptare tick...'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Spread: {sym?.spread !== null && sym?.spread !== undefined ? `$${sym.spread.toFixed(2)}` : '—'} · Min {sym?.minLots ?? 0.01}L
              </div>
            </div>

            <div className="flex flex-col justify-center">
              <button
                type="button"
                disabled={!acc}
                onClick={() => {
                  if (!acc) return;
                  onSyncAccountContext({
                    balance: acc.balance,
                    currency: acc.currency,
                    leverage: acc.leverage,
                    brokerLabel: `${acc.brokerTitle} Demo`,
                  });
                  setFeedback({
                    type: 'ok',
                    text: `Capitalul (${acc.balance.toFixed(2)} ${acc.currency}) și levierul 1:${acc.leverage} au fost aplicate în Calculatorul de Risc.`,
                  });
                }}
                className="w-full py-2 px-3 rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                Sincronizează în Calculator
              </button>
            </div>
          </div>

          {/* Demo Execution Ticket + Open Positions Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Demo Order Ticket */}
            <form onSubmit={handlePlaceDemoOrder} className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Tichet Execuție Demo XAUUSD
                </span>
                <button
                  type="button"
                  onClick={handleApplyCalculatorToTicket}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Preia din Calculator</span>
                </button>
              </div>

              {/* BUY / SELL Switch */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#141A26] border border-slate-200 dark:border-[#222C40]">
                <button
                  type="button"
                  onClick={() => setTradeSide('BUY')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tradeSide === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>BUY Market</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTradeSide('SELL')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tradeSide === 'SELL'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>SELL Market</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Volum (Loturi)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="5.00"
                    value={lotsInput}
                    onChange={(e) => setLotsInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">SL Dist. ($)</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0.50"
                    value={slDistInput}
                    onChange={(e) => setSlDistInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">TP Dist. ($)</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0.50"
                    value={tpDistInput}
                    onChange={(e) => setTpDistInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>
                  Marjă est. (1:{acc?.leverage ?? 30}):{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    ~${estMarginUsd.toFixed(2)} USD
                  </strong>
                </span>
                <span>1 pip = $1.00 la 0.10L · $0.10 la 0.01L</span>
              </div>

              <button
                type="submit"
                disabled={isBusy || !isAuthenticated || !isDemoSafe}
                className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                  tradeSide === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  Execută {tradeSide} {Number(lotsInput || 0.01).toFixed(2)}L XAUUSD pe Cont Demo
                </span>
              </button>
            </form>

            {/* Right: Open Positions & Recent Executions */}
            <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#182030] pt-4 lg:pt-0 lg:pl-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Poziții Deschise Pepperstone Demo ({status?.openPositions.length ?? 0})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {status?.lastSyncAt
                    ? `Ultima sincronizare: ${new Date(status.lastSyncAt).toLocaleTimeString('ro-RO')}`
                    : 'Nesincronizat'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-[#182030] text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 text-left font-medium">ID / Simbol</th>
                      <th className="py-2 px-2 text-left font-medium">Direcție</th>
                      <th className="py-2 px-2 text-right font-medium">Loturi</th>
                      <th className="py-2 px-2 text-right font-medium">Entry</th>
                      <th className="py-2 px-2 text-right font-medium">SL / TP</th>
                      <th className="py-2 pl-2 text-right font-medium">Acțiune</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#182030] font-mono tabular-nums">
                    {status && status.openPositions.length > 0 ? (
                      status.openPositions.map((pos) => (
                        <tr key={pos.positionId} className="hover:bg-slate-50 dark:hover:bg-[#111622]">
                          <td className="py-2.5 pr-3 text-slate-900 dark:text-white">
                            <div className="font-semibold">{pos.symbolName}</div>
                            <div className="text-[11px] text-slate-500">#{pos.positionId}</div>
                          </td>
                          <td
                            className={`py-2.5 px-2 font-bold ${
                              pos.tradeSide === 'BUY'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {pos.tradeSide}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-200">
                            {pos.lots.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-900 dark:text-white">
                            {pos.entryPrice.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{pos.stopLoss ? pos.stopLoss.toFixed(2) : '—'}</span>
                            <span> / </span>
                            <span>{pos.takeProfit ? pos.takeProfit.toFixed(2) : '—'}</span>
                          </td>
                          <td className="py-2.5 pl-2 text-right font-sans">
                            <button
                              type="button"
                              disabled={closingPosId === pos.positionId}
                              onClick={() => void handleClosePosition(pos.positionId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-medium text-rose-700 dark:text-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>{closingPosId === pos.positionId ? 'Se închide...' : 'Închide'}</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center font-sans text-slate-500 dark:text-slate-400">
                          Nu există poziții deschise în prezent pe contul Demo #{acc?.traderLogin ?? '—'}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {status && status.recentExecutions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-[#182030] space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Ultimele Execuții Broker
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {status.recentExecutions.slice(0, 5).map((ex) => (
                      <div
                        key={ex.id}
                        className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300"
                      >
                        <span>
                          {ex.executionType}
                          {ex.tradeSide ? ` · ${ex.tradeSide}` : ''}
                          {ex.lots ? ` ${ex.lots.toFixed(2)}L` : ''}
                          {ex.positionId ? ` #${ex.positionId}` : ''}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {ex.price ? `@ ${ex.price.toFixed(2)} · ` : ''}
                          {new Date(ex.timestamp).toLocaleTimeString('ro-RO')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
