require("dotenv").config(); // <--- Loads your secrets
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");

const app = express();
app.use(cors());

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};
connectDB();

// --- SCHEMA ---
const stockSchema = new mongoose.Schema({
  date: String, // Format: "2026-01-19"
  stocks: Array, // Stores the entire list of stocks for that day
});
const DailyMarket = mongoose.model("DailyMarket", stockSchema);

// --- THE LOGIC ---
const fetchAndSaveMarketData = async () => {
    try {
        console.log("🔄 Fetching LIVE Market Data...");
        
        // 1. USE THE LIVE URL
        // We add a random timer (?t=...) to force a fresh version every time
        const { data } = await axios.get(`https://www.sharesansar.com/live-trading?t=${Date.now()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // Pretend to be a real browser
        });
        
        const $ = cheerio.load(data);
        const stocks = [];

        // 2. SCRAPE THE LIVE TABLE
        $('table tbody tr').each((index, element) => {
            const tds = $(element).find('td');
            
            // Safety check: Ensure row has enough data
            if (tds.length > 5) {
                const symbol = $(tds[1]).text().trim();
                // In Live Table: Price is usually 3rd column (index 2), Change % is 5th (index 4)
                const price = parseFloat($(tds[2]).text().replace(/,/g, '').trim());
                const change = parseFloat($(tds[4]).text().trim());
                const name = symbol; // Live table often lacks full name, so we use Symbol as Name temporarily

                if (symbol && !isNaN(price)) {
                    stocks.push({ symbol, name, price, change });
                }
            }
        });

        if (stocks.length > 0) {
            // 3. UPSERT LOGIC (Overwrite today's entry if it exists)
            const nepalTime = new Date(new Date().getTime() + 20700000); // UTC + 5:45
            const todayStr = nepalTime.toISOString().split('T')[0];
            
            await DailyMarket.findOneAndUpdate(
                { date: todayStr }, 
                { stocks: stocks },
                { upsert: true, new: true }
            );
            
            console.log(`✅ LIVE DATA: ${stocks.length} stocks updated for ${todayStr}`);
            return stocks;
        } else {
            console.log("⚠️ No data found in Live Table. Market might be closed or layout changed.");
            return [];
        }
    } catch (error) {
        console.error("❌ Scrape Failed:", error.message);
        return [];
    }
};
// --- ROUTES ---
app.get("/", (req, res) => res.send("API is Running...")); // Health Check

app.get("/api/live", async (req, res) => {
  // Return live data (and try to save it)
  const data = await fetchAndSaveMarketData();
  res.json(data);
});

app.get("/api/history/:symbol", async (req, res) => {
  const { symbol } = req.params;
  // Fetch all history from MongoDB
  const allHistory = await DailyMarket.find({}).sort({ date: 1 });

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

// --- CRON JOB (3:00 PM) ---
cron.schedule("0 15 * * *", () => {
  console.log("⏰ Auto-Pilot: Saving to MongoDB...");
  fetchAndSaveMarketData();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
