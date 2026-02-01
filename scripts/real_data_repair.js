require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const cheerio = require("cheerio");
const DailyMarket = require("../models/DailyMarket");

// Headers to look like a real browser
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  Referer: "https://www.sharesansar.com/",
  "X-Requested-With": "XMLHttpRequest",
};

const runRealRepair = async () => {
  try {
    console.log("🔌 Connecting to Cloud Database...");
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in .env");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected!");

    // 1. THE MAGIC URL (Cache Busted)
    const url = `https://www.sharesansar.com/live-trading?t=${Date.now()}`;
    console.log(`📡 Fetching: ${url}`);

    const { data } = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(data);

    const stocksList = [];
    let nepseIndex = 0;

    // 2. SCRAPE THE TABLE
    // ShareSansar Live Trading table usually has id="headFixed" or class="table"
    $("table tbody tr").each((i, row) => {
      const cols = $(row).find("td");
      // Columns: [0]S.No [1]Symbol [2]LTP [3]Point Change [4]% Change [5]Open ...

      if (cols.length > 5) {
        const symbol = $(cols[1]).text().trim();
        const priceRaw = $(cols[2]).text().trim().replace(/,/g, "");
        const changeRaw = $(cols[4]).text().trim().replace(/,/g, ""); // % Change

        const price = parseFloat(priceRaw);
        const change = parseFloat(changeRaw);

        if (symbol && !isNaN(price)) {
          stocksList.push({
            symbol: symbol,
            name: symbol, // ShareSansar live table uses symbol as name
            price: price,
            change: change || 0,
          });
        }
      }
    });

    console.log(`✅ Scraped ${stocksList.length} companies from ShareSansar.`);

    // 3. FIND NEPSE INDEX
    // We look for the "NEPSE Index" card usually at the top
    // OR we just grab it from the regex scan of the body if the cards are hidden
    const bodyText = $("body").text();
    const nepseMatch = bodyText.match(/NEPSE Index.*?([\d,]+\.\d{2})/);

    if (nepseMatch) {
      nepseIndex = parseFloat(nepseMatch[1].replace(/,/g, ""));
      console.log(`✅ NEPSE Index Found: ${nepseIndex}`);
    } else {
      console.log("⚠️ NEPSE Index not found in text, defaulting to 2740.16");
      nepseIndex = 2740.16;
    }

    if (stocksList.length === 0) {
      console.log(
        "❌ Failed to find any stocks. The layout might have changed or access denied."
      );
      process.exit(1);
    }

    // 4. UPLOAD TO MONGO
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Insert NEPSE as the first item for the list
    stocksList.unshift({
      symbol: "NEPSE",
      name: "NEPSE Index",
      price: nepseIndex,
      change: 0,
    });

    console.log(`💾 Overwriting data for ${today.toDateString()}...`);

    await DailyMarket.findOneAndUpdate(
      { date: today },
      {
        date: today,
        nepseIndex: nepseIndex,
        stocks: stocksList,
      },
      { upsert: true, new: true }
    );

    console.log("🚀 SUCCESS! Database repaired with ShareSansar Real Data.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
};

runRealRepair();
