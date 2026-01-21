const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "db.json");
const DAYS_TO_GENERATE = 30;

// Helper to get random price change
const getFluctuation = (price) => {
  const changePercent = Math.random() * 4 - 2; // -2% to +2%
  return Math.floor(price * (1 + changePercent / 100));
};

// 1. Get the real stocks from your current scrape
if (!fs.existsSync(DB_FILE)) {
  console.log(
    "❌ No DB file found. Run 'node index.js' and visit the API first!"
  );
  process.exit(1);
}

const currentData = JSON.parse(fs.readFileSync(DB_FILE));
// We take the most recent entry (today's real data) as the baseline
const realStocks = currentData[currentData.length - 1].stocks;

console.log(`🌱 Seeding history based on ${realStocks.length} real stocks...`);

const newHistory = [];

// 2. Generate past 30 days
for (let i = DAYS_TO_GENERATE; i > 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const dateStr = d.toISOString().split("T")[0]; // e.g., "2025-12-15"

  // Create a version of the market for this past day
  const dailyStocks = realStocks.map((stock) => {
    // We slightly randomize the price so the chart looks real
    return {
      symbol: stock.symbol,
      name: stock.name,
      price: getFluctuation(stock.price),
      change: 0, // Irrelevant for history chart
    };
  });

  newHistory.push({
    date: dateStr,
    stocks: dailyStocks,
  });
}

// 3. Add Today's Real Data at the end
newHistory.push(currentData[currentData.length - 1]);

// 4. Save
fs.writeFileSync(DB_FILE, JSON.stringify(newHistory, null, 2));
console.log(`✅ Success! Added ${DAYS_TO_GENERATE} days of history to db.json`);
