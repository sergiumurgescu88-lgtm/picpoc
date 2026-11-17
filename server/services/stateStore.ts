import fs from 'fs';
import path from 'path';
import {
  AlertRule,
  LifecycleAuditEvent,
  NotificationEvent,
  StrategyPolicy,
  TradingSignal,
} from '../types/trading.js';

export interface PersistedTerminalState {
  version: number;
  updatedAt: number;
  policy: StrategyPolicy;
  signals: TradingSignal[];
  alerts: AlertRule[];
  notifications: NotificationEvent[];
  lifecycleEvents: LifecycleAuditEvent[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STATE_FILE = path.join(DATA_DIR, 'terminal-state.json');

export class TerminalStateStore {
  private flushTimer: NodeJS.Timeout | null = null;
  private state: PersistedTerminalState = {
    version: 1,
    updatedAt: Date.now(),
    policy: 'EXIT_PROFIT_ON_REVERSAL',
    signals: [],
    alerts: [],
    notifications: [],
    lifecycleEvents: [],
  };

  public load(): PersistedTerminalState {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return this.state;
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedTerminalState>;
      this.state = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        policy:
          parsed.policy === 'LOCK_UNTIL_RESOLUTION'
            ? 'LOCK_UNTIL_RESOLUTION'
            : 'EXIT_PROFIT_ON_REVERSAL',
        signals: Array.isArray(parsed.signals) ? parsed.signals : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        lifecycleEvents: Array.isArray(parsed.lifecycleEvents) ? parsed.lifecycleEvents : [],
      };
      return this.state;
    } catch (err) {
      console.error(
        '[StateStore] Nu s-a putut încărca starea salvată, se pornește cu stare curată:',
        err instanceof Error ? err.message : 'unknown'
      );
      return this.state;
    }
  }

  public getSnapshot(): PersistedTerminalState {
    return this.state;
  }

  public update(patch: Partial<Omit<PersistedTerminalState, 'version' | 'updatedAt'>>): void {
    this.state = {
      ...this.state,
      ...patch,
      updatedAt: Date.now(),
    };
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 350);
  }

  public flushNow(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmpPath, STATE_FILE);
    } catch (err) {
      console.error(
        '[StateStore] Eroare la salvarea stării pe disc:',
        err instanceof Error ? err.message : 'unknown'
      );
    }
  }

  public dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushNow();
  }
}
