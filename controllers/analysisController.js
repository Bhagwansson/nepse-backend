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

    // 2. Construct the Response
    // (In a real app, check req.user.role here for Pro features)
    const response = {
      symbol: analysis.symbol,
      price: analysis.lastPrice,
      date: analysis.date,
      score: analysis.totalScore,
      recommendation: analysis.recommendation, // "STRONG BUY" etc.

      // The "Why" - Detailed Signals
      signals: analysis.signals,

      // The Math - Raw Indicators
      indicators: {
        rsi: analysis.indicators.rsi,
        macd: analysis.indicators.macd,
        // We can hide EMA/Volume for "Pro" users later if needed
      },
    };

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
    const topPicks = await StockAnalysis.find()
      .sort({ totalScore: -1 }) // Highest score first
      .limit(5) // Top 5
      .select("symbol lastPrice recommendation totalScore"); // Only essential fields

    res.json(topPicks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
};
