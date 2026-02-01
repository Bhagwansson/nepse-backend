const DailyMarket = require("../models/DailyMarket");
const axios = require("axios");
const cheerio = require("cheerio");

// --- 1. INDICATOR MATH FUNCTIONS ---

// Exponential Moving Average (EMA)
const calculateEMA = (prices, period) => {
  const k = 2 / (period + 1);
  let emaArray = [prices[0]]; // Start with simple price

  for (let i = 1; i < prices.length; i++) {
    const newEma = prices[i] * k + emaArray[i - 1] * (1 - k);
    emaArray.push(newEma);
  }
  return emaArray;
};

// MACD (12, 26, 9)
const calculateMACD = (prices) => {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  // MACD Line = EMA12 - EMA26
  // We need to slice arrays to match lengths (start from index 26)
  const macdLine = [];
  const minLen = Math.min(ema12.length, ema26.length);

  for (let i = 0; i < minLen; i++) {
    // Only calculate where both exist
    if (i >= 26) {
      macdLine.push(ema12[i] - ema26[i]);
    } else {
      macdLine.push(0); // Filler for start
    }
  }

  // Signal Line = 9-day EMA of MACD Line
  const signalLine = calculateEMA(macdLine.slice(26), 9);

  // Histogram = MACD - Signal
  const currentMACD = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  const histogram = currentMACD - currentSignal;

  return { macd: currentMACD, signal: currentSignal, histogram };
};

// RSI (14)
const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  let rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

// --- 2. LIVE PRICE FETCH (Fixes the "565 vs 1139" issue) ---
const fetchLivePrice = async (symbol) => {
  try {
    // Scrape individual stock page if needed (Fallback)
    // Or simpler: hit the live-trading API we used before
    const url = `https://www.sharesansar.com/live-trading?t=${Date.now()}`;
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $ = cheerio.load(data);

    let foundPrice = null;
    $("table tbody tr").each((i, row) => {
      const cols = $(row).find("td");
      const sym = $(cols[1]).text().trim();
      if (sym === symbol) {
        foundPrice = parseFloat($(cols[2]).text().replace(/,/g, ""));
      }
    });
    return foundPrice;
  } catch (e) {
    return null;
  }
};

// --- 3. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const isPro = !!req.user; // Logic from optionalAuth

    // A. GET DB HISTORY
    const history = await DailyMarket.find({
      "stocks.symbol": symbol.toUpperCase(),
    })
      .sort({ date: 1 })
      .limit(100); // Need ~50-100 days for good MACD/EMA

    let prices = history
      .map((day) => {
        const s = day.stocks.find((st) => st.symbol === symbol.toUpperCase());
        return s ? s.price : null;
      })
      .filter((p) => p !== null);

    // B. LIVE PRICE CHECK (The Fix)
    // If the DB price seems stale (or user reported discrepancy), we try to get the REAL live price
    // and append it to our prices array for calculation
    const livePrice = await fetchLivePrice(symbol.toUpperCase());
    const dbPrice = prices[prices.length - 1];

    if (livePrice && livePrice !== dbPrice) {
      console.log(
        `⚡ Correcting Price: DB says ${dbPrice}, Live is ${livePrice}`
      );
      prices.push(livePrice); // Add live price to history for accurate RSI
    }

    if (prices.length < 30) {
      return res.status(404).json({ msg: "Not enough data for analysis." });
    }

    // C. CALCULATE INDICATORS
    const currentPrice = prices[prices.length - 1];
    const rsiVal = calculateRSI(prices, 14);
    const { macd, signal: macdSignal, histogram } = calculateMACD(prices);
    const ema20 = calculateEMA(prices, 20).pop(); // Get last value

    // D. GENERATE AI VERDICT
    let verdict = "HOLD";
    let score = 50;
    let reasons = [];

    // Logic Rule 1: RSI
    if (rsiVal < 30) {
      reasons.push("RSI is Oversold (Cheap)");
      score += 20;
    } else if (rsiVal > 70) {
      reasons.push("RSI is Overbought (Expensive)");
      score -= 20;
    } else {
      reasons.push("RSI is Neutral");
    }

    // Logic Rule 2: MACD
    if (histogram > 0 && macd > macdSignal) {
      reasons.push("MACD indicates Bullish momentum");
      score += 15;
    } else if (histogram < 0) {
      reasons.push("MACD indicates Bearish pressure");
      score -= 15;
    }

    // Logic Rule 3: EMA Trend
    if (currentPrice > ema20) {
      reasons.push("Price is above 20-day EMA (Uptrend)");
      score += 15;
    } else {
      reasons.push("Price is below 20-day EMA (Downtrend)");
      score -= 15;
    }

    // Final Verdict
    if (score >= 75) verdict = "STRONG BUY";
    else if (score >= 60) verdict = "BUY";
    else if (score <= 35) verdict = "SELL";
    else if (score <= 20) verdict = "STRONG SELL";

    // E. SEND RESPONSE
    res.json({
      symbol: symbol.toUpperCase(),
      price: currentPrice,
      date: new Date(),
      isPro,

      // Free Data
      indicators: {
        rsi: rsiVal, // Send raw number
      },

      // Pro Data (AI Analysis)
      score: isPro ? score : "🔒",
      recommendation: isPro ? verdict : "LOGIN_TO_VIEW",
      signals: isPro ? reasons : ["Login to view AI insights"],

      // Detailed Indicators (For Pro UI)
      details: isPro
        ? {
            macd: macd.toFixed(2),
            ema: ema20.toFixed(2),
            volume: "N/A", // Volume requires separate history tracking
          }
        : null,
    });
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Analysis Failed" });
  }
};

exports.getTopPicks = async (req, res) => {
  res.json([]);
}; // Keep empty for now
