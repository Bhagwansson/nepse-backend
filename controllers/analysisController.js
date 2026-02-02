const DailyMarket = require("../models/DailyMarket");

// --- 1. MATH ENGINE ---
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
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
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
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No market data found." });
    }

    // 2. Extract Data
    const history = [...rawHistory].reverse(); // Oldest -> Newest
    const prices = [];
    const volumes = [];
    let lastTradedDate = new Date(); // Default to now, will update below

    history.forEach((day) => {
      if (!day.stocks) return;
      const s = day.stocks.find((st) => st.symbol === cleanSymbol);
      if (s && s.price) {
        prices.push(s.price);
        // Safe volume extraction
        let vol = 0;
        if (s.volume !== undefined && s.volume !== null) {
          if (typeof s.volume === "number") vol = s.volume;
          else if (typeof s.volume === "string")
            vol = parseFloat(s.volume.replace(/,/g, "")) || 0;
        }
        volumes.push(vol);
        // Capture the date of this record
        lastTradedDate = day.date;
      }
    });

    if (prices.length === 0)
      return res.status(404).json({ msg: "Invalid price data." });

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // 3. Calculate Indicators
    const rsi = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const { macd } = calculateMACD(prices);

    // Volume Average
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // 4. Generate AI Verdict (Force reasons to prevent empty bullets)
    let score = 50;
    let reasons = [];

    // RSI Logic
    if (rsi < 30) {
      score += 20;
      reasons.push(`RSI is Oversold (${rsi.toFixed(1)}).`);
    } else if (rsi > 70) {
      score -= 20;
      reasons.push(`RSI is Overbought (${rsi.toFixed(1)}).`);
    } else {
      reasons.push(`RSI is Neutral (${rsi.toFixed(1)}).`);
    } // Add reason even if neutral

    // Trend Logic
    if (currentPrice > ema20) {
      score += 15;
      reasons.push("Uptrend: Price is above 20-day EMA.");
    } else {
      score -= 15;
      reasons.push("Downtrend: Price is below 20-day EMA.");
    }

    // MACD Logic
    if (macd > 0) {
      score += 10;
      reasons.push("Bullish Momentum (MACD +).");
    } else {
      score -= 10;
      reasons.push("Bearish Momentum (MACD -).");
    }

    // Volume Logic
    if (volumeRatio > 1.5 && avgVolume > 0) {
      reasons.push("High Volume detected (Strong Conviction).");
      if (currentPrice > prices[prices.length - 2]) score += 15;
      else score -= 15;
    }

    // Final Verdict
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

    // 5. Send Response
    // ✅ Fix: Map detailed indicators to the correct structure for your UI
    let response = {
      symbol: cleanSymbol,
      price: currentPrice,
      date: lastTradedDate, // ✅ Fix: Sends the ACTUAL date from DB
      indicators: {
        rsi: rsi, // Free for everyone
      },
      isPro,

      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,
      signals: isPro ? reasons : ["Login to see AI verdict"],
    };

    if (isPro) {
      // ✅ Fix: Put MACD/EMA here so the bottom UI bar finds them
      response.indicators.macd = !isNaN(macd) ? macd.toFixed(2) : "0.00";
      response.indicators.ema = !isNaN(ema20) ? ema20.toFixed(2) : "0.00";
      response.indicators.volume = !isNaN(currentVolume)
        ? currentVolume.toLocaleString()
        : "N/A";

      // Optional: Keep details if your Detailed View uses it
      response.details = {
        avgVolume: Math.round(avgVolume).toLocaleString(),
      };
    } else {
      response.indicators.macd = "LOCKED";
      response.indicators.ema = "LOCKED";
      response.indicators.volume = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getTopPicks = async (req, res) => {
  res.json([]);
};
