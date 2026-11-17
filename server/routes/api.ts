import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { CONFIG, Timeframe } from '../config/env.js';
import {
  apiRateLimiter,
  CreateAlertSchema,
  RiskCalcSchema,
  scanRateLimiter,
  ScanRequestSchema,
  TimeframeSchema,
  validateBody,
  validateQuery,
} from '../middleware/security.js';
import { MarketFeedService } from '../services/marketFeed.js';
import { NotificationHub } from '../services/notificationHub.js';
import { SignalGeneratorEngine } from '../engine/signalGenerator.js';

const SnapshotQuerySchema = z.object({
  timeframe: TimeframeSchema.optional(),
});

export function createApiRouter(
  marketFeed: MarketFeedService,
  signalEngine: SignalGeneratorEngine,
  notificationHub: NotificationHub
): Router {
  const router = Router();
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
      notifications: notificationHub.getNotifications().slice(0, 25),
    });
  });

  router.post(
    '/signals/scan',
    scanRateLimiter,
    validateBody(ScanRequestSchema),
    (req: Request, res: Response) => {
      const body = req.body as { timeframe?: Timeframe };
      const tf: Timeframe = body.timeframe ?? 'M15';
      const generated = signalEngine.evaluateAndGenerateSignal(tf, true);

      if (!generated) {
        res.json({
          created: false,
          message: 'Există deja suficiente semnale active sau confluența este neutră.',
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

  return router;
}
