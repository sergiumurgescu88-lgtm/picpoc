import { FormEvent, useState } from 'react';
import { BellPlus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  AlertRule,
  NotificationEvent,
  SecurityAuditSnapshot,
  Timeframe,
} from '../types/trading';

interface AlertsSecurityViewProps {
  alerts: AlertRule[];
  notifications: NotificationEvent[];
  securityAudit: SecurityAuditSnapshot | null;
  currentPrice: number | null;
  onCreateAlert: (payload: {
    type: AlertRule['type'];
    threshold?: number;
    timeframe?: Timeframe;
    note: string;
  }) => Promise<void>;
  onToggleAlert: (id: string) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
  onRefreshAudit: () => Promise<void>;
}

const ALERT_TYPE_LABELS: Record<AlertRule['type'], string> = {
  PRICE_ABOVE: 'Preț Peste Nivel',
  PRICE_BELOW: 'Preț Sub Nivel',
  RSI_OVERBOUGHT: 'RSI Supracumpărat',
  RSI_OVERSOLD: 'RSI Supravândut',
  NEW_SIGNAL: 'Orice Semnal Nou',
};

export function AlertsSecurityView({
  alerts,
  notifications,
  securityAudit,
  currentPrice,
  onCreateAlert,
  onToggleAlert,
  onDeleteAlert,
  onRefreshAudit,
}: AlertsSecurityViewProps) {
  const [type, setType] = useState<AlertRule['type']>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState<string>(() =>
    currentPrice ? (currentPrice + 5).toFixed(2) : '2640.00'
  );
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (note.trim().length < 2) {
      setFormError('Introduceți o descriere scurtă (minim 2 caractere).');
      return;
    }

    try {
      setSubmitting(true);
      await onCreateAlert({
        type,
        threshold: type === 'NEW_SIGNAL' ? undefined : Number(threshold),
        timeframe: type === 'RSI_OVERBOUGHT' || type === 'RSI_OVERSOLD' || type === 'NEW_SIGNAL' ? timeframe : undefined,
        note: note.trim(),
      });
      setNote('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Eroare la crearea alertei');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create & Manage Custom Real-Time Alerts */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 space-y-5">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Reguli Alerte în Timp Real
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitorizate continuu pe server și livrate instant prin WebSocket
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-slate-500 dark:text-slate-400">Condiție Alertă</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AlertRule['type'])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="PRICE_ABOVE">Preț XAU/USD peste prag</option>
                  <option value="PRICE_BELOW">Preț XAU/USD sub prag</option>
                  <option value="RSI_OVERBOUGHT">RSI Supracumpărat</option>
                  <option value="RSI_OVERSOLD">RSI Supravândut</option>
                  <option value="NEW_SIGNAL">Generare Semnal Nou</option>
                </select>
              </label>

              {type !== 'NEW_SIGNAL' ? (
                <label className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">
                    {type.startsWith('PRICE') ? 'Nivel Preț (USD)' : 'Prag RSI (1–99)'}
                  </span>
                  <input
                    type="number"
                    step={type.startsWith('PRICE') ? '0.10' : '1'}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </label>
              ) : (
                <label className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Interval Prioritar</span>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="H4">H4</option>
                    <option value="D1">D1</option>
                  </select>
                </label>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-slate-500 dark:text-slate-400">Notă / Etichetă Alertă</span>
              <input
                type="text"
                maxLength={140}
                placeholder="Ex: Testare zonă lichiditate Londra"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#222C40] bg-slate-50 dark:bg-[#141A26] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </label>

            {formError && <p className="text-rose-500">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              <BellPlus className="w-3.5 h-3.5" />
              <span>Adaugă Regulă Alertă</span>
            </button>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-[#182030] border-t border-slate-100 dark:border-[#182030] pt-2">
            {alerts.map((rule) => (
              <div key={rule.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {ALERT_TYPE_LABELS[rule.type]}
                    </span>
                    {rule.threshold !== undefined && (
                      <span className="font-mono text-amber-600 dark:text-amber-400">
                        {rule.threshold.toFixed(2)}
                      </span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 font-mono">Declanșări: {rule.triggeredCount}</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">{rule.note}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onToggleAlert(rule.id)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                      rule.active
                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-300 dark:border-[#243045] text-slate-500'
                    }`}
                  >
                    {rule.active ? 'Activă' : 'Pauză'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteAlert(rule.id)}
                    aria-label="Șterge alerta"
                    className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Notification Stream Log */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5 flex flex-col">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Istoric Notificări în Timp Real
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-[#182030] max-h-[420px] overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className="py-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-semibold ${
                      n.severity === 'SUCCESS'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : n.severity === 'CRITICAL'
                          ? 'text-rose-600 dark:text-rose-400'
                          : n.severity === 'WARNING'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {n.title}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {new Date(n.timestamp).toLocaleTimeString('ro-RO')}
                  </span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modular & Secured Architecture Inspector */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1C2331] bg-white dark:bg-[#0D111A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#182030]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Arhitectură Modulară & Audit Securitate Server
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Politici active aplicate pe stratul Express, WebSocket și Motorul de Analiză
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onRefreshAudit()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#243045] text-slate-700 dark:text-slate-200 hover:border-amber-500/50 cursor-pointer"
          >
            Reîmprospătează Audit
          </button>
        </div>

        {securityAudit && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Limitare Rată (Rate Limit)</div>
              <div className="mt-1 font-mono text-slate-900 dark:text-white">
                {securityAudit.rateLimitPolicy}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Validare & Sanitizare</div>
              <div className="mt-1 font-mono text-slate-900 dark:text-white">
                {securityAudit.validationEngine}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Protecție Payload & WebSocket</div>
              <div className="mt-1 font-mono text-slate-900 dark:text-white">
                {securityAudit.wsOriginCheck}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Telemetrie Securitate</div>
              <div className="mt-1 font-mono tabular-nums text-slate-900 dark:text-white">
                Clienți WS activi: {securityAudit.activeWsClients} · Cereri blocate: {securityAudit.blockedRequestsCount}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
