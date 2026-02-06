const DailyMarket = require("../models/DailyMarket");

// --- 1. PRECISION MATH ENGINE (TradingView Standard) ---

// Helper: Calculate SMA (Simple Moving Average)
const calculateSMA = (data) => {
  if (!data || data.length === 0) return 0;
  const sum = data.reduce((a, b) => a + b, 0);
  return sum / data.length;
};

// Helper: Calculate Standard EMA Array
// Rule: First value is SMA. Subsequent are (Price - PrevEMA) * k + PrevEMA
const calculateEMAArray = (values, period) => {
  const k = 2 / (period + 1);
  const emaArray = new Array(values.length).fill(null); // Use null for invalid periods

  // We need at least 'period' data points to start
  if (values.length < period) return emaArray;

  // 1. First valid point is SMA of first 'period' values
  // Index: period - 1
  const initialSlice = values.slice(0, period);
  const initialSMA = calculateSMA(initialSlice);
  emaArray[period - 1] = initialSMA;

  // 2. Calculate rest
  for (let i = period; i < values.length; i++) {
    // EMA = (Price * k) + (PrevEMA * (1-k))
    // or: (Price - PrevEMA) * k + PrevEMA
    emaArray[i] = (values[i] - emaArray[i - 1]) * k + emaArray[i - 1];
  }

  return emaArray;
};

// FULL MACD (12, 26, 9)
const calculateExactMACD = (prices) => {
  // Need significant history for convergence
  if (!prices || prices.length < 50)
    return { macd: 0, signal: 0, histogram: 0 };

  // 1. Calculate Fast (12) and Slow (26) EMAs
  const ema12 = calculateEMAArray(prices, 12);
  const ema26 = calculateEMAArray(prices, 26);

  // 2. Calculate MACD Line (Fast - Slow)
  // It will contain 'null' where slow EMA is not yet valid
  const macdLine = [];
  for (let i = 0; i < prices.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i] - ema26[i]);
    } else {
      macdLine.push(null);
    }
  }

  // 3. Calculate Signal Line (9 EMA of MACD Line)
  // We must pass ONLY the valid numbers to the EMA function, but keep track of indices
  // Filter out nulls to feed into EMA calculator
  const validMacdValues = macdLine.filter((val) => val !== null);

  // Calculate EMA(9) on the MACD values
  const signalLineValues = calculateEMAArray(validMacdValues, 9);

  // 4. Align the results
  // The signalLineValues array corresponds to the tail of the prices array.
  // We want the VERY LAST value.

  const currentMACD = validMacdValues[validMacdValues.length - 1];
  const currentSignal = signalLineValues[signalLineValues.length - 1];

  if (currentMACD == null || currentSignal == null) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const histogram = currentMACD - currentSignal;

  return {
    macd: currentMACD,
    signal: currentSignal,
    histogram: histogram,
  };
};

// RSI Calculation (Standard Wilder's)
const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) return 50;

  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * 13 + change) / 14;
      avgLoss = (avgLoss * 13 + 0) / 14;
    } else {
      avgGain = (avgGain * 13 + 0) / 14;
      avgLoss = (avgLoss * 13 + Math.abs(change)) / 14;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";
    const isPro = true; // 🔥 Unlocked for Dev

    // 1. Fetch History (Max 400 for precision)
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(400)
      .lean();

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No market data found." });
    }

    // 2. Extract Data (Oldest -> Newest)
    const history = [...rawHistory].reverse();
    const prices = [];
    const volumes = [];
    let lastDate = new Date();

    history.forEach((day) => {
      if (!day.stocks) return;
      const s = day.stocks.find((st) => st.symbol === cleanSymbol);
      if (s && s.price) {
        prices.push(Number(s.price));

        // Safe Volume
        let vol = 0;
        if (s.volume) {
          if (typeof s.volume === "number") vol = s.volume;
          else if (typeof s.volume === "string")
            vol = parseFloat(s.volume.replace(/,/g, "")) || 0;
        }
        volumes.push(vol);
        lastDate = day.date;
      }
    });

    if (prices.length === 0)
      return res.status(404).json({ msg: "Invalid data." });

    const currentPrice = prices[prices.length - 1];

    // Volume Fallback
    let currentVolume = volumes[volumes.length - 1];
    if (currentVolume === 0 && volumes.length > 1) {
      currentVolume = volumes[volumes.length - 2];
    }

    // 3. Calculate Indicators
    const rsiVal = calculateRSI(prices, 14);

    // EMA for Trend (20-day)
    const ema20Array = calculateEMAArray(prices, 20);
    const ema20 = ema20Array[ema20Array.length - 1] || 0;

    // 🔥 EXACT MACD CALCULATION
    const { macd, signal, histogram } = calculateExactMACD(prices);

    // Volume Stats
    const validVolumes = volumes.slice(-20);
    const avgVolume =
      validVolumes.reduce((a, b) => a + b, 0) / (validVolumes.length || 1);

    // 4. Text Generation
    let score = 50;
    let techText = `Trading volume is ${currentVolume.toLocaleString()}. `;

    // RSI Text
    if (rsiVal < 30) {
      score += 20;
      techText += `RSI is Oversold (${rsiVal.toFixed(1)}), potential bounce. `;
    } else if (rsiVal > 70) {
      score -= 20;
      techText += `RSI is Overbought (${rsiVal.toFixed(
        1
      )}), potential pullback. `;
    } else {
      techText += `RSI is Neutral (${rsiVal.toFixed(1)}). `;
    }

    // EMA Text
    if (currentPrice > ema20) {
      score += 15;
      techText += `Price is above 20-EMA (Rs. ${ema20.toFixed(
        0
      )}), confirming uptrend. `;
    } else {
      score -= 15;
      techText += `Price is below 20-EMA (Rs. ${ema20.toFixed(
        0
      )}), indicating weakness. `;
    }

    // MACD Text (Using Histogram for Momentum)
    if (histogram > 0) {
      score += 10;
      techText += `MACD Histogram is positive (${histogram.toFixed(
        2
      )}), showing Bullish momentum. `;
    } else {
      score -= 10;
      techText += `MACD Histogram is negative (${histogram.toFixed(
        2
      )}), showing Bearish momentum. `;
    }

    // 5. Verdict Logic
    let recommendation = "HOLD";
    let verdictText = "";
    let color = "#F59E0B";

    if (score >= 70) {
      recommendation = "STRONG BUY";
      color = "#10B981";
      verdictText =
        "Strong Bullish setup. Momentum and Trend are aligned upwards.";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
      verdictText = "Bullish outlook. Good opportunity to accumulate.";
    } else if (score <= 40) {
      recommendation = "SELL";
      color = "#EF4444";
      verdictText = "Bearish outlook. Trend is broken, consider exiting.";
    } else if (score <= 25) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
      verdictText = "Critical weakness. High risk of further downside.";
    } else {
      verdictText = "Market is indecisive. Wait for clearer signals.";
    }

    const response = {
      symbol: cleanSymbol,
      price: currentPrice,
      date: lastDate,
      indicators: {
        rsi: Number(rsiVal),
      },
      isPro,
      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,
      technicalSummary: isPro ? techText : "Login to view.",
      finalVerdict: isPro ? verdictText : "Login to view.",
    };

    if (isPro) {
      // ✅ We now return the MACD Line (20.74) and Histogram (-7.37)
      // Most dashboards show the Histogram for divergence, but you can choose.
      // Let's send Histogram as the main "MACD" display value since it shows +/- momentum
      response.indicators.macd = histogram.toFixed(2);

      // Or if you prefer the Line value like the user input:
      // response.indicators.macd = macd.toFixed(2);

      response.indicators.ema = ema20.toFixed(2);
      response.indicators.volume = currentVolume.toLocaleString();

      // Extra details for debugging if needed
      response.details = {
        macdLine: macd.toFixed(2),
        signalLine: signal.toFixed(2),
        histogram: histogram.toFixed(2),
      };
    } else {
      response.indicators.macd = "LOCKED";
      response.indicators.ema = "LOCKED";
      response.indicators.volume = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getTopPicks = async (req, res) => {
  res.json([]);
};
