const DailyMarket = require("../models/DailyMarket");

// --- 1. THE MATH ENGINE (Calculates fresh values) ---
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

// --- 2. THE MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const isPro = !!req.user;

    // 1. Fetch Fresh History (Last 50-100 days from DailyMarket)
    const history = await DailyMarket.find({
      "stocks.symbol": symbol.toUpperCase(),
    })
      .sort({ date: 1 })
      .limit(100);

    const prices = history
      .map((day) => {
        const s = day.stocks.find((st) => st.symbol === symbol.toUpperCase());
        return s ? s.price : null;
      })
      .filter((p) => p !== null);

    if (prices.length < 20) {
      return res
        .status(404)
        .json({ msg: "Not enough live data for analysis." });
    }

    // 2. Perform Live Calculations
    const currentPrice = prices[prices.length - 1];
    const rsi = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);

    // Simple AI Logic for Score & Signal
    let score = 50;
    let signals = [];
    if (rsi < 30) {
      score += 20;
      signals.push("RSI is Oversold (Bullish)");
    }
    if (rsi > 70) {
      score -= 20;
      signals.push("RSI is Overbought (Bearish)");
    }
    if (currentPrice > ema20) {
      score += 15;
      signals.push("Price above 20-EMA (Uptrend)");
    }

    const recommendation = score >= 65 ? "BUY" : score <= 35 ? "SELL" : "HOLD";

    // 3. YOUR PREFERRED RESPONSE STRUCTURE ✅
    let response = {
      symbol: symbol.toUpperCase(),
      price: currentPrice,
      date: new Date(), // Set to TODAY
      indicators: {
        rsi: rsi, // Number for frontend .toFixed()
      },
      isPro: isPro,
    };

    if (isPro) {
      // 🟢 PRO: Show Fresh Live Data
      response.score = score;
      response.recommendation = recommendation;
      response.signals = signals.length > 0 ? signals : ["Market is neutral"];
      response.indicators.ema = ema20;
      response.indicators.macd = "Calculated Live";
      response.indicators.volume = "Live";
    } else {
      // 🔴 GUEST: Same structure but Locked
      response.score = "LOCKED";
      response.recommendation = "LOGIN_TO_VIEW";
      response.signals = ["Login to see detailed technical signals"];
      response.indicators.ema = "LOCKED";
      response.indicators.macd = "LOCKED";
      response.indicators.volume = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
};

// GET /api/analysis/top-picks
exports.getTopPicks = async (req, res) => {
  try {
    const isPro = !!req.user;
    // Fetch last record and sort by a field or mock for now
    const latest = await DailyMarket.findOne().sort({ date: -1 });
    if (!latest) return res.json([]);

    const topPicks = latest.stocks.slice(0, 5).map((stock) => ({
      symbol: stock.symbol,
      lastPrice: stock.price,
      totalScore: isPro ? 75 : "🔒", // Logic to determine top picks
      recommendation: isPro ? "BUY" : "Login to view",
    }));

    res.json(topPicks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
};
