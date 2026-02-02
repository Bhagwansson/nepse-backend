const DailyMarket = require("../models/DailyMarket");

// --- 1. ROBUST MATH ENGINE ---
// Safe against missing or empty data

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
  let rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const calculateEMA = (prices, period) => {
  if (!prices || prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

const calculateMACD = (prices) => {
  if (!prices || prices.length < 26)
    return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(prices.slice(-26), 12);
  const ema26 = calculateEMA(prices.slice(-26), 26);
  const macdLine = ema12 - ema26;
  return { macd: macdLine, signal: macdLine * 0.8, histogram: macdLine * 0.2 };
};

// --- 2. MAIN CONTROLLER ---

exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";
    const isPro = !!req.user;

    // 1. Fetch History (Newest First)
    // We use .lean() for performance and to get plain JS objects
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No market data found." });
    }

    // 2. Extract Data Safely (Handle Missing Volume)
    const history = [...rawHistory].reverse(); // Oldest -> Newest
    const prices = [];
    const volumes = [];

    history.forEach((day) => {
      if (!day.stocks) return;
      const s = day.stocks.find((st) => st.symbol === cleanSymbol);

      if (s && s.price) {
        prices.push(s.price);

        // 🔥 CRITICAL FIX: Handle old data where volume is undefined
        // If s.volume is missing, use 0. If it's a string "10,000", parse it.
        let vol = 0;
        if (s.volume !== undefined && s.volume !== null) {
          if (typeof s.volume === "number") vol = s.volume;
          else if (typeof s.volume === "string")
            vol = parseFloat(s.volume.replace(/,/g, "")) || 0;
        }
        volumes.push(vol);
      }
    });

    if (prices.length === 0) {
      return res
        .status(404)
        .json({ msg: "Stock found but missing price data." });
    }

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1]; // This is now safe (number 0 or real volume)

    // 3. Calculate Indicators
    const rsi = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const { macd } = calculateMACD(prices);

    // Safe Volume Average
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    // Prevent division by zero if average is 0 (all old data)
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    // 4. Generate AI Verdict
    let score = 50;
    let reasons = [];

    // RSI
    if (rsi < 30) {
      score += 20;
      reasons.push(`RSI is Oversold (${rsi.toFixed(1)}).`);
    } else if (rsi > 70) {
      score -= 20;
      reasons.push(`RSI is Overbought (${rsi.toFixed(1)}).`);
    }

    // Trend
    if (currentPrice > ema20) {
      score += 10;
      reasons.push("Price is in an Uptrend.");
    } else {
      score -= 10;
      reasons.push("Price is in a Downtrend.");
    }

    // MACD
    if (macd > 0) {
      score += 10;
      reasons.push("MACD is Bullish.");
    } else {
      score -= 10;
      reasons.push("MACD is Bearish.");
    }

    // Volume (Only if we have meaningful data)
    if (volumeRatio > 1.5 && avgVolume > 0) {
      if (currentPrice > prices[prices.length - 2]) {
        score += 15;
        reasons.push("High Volume confirms rise!");
      } else {
        score -= 15;
        reasons.push("High Volume confirms drop!");
      }
    }

    // Final Recommendation
    let recommendation = "HOLD";
    let color = "#F59E0B"; // Yellow
    if (score >= 75) {
      recommendation = "STRONG BUY";
      color = "#10B981";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
    } else if (score <= 35) {
      recommendation = "SELL";
      color = "#EF4444";
    } else if (score <= 20) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
    }

    // 5. Send Response
    res.json({
      symbol: cleanSymbol,
      price: currentPrice,
      date: new Date(),
      indicators: { rsi: rsi },
      isPro,

      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,
      signals: isPro ? reasons : ["Login to see AI verdict"],

      details: isPro
        ? {
            macd: !isNaN(macd) ? macd.toFixed(2) : "0.00",
            ema: !isNaN(ema20) ? ema20.toFixed(2) : "0.00",
            // Safe formatting
            volume: currentVolume.toLocaleString(),
            avgVolume: Math.round(avgVolume).toLocaleString(),
          }
        : null,
    });
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

exports.getTopPicks = async (req, res) => {
  res.json([]);
};
