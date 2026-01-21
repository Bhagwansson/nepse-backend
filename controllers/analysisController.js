const StockAnalysis = require("../models/StockAnalysis");

// GET /api/analysis/:symbol
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;

    // 1. Fetch the latest analysis from DB
    const analysis = await StockAnalysis.findOne({
      symbol: symbol.toUpperCase(),
    });

    if (!analysis) {
      return res.status(404).json({
        msg: "No analysis found. Try running the daily crunch script.",
      });
    }

    // 2. Determine if the user is a "Pro" (Logged In)
    const isPro = !!req.user; // true if logged in, false if guest

    // 3. Construct the Response
    let response = {
      symbol: analysis.symbol,
      price: analysis.lastPrice,
      date: analysis.date,
      // ✅ FREE FEATURES (Always visible)
      indicators: {
        rsi: analysis.indicators.rsi, // Free for everyone
      },
      isPro: isPro, // Tell frontend if they are viewing as Pro or Guest
    };

    // 4. THE GATEKEEPER LOGIC 🔒
    if (isPro) {
      // 🟢 LOGGED IN USER: Show Everything
      response.score = analysis.totalScore;
      response.recommendation = analysis.recommendation; // "STRONG BUY", etc.
      response.signals = analysis.signals; // The "Why"

      // Add Premium Indicators
      response.indicators.macd = analysis.indicators.macd;
      response.indicators.ema = analysis.indicators.ema; // Assuming you store EMA
      response.indicators.volume = analysis.indicators.volume; // Assuming you store Volume
      response.indicators.fibonacci = analysis.indicators.fibonacci; // Assuming you store Fib
    } else {
      // 🔴 GUEST USER: Lock Premium Features
      response.score = "LOCKED";
      response.recommendation = "LOGIN_TO_VIEW";
      response.signals = ["Login to see detailed technical signals"];

      // Lock Premium Indicators
      response.indicators.macd = "LOCKED";
      response.indicators.ema = "LOCKED";
      response.indicators.volume = "LOCKED";
      response.indicators.fibonacci = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
};

// GET /api/analysis/top-picks
// Returns the highest scoring stocks for the dashboard
exports.getTopPicks = async (req, res) => {
  try {
    const isPro = !!req.user;

    const topPicks = await StockAnalysis.find()
      .sort({ totalScore: -1 }) // Highest score first
      .limit(5) // Top 5
      .select("symbol lastPrice recommendation totalScore");

    // Map through results to hide specific fields for guests
    const sanitizedPicks = topPicks.map((stock) => {
      return {
        symbol: stock.symbol,
        lastPrice: stock.lastPrice,
        // If guest, hide the score and recommendation in the dashboard list too
        totalScore: isPro ? stock.totalScore : "🔒",
        recommendation: isPro ? stock.recommendation : "Login to view",
      };
    });

    res.json(sanitizedPicks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
};
