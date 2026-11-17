import { Timeframe } from '../config/env.js';

export type SignalDirection = 'BUY' | 'SELL';
export type SignalStatus =
  | 'ACTIVE'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'TP4_HIT'
  | 'SL_HIT'
  | 'CLOSED';
export type TargetMilestone = 'TP1' | 'TP2' | 'TP3' | 'TP4' | 'SL';
export type SignalResolution = 'WON' | 'LOST' | 'ACTIVE';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TradingSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP_LDN_NY';

export interface Candle {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  marketOpen: number;
  openDelta: number;
  openDeltaPct: number;
  change24h: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  session: TradingSession;
  source: 'LIVE_FEED' | 'ADAPTIVE_STREAM';
  sourceDetail: string;
  timestamp: number;
}

export interface TechnicalIndicators {
  timeframe: Timeframe;
  price: number;
  ema9: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  rsiState: 'OVERBOUGHT' | 'OVERSOLD' | 'BULLISH_ZONE' | 'BEARISH_ZONE' | 'NEUTRAL';
  macd: {
    line: number;
    signal: number;
    histogram: number;
    crossover: 'BULLISH' | 'BEARISH' | 'NONE';
  };
  stochRsi: {
    k: number;
    d: number;
  };
  adx14: number;
  atr14: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    bandwidth: number;
    squeeze: boolean;
  };
  pivots: {
    p: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  };
  fibonacci: {
    swingHigh: number;
    swingLow: number;
    direction: 'UPSWING' | 'DOWNSWING';
    levels: {
      level: string;
      price: number;
    }[];
  };
}

export interface StructureEvent {
  id: string;
  type: 'BOS' | 'CHoCH' | 'LIQUIDITY_SWEEP';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  time: number;
  description: string;
}

export interface OrderBlock {
  id: string;
  direction: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  time: number;
  mitigated: boolean;
}

export interface FairValueGap {
  id: string;
  direction: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  time: number;
  filled: boolean;
}

export interface MarketStructure {
  timeframe: Timeframe;
  bias: MarketBias;
  events: StructureEvent[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  sessionLevels: {
    asiaHigh: number;
    asiaLow: number;
    londonHigh: number;
    londonLow: number;
    prevDayHigh: number;
    prevDayLow: number;
  };
}

export interface TimeframeConfluence {
  timeframe: Timeframe;
  bias: MarketBias;
  rsi14: number;
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  macdState: 'BULLISH' | 'BEARISH';
  weight: number;
}

export interface TechnicalAnalysisReport {
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  overallBias: MarketBias;
  confluenceScore: number; // -100 to +100
  indicators: TechnicalIndicators;
  structure: MarketStructure;
  mtfMatrix: TimeframeConfluence[];
  emaSeries: {
    ema20: { time: number; value: number }[];
    ema50: { time: number; value: number }[];
    ema200: { time: number; value: number }[];
    bbUpper: { time: number; value: number }[];
    bbLower: { time: number; value: number }[];
  };
}

export interface TradingSignal {
  id: string;
  symbol: string;
  direction: SignalDirection;
  status: SignalStatus;
  timeframe: Timeframe;
  session: TradingSession;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4: number;
  riskReward: number;
  confidence: number; // 0-100
  currentPrice: number;
  pnlPips: number;
  rMultiple: number;
  reachedTargets: TargetMilestone[];
  resolution: SignalResolution;
  setupType: string;
  reasons: string[];
  invalidation: string;
  confluenceBreakdown: {
    trend: number;
    momentum: number;
    structure: number;
    volatility: number;
  };
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface DirectionBreakdown {
  total: number;
  won: number;
  lost: number;
  active: number;
  winRatePct: number;
  netPips: number;
  netR: number;
}

export interface TimeframeResolutionRow {
  timeframe: Timeframe;
  total: number;
  longCount: number;
  shortCount: number;
  won: number;
  lost: number;
  active: number;
  winRatePct: number;
  netPips: number;
  netR: number;
}

export interface EquityCurvePoint {
  index: number;
  signalId: string;
  direction: SignalDirection;
  timeframe: Timeframe;
  status: SignalStatus;
  resolution: 'WON' | 'LOST';
  tradeR: number;
  tradePips: number;
  cumulativeR: number;
  cumulativePips: number;
  peakR: number;
  drawdownR: number;
  peakPips: number;
  drawdownPips: number;
  timestamp: number;
  setupType: string;
}

export interface SignalResolutionReport {
  symbol: string;
  generatedAt: number;
  overview: {
    totalSignals: number;
    resolvedCount: number;
    activePendingCount: number;
    openRunningCount: number;
    wonCount: number;
    lostCount: number;
    winRatePct: number;
    netPips: number;
    netR: number;
    peakR: number;
    peakPips: number;
    maxDrawdownR: number;
    maxDrawdownPips: number;
    currentDrawdownR: number;
    currentDrawdownPips: number;
    avgWinR: number;
    avgLossR: number;
    profitFactor: number;
    expectancyR: number;
    avgDurationMinutes: number;
  };
  byDirection: {
    long: DirectionBreakdown;
    short: DirectionBreakdown;
  };
  milestones: {
    tp1HitCount: number;
    tp1HitRatePct: number;
    tp2HitCount: number;
    tp2HitRatePct: number;
    tp3HitCount: number;
    tp3HitRatePct: number;
    tp4HitCount: number;
    tp4HitRatePct: number;
    slHitCount: number;
    slHitRatePct: number;
    manualClosedCount: number;
    activePendingCount: number;
  };
  byTimeframe: TimeframeResolutionRow[];
  equityCurve: EquityCurvePoint[];
  signals: TradingSignal[];
}

export interface AlertRule {
  id: string;
  type: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'RSI_OVERBOUGHT' | 'RSI_OVERSOLD' | 'NEW_SIGNAL';
  threshold?: number;
  timeframe?: Timeframe;
  note: string;
  active: boolean;
  triggeredCount: number;
  lastTriggeredAt?: number;
  createdAt: number;
}

export interface NotificationEvent {
  id: string;
  category: 'SIGNAL_NEW' | 'SIGNAL_TP' | 'SIGNAL_SL' | 'ALERT_RULE' | 'SYSTEM';
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  signalId?: string;
  direction?: SignalDirection;
  price: number;
  timestamp: number;
}

export interface SecurityAuditSnapshot {
  rateLimitPolicy: string;
  validationEngine: string;
  wsOriginCheck: string;
  payloadCap: string;
  headersEnforced: string[];
  activeWsClients: number;
  blockedRequestsCount: number;
  lastAuditTimestamp: number;
}
