require("dotenv").config();
const mongoose = require("mongoose");
const puppeteer = require("puppeteer");

// --- CONFIGURATION ---
const START_DATE = new Date("2025-09-10"); // Resume from where you got stuck
const HIGH_RES_CUTOFF = new Date("2024-01-01");
const STOP_DATE = new Date("2010-01-01");
let lastFingerprint = 0;

// --- MONGO SETUP ---
const stockSchema = new mongoose.Schema({
  date: String,
  stocks: Array,
});
const DailyMarket = mongoose.model("DailyMarket", stockSchema);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

const launchBrowser = async () => {
  console.log("🚀 Launching Fresh Browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  return { browser, page };
};

const scrapeDateWithPuppeteer = async (page, dateStr) => {
  console.log(`\n⏳ Navigating to ${dateStr}...`);

  // 1. Load Page
  await page.goto("https://www.sharesansar.com/today-share-price", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // 2. Handle Cloudflare/Security
  const title = await page.title();
  if (title.includes("Just a moment") || title.includes("Security")) {
    console.log("   🛡️ Security Check. Waiting 10s...");
    await new Promise((r) => setTimeout(r, 10000));
  }

  // 3. THE NUCLEAR OPTION: Inject Date & Click via JavaScript ☢️
  // We don't use page.type() anymore. We force the value directly into the DOM.
  const tableUpdated = await page.evaluate(async (date) => {
    const dateInput = document.querySelector("#fromdate");
    const searchBtn = document.querySelector("#btn_todayshareprice_submit");

    if (!dateInput || !searchBtn) return false;

    // Force the value
    dateInput.value = date;

    // Manually trigger events so the site "knows" we changed it
    dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    dateInput.dispatchEvent(new Event("blur", { bubbles: true }));

    // Wait a tiny bit for the UI to digest the date
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Force the click
    searchBtn.click();
    return true;
  }, dateStr);

  if (!tableUpdated) {
    console.log("   ❌ Input/Button not found in DOM.");
    return { stocks: [], sum: 0, error: "DOM_ERROR" };
  }

  // 4. Wait for the table to actually CHANGE
  // We wait up to 5 seconds for the "Loading" indicator or table refresh
  await new Promise((r) => setTimeout(r, 3000));

  // 5. Scrape
  const result = await page.evaluate(() => {
    const rows = document.querySelectorAll("#headFixed tbody tr");
    const data = [];
    let totalSum = 0;

    rows.forEach((row) => {
      const tds = row.querySelectorAll("td");
      if (tds.length > 5) {
        const symbol = tds[1].innerText.trim();
        const name = tds[2].innerText.trim();
        const price = parseFloat(tds[6].innerText.replace(/,/g, "").trim());

        if (symbol && !isNaN(price)) {
          data.push({ symbol, name, price, change: 0 });
          totalSum += price;
        }
      }
    });
    return { stocks: data, sum: totalSum };
  });

  return result;
};

const runSelfHealingSeeder = async () => {
  await connectDB();

  let { browser, page } = await launchBrowser();
  let currentDate = new Date(START_DATE);
  let crashCount = 0;

  while (currentDate >= STOP_DATE) {
    const dateStr = currentDate.toISOString().split("T")[0];

    // Weekly Logic (Skip non-Sundays for older years)
    if (currentDate < HIGH_RES_CUTOFF && currentDate.getDay() !== 0) {
      currentDate.setDate(currentDate.getDate() - 1);
      continue;
    }

    const exists = await DailyMarket.exists({ date: dateStr });
    if (exists) {
      console.log(`⏩ SKIPPING ${dateStr} (Already in DB)`);
    } else {
      try {
        const { stocks, sum, error } = await scrapeDateWithPuppeteer(
          page,
          dateStr
        );

        if (error) throw new Error(error);

        if (stocks.length > 20) {
          if (sum === lastFingerprint) {
            // If it's a duplicate, we RETRY the same date once more before skipping
            if (crashCount === 0) {
              console.log(
                `⚠️ Potential Glitch (Duplicate). Retrying ${dateStr}...`
              );
              crashCount++; // Mark as retrying
              continue; // Don't change date, try loop again
            } else {
              console.log(`⛔ DUPLICATE CONFIRMED (Market Closed?). Skipping.`);
              crashCount = 0;
            }
          } else {
            await DailyMarket.create({ date: dateStr, stocks });
            const marker =
              currentDate < HIGH_RES_CUTOFF ? "⭐ WEEKLY" : "DAILY";
            console.log(
              `✅ SAVED [${marker}] ${
                stocks.length
              } records for ${dateStr} [FP: ${sum.toFixed(0)}]`
            );
            lastFingerprint = sum;
            crashCount = 0;
          }
        } else {
          console.log(`⛔ EMPTY / HOLIDAY: ${dateStr}`);
        }
      } catch (error) {
        console.log(`❌ CRASH: ${error.message}. Restarting...`);
        try {
          await browser.close();
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 5000));
        ({ browser, page } = await launchBrowser());
        continue;
      }
    }

    currentDate.setDate(currentDate.getDate() - 1);

    // Memory cleanup every 30 pages
    if (currentDate.getDate() % 30 === 0) {
      console.log("🧹 Routine Restart...");
      try {
        await browser.close();
      } catch (e) {}
      ({ browser, page } = await launchBrowser());
    }
  }

  await browser.close();
  process.exit();
};

runSelfHealingSeeder();
