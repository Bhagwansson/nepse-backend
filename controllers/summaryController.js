const axios = require("axios");
const cheerio = require("cheerio");
const DailyMarket = require("../models/DailyMarket");

// @desc    Get Market Summary (Gold, Silver, NEPSE Index)
// @route   GET /api/market/summary
exports.getMarketSummary = async (req, res) => {
  try {
    // 1. Scrape Gold/Silver (Real-time from Hamro Patro)
    let commodities = {
      gold: { price: "N/A", change: 0, direction: "neutral" },
      silver: { price: "N/A", change: 0, direction: "neutral" },
    };

    try {
      const { data } = await axios.get("https://www.hamropatro.com/gold");
      const $ = cheerio.load(data);

      // Hamro Patro usually puts the main Gold price in a specific list item
      // This selector targets the "Gold (Fine)" section
      const goldText = $(
        ".gold-silver-table tbody tr:first-child td:nth-child(2)"
      )
        .text()
        .trim(); // e.g., "Rs. 142,000"
      const goldChangeText = $(
        ".gold-silver-table tbody tr:first-child td:nth-child(3)"
      )
        .text()
        .trim(); // e.g., "+ 500"

      const silverText = $(
        ".gold-silver-table tbody tr:nth-child(3) td:nth-child(2)"
      )
        .text()
        .trim();
      const silverChangeText = $(
        ".gold-silver-table tbody tr:nth-child(3) td:nth-child(3)"
      )
        .text()
        .trim();

      commodities.gold = parsePrice(goldText, goldChangeText);
      commodities.silver = parsePrice(silverText, silverChangeText);
    } catch (err) {
      console.error("Gold Scraping Failed:", err.message);
    }

    // 2. Get NEPSE Index History (Last 30 Days)
    // We assume your DailyMarket collection has records.
    // We'll calculate an "Index" proxy by averaging the top 10 stocks if you don't store the exact NEPSE index.
    // OR, if you simply want a visual trend, we can use the stored data.

    // 2. Get NEPSE Index History (Last 30 Days)
    const historyDocs = await DailyMarket.find()
      .sort({ date: -1 })
      .limit(30)
      .select("date nepseIndex stocks"); // Select nepseIndex

    const chartData = historyDocs
      .map((doc) => {
        // USE REAL INDEX if available, otherwise fallback to stock price
        const val = doc.nepseIndex || (doc.stocks[0] ? doc.stocks[0].price : 0);
        return {
          value: val,
          label: doc.date.toISOString().slice(5, 10),
        };
      })
      .reverse();

    // 3. Current NEPSE Status (Latest Day)
    const latest = chartData[chartData.length - 1] || { value: 0 };
    const prev = chartData[chartData.length - 2] || { value: 0 };
    const nepseChange = latest.value - prev.value;

    res.json({
      commodities,
      nepse: {
        value: latest.value,
        change: nepseChange,
        percent: ((nepseChange / prev.value) * 100).toFixed(2),
        chart: chartData,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
};

// Helper: Parse "Rs. 1,42,000" and "+ 500" into clean numbers
function parsePrice(priceStr, changeStr) {
  if (!priceStr) return { price: "N/A", change: 0, direction: "neutral" };

  // Remove "Rs.", commas, and spaces
  const cleanPrice = priceStr.replace(/[^\d]/g, "");
  const cleanChange = changeStr.replace(/[^\d]/g, ""); // Remove + or - for now

  const isNegative = changeStr.includes("-");
  const changeVal = parseInt(cleanChange) || 0;

  return {
    price: parseInt(cleanPrice).toLocaleString(), // Format nicely (1,42,000)
    change: isNegative ? -changeVal : changeVal,
    direction: isNegative ? "down" : changeVal > 0 ? "up" : "neutral",
  };
}
