import crypto from 'crypto';
import { CONFIG, Timeframe } from '../config/env.js';
import {
  Candle,
  DirectionBreakdown,
  EquityCurvePoint,
  MarketBias,
  SignalDirection,
  SignalResolutionReport,
  SignalStatus,
  TargetMilestone,
  TechnicalAnalysisReport,
  TimeframeConfluence,
  TimeframeResolutionRow,
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
    this.signals = [];
    // Seed authentic historical walk-forward evaluated signals from real candle history
    this.seedHistoricalEvaluatedSignals();
    // Generate initial calibrated live active signal from current market structure
    this.evaluateAndGenerateSignal('M15', true);
    // Keep newest signals first
    this.signals.sort((a, b) => b.createdAt - a.createdAt);
  }

  private seedHistoricalEvaluatedSignals(): void {
    const tfConfigs: { tf: Timeframe; step: number; minSlice: number }[] = [
      { tf: 'H1', step: 11, minSlice: 45 },
      { tf: 'M15', step: 16, minSlice: 50 },
    ];

    for (const { tf, step, minSlice } of tfConfigs) {
      const candles = this.marketFeed.getCandles(tf);
      if (candles.length < minSlice + 15) continue;

      let cursor = minSlice;
      while (cursor < candles.length - 8) {
        const slice = candles.slice(0, cursor + 1);
        const ind = computeTechnicalIndicators(slice, tf);
        const entryCandle = candles[cursor];

        let direction: SignalDirection | null = null;
        if (ind.ema20 > ind.ema50 && ind.rsi14 >= 51 && ind.macd.histogram >= 0) {
          direction = 'BUY';
        } else if (ind.ema20 < ind.ema50 && ind.rsi14 <= 49 && ind.macd.histogram <= 0) {
          direction = 'SELL';
        } else if (ind.rsi14 <= 34) {
          direction = 'BUY';
        } else if (ind.rsi14 >= 66) {
          direction = 'SELL';
        }

        if (!direction) {
          cursor += Math.max(4, Math.floor(step / 2));
          continue;
        }

        const atr = Math.max(2.2, ind.atr14);
        const slDist = round2(atr * 1.35);
        const tp1Dist = round2(slDist * 1.15);
        const tp2Dist = round2(slDist * 1.9);
        const tp3Dist = round2(slDist * 2.8);
        const tp4Dist = round2(slDist * 3.8);

        const entry = round2(entryCandle.close);
        const stopLoss = round2(direction === 'BUY' ? entry - slDist : entry + slDist);
        const tp1 = round2(direction === 'BUY' ? entry + tp1Dist : entry - tp1Dist);
        const tp2 = round2(direction === 'BUY' ? entry + tp2Dist : entry - tp2Dist);
        const tp3 = round2(direction === 'BUY' ? entry + tp3Dist : entry - tp3Dist);
        const tp4 = round2(direction === 'BUY' ? entry + tp4Dist : entry - tp4Dist);

        // Walk forward candle-by-candle without lookahead bias
        const reachedTargets: TargetMilestone[] = [];
        let status: SignalStatus = 'ACTIVE';
        let resolution: 'WON' | 'LOST' | 'ACTIVE' = 'ACTIVE';
        let exitPrice = entry;
        let closedAt: number | undefined;
        let lastEvalTime = entryCandle.time;
        let exitIndex = cursor;

        for (let j = cursor + 1; j < candles.length; j++) {
          const bar = candles[j];
          lastEvalTime = bar.time;
          exitIndex = j;

          if (direction === 'BUY') {
            // Conservative intra-bar check: SL checked before TP1 if TP1 not yet reached
            if (!reachedTargets.includes('TP1') && bar.low <= stopLoss) {
              reachedTargets.push('SL');
              status = 'SL_HIT';
              resolution = 'LOST';
              exitPrice = stopLoss;
              closedAt = bar.time * 1000;
              break;
            }
            if (!reachedTargets.includes('TP1') && bar.high >= tp1) {
              reachedTargets.push('TP1');
              status = 'TP1_HIT';
              resolution = 'WON';
              exitPrice = tp1;
            }
            if (!reachedTargets.includes('TP2') && bar.high >= tp2) {
              reachedTargets.push('TP2');
              status = 'TP2_HIT';
              resolution = 'WON';
              exitPrice = tp2;
            }
            if (!reachedTargets.includes('TP3') && bar.high >= tp3) {
              reachedTargets.push('TP3');
              status = 'TP3_HIT';
              resolution = 'WON';
              exitPrice = tp3;
            }
            if (!reachedTargets.includes('TP4') && bar.high >= tp4) {
              reachedTargets.push('TP4');
              status = 'TP4_HIT';
              resolution = 'WON';
              exitPrice = tp4;
              closedAt = bar.time * 1000;
              break;
            }
            // Auto-breakeven protection once TP1+ is achieved
            if (reachedTargets.includes('TP1') && bar.low <= entry) {
              closedAt = bar.time * 1000;
              break;
            }
          } else {
            if (!reachedTargets.includes('TP1') && bar.high >= stopLoss) {
              reachedTargets.push('SL');
              status = 'SL_HIT';
              resolution = 'LOST';
              exitPrice = stopLoss;
              closedAt = bar.time * 1000;
              break;
            }
            if (!reachedTargets.includes('TP1') && bar.low <= tp1) {
              reachedTargets.push('TP1');
              status = 'TP1_HIT';
              resolution = 'WON';
              exitPrice = tp1;
            }
            if (!reachedTargets.includes('TP2') && bar.low <= tp2) {
              reachedTargets.push('TP2');
              status = 'TP2_HIT';
              resolution = 'WON';
              exitPrice = tp2;
            }
            if (!reachedTargets.includes('TP3') && bar.low <= tp3) {
              reachedTargets.push('TP3');
              status = 'TP3_HIT';
              resolution = 'WON';
              exitPrice = tp3;
            }
            if (!reachedTargets.includes('TP4') && bar.low <= tp4) {
              reachedTargets.push('TP4');
              status = 'TP4_HIT';
              resolution = 'WON';
              exitPrice = tp4;
              closedAt = bar.time * 1000;
              break;
            }
            if (reachedTargets.includes('TP1') && bar.high >= entry) {
              closedAt = bar.time * 1000;
              break;
            }
          }
        }

        // Only add resolved historical setups (those that touched at least TP1 or SL)
        if (resolution !== 'ACTIVE') {
          if (!closedAt) {
            closedAt = lastEvalTime * 1000;
          }
          const diff = direction === 'BUY' ? exitPrice - entry : entry - exitPrice;
          const pnlPips = round2(diff * 10);
          const rMultiple = round2(diff / Math.max(0.5, slDist));

          const utcHour = new Date(entryCandle.time * 1000).getUTCHours();
          const session =
            utcHour >= 12 && utcHour < 16
              ? 'OVERLAP_LDN_NY'
              : utcHour >= 7 && utcHour < 12
                ? 'LONDON'
                : utcHour >= 16 && utcHour < 21
                  ? 'NEW_YORK'
                  : 'ASIA';

          const setupVariants =
            direction === 'BUY'
              ? [`BOS + Retest EMA20 ${tf}`, `Order Block Cerere ${tf}`, `Impuls Momentum RSI ${tf}`]
              : [`Breakout Structură Bearish ${tf}`, `Order Block Ofertă ${tf}`, `Respingere EMA50 ${tf}`];
          const setupType = setupVariants[cursor % setupVariants.length];

          const signalId = `sig-hist-${tf.toLowerCase()}-${entryCandle.time}`;
          this.signals.push({
            id: signalId,
            symbol: CONFIG.SYMBOL,
            direction,
            status,
            timeframe: tf,
            session,
            entry,
            stopLoss,
            tp1,
            tp2,
            tp3,
            tp4,
            riskReward: round2(tp2Dist / slDist),
            confidence: Math.min(92, Math.max(66, Math.round(70 + Math.abs(ind.rsi14 - 50) * 0.7))),
            currentPrice: round2(exitPrice),
            pnlPips,
            rMultiple,
            reachedTargets,
            resolution,
            setupType,
            reasons: [
              `Aliniere EMA20 (${ind.ema20.toFixed(2)}) / EMA50 (${ind.ema50.toFixed(2)}) pe ${tf} la momentul intrării.`,
              `Momentum RSI(14) la ${ind.rsi14.toFixed(1)} · Histogramă MACD ${ind.macd.histogram >= 0 ? '+' : ''}${ind.macd.histogram.toFixed(2)}.`,
              `Evaluare istorică walk-forward: ținte atinse [${reachedTargets.join(' → ')}].`,
            ],
            invalidation: `Închidere ${tf} ${direction === 'BUY' ? 'sub' : 'peste'} ${stopLoss.toFixed(2)}.`,
            confluenceBreakdown: {
              trend: ind.ema20 > ind.ema50 ? 82 : 74,
              momentum: Math.min(90, Math.round(64 + Math.abs(ind.rsi14 - 50))),
              structure: 79,
              volatility: ind.adx14 >= 20 ? 81 : 69,
            },
            createdAt: entryCandle.time * 1000,
            updatedAt: closedAt,
            closedAt,
          });

          cursor = Math.max(cursor + step, exitIndex + 2);
        } else {
          cursor += step;
        }
      }
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
    const activeCount = this.signals.filter((s) => !s.closedAt && s.status === 'ACTIVE').length;
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
    const tp1Dist = round2(slDist * 1.15);
    const tp2Dist = round2(slDist * 1.9);
    const tp3Dist = round2(slDist * 2.8);
    const tp4Dist = round2(slDist * 3.8);

    const entry = round2(price);
    const stopLoss = round2(direction === 'BUY' ? entry - slDist : entry + slDist);
    const tp1 = round2(direction === 'BUY' ? entry + tp1Dist : entry - tp1Dist);
    const tp2 = round2(direction === 'BUY' ? entry + tp2Dist : entry - tp2Dist);
    const tp3 = round2(direction === 'BUY' ? entry + tp3Dist : entry - tp3Dist);
    const tp4 = round2(direction === 'BUY' ? entry + tp4Dist : entry - tp4Dist);
    const riskReward = round2(tp2Dist / slDist);

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
      tp4,
      riskReward,
      confidence,
      currentPrice: entry,
      pnlPips: 0,
      rMultiple: 0,
      reachedTargets: [],
      resolution: 'ACTIVE',
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
   * Evaluates every open signal against the latest live tick.
   * Tracks progressive milestones (TP1 -> TP2 -> TP3 -> TP4) and Stop-Loss / Breakeven protection.
   */
  public updateSignalsOnTick(price: number): {
    updatedSignals: TradingSignal[];
    transitions: { signal: TradingSignal; previousStatus: string }[];
  } {
    const updatedSignals: TradingSignal[] = [];
    const transitions: { signal: TradingSignal; previousStatus: string }[] = [];

    for (const sig of this.signals) {
      if (sig.closedAt || sig.status === 'CLOSED' || sig.status === 'SL_HIT' || sig.status === 'TP4_HIT') {
        continue;
      }

      const prevStatus = sig.status;
      sig.currentPrice = round2(price);
      const diff = sig.direction === 'BUY' ? price - sig.entry : sig.entry - price;
      const riskDist = Math.max(0.5, Math.abs(sig.entry - sig.stopLoss));
      sig.pnlPips = round2(diff * 10);
      sig.rMultiple = round2(diff / riskDist);
      sig.updatedAt = Date.now();

      const hasTp1 = sig.reachedTargets.includes('TP1');

      if (sig.direction === 'BUY') {
        if (!hasTp1 && price <= sig.stopLoss) {
          sig.reachedTargets.push('SL');
          sig.status = 'SL_HIT';
          sig.resolution = 'LOST';
          sig.pnlPips = -round2(riskDist * 10);
          sig.rMultiple = -1;
          sig.closedAt = Date.now();
        } else if (hasTp1 && price <= sig.entry) {
          // Breakeven lock after TP1+
          const lockedPrice = sig.reachedTargets.includes('TP3')
            ? sig.tp3
            : sig.reachedTargets.includes('TP2')
              ? sig.tp2
              : sig.tp1;
          const lockedDiff = lockedPrice - sig.entry;
          sig.pnlPips = round2(lockedDiff * 10);
          sig.rMultiple = round2(lockedDiff / riskDist);
          sig.resolution = 'WON';
          sig.closedAt = Date.now();
        } else {
          if (!sig.reachedTargets.includes('TP1') && price >= sig.tp1) {
            sig.reachedTargets.push('TP1');
            sig.status = 'TP1_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP2') && price >= sig.tp2) {
            sig.reachedTargets.push('TP2');
            sig.status = 'TP2_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP3') && price >= sig.tp3) {
            sig.reachedTargets.push('TP3');
            sig.status = 'TP3_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP4') && price >= sig.tp4) {
            sig.reachedTargets.push('TP4');
            sig.status = 'TP4_HIT';
            sig.resolution = 'WON';
            sig.closedAt = Date.now();
          }
        }
      } else {
        if (!hasTp1 && price >= sig.stopLoss) {
          sig.reachedTargets.push('SL');
          sig.status = 'SL_HIT';
          sig.resolution = 'LOST';
          sig.pnlPips = -round2(riskDist * 10);
          sig.rMultiple = -1;
          sig.closedAt = Date.now();
        } else if (hasTp1 && price >= sig.entry) {
          const lockedPrice = sig.reachedTargets.includes('TP3')
            ? sig.tp3
            : sig.reachedTargets.includes('TP2')
              ? sig.tp2
              : sig.tp1;
          const lockedDiff = sig.entry - lockedPrice;
          sig.pnlPips = round2(lockedDiff * 10);
          sig.rMultiple = round2(lockedDiff / riskDist);
          sig.resolution = 'WON';
          sig.closedAt = Date.now();
        } else {
          if (!sig.reachedTargets.includes('TP1') && price <= sig.tp1) {
            sig.reachedTargets.push('TP1');
            sig.status = 'TP1_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP2') && price <= sig.tp2) {
            sig.reachedTargets.push('TP2');
            sig.status = 'TP2_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP3') && price <= sig.tp3) {
            sig.reachedTargets.push('TP3');
            sig.status = 'TP3_HIT';
            sig.resolution = 'WON';
          }
          if (!sig.reachedTargets.includes('TP4') && price <= sig.tp4) {
            sig.reachedTargets.push('TP4');
            sig.status = 'TP4_HIT';
            sig.resolution = 'WON';
            sig.closedAt = Date.now();
          }
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
    if (!sig || sig.closedAt || sig.status === 'CLOSED' || sig.status === 'SL_HIT' || sig.status === 'TP4_HIT') {
      return null;
    }
    sig.status = 'CLOSED';
    sig.resolution = sig.reachedTargets.includes('TP1') || sig.pnlPips > 0 ? 'WON' : 'LOST';
    sig.closedAt = Date.now();
    sig.updatedAt = Date.now();
    return sig;
  }

  public getResolutionReport(): SignalResolutionReport {
    const all = this.signals;
    const totalSignals = all.length;

    const wonSignals = all.filter((s) => s.resolution === 'WON');
    const lostSignals = all.filter((s) => s.resolution === 'LOST');
    const activePendingSignals = all.filter((s) => s.resolution === 'ACTIVE');
    const openRunningCount = all.filter(
      (s) => !s.closedAt && s.status !== 'CLOSED' && s.status !== 'SL_HIT' && s.status !== 'TP4_HIT'
    ).length;

    const wonCount = wonSignals.length;
    const lostCount = lostSignals.length;
    const activePendingCount = activePendingSignals.length;
    const resolvedCount = wonCount + lostCount;
    const winRatePct = resolvedCount > 0 ? round2((wonCount / resolvedCount) * 100) : 0;

    const resolvedList = all.filter((s) => s.resolution === 'WON' || s.resolution === 'LOST');
    const netPips = round2(resolvedList.reduce((acc, s) => acc + s.pnlPips, 0));
    const netR = round2(resolvedList.reduce((acc, s) => acc + s.rMultiple, 0));

    const grossWinR = wonSignals.reduce((acc, s) => acc + Math.max(0, s.rMultiple), 0);
    const grossLossR = Math.abs(lostSignals.reduce((acc, s) => acc + Math.min(0, s.rMultiple), 0));

    const avgWinR = wonCount > 0 ? round2(grossWinR / wonCount) : 0;
    const avgLossR = lostCount > 0 ? round2(-grossLossR / lostCount) : 0;
    const profitFactor =
      grossLossR > 0 ? round2(grossWinR / grossLossR) : grossWinR > 0 ? 99.9 : 0;
    const expectancyR = resolvedCount > 0 ? round2(netR / resolvedCount) : 0;

    const closedWithDuration = resolvedList.filter((s) => s.closedAt && s.closedAt >= s.createdAt);
    const avgDurationMinutes =
      closedWithDuration.length > 0
        ? Math.round(
            closedWithDuration.reduce(
              (acc, s) => acc + ((s.closedAt ?? s.updatedAt) - s.createdAt) / 60_000,
              0
            ) / closedWithDuration.length
          )
        : 0;

    const buildDirBreakdown = (dir: SignalDirection): DirectionBreakdown => {
      const subset = all.filter((s) => s.direction === dir);
      const won = subset.filter((s) => s.resolution === 'WON');
      const lost = subset.filter((s) => s.resolution === 'LOST');
      const active = subset.filter((s) => s.resolution === 'ACTIVE');
      const resolved = won.length + lost.length;
      const resolvedSub = subset.filter((s) => s.resolution !== 'ACTIVE');
      return {
        total: subset.length,
        won: won.length,
        lost: lost.length,
        active: active.length,
        winRatePct: resolved > 0 ? round2((won.length / resolved) * 100) : 0,
        netPips: round2(resolvedSub.reduce((acc, s) => acc + s.pnlPips, 0)),
        netR: round2(resolvedSub.reduce((acc, s) => acc + s.rMultiple, 0)),
      };
    };

    const evalBase = Math.max(1, resolvedCount);
    const tp1HitCount = all.filter((s) => s.reachedTargets.includes('TP1')).length;
    const tp2HitCount = all.filter((s) => s.reachedTargets.includes('TP2')).length;
    const tp3HitCount = all.filter((s) => s.reachedTargets.includes('TP3')).length;
    const tp4HitCount = all.filter((s) => s.reachedTargets.includes('TP4')).length;
    const slHitCount = all.filter(
      (s) => s.reachedTargets.includes('SL') || s.status === 'SL_HIT'
    ).length;
    const manualClosedCount = all.filter((s) => s.status === 'CLOSED').length;

    const byTimeframe: TimeframeResolutionRow[] = CONFIG.TIMEFRAMES.map((tf) => {
      const subset = all.filter((s) => s.timeframe === tf);
      const won = subset.filter((s) => s.resolution === 'WON').length;
      const lost = subset.filter((s) => s.resolution === 'LOST').length;
      const active = subset.filter((s) => s.resolution === 'ACTIVE').length;
      const resolved = won + lost;
      const resolvedSub = subset.filter((s) => s.resolution !== 'ACTIVE');
      return {
        timeframe: tf,
        total: subset.length,
        longCount: subset.filter((s) => s.direction === 'BUY').length,
        shortCount: subset.filter((s) => s.direction === 'SELL').length,
        won,
        lost,
        active,
        winRatePct: resolved > 0 ? round2((won / resolved) * 100) : 0,
        netPips: round2(resolvedSub.reduce((acc, s) => acc + s.pnlPips, 0)),
        netR: round2(resolvedSub.reduce((acc, s) => acc + s.rMultiple, 0)),
      };
    });

    const chronologicalResolved = [...resolvedList].sort(
      (a, b) => (a.closedAt ?? a.createdAt) - (b.closedAt ?? b.createdAt)
    );
    let cumR = 0;
    let cumPips = 0;
    let peakR = 0;
    let peakPips = 0;
    let maxDrawdownR = 0;
    let maxDrawdownPips = 0;

    const equityCurve: EquityCurvePoint[] = chronologicalResolved.map((s, idx) => {
      cumR = round2(cumR + s.rMultiple);
      cumPips = round2(cumPips + s.pnlPips);
      if (cumR > peakR) peakR = cumR;
      if (cumPips > peakPips) peakPips = cumPips;

      const drawdownR = round2(cumR - peakR);
      const drawdownPips = round2(cumPips - peakPips);
      if (drawdownR < maxDrawdownR) maxDrawdownR = drawdownR;
      if (drawdownPips < maxDrawdownPips) maxDrawdownPips = drawdownPips;

      return {
        index: idx + 1,
        signalId: s.id,
        direction: s.direction,
        timeframe: s.timeframe,
        status: s.status,
        resolution: s.resolution === 'WON' ? 'WON' : 'LOST',
        tradeR: s.rMultiple,
        tradePips: s.pnlPips,
        cumulativeR: cumR,
        cumulativePips: cumPips,
        peakR,
        drawdownR,
        peakPips,
        drawdownPips,
        timestamp: s.closedAt ?? s.updatedAt,
        setupType: s.setupType,
      };
    });

    const lastPoint = equityCurve[equityCurve.length - 1];
    const currentDrawdownR = lastPoint ? lastPoint.drawdownR : 0;
    const currentDrawdownPips = lastPoint ? lastPoint.drawdownPips : 0;

    return {
      symbol: CONFIG.SYMBOL,
      generatedAt: Date.now(),
      overview: {
        totalSignals,
        resolvedCount,
        activePendingCount,
        openRunningCount,
        wonCount,
        lostCount,
        winRatePct,
        netPips,
        netR,
        peakR,
        peakPips,
        maxDrawdownR,
        maxDrawdownPips,
        currentDrawdownR,
        currentDrawdownPips,
        avgWinR,
        avgLossR,
        profitFactor,
        expectancyR,
        avgDurationMinutes,
      },
      byDirection: {
        long: buildDirBreakdown('BUY'),
        short: buildDirBreakdown('SELL'),
      },
      milestones: {
        tp1HitCount,
        tp1HitRatePct: resolvedCount > 0 ? round2((tp1HitCount / evalBase) * 100) : 0,
        tp2HitCount,
        tp2HitRatePct: resolvedCount > 0 ? round2((tp2HitCount / evalBase) * 100) : 0,
        tp3HitCount,
        tp3HitRatePct: resolvedCount > 0 ? round2((tp3HitCount / evalBase) * 100) : 0,
        tp4HitCount,
        tp4HitRatePct: resolvedCount > 0 ? round2((tp4HitCount / evalBase) * 100) : 0,
        slHitCount,
        slHitRatePct: resolvedCount > 0 ? round2((slHitCount / evalBase) * 100) : 0,
        manualClosedCount,
        activePendingCount,
      },
      byTimeframe,
      equityCurve,
      signals: all,
    };
  }
}
