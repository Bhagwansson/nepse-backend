// utils/indicators.js

// 1. Simple Moving Average (SMA)
const calculateSMA = (data, period) => {
  if (data.length < period) return null;
  const slice = data.slice(data.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
};

// 2. Exponential Moving Average (EMA) - The Foundation of MACD
const calculateEMA = (data, period) => {
  if (data.length < period) return [];

  const k = 2 / (period + 1);
  let emaArray = [];

  // Start with SMA for the first EMA value
  let initialSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emaArray.push(initialSMA);

  // Calculate the rest
  for (let i = period; i < data.length; i++) {
    const newEMA = data[i] * k + emaArray[emaArray.length - 1] * (1 - k);
    emaArray.push(newEMA);
  }

  // Pad with nulls at the start so index matches date
  const padding = new Array(period - 1).fill(null);
  return [...padding, ...emaArray];
};

// 3. RSI (Wilder's Smoothing) - The Fix for your Bug
const calculateRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return [];

  let gains = [];
  let losses = [];

  // Calculate initial differences
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  // First Average (Simple)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  let rsiArray = [];
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiArray.push(100 - 100 / (1 + rs));

  // Smooth the rest
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiArray.push(100 - 100 / (1 + rs));
  }

  // Pad beginning with nulls
  const padding = new Array(period).fill(null);
  return [...padding, ...rsiArray];
};

// 4. MACD (The Pro Indicator)
const calculateMACD = (closes) => {
  // Standard periods: 12, 26, 9
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  let macdLine = [];
  let signalLine = [];
  let histogram = [];

  // MACD Line = EMA12 - EMA26
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i] - ema26[i]);
    } else {
      macdLine.push(null);
    }
  }

  // Signal Line = 9-day EMA of the MACD Line
  // We filter out nulls first to calculate EMA, then map back
  const validMacd = macdLine.filter((x) => x !== null);
  const validSignal = calculateEMA(validMacd, 9);

  // Re-align Signal Line with original array
  const offset = closes.length - validSignal.length;
  const signalPadding = new Array(offset).fill(null);
  signalLine = [...signalPadding, ...validSignal];

  // Histogram = MACD - Signal
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram.push(macdLine[i] - signalLine[i]);
    } else {
      histogram.push(null);
    }
  }

  return { macdLine, signalLine, histogram };
};

module.exports = { calculateRSI, calculateMACD, calculateEMA, calculateSMA };
