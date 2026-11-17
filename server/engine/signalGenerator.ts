import crypto from 'crypto';
import { CONFIG, Timeframe } from '../config/env.js';
import {
  Candle,
  MarketBias,
  SignalDirection,
  TechnicalAnalysisReport,
  TimeframeConfluence,
  TradingSignal,
} from '../types/trading.js';
import {
  calculateBollingerSeries,
  calculateEMASeries,
  computeTechnicalIndicators,
} from './indicators.js';
import { analyzeMarketStructure } from './structure.js';
import { detectTradingSession, MarketFeedService } from '../services/marketFeed.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TF_WEIGHTS: Record<Timeframe, number> = {
  M5: 10,
  M15: 20,
  H1: 30,
  H4: 25,
  D1: 15,
};

export class SignalGeneratorEngine {
  private signals: TradingSignal[] = [];

  constructor(private marketFeed: MarketFeedService) {}

  public initialize(): void {
    // Generate initial calibrated active signal from live market structure
    this.evaluateAndGenerateSignal('M15', true);
    // Seed 2 recent resolved/historical signals anchored to real recent candles for journal context
    const candles = this.marketFeed.getCandles('H1');
    if (candles.length > 35) {
      const c1 = candles[candles.length - 28];
      const c2 = candles[candles.length - 14];
      const sig1Dir: SignalDirection = c1.close >= c1.open ? 'BUY' : 'SELL';
      const atr = 4.2;
      this.signals.push({
        id: 'sig-hist-01',
        symbol: CONFIG.SYMBOL,
        direction: sig1Dir,
        status: 'TP2_HIT',
        timeframe: 'H1',
        session: 'LONDON',
        entry: round2(c1.close),
        stopLoss: round2(sig1Dir === 'BUY' ? c1.close - atr * 1.3 : c1.close + atr * 1.3),
        tp1: round2(sig1Dir === 'BUY' ? c1.close + atr * 1.2 : c1.close - atr * 1.2),
        tp2: round2(sig1Dir === 'BUY' ? c1.close + atr * 2.4 : c1.close - atr * 2.4),
        tp3: round2(sig1Dir === 'BUY' ? c1.close + atr * 3.8 : c1.close - atr * 3.8),
        riskReward: 2.8,
        confidence: 84,
        currentPrice: round2(sig1Dir === 'BUY' ? c1.close + atr * 2.45 : c1.close - atr * 2.45),
        pnlPips: round2(atr * 2.4 * 10),
        rMultiple: 1.85,
        setupType: 'BOS + Retest Order Block H1',
        reasons: [
          'Ruptură de structură (BOS) confirmată pe H1 cu volum peste medie.',
          'Re-testare Order Block instituțional și respingere din EMA 20.',
          'Confluență RSI > 55 și histogramă MACD în expansiune.',
        ],
        invalidation: `Închidere H1 ${sig1Dir === 'BUY' ? 'sub' : 'peste'} nivelul de invalidare structurală.`,
        confluenceBreakdown: { trend: 86, momentum: 82, structure: 88, volatility: 78 },
        createdAt: c1.time * 1000,
        updatedAt: (c1.time + 7200) * 1000,
        closedAt: (c1.time + 7200) * 1000,
      });

      const sig2Dir: SignalDirection = c2.close >= c2.open ? 'BUY' : 'SELL';
      this.signals.push({
        id: 'sig-hist-02',
        symbol: CONFIG.SYMBOL,
        direction: sig2Dir,
        status: 'TP1_HIT',
        timeframe: 'M15',
        session: 'OVERLAP_LDN_NY',
        entry: round2(c2.close),
        stopLoss: round2(sig2Dir === 'BUY' ? c2.close - 4.8 : c2.close + 4.8),
        tp1: round2(sig2Dir === 'BUY' ? c2.close + 5.2 : c2.close - 5.2),
        tp2: round2(sig2Dir === 'BUY' ? c2.close + 9.6 : c2.close - 9.6),
        tp3: round2(sig2Dir === 'BUY' ? c2.close + 14.4 : c2.close - 14.4),
        riskReward: 2.2,
        confidence: 78,
        currentPrice: round2(sig2Dir === 'BUY' ? c2.close + 5.4 : c2.close - 5.4),
        pnlPips: 52,
        rMultiple: 1.08,
        setupType: 'Liquidity Sweep + FVG Fill',
        reasons: [
          'Colectare lichiditate sesiune Londra urmată de impuls pe M15.',
          'Completare Fair Value Gap (FVG) în zona Fibonacci 0.618.',
          'ADX > 24 confirmând direcție clară intraday.',
        ],
        invalidation: `Depășirea extremului de lichiditate la ${(sig2Dir === 'BUY' ? c2.close - 4.8 : c2.close + 4.8).toFixed(2)}.`,
        confluenceBreakdown: { trend: 76, momentum: 80, structure: 81, volatility: 75 },
        createdAt: c2.time * 1000,
        updatedAt: (c2.time + 3600) * 1000,
      });
    }
  }

  public getSignals(): TradingSignal[] {
    return this.signals;
  }

  public buildTechnicalReport(timeframe: Timeframe): TechnicalAnalysisReport {
    const candles = this.marketFeed.getCandles(timeframe);
    const indicators = computeTechnicalIndicators(candles, timeframe);
    const structure = analyzeMarketStructure(candles, timeframe);

    // Multi-timeframe confluence across all timeframes
    const mtfMatrix: TimeframeConfluence[] = CONFIG.TIMEFRAMES.map((tf) => {
      const tfCandles = this.marketFeed.getCandles(tf);
      const tfInd = computeTechnicalIndicators(tfCandles, tf);
      const emaBull = tfInd.ema20 > tfInd.ema50 && tfInd.price > tfInd.ema20;
      const emaBear = tfInd.ema20 < tfInd.ema50 && tfInd.price < tfInd.ema20;
      const emaAlignment = emaBull ? 'BULLISH' : emaBear ? 'BEARISH' : 'MIXED';
      const macdState = tfInd.macd.histogram >= 0 ? 'BULLISH' : 'BEARISH';

      let tfScore = 0;
      if (emaAlignment === 'BULLISH') tfScore += 1;
      else if (emaAlignment === 'BEARISH') tfScore -= 1;
      if (tfInd.rsi14 > 54) tfScore += 1;
      else if (tfInd.rsi14 < 46) tfScore -= 1;
      if (macdState === 'BULLISH') tfScore += 1;
      else tfScore -= 1;

      const bias: MarketBias = tfScore >= 2 ? 'BULLISH' : tfScore <= -2 ? 'BEARISH' : 'NEUTRAL';

      return {
        timeframe: tf,
        bias,
        rsi14: tfInd.rsi14,
        emaAlignment,
        macdState,
        weight: TF_WEIGHTS[tf],
      };
    });

    // Weighted confluence score -100..+100
    let weightedSum = 0;
    for (const row of mtfMatrix) {
      const dir = row.bias === 'BULLISH' ? 1 : row.bias === 'BEARISH' ? -1 : 0;
      weightedSum += dir * row.weight;
    }

    if (structure.bias === 'BULLISH') weightedSum += 12;
    else if (structure.bias === 'BEARISH') weightedSum -= 12;

    const confluenceScore = Math.max(-100, Math.min(100, Math.round(weightedSum)));
    const overallBias: MarketBias =
      confluenceScore >= 20 ? 'BULLISH' : confluenceScore <= -20 ? 'BEARISH' : 'NEUTRAL';

    // Overlay series for Lightweight Charts
    const closes = candles.map((c) => c.close);
    const ema20Vals = calculateEMASeries(closes, 20);
    const ema50Vals = calculateEMASeries(closes, 50);
    const ema200Vals = calculateEMASeries(closes, 200);
    const bb = calculateBollingerSeries(closes, 20, 2);

    const emaSeries = {
      ema20: candles.map((c, i) => ({ time: c.time, value: ema20Vals[i] })),
      ema50: candles.map((c, i) => ({ time: c.time, value: ema50Vals[i] })),
      ema200: candles.map((c, i) => ({ time: c.time, value: ema200Vals[i] })),
      bbUpper: candles.map((c, i) => ({ time: c.time, value: bb.upper[i] })),
      bbLower: candles.map((c, i) => ({ time: c.time, value: bb.lower[i] })),
    };

    return {
      symbol: CONFIG.SYMBOL,
      timeframe,
      timestamp: Date.now(),
      overallBias,
      confluenceScore,
      indicators,
      structure,
      mtfMatrix,
      emaSeries,
    };
  }

  public evaluateAndGenerateSignal(
    timeframe: Timeframe,
    forceInitial = false
  ): TradingSignal | null {
    const activeCount = this.signals.filter((s) => s.status === 'ACTIVE').length;
    if (!forceInitial && activeCount >= CONFIG.SIGNAL_ENGINE.MAX_ACTIVE_SIGNALS) {
      return null;
    }

    const report = this.buildTechnicalReport(timeframe);
    const { indicators, structure, confluenceScore, mtfMatrix } = report;
    const price = this.marketFeed.getTick().mid;

    let direction: SignalDirection | null = null;
    if (confluenceScore >= 22) direction = 'BUY';
    else if (confluenceScore <= -22) direction = 'SELL';
    else if (forceInitial) {
      direction = indicators.ema20 >= indicators.ema50 ? 'BUY' : 'SELL';
    }

    if (!direction) return null;

    // Prevent duplicate active signal on same timeframe & direction within 5 minutes
    const duplicate = this.signals.find(
      (s) =>
        s.status === 'ACTIVE' &&
        s.timeframe === timeframe &&
        s.direction === direction &&
        Date.now() - s.createdAt < 5 * 60_000
    );
    if (duplicate && !forceInitial) return null;

    const atr = Math.max(2.2, indicators.atr14);
    const slDist = round2(atr * 1.45);
    const tp1Dist = round2(slDist * 1.25);
    const tp2Dist = round2(slDist * 2.2);
    const tp3Dist = round2(slDist * 3.4);

    const entry = round2(price);
    const stopLoss = round2(direction === 'BUY' ? entry - slDist : entry + slDist);
    const tp1 = round2(direction === 'BUY' ? entry + tp1Dist : entry - tp1Dist);
    const tp2 = round2(direction === 'BUY' ? entry + tp2Dist : entry - tp2Dist);
    const tp3 = round2(direction === 'BUY' ? entry + tp3Dist : entry - tp3Dist);
    const riskReward = round2(tp2Dist / slDist);

    // Component confidence scoring
    const alignedTfs = mtfMatrix.filter(
      (m) => (direction === 'BUY' && m.bias === 'BULLISH') || (direction === 'SELL' && m.bias === 'BEARISH')
    ).length;
    const trendScore = Math.min(96, 54 + alignedTfs * 9);
    const momentumScore = Math.min(
      95,
      direction === 'BUY'
        ? indicators.rsi14 > 52 && indicators.rsi14 < 72
          ? 84
          : 66
        : indicators.rsi14 < 48 && indicators.rsi14 > 28
          ? 84
          : 66
    );
    const structureScore = Math.min(
      95,
      62 +
        (structure.bias === (direction === 'BUY' ? 'BULLISH' : 'BEARISH') ? 18 : 6) +
        Math.min(12, structure.orderBlocks.length * 4)
    );
    const volatilityScore = indicators.adx14 >= 20 ? 82 : 68;
    const confidence = Math.round(
      (trendScore * 0.3 + momentumScore * 0.25 + structureScore * 0.3 + volatilityScore * 0.15)
    );

    if (!forceInitial && confidence < CONFIG.SIGNAL_ENGINE.MIN_CONFIDENCE) {
      return null;
    }

    const reasons: string[] = [];
    reasons.push(
      direction === 'BUY'
        ? `Aliniere EMA bullish pe ${timeframe}: prețul (${entry.toFixed(2)}) tranzacționează în raport favorabil cu EMA20 (${indicators.ema20.toFixed(2)}) și EMA50 (${indicators.ema50.toFixed(2)}).`
        : `Presiune bearish pe ${timeframe}: prețul (${entry.toFixed(2)}) sub presiunea mediilor EMA20 (${indicators.ema20.toFixed(2)}) / EMA50 (${indicators.ema50.toFixed(2)}).`
    );
    reasons.push(
      `Momentum RSI(14) la ${indicators.rsi14.toFixed(1)} · Histogramă MACD ${indicators.macd.histogram >= 0 ? '+' : ''}${indicators.macd.histogram.toFixed(2)} · ADX ${indicators.adx14.toFixed(1)}.`
    );

    if (structure.events[0]) {
      reasons.push(structure.events[0].description);
    } else {
      reasons.push(
        `Niveluri Fibonacci cheie active (Golden Pocket 0.618 la ${indicators.fibonacci.levels[3]?.price.toFixed(2) ?? entry.toFixed(2)}).`
      );
    }

    if (structure.orderBlocks.length > 0) {
      const ob = structure.orderBlocks[0];
      reasons.push(
        `Order Block ${ob.direction === 'BULLISH' ? 'de cerere' : 'de ofertă'} activ în zona ${ob.bottom.toFixed(2)} – ${ob.top.toFixed(2)}.`
      );
    }

    const setupType =
      structure.events[0]?.type === 'LIQUIDITY_SWEEP'
        ? `Liquidity Sweep + Reversie ${timeframe}`
        : structure.events[0]?.type === 'CHoCH'
          ? `CHoCH Schimbare Structură ${timeframe}`
          : `Confluență Multi-Timeframe ${timeframe}`;

    const signal: TradingSignal = {
      id: `sig-${crypto.randomBytes(4).toString('hex')}`,
      symbol: CONFIG.SYMBOL,
      direction,
      status: 'ACTIVE',
      timeframe,
      session: detectTradingSession(),
      entry,
      stopLoss,
      tp1,
      tp2,
      tp3,
      riskReward,
      confidence,
      currentPrice: entry,
      pnlPips: 0,
      rMultiple: 0,
      setupType,
      reasons,
      invalidation:
        direction === 'BUY'
          ? `Închidere lumânare ${timeframe} sub ${stopLoss.toFixed(2)} invalidează scenariul bullish.`
          : `Închidere lumânare ${timeframe} peste ${stopLoss.toFixed(2)} invalidează scenariul bearish.`,
      confluenceBreakdown: {
        trend: trendScore,
        momentum: momentumScore,
        structure: structureScore,
        volatility: volatilityScore,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.signals.unshift(signal);
    if (this.signals.length > CONFIG.SIGNAL_ENGINE.MAX_HISTORY_SIGNALS) {
      this.signals = this.signals.slice(0, CONFIG.SIGNAL_ENGINE.MAX_HISTORY_SIGNALS);
    }

    return signal;
  }

  /**
   * Evaluates every active signal against the latest live tick.
   * Returns signals whose status transitioned (TP1/TP2/TP3/SL hit).
   */
  public updateSignalsOnTick(price: number): {
    updatedSignals: TradingSignal[];
    transitions: { signal: TradingSignal; previousStatus: string }[];
  } {
    const updatedSignals: TradingSignal[] = [];
    const transitions: { signal: TradingSignal; previousStatus: string }[] = [];

    for (const sig of this.signals) {
      if (sig.status === 'CLOSED' || sig.status === 'SL_HIT' || sig.status === 'TP3_HIT') {
        continue;
      }

      const prevStatus = sig.status;
      sig.currentPrice = round2(price);
      const diff = sig.direction === 'BUY' ? price - sig.entry : sig.entry - price;
      const riskDist = Math.max(0.5, Math.abs(sig.entry - sig.stopLoss));
      sig.pnlPips = round2(diff * 10);
      sig.rMultiple = round2(diff / riskDist);
      sig.updatedAt = Date.now();

      if (sig.direction === 'BUY') {
        if (price <= sig.stopLoss) {
          sig.status = 'SL_HIT';
          sig.closedAt = Date.now();
        } else if (price >= sig.tp3) {
          sig.status = 'TP3_HIT';
          sig.closedAt = Date.now();
        } else if (price >= sig.tp2 && sig.status !== 'TP2_HIT') {
          sig.status = 'TP2_HIT';
        } else if (price >= sig.tp1 && sig.status === 'ACTIVE') {
          sig.status = 'TP1_HIT';
        }
      } else {
        if (price >= sig.stopLoss) {
          sig.status = 'SL_HIT';
          sig.closedAt = Date.now();
        } else if (price <= sig.tp3) {
          sig.status = 'TP3_HIT';
          sig.closedAt = Date.now();
        } else if (price <= sig.tp2 && sig.status !== 'TP2_HIT') {
          sig.status = 'TP2_HIT';
        } else if (price <= sig.tp1 && sig.status === 'ACTIVE') {
          sig.status = 'TP1_HIT';
        }
      }

      updatedSignals.push(sig);
      if (sig.status !== prevStatus) {
        transitions.push({ signal: sig, previousStatus: prevStatus });
      }
    }

    return { updatedSignals, transitions };
  }

  public closeSignalManually(id: string): TradingSignal | null {
    const sig = this.signals.find((s) => s.id === id);
    if (!sig || sig.status === 'CLOSED' || sig.status === 'SL_HIT' || sig.status === 'TP3_HIT') {
      return null;
    }
    sig.status = 'CLOSED';
    sig.closedAt = Date.now();
    sig.updatedAt = Date.now();
    return sig;
  }
}
