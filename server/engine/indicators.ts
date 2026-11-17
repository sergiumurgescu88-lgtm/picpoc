import { Timeframe } from '../config/env.js';
import { Candle, TechnicalIndicators } from '../types/trading.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateEMASeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];

  // Seed with SMA of first available elements up to period
  const seedLen = Math.min(period, values.length);
  let sum = 0;
  for (let i = 0; i < seedLen; i++) {
    sum += values[i];
  }
  let ema = sum / seedLen;

  for (let i = 0; i < values.length; i++) {
    if (i < seedLen - 1) {
      const partial = values.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
      result.push(round2(partial));
    } else if (i === seedLen - 1) {
      result.push(round2(ema));
    } else {
      ema = values[i] * k + ema * (1 - k);
      result.push(round2(ema));
    }
  }
  return result;
}

export function calculateRSISeries(closes: number[], period = 14): number[] {
  if (closes.length < 2) return closes.map(() => 50);
  const rsi: number[] = new Array(closes.length).fill(50);

  let gainSum = 0;
  let lossSum = 0;
  const initLen = Math.min(period, closes.length - 1);

  for (let i = 1; i <= initLen; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / initLen;
  let avgLoss = lossSum / initLen;

  for (let i = initLen; i < closes.length; i++) {
    if (i > initLen) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      rsi[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = round2(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 4.5;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trueRanges.push(tr);
  }

  const slice = trueRanges.slice(-period);
  const avg = slice.reduce((acc, v) => acc + v, 0) / Math.max(1, slice.length);
  return round2(Math.max(0.5, avg));
}

export function calculateADX(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 22;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trList.push(
      Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close))
    );
  }

  const recentTR = trList.slice(-period).reduce((a, b) => a + b, 0);
  const recentPlus = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const recentMinus = minusDM.slice(-period).reduce((a, b) => a + b, 0);

  if (recentTR === 0) return 20;
  const plusDI = (recentPlus / recentTR) * 100;
  const minusDI = (recentMinus / recentTR) * 100;
  const denom = plusDI + minusDI;
  if (denom === 0) return 20;

  return round2(Math.min(85, Math.max(10, (Math.abs(plusDI - minusDI) / denom) * 100)));
}

export function calculateBollingerSeries(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const window = closes.slice(start, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);

    middle.push(round2(mean));
    upper.push(round2(mean + mult * std));
    lower.push(round2(mean - mult * std));
  }

  return { upper, middle, lower };
}

export function computeTechnicalIndicators(
  candles: Candle[],
  timeframe: Timeframe
): TechnicalIndicators {
  const closes = candles.map((c) => c.close);
  const lastCandle = candles[candles.length - 1];
  const price = round2(lastCandle.close);

  const ema9Arr = calculateEMASeries(closes, 9);
  const ema20Arr = calculateEMASeries(closes, 20);
  const ema50Arr = calculateEMASeries(closes, 50);
  const ema200Arr = calculateEMASeries(closes, 200);

  const ema9 = ema9Arr[ema9Arr.length - 1];
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const ema200 = ema200Arr[ema200Arr.length - 1];

  const rsiArr = calculateRSISeries(closes, 14);
  const rsi14 = rsiArr[rsiArr.length - 1];
  let rsiState: TechnicalIndicators['rsiState'] = 'NEUTRAL';
  if (rsi14 >= 70) rsiState = 'OVERBOUGHT';
  else if (rsi14 <= 30) rsiState = 'OVERSOLD';
  else if (rsi14 >= 55) rsiState = 'BULLISH_ZONE';
  else if (rsi14 <= 45) rsiState = 'BEARISH_ZONE';

  // MACD (12, 26, 9)
  const ema12Arr = calculateEMASeries(closes, 12);
  const ema26Arr = calculateEMASeries(closes, 26);
  const macdLineArr = ema12Arr.map((v, idx) => round2(v - ema26Arr[idx]));
  const macdSignalArr = calculateEMASeries(macdLineArr, 9);

  const macdLine = macdLineArr[macdLineArr.length - 1];
  const macdSignal = macdSignalArr[macdSignalArr.length - 1];
  const macdHist = round2(macdLine - macdSignal);
  const prevHist =
    macdLineArr.length > 1
      ? macdLineArr[macdLineArr.length - 2] - macdSignalArr[macdSignalArr.length - 2]
      : macdHist;

  let crossover: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  if (prevHist <= 0 && macdHist > 0) crossover = 'BULLISH';
  else if (prevHist >= 0 && macdHist < 0) crossover = 'BEARISH';

  // Stochastic RSI
  const recentRsi = rsiArr.slice(-14);
  const minRsi = Math.min(...recentRsi);
  const maxRsi = Math.max(...recentRsi);
  const stochK = maxRsi === minRsi ? 50 : round2(((rsi14 - minRsi) / (maxRsi - minRsi)) * 100);
  const stochD = round2(
    recentRsi
      .slice(-3)
      .map((r) => (maxRsi === minRsi ? 50 : ((r - minRsi) / (maxRsi - minRsi)) * 100))
      .reduce((a, b) => a + b, 0) / Math.min(3, recentRsi.length)
  );

  const atr14 = calculateATR(candles, 14);
  const adx14 = calculateADX(candles, 14);

  const bb = calculateBollingerSeries(closes, 20, 2);
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbMiddle = bb.middle[bb.middle.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const bandRange = Math.max(0.01, bbUpper - bbLower);
  const percentB = round2(((price - bbLower) / bandRange) * 100);
  const bandwidth = round2((bandRange / Math.max(1, bbMiddle)) * 100);
  const squeeze = bandwidth < 0.85;

  // Classic Pivot Points using prior 24-bar high/low/close composite
  const pivotWindow = candles.slice(-25, -1);
  const pHigh = Math.max(...pivotWindow.map((c) => c.high));
  const pLow = Math.min(...pivotWindow.map((c) => c.low));
  const pClose = pivotWindow[pivotWindow.length - 1]?.close ?? price;
  const p = round2((pHigh + pLow + pClose) / 3);
  const r1 = round2(2 * p - pLow);
  const s1 = round2(2 * p - pHigh);
  const r2 = round2(p + (pHigh - pLow));
  const s2 = round2(p - (pHigh - pLow));
  const r3 = round2(pHigh + 2 * (p - pLow));
  const s3 = round2(pLow - 2 * (pHigh - p));

  // Fibonacci Retracement from recent 50-bar swing
  const fibWindow = candles.slice(-50);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let highIdx = 0;
  let lowIdx = 0;
  fibWindow.forEach((c, idx) => {
    if (c.high > swingHigh) {
      swingHigh = c.high;
      highIdx = idx;
    }
    if (c.low < swingLow) {
      swingLow = c.low;
      lowIdx = idx;
    }
  });
  swingHigh = round2(swingHigh);
  swingLow = round2(swingLow);
  const direction = highIdx > lowIdx ? 'UPSWING' : 'DOWNSWING';
  const diff = swingHigh - swingLow;
  const ratios = [
    { label: '0.236', r: 0.236 },
    { label: '0.382', r: 0.382 },
    { label: '0.500', r: 0.5 },
    { label: '0.618 (Golden)', r: 0.618 },
    { label: '0.786', r: 0.786 },
  ];

  const fibLevels = ratios.map(({ label, r }) => ({
    level: label,
    price: direction === 'UPSWING' ? round2(swingHigh - diff * r) : round2(swingLow + diff * r),
  }));

  return {
    timeframe,
    price,
    ema9,
    ema20,
    ema50,
    ema200,
    rsi14,
    rsiState,
    macd: {
      line: macdLine,
      signal: macdSignal,
      histogram: macdHist,
      crossover,
    },
    stochRsi: {
      k: stochK,
      d: stochD,
    },
    adx14,
    atr14,
    bollinger: {
      upper: bbUpper,
      middle: bbMiddle,
      lower: bbLower,
      percentB,
      bandwidth,
      squeeze,
    },
    pivots: { p, r1, r2, r3, s1, s2, s3 },
    fibonacci: {
      swingHigh,
      swingLow,
      direction,
      levels: fibLevels,
    },
  };
}
