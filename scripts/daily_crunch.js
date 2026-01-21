require("dotenv").config();
const mongoose = require("mongoose");
const DailyMarket = require("../models/DailyMarket");
const StockAnalysis = require("../models/StockAnalysis");
const {
  calculateRSI,
  calculateMACD,
  calculateEMA,
  calculateSMA,
} = require("../utils/indicators");
const { analyzeStock } = require("../utils/analyzer");

// CONFIGURATION
const DAYS_REQUIRED_FOR_MACD = 35; // We need at least this much history to be accurate

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

const runDailyCrunch = async () => {
  await connectDB();
  console.log("🧠 Starting Daily Crunch Analysis...");

  // 1. Get all unique symbols from the database
  // We use a distinct query to find every company you have data for
  // (This might take a moment if you have millions of records, but for NEPSE it's fast)
  console.log("🔍 Finding active companies...");
  const days = await DailyMarket.find().limit(1).sort({ date: -1 }); // Get latest date
  if (days.length === 0) {
    console.log("❌ No data found in DailyMarket. Run the seeder first!");
    process.exit();
  }

  // We get the list of stocks from the MOST RECENT day to ensure they are active
  const latestDay = days[0];
  const activeSymbols = latestDay.stocks.map((s) => s.symbol);

  console.log(
    `📊 Found ${activeSymbols.length} companies active on ${latestDay.date}. Analyzing...`
  );

  for (const symbol of activeSymbols) {
    // 2. Fetch History for this stock (Sorted Oldest -> Newest)
    // We need about 200 days to calculate accurate EMA-200 and warmed-up RSI
    const history = await DailyMarket.aggregate([
      { $match: { "stocks.symbol": symbol } },
      { $sort: { date: 1 } }, // Oldest first
      {
        $project: {
          date: 1,
          stock: {
            $filter: {
              input: "$stocks",
              as: "s",
              cond: { $eq: ["$$s.symbol", symbol] },
            },
          },
        },
      },
      { $unwind: "$stock" }, // Flatten array
    ]);

    if (history.length < DAYS_REQUIRED_FOR_MACD) {
      // console.log(`⚠️ Skipping ${symbol}: Not enough history (${history.length} days)`);
      continue;
    }

    // 3. Prepare Arrays for Math
    const closes = history.map((d) => d.stock.price);
    const volumes = history.map((d) => d.stock.quantity || 0); // Assuming quantity exists, else 0

    // 4. Calculate Indicators
    // We only care about the LAST value (Today's value) for the dashboard
    const rsiArray = calculateRSI(closes);
    const macdData = calculateMACD(closes);
    const ema50Array = calculateEMA(closes, 50);
    const ema200Array = calculateEMA(closes, 200);
    const avgVolArray = calculateSMA(volumes, 20); // 20-day Average Volume

    // Get the latest values (last index)
    const lastIdx = closes.length - 1;

    const indicators = {
      rsi: rsiArray[lastIdx],
      macd: {
        value: macdData.macdLine[lastIdx],
        signal: macdData.signalLine[lastIdx],
        histogram: macdData.histogram[lastIdx],
      },
      ema50: ema50Array[lastIdx],
      ema200: ema200Array[lastIdx],
      volume: volumes[lastIdx],
      averageVolume: avgVolArray[lastIdx],
    };

    // 5. RUN THE BRAIN 🧠
    // This generates the text explanation and Buy/Sell score
    const currentPrice = closes[lastIdx];
    const analysisResult = analyzeStock(symbol, currentPrice, indicators);

    // 6. Save to DB
    // We use findOneAndUpdate with upsert: true (Create if new, Update if exists)
    await StockAnalysis.findOneAndUpdate(
      { symbol: symbol },
      {
        date: latestDay.date,
        lastPrice: currentPrice,
        // change: history[lastIdx].stock.change || 0, // If you have change data
        indicators: indicators,
        signals: analysisResult.signals,
        totalScore: analysisResult.totalScore,
        recommendation: analysisResult.recommendation,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    process.stdout.write(
      `✅ Analyzed ${symbol}: ${analysisResult.recommendation} (Score: ${analysisResult.totalScore})\r`
    );
  }

  console.log("\n🎉 Daily Crunch Complete! All signals updated.");
  process.exit();
};

runDailyCrunch();
