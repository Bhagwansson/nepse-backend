const DailyMarket = require("../models/DailyMarket");
const axios = require("axios");
const cheerio = require("cheerio");

// Configuration for real-time fetching
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Cache-Control": "no-cache",
};

// @desc    Get REAL-TIME Market Data (Direct from Source)
// @route   GET /api/market/live
exports.getLiveMarket = async (req, res) => {
  try {
    // 1. Fetch live data immediately using your cache-busting timestamp
    const url = `https://www.sharesansar.com/live-trading?t=${Date.now()}`;
    console.log(`📡 Fetching Live: ${url}`);

    const { data } = await axios.get(url, { headers: HEADERS, timeout: 5000 });
    const $ = cheerio.load(data);
    const stocksList = [];

    // 2. Parse the live table
    $("table tbody tr").each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length > 5) {
        const symbol = $(cols[1]).text().trim();
        const price = parseFloat($(cols[2]).text().replace(/,/g, ""));
        const change = parseFloat($(cols[4]).text().replace(/,/g, ""));

        if (symbol && !isNaN(price)) {
          stocksList.push({
            symbol,
            name: symbol,
            price,
            change: change || 0,
            lastUpdated: new Date(), // Timestamp for every individual stock
          });
        }
      }
    });

    // 3. If scraping worked, return live data to user IMMEDIATELY
    if (stocksList.length > 0) {
      res.json(stocksList);

      // 4. BACKGROUND TASK: Update DB so charts/details are accurate
      // We don't 'await' this so the user doesn't have to wait for the DB write
      const today = new Date().toISOString().split("T")[0];
      DailyMarket.findOneAndUpdate(
        { date: today },
        {
          date: today,
          stocks: stocksList,
          lastUpdated: new Date(),
        },
        { upsert: true }
      ).catch((err) => console.error("DB Background Update Error:", err));

      return;
    }

    // 5. FALLBACK: If scraping fails (e.g., source is down), use latest DB record
    const latestRecord = await DailyMarket.findOne().sort({ date: -1 });
    if (latestRecord) {
      return res.json(latestRecord.stocks);
    }

    res.status(404).json({ msg: "No live or cached data available" });
  } catch (error) {
    console.error("Live Fetch Error:", error);
    // On error, try to serve whatever we have in DB
    const fallback = await DailyMarket.findOne().sort({ date: -1 });
    res.status(200).json(fallback ? fallback.stocks : []);
  }
}; // yyyuy
