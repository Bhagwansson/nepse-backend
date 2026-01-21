const StockAnalysis = require("../models/StockAnalysis");

// @desc    Get Single Stock Analysis (Freemium)
// @route   GET /api/analysis/:symbol
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const analysis = await StockAnalysis.findOne({
      symbol: symbol.toUpperCase(),
    });

    if (!analysis) {
      return res.status(404).json({ msg: "No analysis found." });
    }

    const isPro = !!req.user; // Logic from optionalAuth

    // Build Response
    let response = {
      symbol: analysis.symbol,
      price: analysis.lastPrice,
      date: analysis.date,
      indicators: { rsi: analysis.indicators.rsi }, // Free
      isPro: isPro,
    };

    if (isPro) {
      // PRO DATA
      response.score = analysis.totalScore;
      response.recommendation = analysis.recommendation;
      response.signals = analysis.signals;
      response.indicators.macd = analysis.indicators.macd;
      response.indicators.ema = analysis.indicators.ema;
      response.indicators.volume = analysis.indicators.volume;
      response.indicators.fibonacci = analysis.indicators.fibonacci;
    } else {
      // GUEST DATA (Locked)
      response.score = "LOCKED";
      response.recommendation = "LOGIN_TO_VIEW";
      response.signals = ["Login to see detailed signals"];
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

// @desc    Get Top Picks for Dashboard
// @route   GET /api/analysis/top-picks
exports.getTopPicks = async (req, res) => {
  try {
    const isPro = !!req.user;

    // Fetch Top 5 Highest Scoring Stocks
    const topPicks = await StockAnalysis.find()
      .sort({ totalScore: -1 })
      .limit(5)
      .select("symbol lastPrice recommendation totalScore");

    const sanitizedPicks = topPicks.map((stock) => ({
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
