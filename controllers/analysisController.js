const DailyMarket = require("../models/DailyMarket");

// --- 1. MATH ENGINE ---
const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
};

const calculateEMA = (prices, period) => {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const isPro = !!req.user;

    // 🟢 STEP 1: FETCH LATEST DATA CORRECTLY
    // Sort by date: -1 (Newest first) so we get 2026 data, not 2021 data
    const rawHistory = await DailyMarket.find({
      "stocks.symbol": symbol.toUpperCase(),
    })
      .sort({ date: -1 })
      .limit(50); // Get last 50 days

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No data found" });
    }

    // 🟢 STEP 2: REVERSE TO CHRONOLOGICAL ORDER
    // We need Oldest -> Newest for indicator math (RSI/EMA)
    const history = rawHistory.reverse();

    // Extract just the prices for this symbol
    const prices = history
      .map((day) => {
        const s = day.stocks.find((st) => st.symbol === symbol.toUpperCase());
        return s ? s.price : null;
      })
      .filter((p) => p !== null);

    // Fail-safe if symbol missing in some records
    if (prices.length < 5) {
      return res
        .status(404)
        .json({ msg: "Insufficient data for calculations" });
    }

    // 🟢 STEP 3: PERFORM CALCULATIONS
    const currentPrice = prices[prices.length - 1]; // Now this is TODAY'S price
    const rsi = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);

    // AI Logic
    let score = 50;
    let signals = [];
    if (rsi < 30) {
      score += 20;
      signals.push("RSI is Oversold (Bullish)");
    } else if (rsi > 70) {
      score -= 20;
      signals.push("RSI is Overbought (Bearish)");
    } else {
      signals.push("RSI is Neutral");
    }

    if (currentPrice > ema20) {
      score += 15;
      signals.push("Price above 20-EMA (Uptrend)");
    } else {
      score -= 15;
      signals.push("Price below 20-EMA (Downtrend)");
    }

    const recommendation = score >= 65 ? "BUY" : score <= 35 ? "SELL" : "HOLD";

    // 🟢 STEP 4: SEND RESPONSE
    let response = {
      symbol: symbol.toUpperCase(),
      price: currentPrice,
      date: new Date(),
      indicators: { rsi: rsi },
      isPro: isPro,
    };

    if (isPro) {
      response.score = score;
      response.recommendation = recommendation;
      response.signals = signals;
      response.indicators.ema = ema20;
      response.indicators.macd = "Calculated Live";
      response.indicators.volume = "Live";
    } else {
      response.score = "LOCKED";
      response.recommendation = "LOGIN_TO_VIEW";
      response.signals = ["Login to see signals"];
      response.indicators.ema = "LOCKED";
      response.indicators.macd = "LOCKED";
      response.indicators.volume = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// Top Picks (Optional - leave as is or update similarly)
exports.getTopPicks = async (req, res) => {
  try {
    const isPro = !!req.user;
    const latest = await DailyMarket.findOne().sort({ date: -1 });
    if (!latest) return res.json([]);

    // Just sorting by % change as a simple "Top Pick" proxy
    const winners = latest.stocks
      .sort((a, b) => b.change - a.change)
      .slice(0, 5);

    const topPicks = winners.map((stock) => ({
      symbol: stock.symbol,
      lastPrice: stock.price,
      totalScore: isPro ? 80 : "🔒",
      recommendation: isPro ? "BUY" : "Login to view",
    }));

    res.json(topPicks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
};
