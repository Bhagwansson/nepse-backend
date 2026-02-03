const DailyMarket = require("../models/DailyMarket");

// --- 1. MATH ENGINE (Returns Safe Numbers) ---
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
  const res = 100 - 100 / (1 + rs);
  return isNaN(res) ? 50 : res;
};

const calculateEMA = (prices, period) => {
  if (!prices || prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return isNaN(ema) ? prices[prices.length - 1] : ema;
};

const calculateMACD = (prices) => {
  if (!prices || prices.length < 26)
    return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(prices.slice(-26), 12);
  const ema26 = calculateEMA(prices.slice(-26), 26);
  const macdLine = ema12 - ema26;
  return { macd: isNaN(macdLine) ? 0 : macdLine, signal: 0, histogram: 0 };
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";
    const isPro = !!req.user;

    // 1. Fetch History
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No market data found." });
    }

    // 2. Extract Data
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
        lastDate = day.date; // Use the actual date from DB
      }
    });

    if (prices.length === 0)
      return res.status(404).json({ msg: "Invalid data." });

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // 3. Calculate Indicators
    const rsiVal = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const { macd } = calculateMACD(prices);

    // 4. Generate AI Verdict Strings
    let score = 50;
    let reasons = [];

    if (rsiVal < 30) {
      score += 20;
      reasons.push(`RSI is Oversold (${rsiVal.toFixed(1)})`);
    } else if (rsiVal > 70) {
      score -= 20;
      reasons.push(`RSI is Overbought (${rsiVal.toFixed(1)})`);
    } else {
      reasons.push(`RSI is Neutral (${rsiVal.toFixed(1)})`);
    }

    if (currentPrice > ema20) {
      score += 15;
      reasons.push("Uptrend: Price > 20 EMA");
    } else {
      score -= 15;
      reasons.push("Downtrend: Price < 20 EMA");
    }

    if (macd > 0) {
      score += 10;
      reasons.push("Bullish Momentum (MACD +)");
    } else {
      score -= 10;
      reasons.push("Bearish Momentum (MACD -)");
    }

    // 5. Final Verdict
    let recommendation = "HOLD";
    let color = "#F59E0B";
    if (score >= 70) {
      recommendation = "STRONG BUY";
      color = "#10B981";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
    } else if (score <= 40) {
      recommendation = "SELL";
      color = "#EF4444";
    } else if (score <= 25) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
    }

    // 6. Response
    const response = {
      symbol: cleanSymbol,
      price: currentPrice,
      date: lastDate, // Fixes the Date issue
      indicators: {
        rsi: rsiVal, // Send NUMBER (e.g. 52.88)
      },
      isPro,

      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,
      signals: isPro ? reasons : ["Login to see AI verdict"],

      // Populate details just in case frontend needs it
      details: isPro
        ? {
            macd: macd.toFixed(2),
            ema: ema20.toFixed(2),
          }
        : null,
    };

    if (isPro) {
      // ✅ FIX: Send NUMBERS, not strings.
      // Frontend .toFixed(2) works on numbers, fails on strings.
      response.indicators.macd = macd;
      response.indicators.ema = ema20;
      response.indicators.volume = currentVolume;
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
