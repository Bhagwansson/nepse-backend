const StockAnalysis = require("../models/StockAnalysis");
const DailyMarket = require("../models/DailyMarket"); // <--- IMPORT THIS

// --- HELPER: Calculate RSI On-The-Fly ---
const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  let rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

// @desc    Get Single Stock Analysis (Calculated Live)
// @route   GET /api/analysis/:symbol
// exports.getAnalysis = async (req, res) => {
//   try {
//     const { symbol } = req.params;
//     const isPro = !!req.user; // Logic from optionalAuth

//     // 1. GET FRESH DATA (From the DailyMarket table we fixed earlier)
//     // We get the last 50 days of data to calculate indicators accurately
//     const history = await DailyMarket.find({
//       "stocks.symbol": symbol.toUpperCase(),
//     })
//       .sort({ date: 1 }) // Oldest to Newest
//       .limit(50);

//     // 2. EXTRACT PRICES
//     const prices = history
//       .map((day) => {
//         const s = day.stocks.find(
//           (stock) => stock.symbol === symbol.toUpperCase()
//         );
//         return s ? s.price : null;
//       })
//       .filter((p) => p !== null);

//     if (prices.length === 0) {
//       return res
//         .status(404)
//         .json({ msg: "No live data found for this stock." });
//     }

//     // 3. CALCULATE INDICATORS (Live)
//     const currentPrice = prices[prices.length - 1];
//     const rsiVal = calculateRSI(prices, 14).toFixed(2);

//     // Determine Signal
//     let signal = "HOLD";
//     let score = 50;

//     if (rsiVal < 30) {
//       signal = "BUY";
//       score = 80;
//     } else if (rsiVal > 70) {
//       signal = "SELL";
//       score = 20;
//     }

//     // 4. CONSTRUCT RESPONSE
//     let response = {
//       symbol: symbol.toUpperCase(),
//       price: currentPrice,
//       date: new Date(), // Always Today
//       indicators: { rsi: rsiVal },
//       isPro: isPro,
//       // Default Fallbacks for guest
//       score: isPro ? score : "🔒",
//       recommendation: isPro ? signal : "LOGIN_TO_VIEW",
//       signals: isPro
//         ? [`RSI is ${rsiVal} (${signal})`]
//         : ["Login to see signals"],
//     };

//     if (isPro) {
//       // Mocking other indicators for now since we only have Price data
//       // You can add real MACD logic here later
//       response.indicators.macd = "0.00";
//       response.indicators.ema = currentPrice;
//       response.indicators.volume = "N/A";
//       response.indicators.fibonacci = "N/A";
//     } else {
//       response.indicators.macd = "LOCKED";
//       response.indicators.ema = "LOCKED";
//       response.indicators.volume = "LOCKED";
//       response.indicators.fibonacci = "LOCKED";
//     }

//     res.json(response);
//   } catch (error) {
//     console.error("Analysis Error:", error);
//     res.status(500).json({ error: "Server Error" });
//   }
// };

// @desc    Get Single Stock Analysis (Calculated Live)
// @route   GET /api/analysis/:symbol
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const isPro = !!req.user;

    // 1. GET FRESH DATA
    const history = await DailyMarket.find({
      "stocks.symbol": symbol.toUpperCase(),
    })
      .sort({ date: 1 })
      .limit(50);

    // 2. EXTRACT PRICES
    const prices = history
      .map((day) => {
        const s = day.stocks.find(
          (stock) => stock.symbol === symbol.toUpperCase()
        );
        return s ? s.price : null;
      })
      .filter((p) => p !== null);

    if (prices.length === 0) {
      return res.status(404).json({ msg: "No live data found." });
    }

    // 3. CALCULATE INDICATORS (Live)
    const currentPrice = prices[prices.length - 1];

    // ✅ FIX: Keep this as a NUMBER. Do not use .toFixed() here.
    const rawRsi = calculateRSI(prices, 14);

    // Determine Signal
    let signal = "HOLD";
    let score = 50;

    if (rawRsi < 30) {
      signal = "BUY";
      score = 80;
    } else if (rawRsi > 70) {
      signal = "SELL";
      score = 20;
    }

    // 4. CONSTRUCT RESPONSE
    let response = {
      symbol: symbol.toUpperCase(),
      price: currentPrice,
      date: new Date(),
      indicators: {
        rsi: rawRsi, // Sending raw number (e.g. 54.2341...)
      },
      isPro: isPro,
      score: isPro ? score : "🔒",
      recommendation: isPro ? signal : "LOGIN_TO_VIEW",
      // Format it for the text signal, but keep the main value raw
      signals: isPro
        ? [`RSI is ${rawRsi.toFixed(2)} (${signal})`]
        : ["Login to see signals"],
    };

    // ... (rest of the code for Mock Indicators remains the same) ...
    if (isPro) {
      response.indicators.macd = 0.0;
      response.indicators.ema = currentPrice;
      response.indicators.volume = "N/A";
      response.indicators.fibonacci = "N/A";
    } else {
      response.indicators.macd = "LOCKED";
      response.indicators.ema = "LOCKED";
      response.indicators.volume = "LOCKED";
      response.indicators.fibonacci = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// @desc    Get Top Picks (Still reads from DB, or mock it)
// @route   GET /api/analysis/top-picks
exports.getTopPicks = async (req, res) => {
  try {
    const isPro = !!req.user;

    // For now, let's return a fail-safe list if DB is empty
    const picks = [
      {
        symbol: "NICA",
        lastPrice: 485,
        totalScore: 85,
        recommendation: "STRONG BUY",
      },
      { symbol: "NTC", lastPrice: 890, totalScore: 78, recommendation: "BUY" },
    ];

    const sanitizedPicks = picks.map((stock) => ({
      symbol: stock.symbol,
      lastPrice: stock.lastPrice,
      totalScore: isPro ? stock.totalScore : "🔒",
      recommendation: isPro ? stock.recommendation : "Login to view",
    }));

    res.json(sanitizedPicks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
};
