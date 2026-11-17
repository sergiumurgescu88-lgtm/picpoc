import { Timeframe } from '../config/env.js';
import {
  Candle,
  FairValueGap,
  MarketBias,
  MarketStructure,
  OrderBlock,
  StructureEvent,
} from '../types/trading.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function analyzeMarketStructure(candles: Candle[], timeframe: Timeframe): MarketStructure {
  const events: StructureEvent[] = [];
  const orderBlocks: OrderBlock[] = [];
  const fairValueGaps: FairValueGap[] = [];

  if (candles.length < 15) {
    return {
      timeframe,
      bias: 'NEUTRAL',
      events,
      orderBlocks,
      fairValueGaps,
      sessionLevels: {
        asiaHigh: candles[0]?.high ?? 0,
        asiaLow: candles[0]?.low ?? 0,
        londonHigh: candles[0]?.high ?? 0,
        londonLow: candles[0]?.low ?? 0,
        prevDayHigh: candles[0]?.high ?? 0,
        prevDayLow: candles[0]?.low ?? 0,
      },
    };
  }

  // Detect Swing Highs & Lows using 3-bar fractals
  const swingHighs: { index: number; price: number; time: number }[] = [];
  const swingLows: { index: number; price: number; time: number }[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      swingHighs.push({ index: i, price: round2(c.high), time: c.time });
    }
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      swingLows.push({ index: i, price: round2(c.low), time: c.time });
    }
  }

  const lastPrice = candles[candles.length - 1].close;
  let bullishBreaks = 0;
  let bearishBreaks = 0;

  // Detect BOS & CHoCH on recent swing points
  const recentWindow = Math.max(20, candles.length - 60);
  for (let i = recentWindow; i < candles.length; i++) {
    const c = candles[i];
    const prevHigh = [...swingHighs].reverse().find((s) => s.index < i - 1);
    const prevLow = [...swingLows].reverse().find((s) => s.index < i - 1);

    if (prevHigh && c.close > prevHigh.price && candles[i - 1].close <= prevHigh.price) {
      bullishBreaks++;
      const isChoch = bearishBreaks > bullishBreaks;
      events.push({
        id: `str-b-${c.time}`,
        type: isChoch ? 'CHoCH' : 'BOS',
        direction: 'BULLISH',
        price: prevHigh.price,
        time: c.time,
        description: isChoch
          ? `Schimbare de caracter (CHoCH) bullish peste ${prevHigh.price.toFixed(2)}`
          : `Ruptură de structură (BOS) bullish peste ${prevHigh.price.toFixed(2)}`,
      });
    }

    if (prevLow && c.close < prevLow.price && candles[i - 1].close >= prevLow.price) {
      bearishBreaks++;
      const isChoch = bullishBreaks > bearishBreaks;
      events.push({
        id: `str-s-${c.time}`,
        type: isChoch ? 'CHoCH' : 'BOS',
        direction: 'BEARISH',
        price: prevLow.price,
        time: c.time,
        description: isChoch
          ? `Schimbare de caracter (CHoCH) bearish sub ${prevLow.price.toFixed(2)}`
          : `Ruptură de structură (BOS) bearish sub ${prevLow.price.toFixed(2)}`,
      });
    }

    // Liquidity Sweep detection (wick beyond swing, close back inside)
    if (prevHigh && c.high > prevHigh.price && c.close < prevHigh.price) {
      events.push({
        id: `liq-h-${c.time}`,
        type: 'LIQUIDITY_SWEEP',
        direction: 'BEARISH',
        price: round2(c.high),
        time: c.time,
        description: `Colectare lichiditate (Buy-Side Sweep) la ${c.high.toFixed(2)}`,
      });
    }
    if (prevLow && c.low < prevLow.price && c.close > prevLow.price) {
      events.push({
        id: `liq-l-${c.time}`,
        type: 'LIQUIDITY_SWEEP',
        direction: 'BULLISH',
        price: round2(c.low),
        time: c.time,
        description: `Colectare lichiditate (Sell-Side Sweep) la ${c.low.toFixed(2)}`,
      });
    }
  }

  // Fair Value Gaps (3-candle imbalance) & Order Blocks
  const startIdx = Math.max(2, candles.length - 55);
  for (let i = startIdx; i < candles.length - 1; i++) {
    const c1 = candles[i - 1];
    const c2 = candles[i];
    const c3 = candles[i + 1];

    // Bullish FVG: c1.high < c3.low
    if (c3.low - c1.high > 0.6) {
      const filled = candles.slice(i + 2).some((later) => later.low <= c1.high);
      fairValueGaps.push({
        id: `fvg-b-${c2.time}`,
        direction: 'BULLISH',
        top: round2(c3.low),
        bottom: round2(c1.high),
        time: c2.time,
        filled,
      });
    }

    // Bearish FVG: c1.low > c3.high
    if (c1.low - c3.high > 0.6) {
      const filled = candles.slice(i + 2).some((later) => later.high >= c1.low);
      fairValueGaps.push({
        id: `fvg-s-${c2.time}`,
        direction: 'BEARISH',
        top: round2(c1.low),
        bottom: round2(c3.high),
        time: c2.time,
        filled,
      });
    }

    // Order Blocks: last opposing candle before strong displacement
    const body2 = Math.abs(c2.close - c2.open);
    const body1 = Math.abs(c1.close - c1.open);
    if (c1.close < c1.open && c2.close > c2.open && body2 > body1 * 1.6 && c2.close > c1.high) {
      const mitigated = candles.slice(i + 1).some((later) => later.low < c1.low);
      orderBlocks.push({
        id: `ob-b-${c1.time}`,
        direction: 'BULLISH',
        top: round2(c1.high),
        bottom: round2(c1.low),
        time: c1.time,
        mitigated,
      });
    } else if (c1.close > c1.open && c2.close < c2.open && body2 > body1 * 1.6 && c2.close < c1.low) {
      const mitigated = candles.slice(i + 1).some((later) => later.high > c1.high);
      orderBlocks.push({
        id: `ob-s-${c1.time}`,
        direction: 'BEARISH',
        top: round2(c1.high),
        bottom: round2(c1.low),
        time: c1.time,
        mitigated,
      });
    }
  }

  // Session Highs / Lows approximation from candle UTC hours
  const slice24 = candles.slice(-Math.min(candles.length, 48));
  const asiaCandles = slice24.filter((c) => {
    const h = new Date(c.time * 1000).getUTCHours();
    return h >= 0 && h < 7;
  });
  const londonCandles = slice24.filter((c) => {
    const h = new Date(c.time * 1000).getUTCHours();
    return h >= 7 && h < 13;
  });
  const prevDaySlice = candles.slice(-Math.min(candles.length, 96), -Math.min(candles.length, 24));
  const fallbackHigh = Math.max(...slice24.map((c) => c.high));
  const fallbackLow = Math.min(...slice24.map((c) => c.low));

  const asiaHigh = round2(asiaCandles.length ? Math.max(...asiaCandles.map((c) => c.high)) : fallbackHigh);
  const asiaLow = round2(asiaCandles.length ? Math.min(...asiaCandles.map((c) => c.low)) : fallbackLow);
  const londonHigh = round2(
    londonCandles.length ? Math.max(...londonCandles.map((c) => c.high)) : fallbackHigh
  );
  const londonLow = round2(
    londonCandles.length ? Math.min(...londonCandles.map((c) => c.low)) : fallbackLow
  );
  const prevDayHigh = round2(
    prevDaySlice.length ? Math.max(...prevDaySlice.map((c) => c.high)) : fallbackHigh
  );
  const prevDayLow = round2(
    prevDaySlice.length ? Math.min(...prevDaySlice.map((c) => c.low)) : fallbackLow
  );

  // Determine overall structure bias
  let bias: MarketBias = 'NEUTRAL';
  const latestEvent = events[events.length - 1];
  const recentHigh = swingHighs[swingHighs.length - 1]?.price ?? lastPrice;
  const recentLow = swingLows[swingLows.length - 1]?.price ?? lastPrice;

  if (latestEvent) {
    bias = latestEvent.direction;
  } else if (lastPrice > (recentHigh + recentLow) / 2) {
    bias = 'BULLISH';
  } else {
    bias = 'BEARISH';
  }

  return {
    timeframe,
    bias,
    events: events.slice(-6).reverse(),
    orderBlocks: orderBlocks.filter((ob) => !ob.mitigated).slice(-4).reverse(),
    fairValueGaps: fairValueGaps.filter((fvg) => !fvg.filled).slice(-4).reverse(),
    sessionLevels: {
      asiaHigh,
      asiaLow,
      londonHigh,
      londonLow,
      prevDayHigh,
      prevDayLow,
    },
  };
}
