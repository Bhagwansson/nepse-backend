const DailyMarket = require("../models/DailyMarket");
const { calculateRSI } = require("../utils/indicators");

// @desc    Get Latest Market Data (The Fix for Dashboard)
// @route   GET /api/market/live
exports.getLiveMarket = async (req, res) => {
  try {
    const latestRecord = await DailyMarket.findOne().sort({ date: -1 });

    if (!latestRecord) {
      return res.status(404).json({ msg: "No market data found" });
    }

    const marketData = await DailyMarket.find({ date: latestRecord.date });

    // Flatten the structure if needed, or return the stocks array directly
    // If your DailyMarket schema has a 'stocks' array inside it:
    if (latestRecord.stocks) {
      return res.json(latestRecord.stocks);
    }

    res.json(marketData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
};

// @desc    Get Stock History for Charts (KEEP THIS!)
// @route   GET /api/market/history/:symbol?period=1Y
exports.getStockHistory = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period } = req.query;

    let daysVisible = 30;
    if (period === "1M") daysVisible = 30;
    if (period === "6M") daysVisible = 180;
    if (period === "1Y") daysVisible = 365;
    if (period === "ALL") daysVisible = 365 * 5;

    const visibleCutoff = new Date();
    visibleCutoff.setDate(visibleCutoff.getDate() - daysVisible);

    const fetchCutoff = new Date(visibleCutoff);
    fetchCutoff.setDate(fetchCutoff.getDate() - 200);

    const fetchDateStr = fetchCutoff.toISOString().split("T")[0];

    const history = await DailyMarket.aggregate([
      { $match: { date: { $gte: fetchDateStr } } },
      { $sort: { date: 1 } },
      {
        $project: {
          date: 1,
          stock: {
            $filter: {
              input: "$stocks",
              as: "item",
              cond: { $eq: ["$$item.symbol", symbol.toUpperCase()] },
            },
          },
        },
      },
      { $match: { "stock.0": { $exists: true } } },
    ]);

    if (!history.length) {
      return res
        .status(404)
        .json({ error: "No history found for this symbol" });
    }

    const closingPrices = history.map((day) => day.stock[0].price);
    const rsiArray = calculateRSI(closingPrices, 14);

    const fullData = history.map((day, index) => {
      return {
        time: day.date,
        value: day.stock[0].price,
        rsi: rsiArray[index] || null,
      };
    });

    const finalData = fullData.filter((d) => new Date(d.time) >= visibleCutoff);

    res.json(finalData);
  } catch (error) {
    console.error("History Error:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
};

// @desc    Search Stocks (KEEP THIS!)
// @route   GET /api/market/search?q=NICA
exports.searchStocks = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const latestDay = await DailyMarket.findOne().sort({ date: -1 });
    if (!latestDay) return res.json([]);

    const results = latestDay.stocks
      .filter(
        (s) =>
          s.symbol.includes(q.toUpperCase()) ||
          s.name.toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 10)
      .map((s) => ({ symbol: s.symbol, name: s.name }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
};
