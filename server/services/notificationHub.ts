import crypto from 'crypto';
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG, Timeframe } from '../config/env.js';
import { getBlockedRequestsCount } from '../middleware/security.js';
import {
  AlertRule,
  NotificationEvent,
  SecurityAuditSnapshot,
  TradingSignal,
} from '../types/trading.js';
import { MarketFeedService } from './marketFeed.js';
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

  constructor(
    private wss: WebSocketServer,
    private marketFeed: MarketFeedService,
    private signalEngine: SignalGeneratorEngine
  ) {}

  public initialize(): void {
    const tick = this.marketFeed.getTick();
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

    // Periodic external live feed synchronization
    this.syncInterval = setInterval(() => {
      void this.marketFeed.syncExternalMarketData();
    }, CONFIG.WS.CANDLE_POLL_MS);
  }

  private processMarketStep(): void {
    const { tick, updatedCandles } = this.marketFeed.stepRealTimeTick();

    // Update active signals & check TP/SL transitions
    const { updatedSignals, transitions } = this.signalEngine.updateSignalsOnTick(tick.mid);

    for (const { signal } of transitions) {
      const isSl = signal.status === 'SL_HIT';
      const notif = this.recordNotification({
        category: isSl ? 'SIGNAL_SL' : 'SIGNAL_TP',
        severity: isSl ? 'CRITICAL' : 'SUCCESS',
        title: isSl
          ? `Stop Loss Atins (${signal.direction} ${signal.timeframe})`
          : `${signal.status.replace('_', ' ')} Atins (${signal.direction} ${signal.timeframe})`,
        message: `${signal.symbol} @ ${tick.mid.toFixed(2)} · Rezultat: ${signal.pnlPips >= 0 ? '+' : ''}${signal.pnlPips.toFixed(1)} pips (${signal.rMultiple >= 0 ? '+' : ''}${signal.rMultiple.toFixed(2)}R)`,
        signalId: signal.id,
        direction: signal.direction,
        price: tick.mid,
      });

      this.broadcast({
        type: 'signal:updated',
        payload: { signal, notification: notif },
      });
    }

    // Evaluate custom user alert rules
    this.evaluateAlertRules(tick.mid);

    // Periodic autonomous multi-timeframe signal scan every ~18 ticks (~27s)
    this.scanCounter += 1;
    if (this.scanCounter >= 18) {
      this.scanCounter = 0;
      const candidateTf: Timeframe = Math.random() > 0.45 ? 'M15' : 'H1';
      const newSignal = this.signalEngine.evaluateAndGenerateSignal(candidateTf, false);
      if (newSignal) {
        this.emitNewSignal(newSignal);
      }
    }

    // Broadcast tick & incremental candle + active signal P&L updates
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
            currentPrice: s.currentPrice,
            pnlPips: s.pnlPips,
            rMultiple: s.rMultiple,
            status: s.status,
            reachedTargets: s.reachedTargets,
            resolution: s.resolution,
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
    this.broadcast({ type: 'alerts:sync', payload: this.alertRules });
    return rule;
  }

  public toggleAlert(id: string): AlertRule | null {
    const rule = this.alertRules.find((r) => r.id === id);
    if (!rule) return null;
    rule.active = !rule.active;
    this.broadcast({ type: 'alerts:sync', payload: this.alertRules });
    return rule;
  }

  public deleteAlert(id: string): boolean {
    const len = this.alertRules.length;
    this.alertRules = this.alertRules.filter((r) => r.id !== id);
    if (this.alertRules.length !== len) {
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
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50);
    }
    return notif;
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
