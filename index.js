const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron"); // <--- The Robot

const app = express();
app.use(cors());

const DB_FILE = path.join(__dirname, "db.json");

// --- DATABASE HELPERS ---
const readDB = () => {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE));
};

const writeDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- THE CORE LOGIC (Reusable) ---
// This function does the heavy lifting. Both the Robot AND the API use this.
const fetchAndSaveMarketData = async () => {
  try {
    console.log("🔄 Starting Market Scrape...");
    const { data } = await axios.get(
      "https://www.sharesansar.com/today-share-price"
    );
    const $ = cheerio.load(data);
    const stocks = [];

    $("#headFixed tbody tr").each((index, element) => {
      const tds = $(element).find("td");
      const symbol = $(tds[1]).text().trim();
      const name = $(tds[2]).text().trim();
      const price = parseFloat($(tds[6]).text().replace(/,/g, "").trim());
      const change = parseFloat($(tds[7]).text().trim());

      if (symbol && !isNaN(price)) {
        stocks.push({ symbol, name, price, change });
      }
    });

    if (stocks.length > 0) {
      const history = readDB();
      const todayStr = new Date().toISOString().split("T")[0];

      // Check for duplicate day
      const alreadySaved = history.some((entry) => entry.date === todayStr);

      if (!alreadySaved) {
        history.push({ date: todayStr, stocks });
        writeDB(history);
        console.log(`✅ SAVED: ${stocks.length} records for ${todayStr}`);
      } else {
        console.log(`⚠️ SKIP: Data for ${todayStr} already exists.`);
      }
      return stocks; // Return data for the API user
    }
  } catch (error) {
    console.error("❌ Scrape Failed:", error.message);
    return [];
  }
};

// --- THE ROBOT (CRON JOB) ---

// Schedule: Run every day at 15:00 (3:00 PM)
// Format: 'Minute Hour * * *'
cron.schedule("0 15 * * *", () => {
  console.log("⏰ 3:00 PM Market Close - Auto-Pilot Engaged!");
  fetchAndSaveMarketData();
});

// TEST ROBOT: Runs every minute (Just to prove it works to you right now)
// You can delete this block later.
// cron.schedule("* * * * *", () => {
//   console.log("🤖 Test Robot: Checking for new data...");
//   fetchAndSaveMarketData();
// });

// --- API ROUTES ---

app.get("/api/live", async (req, res) => {
  // When a user asks for live data, we just run the scraper function manually
  const data = await fetchAndSaveMarketData();
  res.json(data);
});

app.get("/api/history/:symbol", (req, res) => {
  const { symbol } = req.params;
  const allHistory = readDB();
  const stockHistory = allHistory
    .map((day) => {
      const stockData = day.stocks.find(
        (s) => s.symbol === symbol.toUpperCase()
      );
      return {
        date: day.date,
        price: stockData ? stockData.price : null,
      };
    })
    .filter((item) => item.price !== null);
  res.json(stockHistory);
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log("⏰ Cron Job scheduled for 3:00 PM Daily.");
});
