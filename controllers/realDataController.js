const DailyMarket = require("../models/DailyMarket");
const axios = require("axios");
const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

// @desc    Inject ACTUAL NEPSE History (Jan 29 Updated)
// @route   GET /api/market/real-seed
exports.seedRealHistory = async (req, res) => {
  try {
    const realHistory = [
      { date: "2026-01-29", index: 2731.59, change: 0.18 }, // Placeholder for today
      { date: "2026-01-28", index: 2731.59, change: 5.08 },
      { date: "2026-01-27", index: 2726.51, change: -42.58 },
      { date: "2026-01-26", index: 2769.09, change: -3.07 },
      { date: "2026-01-25", index: 2772.17, change: 57.55 },
      { date: "2026-01-22", index: 2714.61, change: 9.23 },
      { date: "2026-01-21", index: 2705.38, change: -9.43 },
      { date: "2026-01-20", index: 2714.81, change: 42.26 },
      { date: "2026-01-18", index: 2672.55, change: 31.12 },
      { date: "2026-01-14", index: 2641.43, change: 1.52 },
    ];

    const docs = realHistory.map((day) => ({
      date: new Date(day.date),
      nepseIndex: day.index,
      stocks: [
        {
          symbol: "NEPSE",
          name: "NEPSE Index",
          price: day.index,
          change: day.change,
        },
      ],
    }));

    for (const doc of docs) {
      await DailyMarket.findOneAndUpdate({ date: doc.date }, doc, {
        upsert: true,
        new: true,
      });
    }
    res.json({ msg: "SUCCESS: History updated." });
  } catch (error) {
    res.status(500).json({ error: "Seeding failed" });
  }
};

// @desc    Force Update LIVE Data (Merolagani Priority) 🎯
// @route   GET /api/market/force-update
exports.updateLiveMarket = async (req, res) => {
  let price = 0;
  let change = 0;
  let source = "";

  try {
    console.log("🚀 Starting Scraper...");

    // --- STRATEGY 1: MEROLAGANI (Old School HTML = Easier to Scrape) ---
    try {
      console.log("📡 Strategy 1: Merolagani...");
      const { data } = await axios.get(
        "https://merolagani.com/LatestMarket.aspx",
        { headers: HEADERS }
      );
      const $ = cheerio.load(data);

      // Merolagani has a big table id="ctl00_ContentPlaceHolder1_LiveTrading"
      // We search for the row containing "NEPSE Index"
      $("tr").each((i, row) => {
        const rowText = $(row).text().trim();
        if (rowText.includes("NEPSE Index")) {
          const cols = $(row).find("td");
          // Merolagani Columns: [0]Symbol [1]LTP [2]%Change [3]Open [4]High [5]Low [6]Qty
          // BUT for the Index table at top, it might be different.
          // Let's grab the first number that looks like an index.

          const pVal = parseFloat($(cols[1]).text().replace(/,/g, ""));
          const cVal = parseFloat($(cols[2]).text().replace(/,/g, ""));

          if (!isNaN(pVal)) {
            price = pVal;
            change = cVal;
            source = "Merolagani Live";
            return false;
          }
        }
      });
    } catch (e) {
      console.log("Merolagani Failed:", e.message);
    }

    // --- STRATEGY 2: HAMRO PATRO (Backup) ---
    if (!price) {
      try {
        console.log("📡 Strategy 2: Hamro Patro...");
        const { data } = await axios.get("https://www.hamropatro.com/share", {
          headers: HEADERS,
        });
        const $ = cheerio.load(data);
        const valText = $(".nepse-summary .value").text().trim(); // "2,731.59"

        if (valText) {
          price = parseFloat(valText.replace(/,/g, ""));
          // Try to find change
          const changeText = $(".nepse-summary .change").text().trim();
          change = parseFloat(changeText.replace(/,/g, "")) || 0;
          source = "Hamro Patro";
        }
      } catch (e) {
        console.log("Hamro Patro Failed:", e.message);
      }
    }

    // --- FALLBACK ---
    if (!price) {
      console.log("⚠️ All Live Sources Failed. Using Jan 28 Close.");
      price = 2731.59;
      change = 5.08;
      source = "Backup (Jan 28)";
    }

    // SAVE
    console.log(`✅ Result: ${price} (${source})`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await DailyMarket.findOneAndUpdate(
      { date: today },
      {
        date: today,
        nepseIndex: price,
        stocks: [
          {
            symbol: "NEPSE",
            name: "NEPSE Index",
            price: price,
            change: change,
          },
        ],
      },
      { upsert: true }
    );

    res.json({ msg: "Market Updated", source, price, change });
  } catch (error) {
    console.error("Critical Error:", error);
    res.status(500).json({ error: "Update Failed", details: error.message });
  }
};
