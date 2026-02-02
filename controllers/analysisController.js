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
// exports.getAnalysis = async (req, res) => {
//   try {
//     const { symbol } = req.params;
//     const isPro = !!req.user;

//     // 🟢 STEP 1: FETCH LATEST DATA CORRECTLY
//     // Sort by date: -1 (Newest first) so we get 2026 data, not 2021 data
//     const rawHistory = await DailyMarket.find({
//       "stocks.symbol": symbol.toUpperCase(),
//     })
//       .sort({ date: -1 })
//       .limit(50); // Get last 50 days

//     if (!rawHistory || rawHistory.length === 0) {
//       return res.status(404).json({ msg: "No data found" });
//     }

//     // 🟢 STEP 2: REVERSE TO CHRONOLOGICAL ORDER
//     // We need Oldest -> Newest for indicator math (RSI/EMA)
//     const history = rawHistory.reverse();

//     // Extract just the prices for this symbol
//     const prices = history
//       .map((day) => {
//         const s = day.stocks.find((st) => st.symbol === symbol.toUpperCase());
//         return s ? s.price : null;
//       })
//       .filter((p) => p !== null);

//     // Fail-safe if symbol missing in some records
//     if (prices.length < 5) {
//       return res
//         .status(404)
//         .json({ msg: "Insufficient data for calculations" });
//     }

//     // 🟢 STEP 3: PERFORM CALCULATIONS
//     const currentPrice = prices[prices.length - 1]; // Now this is TODAY'S price
//     const rsi = calculateRSI(prices, 14);
//     const ema20 = calculateEMA(prices, 20);

//     // AI Logic
//     let score = 50;
//     let signals = [];
//     if (rsi < 30) {
//       score += 20;
//       signals.push("RSI is Oversold (Bullish)");
//     } else if (rsi > 70) {
//       score -= 20;
//       signals.push("RSI is Overbought (Bearish)");
//     } else {
//       signals.push("RSI is Neutral");
//     }

//     if (currentPrice > ema20) {
//       score += 15;
//       signals.push("Price above 20-EMA (Uptrend)");
//     } else {
//       score -= 15;
//       signals.push("Price below 20-EMA (Downtrend)");
//     }

//     const recommendation = score >= 65 ? "BUY" : score <= 35 ? "SELL" : "HOLD";

//     // 🟢 STEP 4: SEND RESPONSE
//     let response = {
//       symbol: symbol.toUpperCase(),
//       price: currentPrice,
//       date: new Date(),
//       indicators: { rsi: rsi },
//       isPro: isPro,
//     };

//     if (isPro) {
//       response.score = score;
//       response.recommendation = recommendation;
//       response.signals = signals;
//       response.indicators.ema = ema20;
//       response.indicators.macd = "Calculated Live";
//       response.indicators.volume = "Live";
//     } else {
//       response.score = "LOCKED";
//       response.recommendation = "LOGIN_TO_VIEW";
//       response.signals = ["Login to see signals"];
//       response.indicators.ema = "LOCKED";
//       response.indicators.macd = "LOCKED";
//       response.indicators.volume = "LOCKED";
//     }

//     res.json(response);
//   } catch (error) {
//     console.error("Analysis Error:", error);
//     res.status(500).json({ error: "Server Error" });
//   }
// };

// ... (Keep RSI, EMA, MACD helper functions the same) ...

exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const isPro = !!req.user;

    // 1. Fetch History
    const rawHistory = await DailyMarket.find({
      "stocks.symbol": symbol.toUpperCase(),
    })
      .sort({ date: -1 }) // Newest first
      .limit(50);

    if (!rawHistory || rawHistory.length < 10)
      return res.status(404).json({ msg: "Not enough data" });

    const history = rawHistory.reverse(); // Oldest -> Newest

    // 2. Extract Data Arrays
    const prices = [];
    const volumes = []; // 🔥 New Volume Array

    history.forEach((day) => {
      const s = day.stocks.find((st) => st.symbol === symbol.toUpperCase());
      if (s) {
        prices.push(s.price);
        volumes.push(s.volume || 0); // Handle missing volume in old records
      }
    });

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // 3. Calculate Indicators
    const rsi = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const { macd } = calculateMACD(prices);

    // 🔥 Calculate Volume Average (Last 20 days)
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // 4. Generate AI Verdict
    let score = 50;
    let reasons = [];

    // -- RSI Logic --
    if (rsi < 30) {
      score += 20;
      reasons.push(`RSI is Oversold (${rsi.toFixed(1)}). Potential bounce.`);
    } else if (rsi > 70) {
      score -= 20;
      reasons.push(`RSI is Overbought (${rsi.toFixed(1)}). Correction likely.`);
    }

    // -- Trend Logic --
    if (currentPrice > ema20) {
      score += 10;
      reasons.push("Price is in an Uptrend (Above 20 EMA).");
    } else {
      score -= 10;
      reasons.push("Price is in a Downtrend (Below 20 EMA).");
    }

    // -- MACD Logic --
    if (macd > 0) {
      score += 10;
      reasons.push("MACD is Bullish.");
    } else {
      score -= 10;
      reasons.push("MACD is Bearish.");
    }

    // -- 🔥 NEW VOLUME LOGIC --
    if (volumeRatio > 1.5) {
      // High Volume (50% higher than average)
      if (currentPrice > prices[prices.length - 2]) {
        score += 15;
        reasons.push(
          "High Volume confirming the price rise! (Strong Conviction)"
        );
      } else {
        score -= 15;
        reasons.push("High Volume confirming the price drop! (Panic Selling)");
      }
    } else if (volumeRatio < 0.5) {
      // Low Volume
      reasons.push("Low Volume. This move lacks conviction.");
    }

    // Final Recommendation
    let recommendation = "HOLD";
    if (score >= 75) recommendation = "STRONG BUY";
    else if (score >= 60) recommendation = "BUY";
    else if (score <= 35) recommendation = "SELL";
    else if (score <= 20) recommendation = "STRONG SELL";

    // 5. Send Response
    res.json({
      symbol: symbol.toUpperCase(),
      price: currentPrice,
      date: new Date(),
      indicators: { rsi: rsi },
      isPro,

      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      signals: isPro ? reasons : ["Login to see AI verdict"],

      details: isPro
        ? {
            macd: macd.toFixed(2),
            ema: ema20.toFixed(2),
            volume: currentVolume.toLocaleString(), // Show Real Volume
            avgVolume: Math.round(avgVolume).toLocaleString(),
          }
        : null,
    });
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
