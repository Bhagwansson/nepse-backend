const DailyMarket = require("../models/DailyMarket");
const { calculateRSI } = require("../utils/indicators"); // We reuse your math engine!

// GET /api/market/history/:symbol?period=1Y
exports.getStockHistory = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period } = req.query; // '1M', '6M', '1Y', 'ALL'

    // 1. Determine "Lookback" vs "Fetch"
    // We always fetch EXTRA data (200 days extra) so RSI warms up correctly.
    let daysVisible = 30; // Default 1 Month
    if (period === "1M") daysVisible = 30;
    if (period === "6M") daysVisible = 180;
    if (period === "1Y") daysVisible = 365;
    if (period === "ALL") daysVisible = 365 * 5;

    // The date we show the user
    const visibleCutoff = new Date();
    visibleCutoff.setDate(visibleCutoff.getDate() - daysVisible);

    // The date we actually fetch from DB (Visible + 200 days for RSI warmup)
    const fetchCutoff = new Date(visibleCutoff);
    fetchCutoff.setDate(fetchCutoff.getDate() - 200);

    const fetchDateStr = fetchCutoff.toISOString().split("T")[0];

    // 2. AGGREGATION PIPELINE (High Speed Fetch) ⚡
    const history = await DailyMarket.aggregate([
      {
        // Filter: Only days after our "Fetch Date"
        $match: { date: { $gte: fetchDateStr } },
      },
      { $sort: { date: 1 } }, // Sort Oldest -> Newest (Critical for charts)
      {
        $project: {
          date: 1,
          // Extract ONLY the specific stock to save bandwidth
          stock: {
            $filter: {
              input: "$stocks",
              as: "item",
              cond: { $eq: ["$$item.symbol", symbol.toUpperCase()] },
            },
          },
        },
      },
      // Remove days where this specific stock wasn't traded
      { $match: { "stock.0": { $exists: true } } },
    ]);

    if (!history.length) {
      return res
        .status(404)
        .json({ error: "No history found for this symbol" });
    }

    // 3. Perform Calculations in Memory 🧮
    // Extract plain price array for the math engine
    const closingPrices = history.map((day) => day.stock[0].price);

    // Calculate Indicators
    const rsiArray = calculateRSI(closingPrices, 14);

    // 4. Merge & Format
    // We map the raw data + calculated indicators into a clean JSON for the Frontend
    // We also "slice" the array to remove the old warmup data users shouldn't see
    const fullData = history.map((day, index) => {
      // RSI array matches Price array index-for-index (with nulls at start)
      return {
        time: day.date, // TradingView prefers 'time' (YYYY-MM-DD)
        value: day.stock[0].price,
        rsi: rsiArray[index] || null,
      };
    });

    // Filter: Keep only the days the user actually asked for
    const finalData = fullData.filter((d) => new Date(d.time) >= visibleCutoff);

    res.json(finalData);
  } catch (error) {
    console.error("History Error:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
};

// GET /api/market/search?q=NICA
exports.searchStocks = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    // Find latest day to search active stocks
    const latestDay = await DailyMarket.findOne().sort({ date: -1 });
    if (!latestDay) return res.json([]);

    // Filter in memory (fast enough for 300 stocks)
    const results = latestDay.stocks
      .filter(
        (s) =>
          s.symbol.includes(q.toUpperCase()) ||
          s.name.toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 10) // Limit to 10 results
      .map((s) => ({ symbol: s.symbol, name: s.name }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
};
