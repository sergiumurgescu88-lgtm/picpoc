import { NextFunction, Request, Response } from 'express';
import { z, ZodSchema } from 'zod';
import { CONFIG } from '../config/env.js';

interface RateBucket {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateBucket>();
const scanBuckets = new Map<string, RateBucket>();
let blockedRequestsCount = 0;

export function getBlockedRequestsCount(): number {
  return blockedRequestsCount;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Security headers safe for embedded iframe preview environments.
 * Avoids X-Frame-Options: DENY so AI Studio preview iframe remains operational.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  bucketStore?: Map<string, RateBucket>;
}) {
  const store = options.bucketStore ?? ipBuckets;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    const existing = store.get(ip);

    if (!existing || existing.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(options.maxRequests - 1));
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      blockedRequestsCount += 1;
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Prea multe cereri. Limita de securitate a fost atinsă.',
        retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - existing.count)));
    next();
  };
}

export const apiRateLimiter = createRateLimiter({
  windowMs: CONFIG.RATE_LIMIT.WINDOW_MS,
  maxRequests: CONFIG.RATE_LIMIT.MAX_REQUESTS,
  bucketStore: ipBuckets,
});

export const scanRateLimiter = createRateLimiter({
  windowMs: CONFIG.RATE_LIMIT.SCAN_WINDOW_MS,
  maxRequests: CONFIG.RATE_LIMIT.MAX_SCANS,
  bucketStore: scanBuckets,
});

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Date de intrare invalide.',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Parametri query invalizi.',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    (req as Request & { validatedQuery: T }).validatedQuery = parsed.data;
    next();
  };
}

export function sanitizeText(input: string): string {
  return input.replace(/[<>`]/g, '').trim();
}

export const TimeframeSchema = z.enum(CONFIG.TIMEFRAMES);

export const CreateAlertSchema = z.object({
  type: z.enum(['PRICE_ABOVE', 'PRICE_BELOW', 'RSI_OVERBOUGHT', 'RSI_OVERSOLD', 'NEW_SIGNAL']),
  threshold: z.number().finite().positive().max(50_000).optional(),
  timeframe: TimeframeSchema.optional(),
  note: z.string().min(2).max(140).transform(sanitizeText),
});

export const RiskCalcSchema = z.object({
  accountBalance: z.number().finite().min(50).max(50_000_000),
  riskPercent: z.number().finite().min(0.1).max(15),
  entryPrice: z.number().finite().min(500).max(20_000),
  stopLoss: z.number().finite().min(500).max(20_000),
  tp1: z.number().finite().min(500).max(20_000).optional(),
  tp2: z.number().finite().min(500).max(20_000).optional(),
  tp3: z.number().finite().min(500).max(20_000).optional(),
});

export const ScanRequestSchema = z.object({
  timeframe: TimeframeSchema.optional(),
});

export const StrategyPolicySchema = z.object({
  policy: z.enum(['EXIT_PROFIT_ON_REVERSAL', 'LOCK_UNTIL_RESOLUTION']),
});

export const BrokerConnectSchema = z.object({
  ctidTraderAccountId: z.number().int().positive().optional(),
});

export const BrokerOrderSchema = z.object({
  tradeSide: z.enum(['BUY', 'SELL']),
  lots: z.number().finite().min(0.01).max(5.0),
  stopLossDistanceUsd: z.number().finite().min(0.5).max(250).optional(),
  takeProfitDistanceUsd: z.number().finite().min(0.5).max(500).optional(),
  comment: z.string().max(64).transform(sanitizeText).optional(),
});

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const msg = err instanceof Error ? err.message : String(err);
  // Ignore silent JSON parse errors from malformed client requests to keep logs clean
  if (msg.includes('Unexpected token') || msg.includes('Expected')) {
    res.status(400).json({ error: 'Invalid request format' });
    return;
  }
  console.error('[API Error]', msg);
  res.status(500).json({
    error: 'Eroare internă a serverului. Cererea nu a putut fi procesată în siguranță.',
  });
}

// Periodic cleanup of expired rate-limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of ipBuckets.entries()) {
    if (bucket.resetAt <= now) ipBuckets.delete(key);
  }
  for (const [key, bucket] of scanBuckets.entries()) {
    if (bucket.resetAt <= now) scanBuckets.delete(key);
  }
}, 60_000).unref();
