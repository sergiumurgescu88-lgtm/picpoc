import crypto from 'crypto';
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG, Timeframe } from '../config/env.js';
import { getBlockedRequestsCount } from '../middleware/security.js';
import {
  AlertRule,
  NotificationEvent,
  SecurityAuditSnapshot,
  StrategyPolicy,
  TradingSignal,
} from '../types/trading.js';
import { CTraderBrokerService } from './ctraderService.js';
import { MarketFeedService } from './marketFeed.js';
import { TerminalStateStore } from './stateStore.js';
import { SignalGeneratorEngine } from '../engine/signalGenerator.js';

interface ClientMeta {
  ws: WebSocket;
  subscribedTimeframe: Timeframe;
  isAlive: boolean;
}

export class NotificationHub {
  private clients = new Set<ClientMeta>();
  private alertRules: AlertRule[] = [];
  private notifications: NotificationEvent[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private scanCounter = 0;
  private reversalCounter = 0;

  constructor(
    private wss: WebSocketServer,
    private marketFeed: MarketFeedService,
    private signalEngine: SignalGeneratorEngine,
    private stateStore?: TerminalStateStore,
    private brokerService?: CTraderBrokerService
  ) {}

  public initialize(): void {
    const tick = this.marketFeed.getTick();
    const persisted = this.stateStore?.getSnapshot();

    if (persisted && persisted.alerts.length > 0) {
      this.alertRules = persisted.alerts;
    } else {
      // Pre-populate 2 helpful alert rules
      this.alertRules = [
        {
          id: 'alrt-default-1',
          type: 'NEW_SIGNAL',
          timeframe: 'M15',
          note: 'Notificare automată la generarea oricărui semnal nou XAU/USD (M15/H1)',
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
        {
          id: 'alrt-default-2',
          type: 'PRICE_ABOVE',
          threshold: Math.round((tick.mid + 12) * 100) / 100,
          note: 'Alertă breakout rezistență intraday XAU/USD',
          active: true,
          triggeredCount: 0,
          createdAt: Date.now(),
        },
      ];
    }

    if (persisted && persisted.notifications.length > 0) {
      this.notifications = persisted.notifications;
    } else {
      this.notifications = [
        {
          id: 'notif-boot',
          category: 'SYSTEM',
          severity: 'INFO',
          title: 'Motor Semnale XAU/USD Inițializat',
          message: `Conexiune WebSocket securizată activă. Preț curent: ${tick.mid.toFixed(2)} USD.`,
          price: tick.mid,
          timestamp: Date.now(),
        },
      ];
    }
    this.persistHubState();

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      if (this.clients.size >= CONFIG.WS.MAX_CLIENTS) {
        ws.close(1013, 'Capacitate maximă atinsă');
        return;
      }

      const client: ClientMeta = {
        ws,
        subscribedTimeframe: 'M15',
        isAlive: true,
      };
      this.clients.add(client);

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('message', (raw) => {
        try {
          if (raw.toString().length > 2048) return;
          const msg = JSON.parse(raw.toString()) as { type?: string; timeframe?: string };
          if (
            msg.type === 'subscribe:timeframe' &&
            msg.timeframe &&
            (CONFIG.TIMEFRAMES as readonly string[]).includes(msg.timeframe)
          ) {
            client.subscribedTimeframe = msg.timeframe as Timeframe;
            this.sendToClient(client.ws, {
              type: 'analysis:update',
              payload: this.signalEngine.buildTechnicalReport(client.subscribedTimeframe),
            });
          }
        } catch {
          // Ignore malformed client payloads
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });

      // Send authoritative initial sync immediately
      this.sendToClient(ws, {
        type: 'init:state',
        payload: {
          tick: this.marketFeed.getTick(),
          signals: this.signalEngine.getSignals(),
          policy: this.signalEngine.getPolicy(),
          alerts: this.alertRules,
          notifications: this.notifications.slice(0, 25),
          analysis: this.signalEngine.buildTechnicalReport(client.subscribedTimeframe),
          candles: this.marketFeed.getCandles(client.subscribedTimeframe),
        },
      });
    });

    // Heartbeat to purge stale connections
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, CONFIG.WS.HEARTBEAT_INTERVAL_MS);

    // Real-time market tick + signal evaluation loop
    this.tickInterval = setInterval(() => {
      this.processMarketStep();
    }, CONFIG.WS.TICK_BROADCAST_MS);

    // Periodic external live feed synchronization + immediate post-sync TP/SL candle reconciliation
    this.syncInterval = setInterval(() => {
      void this.syncAndReconcileExternalData();
    }, CONFIG.WS.CANDLE_POLL_MS);
  }

  private async syncAndReconcileExternalData(): Promise<void> {
    const synced = await this.marketFeed.syncExternalMarketData();
    if (!synced) return;

    const tick = this.marketFeed.getTick();
    const { transitions } = this.signalEngine.updateSignalsOnTick(tick.mid);
    this.emitSignalTransitions(transitions, tick.mid);

    for (const client of this.clients) {
      this.sendToClient(client.ws, {
        type: 'candles:sync',
        payload: {
          timeframe: client.subscribedTimeframe,
          candles: this.marketFeed.getCandles(client.subscribedTimeframe),
          tick,
        },
      });
    }
  }

  private emitSignalTransitions(
    transitions: { signal: TradingSignal; previousStatus: string; previousStopLoss?: number }[],
    refPrice: number
  ): void {
    for (const { signal, previousStatus, previousStopLoss } of transitions) {
      const isSl = signal.status === 'SL_HIT';
      const isBeClose = Boolean(signal.closedAt) && signal.exitReason === 'BREAKEVEN_LOCK';
      const isTp4Full = signal.status === 'TP4_HIT';
      const isPureTrailingStep =
        !isSl && !isBeClose && !isTp4Full && signal.status === previousStatus;

      // Automatically sync matching Pepperstone Demo position SL to Breakeven once TP1+ is reached
      if (!isSl && (signal.reachedTargets.includes('TP1') || signal.trailingStopStage === 'BREAKEVEN')) {
        void this.brokerService?.autoSyncTrailingStopForSignal(signal.direction, signal.stopLoss).catch(() => {});
      }

      const title = isSl
        ? `Stop Loss Inițial Atins (${signal.direction} ${signal.timeframe})`
        : isBeClose
          ? `Trailing Stop / Breakeven Executat · Capital Protejat (${signal.direction} ${signal.timeframe})`
          : isTp4Full
            ? `TP4 Final Atins · Tranzacție Închisă (${signal.direction} ${signal.timeframe})`
            : isPureTrailingStep
              ? `Trailing Stop Avansat Automat (${signal.direction} ${signal.timeframe})`
              : signal.status === 'TP1_HIT'
                ? `TP1 Atins · SL Mutat Automat la Breakeven (${signal.entry.toFixed(2)})`
                : `${signal.status.replace('_', ' ')} Atins · Trailing SL Blocat @ ${signal.stopLoss.toFixed(2)}`;

      const message =
        signal.exitNote ||
        (isPureTrailingStep && previousStopLoss !== undefined
          ? `${signal.symbol} @ ${refPrice.toFixed(2)} · SL avansat de la ${previousStopLoss.toFixed(2)} la ${signal.stopLoss.toFixed(2)} · Capital protejat.`
          : `${signal.symbol} @ ${refPrice.toFixed(2)} · Trailing SL activ: ${signal.stopLoss.toFixed(2)} · Profit curent: ${signal.pnlPips >= 0 ? '+' : ''}${signal.pnlPips.toFixed(1)} pips (${signal.rMultiple >= 0 ? '+' : ''}${signal.rMultiple.toFixed(2)}R)`);

      const notif = this.recordNotification({
        category: isSl
          ? 'SIGNAL_SL'
          : isBeClose || isPureTrailingStep || signal.status === 'TP1_HIT'
            ? 'SIGNAL_BREAKEVEN'
            : 'SIGNAL_TP',
        severity: isSl ? 'CRITICAL' : 'SUCCESS',
        title,
        message,
        signalId: signal.id,
        direction: signal.direction,
        price: signal.currentPrice || refPrice,
      });

      this.broadcast({
        type: 'signal:updated',
        payload: { signal, notification: notif },
      });
    }
  }

  private processMarketStep(): void {
    const { tick, updatedCandles } = this.marketFeed.stepRealTimeTick();

    // Update active signals & check TP/SL transitions (including candle wicks & trailing SL)
    const { updatedSignals, transitions } = this.signalEngine.updateSignalsOnTick(tick.mid);
    this.emitSignalTransitions(transitions, tick.mid);

    // Evaluate custom user alert rules
    this.evaluateAlertRules(tick.mid);

    // Evaluate confirmed trend reversals every ~12 ticks (~18s) BEFORE any new scan
    this.reversalCounter += 1;
    if (this.reversalCounter >= 12) {
      this.reversalCounter = 0;
      const reversalActions = this.signalEngine.evaluateTrendReversalOnOpenSignals();
      for (const act of reversalActions) {
        const isExit = act.type === 'PROFIT_EXIT';
        const isBeTightened = act.type === 'BREAKEVEN_TIGHTENED';
        if (isBeTightened) {
          void this.brokerService?.autoSyncTrailingStopForSignal(act.signal.direction, act.signal.stopLoss).catch(() => {});
        }
        const notif = this.recordNotification({
          category: isExit
            ? 'SIGNAL_REVERSAL_EXIT'
            : isBeTightened
              ? 'SIGNAL_BREAKEVEN'
              : 'SIGNAL_REVERSAL_WARN',
          severity: isExit || isBeTightened ? 'SUCCESS' : 'WARNING',
          title: isExit
            ? `Trend Inversat · Ieșire Profit (${act.signal.direction} ${act.signal.timeframe})`
            : isBeTightened
              ? `Protecție Reversie · SL Mutat la Breakeven (${act.signal.direction} ${act.signal.timeframe})`
              : `Avertisment Schimbare Trend (${act.signal.direction} → ${act.detectedDirection})`,
          message: act.message,
          signalId: act.signal.id,
          direction: act.signal.direction,
          price: tick.mid,
        });
        this.broadcast({
          type: 'signal:updated',
          payload: { signal: act.signal, notification: notif },
        });
      }
    }

    // Periodic autonomous multi-timeframe signal scan every ~18 ticks (~27s)
    // Only opens a new signal if no active signal is running (or same-direction slot free)
    this.scanCounter += 1;
    if (this.scanCounter >= 18) {
      this.scanCounter = 0;
      const candidateTf: Timeframe = Math.random() > 0.45 ? 'M15' : 'H1';
      const newSignal = this.signalEngine.evaluateAndGenerateSignal(candidateTf, false);
      if (newSignal) {
        this.emitNewSignal(newSignal);
      }
    }

    // Broadcast tick & incremental candle + active signal P&L / trailed SL updates
    for (const client of this.clients) {
      const candle = updatedCandles[client.subscribedTimeframe];
      this.sendToClient(client.ws, {
        type: 'market:tick',
        payload: {
          tick,
          candle,
          timeframe: client.subscribedTimeframe,
          activeUpdates: updatedSignals.map((s) => ({
            id: s.id,
            stopLoss: s.stopLoss,
            initialStopLoss: s.initialStopLoss,
            trailingStopStage: s.trailingStopStage,
            breakevenActivatedAt: s.breakevenActivatedAt,
            peakFavorablePrice: s.peakFavorablePrice,
            currentPrice: s.currentPrice,
            pnlPips: s.pnlPips,
            rMultiple: s.rMultiple,
            status: s.status,
            reachedTargets: s.reachedTargets,
            resolution: s.resolution,
            closedAt: s.closedAt,
            exitReason: s.exitReason,
            exitNote: s.exitNote,
            trendWarning: s.trendWarning,
          })),
        },
      });
    }
  }

  public emitNewSignal(signal: TradingSignal): NotificationEvent {
    const notif = this.recordNotification({
      category: 'SIGNAL_NEW',
      severity: signal.direction === 'BUY' ? 'SUCCESS' : 'WARNING',
      title: `Semnal Nou ${signal.direction} XAU/USD (${signal.timeframe})`,
      message: `Entry ${signal.entry.toFixed(2)} · SL ${signal.stopLoss.toFixed(2)} · TP1 ${signal.tp1.toFixed(2)} · R:R 1:${signal.riskReward.toFixed(1)}`,
      signalId: signal.id,
      direction: signal.direction,
      price: signal.entry,
    });

    this.broadcast({
      type: 'signal:created',
      payload: { signal, notification: notif },
    });

    return notif;
  }

  public notifyPolicyChanged(policy: StrategyPolicy): NotificationEvent {
    const tick = this.marketFeed.getTick();
    const notif = this.recordNotification({
      category: 'SYSTEM',
      severity: 'INFO',
      title: 'Politică Management Trend Actualizată',
      message:
        policy === 'EXIT_PROFIT_ON_REVERSAL'
          ? 'Mod activ: Închidere protejată pe profit la reversia confirmată a trendului.'
          : 'Mod activ: Păstrare strictă până la TP4 / Breakeven / SL fără ieșire anticipată.',
      price: tick.mid,
    });
    this.broadcast({
      type: 'policy:updated',
      payload: { policy, notification: notif },
    });
    return notif;
  }

  public notifySignalClosed(signal: TradingSignal): void {
    const notif = this.recordNotification({
      category: 'SYSTEM',
      severity: 'INFO',
      title: `Semnal Închis Manual (${signal.direction} ${signal.timeframe})`,
      message: `Poziție închisă la ${signal.currentPrice.toFixed(2)} (${signal.pnlPips >= 0 ? '+' : ''}${signal.pnlPips.toFixed(1)} pips).`,
      signalId: signal.id,
      direction: signal.direction,
      price: signal.currentPrice,
    });

    this.broadcast({
      type: 'signal:updated',
      payload: { signal, notification: notif },
    });
  }

  private evaluateAlertRules(price: number): void {
    const now = Date.now();
    for (const rule of this.alertRules) {
      if (!rule.active) continue;
      if (rule.lastTriggeredAt && now - rule.lastTriggeredAt < 60_000) continue;

      let triggered = false;
      if (rule.type === 'PRICE_ABOVE' && rule.threshold && price >= rule.threshold) {
        triggered = true;
      } else if (rule.type === 'PRICE_BELOW' && rule.threshold && price <= rule.threshold) {
        triggered = true;
      } else if (rule.type === 'RSI_OVERBOUGHT' || rule.type === 'RSI_OVERSOLD') {
        const tf = rule.timeframe ?? 'M15';
        const report = this.signalEngine.buildTechnicalReport(tf);
        if (rule.type === 'RSI_OVERBOUGHT' && report.indicators.rsi14 >= (rule.threshold ?? 70)) {
          triggered = true;
        }
        if (rule.type === 'RSI_OVERSOLD' && report.indicators.rsi14 <= (rule.threshold ?? 30)) {
          triggered = true;
        }
      }

      if (triggered) {
        rule.triggeredCount += 1;
        rule.lastTriggeredAt = now;
        const notif = this.recordNotification({
          category: 'ALERT_RULE',
          severity: 'WARNING',
          title: `Alertă Declanșată: ${rule.type.replace('_', ' ')}`,
          message: `${rule.note} · Preț curent XAU/USD: ${price.toFixed(2)}`,
          price,
        });
        this.broadcast({
          type: 'alert:triggered',
          payload: { rule, notification: notif },
        });
      }
    }
  }

  public getAlerts(): AlertRule[] {
    return this.alertRules;
  }

  public createAlert(input: {
    type: AlertRule['type'];
    threshold?: number;
    timeframe?: Timeframe;
    note: string;
  }): AlertRule {
    const rule: AlertRule = {
      id: `alrt-${crypto.randomBytes(4).toString('hex')}`,
      type: input.type,
      threshold: input.threshold,
      timeframe: input.timeframe,
      note: input.note,
      active: true,
      triggeredCount: 0,
      createdAt: Date.now(),
    };
    this.alertRules.unshift(rule);
    this.persistHubState();
    this.broadcast({ type: 'alerts:sync', payload: this.alertRules });
    return rule;
  }

  public toggleAlert(id: string): AlertRule | null {
    const rule = this.alertRules.find((r) => r.id === id);
    if (!rule) return null;
    rule.active = !rule.active;
    this.persistHubState();
    this.broadcast({ type: 'alerts:sync', payload: this.alertRules });
    return rule;
  }

  public deleteAlert(id: string): boolean {
    const len = this.alertRules.length;
    this.alertRules = this.alertRules.filter((r) => r.id !== id);
    if (this.alertRules.length !== len) {
      this.persistHubState();
      this.broadcast({ type: 'alerts:sync', payload: this.alertRules });
      return true;
    }
    return false;
  }

  public getNotifications(): NotificationEvent[] {
    return this.notifications;
  }

  public getSecurityAudit(): SecurityAuditSnapshot {
    return {
      rateLimitPolicy: `${CONFIG.RATE_LIMIT.MAX_REQUESTS} req/min per IP (API) · ${CONFIG.RATE_LIMIT.MAX_SCANS} scanări/min`,
      validationEngine: 'Zod v4 Schema Strict Validation + Sanitizare HTML/XSS',
      wsOriginCheck: `WebSocket Server-Authoritative (/ws) · max ${CONFIG.WS.MAX_CLIENTS} clienți simultani`,
      payloadCap: '64 KB JSON Body Limit · Timeout extern 4.5s',
      headersEnforced: [
        'X-Content-Type-Options: nosniff',
        'Referrer-Policy: strict-origin-when-cross-origin',
        'Permissions-Policy: camera=(), microphone=(), geolocation=()',
        'X-Powered-By: eliminat',
      ],
      activeWsClients: this.clients.size,
      blockedRequestsCount: getBlockedRequestsCount(),
      lastAuditTimestamp: Date.now(),
    };
  }

  private recordNotification(
    partial: Omit<NotificationEvent, 'id' | 'timestamp'>
  ): NotificationEvent {
    const notif: NotificationEvent = {
      ...partial,
      id: `notif-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
    };
    this.notifications.unshift(notif);
    if (this.notifications.length > 80) {
      this.notifications = this.notifications.slice(0, 80);
    }
    this.persistHubState();
    return notif;
  }

  private persistHubState(): void {
    this.stateStore?.update({
      alerts: this.alertRules,
      notifications: this.notifications,
    });
  }

  private broadcast(data: unknown): void {
    const serialized = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(serialized);
      }
    }
  }

  private sendToClient(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  public dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}
