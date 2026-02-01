const axios = require("axios");
const cheerio = require("cheerio");
const DailyMarket = require("../models/DailyMarket");

// Helper: Parse "Rs. 1,42,000" and "+ 500" into clean numbers
// Defined here so it's available to the export below
const parsePrice = (priceStr, changeStr) => {
  if (!priceStr) return { price: "N/A", change: 0, direction: "neutral" };

  // Remove "Rs.", commas, and spaces
  const cleanPrice = priceStr.replace(/[^\d]/g, "");
  const cleanChange = changeStr.replace(/[^\d]/g, "");

  const isNegative = changeStr.includes("-");
  const changeVal = parseInt(cleanChange) || 0;

  return {
    price: parseInt(cleanPrice).toLocaleString(),
    change: isNegative ? -changeVal : changeVal,
    direction: isNegative ? "down" : changeVal > 0 ? "up" : "neutral",
  };
};

// @desc    Get Market Summary (Gold, Silver, NEPSE Index)
// @route   GET /api/market/summary
exports.getMarketSummary = async (req, res) => {
  try {
    // 1. Scrape Gold/Silver
    let commodities = {
      gold: { price: "N/A", change: 0, direction: "neutral" },
      silver: { price: "N/A", change: 0, direction: "neutral" },
    };

    try {
      const { data } = await axios.get("https://www.hamropatro.com/gold", {
        timeout: 5000,
      });
      const $ = cheerio.load(data);

      const goldText = $(
        ".gold-silver-table tbody tr:first-child td:nth-child(2)"
      )
        .text()
        .trim();
      const goldChangeText = $(
        ".gold-silver-table tbody tr:first-child td:nth-child(3)"
      )
        .text()
        .trim();

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
    const historyDocs = await DailyMarket.find()
      .sort({ date: -1 })
      .limit(30)
      .select("date nepseIndex stocks");

    const chartData = historyDocs
      .map((doc) => {
        const val =
          doc.nepseIndex ||
          (doc.stocks && doc.stocks[0] ? doc.stocks[0].price : 0);
        return {
          value: val,
          label: doc.date ? doc.date.toISOString().slice(5, 10) : "",
        };
      })
      .reverse();

    // 3. Current NEPSE Status
    const latest = chartData[chartData.length - 1] || { value: 0 };
    const prev = chartData[chartData.length - 2] || { value: 0 };
    const nepseChange = latest.value - prev.value;

    // Fix: Prevent division by zero
    const percentChange =
      prev.value !== 0 ? ((nepseChange / prev.value) * 100).toFixed(2) : "0.00";

    res.json({
      commodities,
      nepse: {
        value: latest.value,
        change: nepseChange,
        percent: percentChange,
        chart: chartData,
      },
    });
  } catch (error) {
    console.error("Summary Controller Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
