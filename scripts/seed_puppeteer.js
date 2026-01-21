const mongoose = require("mongoose");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path"); // <--- Import this

// FIX: Robust way to find .env no matter where you run the command from
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// FIX: Robust way to find the Model
const DailyMarket = require("../models/DailyMarket");

puppeteer.use(StealthPlugin());

const scrapeLiveMarket = async () => {
  console.log("🚀 Starting Puppeteer Scraper...");

  // 3. Connect to Database
  try {
    await mongoose.connect(process.env.MONGO_URI, { family: 4 });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
    process.exit(1);
  }

  let browser;
  try {
    // 4. Launch Browser (Headless for server mode)
    browser = await puppeteer.launch({
      headless: "new", // Run in background
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Helps with memory on servers
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    // 5. Anti-Detection Measures
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("🌍 Navigating to ShareSansar Live Trading...");
    // Random query param prevents caching
    await page.goto(
      `https://www.sharesansar.com/live-trading?t=${Date.now()}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    // 6. Wait for the Table to Load
    await page.waitForSelector("#headFixed", { timeout: 30000 });

    // 7. Scrape the Data
    const stocks = await page.evaluate(() => {
      const rows = document.querySelectorAll("#headFixed tbody tr");
      const data = [];

      rows.forEach((row) => {
        const cols = row.querySelectorAll("td");
        if (cols.length > 5) {
          const symbol = cols[1].innerText.trim();
          // Clean numbers (remove commas)
          const price = parseFloat(cols[2].innerText.replace(/,/g, "").trim());
          const change = parseFloat(cols[4].innerText.trim());
          const high = parseFloat(cols[5].innerText.replace(/,/g, "").trim());
          const low = parseFloat(cols[6].innerText.replace(/,/g, "").trim());
          const volume = parseFloat(cols[7].innerText.replace(/,/g, "").trim());

          if (symbol && !isNaN(price)) {
            data.push({
              symbol,
              name: symbol, // ShareSansar live table doesn't have full name, use Symbol for now
              price,
              change,
              high,
              low,
              quantity: volume,
            });
          }
        }
      });
      return data;
    });

    console.log(`📦 Scraped ${stocks.length} stocks.`);

    if (stocks.length > 0) {
      // 8. Save to MongoDB
      // Calculate "Today" in Nepal Time
      const nepalTime = new Date(new Date().getTime() + 20700000); // UTC + 5:45
      const todayStr = nepalTime.toISOString().split("T")[0];

      await DailyMarket.findOneAndUpdate(
        { date: todayStr },
        {
          date: todayStr,
          stocks: stocks,
        },
        { upsert: true, new: true }
      );
      console.log(`💾 Saved/Updated data for ${todayStr}`);
    } else {
      console.log("⚠️ No data found. Market might be closed.");
    }
  } catch (error) {
    console.error("❌ Scraper Failed:", error.message);
  } finally {
    if (browser) await browser.close();
    await mongoose.disconnect();
    console.log("🏁 Scraper finished.");
    process.exit();
  }
};

scrapeLiveMarket();
