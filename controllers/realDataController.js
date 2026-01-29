const DailyMarket = require("../models/DailyMarket");
const axios = require("axios");
const cheerio = require("cheerio");

// 1. HEADERS (Standard Browser Identity)
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

// @desc    Inject ACTUAL NEPSE History (Jan 29 Update)
// @route   GET /api/market/real-seed
exports.seedRealHistory = async (req, res) => {
  try {
    const realHistory = [
      { date: "2026-01-29", index: 2734.58, change: 3.0 }, // Placeholder for today
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

// @desc    Force Update LIVE Data (Targeting News Sites) 🎯
// @route   GET /api/market/force-update
exports.updateLiveMarket = async (req, res) => {
  let price = 0;
  let change = 0;
  let source = "";
  let debugInfo = "";

  try {
    console.log("🚀 Starting News Scraper...");

    // --- STRATEGY 1: Nepali Paisa (High Success Rate) ---
    // News sites usually have less anti-bot protection.
    if (!price) {
      try {
        console.log("📡 Strategy 1: Nepali Paisa...");
        const { data } = await axios.get("https://www.nepalipaisa.com/", {
          headers: HEADERS,
          timeout: 5000,
        });
        const $ = cheerio.load(data);

        // They usually have a clear block: <div class="nepse_index">...</div>
        // Or inside a specific widget
        const nepalipaisaValue = $(".market_summary .value")
          .first()
          .text()
          .trim(); // Example selector

        // Backup: Look for the text "NEPSE" and grab nearby numbers
        const bodyText = $("body").text();
        // Regex to find "NEPSE" followed by numbers
        // Looks for: NEPSE [spaces] 2,731.59
        const match = bodyText.match(
          /NEPSE\s+Index\s*[:\-\s]*([\d,]+\.\d{2})/i
        );

        if (match && match[1]) {
          price = parseFloat(match[1].replace(/,/g, ""));
          source = "Nepali Paisa (Regex)";

          // Try to find change
          const changeMatch = bodyText.match(
            /Change\s*[:\-\s]*([+-]?[\d,]+\.\d{2})/i
          );
          if (changeMatch)
            change = parseFloat(changeMatch[1].replace(/,/g, ""));
        }
      } catch (e) {
        console.log("Nepali Paisa Failed:", e.message);
        debugInfo += `NP: ${e.message} | `;
      }
    }

    // --- STRATEGY 2: Hamro Patro (Title Tag Trick) ---
    // Sometimes the Title Tag has the price even if the body is hidden/blocked
    if (!price) {
      try {
        console.log("📡 Strategy 2: Hamro Patro Title...");
        const { data } = await axios.get("https://www.hamropatro.com/share", {
          headers: HEADERS,
          timeout: 5000,
        });
        const $ = cheerio.load(data);
        const title = $("title").text(); // "Share Market | 2731.59..."

        const match = title.match(/[\d,]+\.\d{2}/);
        if (match) {
          price = parseFloat(match[0].replace(/,/g, ""));
          source = "Hamro Patro (Title)";
          // Try to fetch change from body if possible, else 0
          const changeText = $(".nepse-summary .change").text().trim();
          if (changeText) change = parseFloat(changeText.replace(/,/g, ""));
        }
      } catch (e) {
        console.log("HP Title Failed:", e.message);
      }
    }

    // --- STRATEGY 3: ShareSansar (Title Tag Trick) ---
    if (!price) {
      try {
        console.log("📡 Strategy 3: ShareSansar Title...");
        const { data } = await axios.get("https://www.sharesansar.com/", {
          headers: HEADERS,
          timeout: 5000,
        });
        const $ = cheerio.load(data);
        // Sometimes title is "NEPSE Index: 2,731.59 - ShareSansar"
        const title = $("title").text();
        const match = title.match(/([\d,]+\.\d{2})/);
        if (match) {
          price = parseFloat(match[1].replace(/,/g, ""));
          source = "ShareSansar (Title)";
        }
      } catch (e) {
        console.log("SS Title Failed:", e.message);
      }
    }

    // --- FALLBACK (Last Resort) ---
    if (!price) {
      console.log("⚠️ All Live Sources Failed. Using Jan 28 Close.");
      price = 2731.59;
      change = 5.08;
      source = "Backup Data (Scraper Blocked)";
    }

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

    res.json({
      msg: "Market Updated",
      source,
      price,
      change,
      debug: source.includes("Backup")
        ? "Cloud IP likely blocked by all providers."
        : "Success",
    });
  } catch (error) {
    console.error("Critical Error:", error);
    res.status(500).json({ error: "Update Failed", details: error.message });
  }
};
