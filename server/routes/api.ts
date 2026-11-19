import { TerminalStateStore } from '../services/stateStore.js';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { CONFIG, Timeframe } from '../config/env.js';
import {
  apiRateLimiter,
  BrokerConnectSchema,
  BrokerOrderSchema,
  CreateAlertSchema,
  RiskCalcSchema,
  scanRateLimiter,
  ScanRequestSchema,
  StrategyPolicySchema,
  TimeframeSchema,
  validateBody,
  validateQuery,
} from '../middleware/security.js';
import { CorrelationService } from '../services/correlationService.js';
import { CTraderBrokerService } from '../services/ctraderService.js';
import { MarketFeedService } from '../services/marketFeed.js';
// import { MarketNewsService, NewsServiceError } from '../services/newsService.js';
import { NotificationHub } from '../services/notificationHub.js';
import { SignalGeneratorEngine } from '../engine/signalGenerator.js';

const SnapshotQuerySchema = z.object({
  timeframe: TimeframeSchema.optional(),
});

export function createApiRouter(
  marketFeed: MarketFeedService,
  signalEngine: SignalGeneratorEngine,
  notificationHub: NotificationHub,
  brokerService?: CTraderBrokerService,
  stateStore?: TerminalStateStore
): Router {
  const router = Router();
//   const newsService = new MarketNewsService();
  const correlationService = new CorrelationService(marketFeed);
  router.use(apiRateLimiter);

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      symbol: CONFIG.SYMBOL,
      uptimeSec: Math.round(process.uptime()),
      timestamp: Date.now(),
    });
  });

  router.get(
    '/market/snapshot',
    validateQuery(SnapshotQuerySchema),
    (req: Request, res: Response) => {
      const q = (req as Request & { validatedQuery: { timeframe?: Timeframe } }).validatedQuery;
      const tf: Timeframe = q.timeframe ?? 'M15';
      res.json({
        tick: marketFeed.getTick(),
        timeframe: tf,
        candles: marketFeed.getCandles(tf),
        analysis: signalEngine.buildTechnicalReport(tf),
      });
    }
  );

  router.get(
    '/market/sentiment',
    validateQuery(SnapshotQuerySchema),
    (req: Request, res: Response) => {
      const q = (req as Request & { validatedQuery: { timeframe?: Timeframe } }).validatedQuery;
      const tf: Timeframe = q.timeframe ?? 'M15';
      const report = signalEngine.buildTechnicalReport(tf);
      const { indicators, structure, confluenceScore, mtfMatrix } = report;

      // Trend component (EMA 20/50/200 & MTF alignment)
      let trendBullCount = 0;
      for (const m of mtfMatrix) {
        if (m.emaAlignment === 'BULLISH') trendBullCount += 1;
        else if (m.emaAlignment === 'MIXED') trendBullCount += 0.5;
      }
      const trendBullPct = Math.round((trendBullCount / Math.max(1, mtfMatrix.length)) * 100);

      // Momentum component (RSI14 + MACD histogram + StochRSI)
      const rsiNorm = Math.max(0, Math.min(100, ((indicators.rsi14 - 25) / 50) * 100));
      const macdBoost = indicators.macd.histogram >= 0 ? 15 : -15;
      const momentumBullPct = Math.round(Math.max(5, Math.min(95, rsiNorm * 0.7 + (50 + macdBoost) * 0.3)));

      // SMC Structure component
      const structureBullPct =
        structure.bias === 'BULLISH' ? 76 : structure.bias === 'BEARISH' ? 24 : 50;

      // Combined authoritative bullish sentiment (0..100)
      const rawBullish = Math.round(
        ((confluenceScore + 100) / 2) * 0.45 +
          trendBullPct * 0.25 +
          momentumBullPct * 0.2 +
          structureBullPct * 0.1
      );
      const bullishPct = Math.max(4, Math.min(96, rawBullish));
      const bearishPct = 100 - bullishPct;

      let label: 'BULLISH_PUTERNIC' | 'BULLISH' | 'NEUTRU' | 'BEARISH' | 'BEARISH_PUTERNIC' = 'NEUTRU';
      let labelText = 'Neutru · Echilibru';
      if (bullishPct >= 70) {
        label = 'BULLISH_PUTERNIC';
        labelText = 'Bullish Puternic';
      } else if (bullishPct >= 56) {
        label = 'BULLISH';
        labelText = 'Bias Bullish';
      } else if (bullishPct <= 30) {
        label = 'BEARISH_PUTERNIC';
        labelText = 'Bearish Puternic';
      } else if (bullishPct <= 44) {
        label = 'BEARISH';
        labelText = 'Bias Bearish';
      }

      res.json({
        symbol: CONFIG.SYMBOL,
        timeframe: tf,
        price: marketFeed.getTick().mid,
        bullishPct,
        bearishPct,
        label,
        labelText,
        components: {
          trendBullPct,
          momentumBullPct,
          structureBullPct,
        },
        timestamp: Date.now(),
      });
    }
  );

  router.get('/market/volatility-24h', (_req: Request, res: Response) => {
    const m15 = marketFeed.getCandles('M15');
    const last96 = m15.slice(-96);
    const baseHourBucket = last96.length > 0 ? Math.floor(last96[0].time / 3600) : 0;

    const intervals = last96.map((c, idx) => {
      const date = new Date(c.time * 1000);
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const quarterIndex = Math.floor(date.getUTCMinutes() / 15);
      const quarterLabel = `:${String(quarterIndex * 15).padStart(2, '0')}`;
      const hourIndex = Math.floor(c.time / 3600) - baseHourBucket;
      const prevClose = idx > 0 ? last96[idx - 1].close : c.open;
      const trueRange = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      );
      const rangeUsd = Math.round(trueRange * 100) / 100;
      const rangePips = Math.round(rangeUsd * 10 * 10) / 10;
      const rangePct = Math.round((rangeUsd / Math.max(1, c.open)) * 10000) / 100;
      const utcH = date.getUTCHours();
      const session =
        utcH >= 12 && utcH < 16
          ? 'Overlap LDN/NY'
          : utcH >= 7 && utcH < 12
            ? 'Londra'
            : utcH >= 16 && utcH < 21
              ? 'New York'
              : 'Asia';

      return {
        time: c.time,
        hourKey: `${hh}:00`,
        hourIndex,
        quarterLabel,
        quarterIndex,
        fullTimeLabel: `${hh}:${mm} UTC`,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        rangeUsd,
        rangePips,
        rangePct,
        session,
      };
    });

    const ranges = intervals.map((i) => i.rangeUsd);
    const avgRangeUsd =
      ranges.length > 0
        ? Math.round((ranges.reduce((a, b) => a + b, 0) / ranges.length) * 100) / 100
        : 0;
    let peak = intervals[0] ?? null;
    for (const item of intervals) {
      if (!peak || item.rangeUsd > peak.rangeUsd) peak = item;
    }

    res.json({
      symbol: CONFIG.SYMBOL,
      windowHours: 24,
      intervalMinutes: 15,
      intervals,
      summary: {
        avgRangeUsd,
        maxRangeUsd: peak?.rangeUsd ?? 0,
        peakTimeLabel: peak?.fullTimeLabel ?? '--',
        currentRangeUsd: intervals[intervals.length - 1]?.rangeUsd ?? 0,
      },
      timestamp: Date.now(),
    });
  });

  router.get("/market/news", (_req: Request, res: Response) => { res.json({ items: [], macroPulse: [], cached: true, timestamp: Date.now() }); });

  router.get('/market/correlations', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const report = await correlationService.getCorrelationMatrix(forceRefresh);
      res.json(report);
    } catch {
      res.status(502).json({
        error: 'Nu s-a putut calcula matricea de corelație macro.',
      });
    }
  });

  router.get(
    '/analysis',
    validateQuery(SnapshotQuerySchema),
    (req: Request, res: Response) => {
      const q = (req as Request & { validatedQuery: { timeframe?: Timeframe } }).validatedQuery;
      const tf: Timeframe = q.timeframe ?? 'M15';
      res.json(signalEngine.buildTechnicalReport(tf));
    }
  );

  router.get('/signals', (_req: Request, res: Response) => {
    res.json({
      signals: signalEngine.getSignals(),
      policy: signalEngine.getPolicy(),
      notifications: notificationHub.getNotifications().slice(0, 25),
    });
  });

  router.get('/signals/resolution', (_req: Request, res: Response) => {
    res.json(signalEngine.getResolutionReport());
  });

  router.get('/signals/policy', (_req: Request, res: Response) => {
    res.json({ policy: signalEngine.getPolicy() });
  });

  router.put(
    '/signals/policy',
    validateBody(StrategyPolicySchema),
    (req: Request, res: Response) => {
      const body = req.body as z.infer<typeof StrategyPolicySchema>;
      const updated = signalEngine.setPolicy(body.policy);
      const notification = notificationHub.notifyPolicyChanged(updated);
      res.json({ policy: updated, notification });
    }
  );

  router.get('/signals/audit', (_req: Request, res: Response) => {
    res.json({
      policy: signalEngine.getPolicy(),
      events: signalEngine.getLifecycleEvents(),
    });
  });

  router.post(
    '/signals/scan',
    scanRateLimiter,
    validateBody(ScanRequestSchema),
    (req: Request, res: Response) => {
      const body = req.body as { timeframe?: Timeframe };
      const tf: Timeframe = body.timeframe ?? 'M15';
      const { signal: generated, blockReason } = signalEngine.evaluateAndGenerateSignalWithReason(
        tf,
        true
      );

      if (!generated) {
        res.json({
          created: false,
          message:
            blockReason ||
            'Există deja un semnal activ sau confluența este neutră. Poziția curentă este protejată.',
          analysis: signalEngine.buildTechnicalReport(tf),
        });
        return;
      }

      const notification = notificationHub.emitNewSignal(generated);
      res.status(201).json({
        created: true,
        signal: generated,
        notification,
      });
    }
  );

  router.post('/signals/:id/close', (req: Request, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!id) {
      res.status(400).json({ error: 'ID semnal invalid.' });
      return;
    }
    const closed = signalEngine.closeSignalManually(id);
    if (!closed) {
      res.status(404).json({ error: 'Semnalul nu a fost găsit sau este deja închis.' });
      return;
    }
    notificationHub.notifySignalClosed(closed);
    res.json({ signal: closed });
  });

  router.get('/alerts', (_req: Request, res: Response) => {
    res.json({ alerts: notificationHub.getAlerts() });
  });

  router.post('/alerts', validateBody(CreateAlertSchema), (req: Request, res: Response) => {
    const rule = notificationHub.createAlert(req.body);
    res.status(201).json({ alert: rule });
  });

  router.patch('/alerts/:id/toggle', (req: Request, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9-_]/g, '');
    const updated = notificationHub.toggleAlert(id);
    if (!updated) {
      res.status(404).json({ error: 'Alerta nu a fost găsită.' });
      return;
    }
    res.json({ alert: updated });
  });

  router.delete('/alerts/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9-_]/g, '');
    const removed = notificationHub.deleteAlert(id);
    if (!removed) {
      res.status(404).json({ error: 'Alerta nu a fost găsită.' });
      return;
    }
    res.json({ deleted: true });
  });

  router.post('/risk/calculate', validateBody(RiskCalcSchema), (req: Request, res: Response) => {
    const { accountBalance, riskPercent, entryPrice, stopLoss, tp1, tp2, tp3 } = req.body as z.infer<
      typeof RiskCalcSchema
    >;

    const slDistanceUsd = Math.abs(entryPrice - stopLoss);
    if (slDistanceUsd < 0.2) {
      res.status(400).json({ error: 'Distanța Stop Loss trebuie să fie minim $0.20.' });
      return;
    }

    // Standard XAU/USD contract: 1.00 lot = 100 oz -> $1 move = $100 per lot ($10 per pip of $0.10)
    const riskAmountUsd = Math.round(accountBalance * (riskPercent / 100) * 100) / 100;
    const rawLots = riskAmountUsd / (slDistanceUsd * 100);
    const recommendedLots = Math.max(0.01, Math.floor(rawLots * 100) / 100);
    const slPips = Math.round(slDistanceUsd * 10 * 10) / 10;

    const calcProfit = (tp?: number) => {
      if (!tp) return null;
      const dist = Math.abs(tp - entryPrice);
      const rewardUsd = Math.round(dist * recommendedLots * 100 * 100) / 100;
      const rr = Math.round((dist / slDistanceUsd) * 100) / 100;
      return { price: tp, rewardUsd, rr };
    };

    res.json({
      riskAmountUsd,
      recommendedLots,
      slDistanceUsd: Math.round(slDistanceUsd * 100) / 100,
      slPips,
      pipValuePerLot: 10,
      projectedTp1: calcProfit(tp1),
      projectedTp2: calcProfit(tp2),
      projectedTp3: calcProfit(tp3),
    });
  });

  router.get('/security/audit', (_req: Request, res: Response) => {
    res.json(notificationHub.getSecurityAudit());
  });

  // Server-side cTrader / Pepperstone Demo Broker Proxy Routes (never exposes tokens/secrets)
  router.get('/broker/status', (_req: Request, res: Response) => {
    if (!brokerService) {
      res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
      return;
    }
    res.json(brokerService.getPublicStatus());
  });

  router.post(
    '/broker/connect',
    validateBody(BrokerConnectSchema),
    async (req: Request, res: Response) => {
      if (!brokerService) {
        res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
        return;
      }
      try {
        const body = req.body as { ctidTraderAccountId?: number };
        const status = await brokerService.connectAndAuthenticate(body.ctidTraderAccountId);
        res.json(status);
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Conectarea cTrader Demo a eșuat.',
          status: brokerService.getPublicStatus(),
        });
      }
    }
  );

  router.post('/broker/sync', async (_req: Request, res: Response) => {
    if (!brokerService) {
      res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
      return;
    }
    try {
      const status = await brokerService.syncAccountState();
      res.json(status);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Sincronizarea contului a eșuat.',
      });
    }
  });

  router.post('/broker/refresh-token', async (_req: Request, res: Response) => {
    if (!brokerService) {
      res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
      return;
    }
    try {
      const refreshed = await brokerService.refreshAccessToken();
      const status = await brokerService.connectAndAuthenticate();
      res.json({ refreshed, status });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Reînnoirea tokenului OAuth a eșuat.',
      });
    }
  });

  router.post(
    '/broker/order',
    validateBody(BrokerOrderSchema),
    async (req: Request, res: Response) => {
      if (!brokerService) {
        res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
        return;
      }
      try {
        const body = req.body as z.infer<typeof BrokerOrderSchema>;
        const execution = await brokerService.placeDemoOrder(body);
        res.status(201).json({ execution, status: brokerService.getPublicStatus() });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Ordinul demo nu a putut fi executat.',
        });
      }
    }
  );

  router.post('/broker/positions/:positionId/close', async (req: Request, res: Response) => {
    if (!brokerService) {
      res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
      return;
    }
    const positionId = Number(req.params.positionId);
    if (!Number.isInteger(positionId) || positionId <= 0) {
      res.status(400).json({ error: 'ID poziție invalid.' });
      return;
    }
    try {
      const execution = await brokerService.closeDemoPosition(positionId);
      res.json({ execution, status: brokerService.getPublicStatus() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Poziția nu a putut fi închisă.',
      });
    }
  });

  router.post('/broker/positions/:positionId/breakeven', async (req: Request, res: Response) => {
    if (!brokerService) {
      res.status(503).json({ error: 'Serviciul broker nu este inițializat.' });
      return;
    }
    const positionId = Number(req.params.positionId);
    if (!Number.isInteger(positionId) || positionId <= 0) {
      res.status(400).json({ error: 'ID poziție invalid.' });
      return;
    }
    try {
      const execution = await brokerService.movePositionToBreakeven(positionId);
      res.json({ execution, status: brokerService.getPublicStatus() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'SL nu a putut fi mutat la Breakeven.',
      });
    }
  });

  
  router.get('/terminal-state', (_req: Request, res: Response) => {
    try {
      const state = stateStore?.load() || { signals: [], lifecycleEvents: [], policy: 'EXIT_PROFIT_ON_REVERSAL' };
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load terminal state' });
    }
  });

  return router;
}

