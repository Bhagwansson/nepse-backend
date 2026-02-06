const DailyMarket = require("../models/DailyMarket");

// --- 1. PROFESSIONAL MATH ENGINE (Vectorized) ---

// Helper: Calculate SMA (Simple Moving Average) for the first 'n' elements
const calculateSMA = (data, period) => {
  if (data.length < period) return 0;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  return sum / period;
};

// Helper: Calculate EMA Array (Returns an array of EMAs)
const calculateEMAArray = (prices, period) => {
  if (prices.length < period) return Array(prices.length).fill(0);

  const k = 2 / (period + 1);
  const emaArray = new Array(prices.length).fill(0);

  // Step 1: Initialize with SMA
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  sma /= period;
  emaArray[period - 1] = sma;

  // Step 2: Calculate EMA for the rest
  for (let i = period; i < prices.length; i++) {
    emaArray[i] = (prices[i] - emaArray[i - 1]) * k + emaArray[i - 1];
  }
  return emaArray;
};

// RSI (Relative Strength Index)
const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) return 50;

  let gains = 0,
    losses = 0;
  // First Average (SMA)
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smoothed Averages (Wilder's Smoothing)
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

// FULL MACD (Line, Signal, Histogram)
const calculateFullMACD = (prices) => {
  if (!prices || prices.length < 35)
    return { macd: 0, signal: 0, histogram: 0 };

  // 1. Calculate EMA-12 and EMA-26 Arrays
  const ema12Array = calculateEMAArray(prices, 12);
  const ema26Array = calculateEMAArray(prices, 26);

  // 2. Calculate MACD Line Array (EMA12 - EMA26)
  const macdLineArray = [];
  for (let i = 0; i < prices.length; i++) {
    // We can only calc MACD once we have both EMAs (index >= 25)
    if (i >= 25) {
      macdLineArray.push(ema12Array[i] - ema26Array[i]);
    } else {
      macdLineArray.push(0);
    }
  }

  // 3. Calculate Signal Line (9-day EMA of the MACD Line)
  // We need to pass the macdLineArray BUT we need to ignore the initial zeros
  // Slice off the invalid start to get a clean array for EMA calc
  const validMacdStart = 26; // approx
  const cleanMacdInput = macdLineArray.slice(validMacdStart);

  if (cleanMacdInput.length < 9) return { macd: 0, signal: 0, histogram: 0 };

  const signalLineClean = calculateEMAArray(cleanMacdInput, 9);

  // 4. Get Final Values (Latest)
  const currentMACD = macdLineArray[macdLineArray.length - 1];
  const currentSignal = signalLineClean[signalLineClean.length - 1];
  const histogram = currentMACD - currentSignal;

  return {
    macd: currentMACD,
    signal: currentSignal,
    histogram: histogram,
  };
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";

    // 🔥 DEV MODE: UNLOCKED
    const isPro = true;

    // 1. Fetch History (Increased to 400 for Accuracy)
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(400) // Need ~300+ for EMA convergence
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

    // Volume Fallback: If today is 0 (scraper error), look back 1 day
    let currentVolume = volumes[volumes.length - 1];
    if (currentVolume === 0 && volumes.length > 1) {
      currentVolume = volumes[volumes.length - 2];
    }

    // 3. Calculate Indicators
    const rsiVal = calculateRSI(prices, 14);

    // Single Scalar EMA for simple Trend Check
    const ema20 = calculateEMAArray(prices, 20).pop();

    // Full Vector MACD (This matches Charting software)
    const { macd, signal, histogram } = calculateFullMACD(prices);

    // Volume Math
    const validVolumes = volumes.slice(-20);
    const avgVolume =
      validVolumes.reduce((a, b) => a + b, 0) / (validVolumes.length || 1);
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    // 4. Generate Analysis Text
    let score = 50;
    let techText = `Trading volume is ${currentVolume.toLocaleString()}. `;

    // RSI Logic
    if (rsiVal < 30) {
      score += 20;
      techText += `RSI is Oversold (${rsiVal.toFixed(
        1
      )}), suggesting a potential bounce. `;
    } else if (rsiVal > 70) {
      score -= 20;
      techText += `RSI is Overbought (${rsiVal.toFixed(
        1
      )}), suggesting a pullback. `;
    } else {
      techText += `RSI is Neutral (${rsiVal.toFixed(
        1
      )}), showing stable momentum. `;
    }

    // EMA Logic
    if (currentPrice > ema20) {
      score += 15;
      techText += `Price is above the 20-day EMA (Rs. ${ema20.toFixed(
        0
      )}), confirming an uptrend. `;
    } else {
      score -= 15;
      techText += `Price is below the 20-day EMA (Rs. ${ema20.toFixed(
        0
      )}), indicating trend weakness. `;
    }

    // MACD Logic (Using HISTOGRAM for Momentum - This is the -2.98 you saw)
    if (histogram > 0) {
      score += 10;
      techText += `MACD Histogram is positive (${histogram.toFixed(
        2
      )}), showing bullish momentum. `;
    } else {
      score -= 10;
      techText += `MACD Histogram is negative (${histogram.toFixed(
        2
      )}), indicating bearish pressure. `;
    }

    // 5. Verdict
    let recommendation = "HOLD";
    let verdictText = "";
    let color = "#F59E0B";

    if (score >= 70) {
      recommendation = "STRONG BUY";
      color = "#10B981";
      verdictText =
        "Strong Bullish Signals. Momentum (MACD), Trend (EMA), and Volume are aligning for an upward move.";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
      verdictText =
        "Positive Outlook. The trend is healthy. Good time to accumulate on dips.";
    } else if (score <= 40) {
      recommendation = "SELL";
      color = "#EF4444";
      verdictText =
        "Bearish Warning. Momentum is fading and trend support is breaking. Consider exiting.";
    } else if (score <= 25) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
      verdictText =
        "Critical Sell Signal. Technicals indicate a strong downtrend. Protect your capital.";
    } else {
      verdictText =
        "Mixed Signals. The market is indecisive. It's safer to wait for a clearer trend confirmation.";
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
      // We show the Histogram value for "MACD" because that's the "Momentum"
      // value traders usually look at for divergence (-2.98).
      // Or you can show the MACD Line (27.98).
      // Let's show Histogram as it indicates the immediate BUY/SELL signal.
      response.indicators.macd = histogram.toFixed(2);
      response.indicators.ema = ema20.toFixed(2);
      response.indicators.volume = currentVolume.toLocaleString();
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
