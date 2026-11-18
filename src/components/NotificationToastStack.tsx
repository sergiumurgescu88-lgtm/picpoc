import { X } from 'lucide-react';
import { NotificationEvent } from '../types/trading';

interface NotificationToastStackProps {
  toasts: NotificationEvent[];
  onDismiss: (id: string) => void;
}

export function NotificationToastStack({ toasts, onDismiss }: NotificationToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-full max-w-sm pointer-events-none px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const accentText =
          toast.severity === 'SUCCESS'
            ? 'text-emerald-600 dark:text-emerald-400'
            : toast.severity === 'CRITICAL'
              ? 'text-rose-600 dark:text-rose-400'
              : toast.severity === 'WARNING'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl border border-slate-200 dark:border-[#243045] bg-white/95 dark:bg-[#111622]/95 backdrop-blur-md p-3.5 shadow-lg flex items-start justify-between gap-3"
          >
            <div className="min-w-0 text-xs">
              <div className={`font-semibold ${accentText}`}>{toast.title}</div>
              <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                {toast.message}
              </p>
              <div className="mt-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
                XAU/USD @ {(toast.price ?? 0).toFixed(2)} ·{' '}
                {new Date(toast.timestamp).toLocaleTimeString('ro-RO')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Închide notificarea"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
