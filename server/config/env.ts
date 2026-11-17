export const CONFIG = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SYMBOL: 'XAU/USD',
  TIMEFRAMES: ['M5', 'M15', 'H1', 'H4', 'D1'] as const,
  RATE_LIMIT: {
    WINDOW_MS: 60_000,
    MAX_REQUESTS: 120,
    SCAN_WINDOW_MS: 60_000,
    MAX_SCANS: 15,
  },
  WS: {
    HEARTBEAT_INTERVAL_MS: 25_000,
    MAX_CLIENTS: 200,
    TICK_BROADCAST_MS: 1_500,
    CANDLE_POLL_MS: 45_000,
  },
  SIGNAL_ENGINE: {
    MIN_CONFIDENCE: 62,
    MAX_ACTIVE_SIGNALS: 4,
    MAX_HISTORY_SIGNALS: 120,
  },
} as const;

export type Timeframe = (typeof CONFIG.TIMEFRAMES)[number];
