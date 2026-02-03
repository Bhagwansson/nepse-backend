const DailyMarket = require("../models/DailyMarket");

// --- 1. MATH ENGINE ---
const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * 13 + change) / 14;
      avgLoss = (avgLoss * 13 + 0) / 14;
    } else {
      avgGain = (avgGain * 13 + 0) / 14;
      avgLoss = (avgLoss * 13 + Math.abs(change)) / 14;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const calculateEMA = (prices, period) => {
  if (!prices || prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  sma /= period;
  let ema = sma;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

const calculateMACD = (prices) => {
  if (!prices || prices.length < 30) return { macd: 0 };
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return { macd: ema12 - ema26 };
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";

    // 🔥 DEVELOPER BYPASS: Force Unlock
    // Change this back to `!!req.user` later when login is ready
    const isPro = true;

    // 1. Fetch History
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(200)
      .lean();

    if (!rawHistory || rawHistory.length === 0) {
      return res.status(404).json({ msg: "No market data found." });
    }

    const history = [...rawHistory].reverse();
    const prices = [];
    const volumes = [];
    let lastDate = new Date();

    history.forEach((day) => {
      if (!day.stocks) return;
      const s = day.stocks.find((st) => st.symbol === cleanSymbol);
      if (s && s.price) {
        prices.push(Number(s.price));

        let vol = 0;
        if (s.volume) {
          if (typeof s.volume === "number") vol = s.volume;
          else if (typeof s.volume === "string")
            vol = parseFloat(s.volume.replace(/,/g, "")) || 0;
        }
        volumes.push(vol);
        lastDate = day.date;
      }
    });

    if (prices.length === 0)
      return res.status(404).json({ msg: "Invalid data." });

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // 3. Calculate Indicators
    const rsiVal = calculateRSI(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const { macd } = calculateMACD(prices);

    const validVolumes = volumes.slice(-20);
    const avgVolume =
      validVolumes.reduce((a, b) => a + b, 0) / (validVolumes.length || 1);
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // 4. Generate Paragraphs
    let score = 50;
    let techText = `Trading volume today was ${currentVolume.toLocaleString()} units. `;

    if (rsiVal < 30) {
      score += 20;
      techText += `The RSI is Oversold at ${rsiVal.toFixed(
        1
      )}, often preceding a bounce. `;
    } else if (rsiVal > 70) {
      score -= 20;
      techText += `The RSI is Overbought at ${rsiVal.toFixed(
        1
      )}, suggesting a pullback. `;
    } else {
      techText += `The RSI is Neutral at ${rsiVal.toFixed(
        1
      )}, showing stable momentum. `;
    }

    if (currentPrice > ema20) {
      score += 15;
      techText += `Price is above the 20-day EMA (Rs. ${ema20.toFixed(
        0
      )}), confirming an uptrend. `;
    } else {
      score -= 15;
      techText += `Price is below the 20-day EMA (Rs. ${ema20.toFixed(
        0
      )}), indicating weakness. `;
    }

    if (macd > 0) {
      score += 10;
      techText += `MACD is positive (${macd.toFixed(
        2
      )}), supporting bullish sentiment. `;
    } else {
      score -= 10;
      techText += `MACD is negative (${macd.toFixed(
        2
      )}), showing bearish pressure. `;
    }

    let recommendation = "HOLD";
    let verdictText = "";
    let color = "#F59E0B";

    if (score >= 70) {
      recommendation = "STRONG BUY";
      color = "#10B981";
      verdictText =
        "Indicators align for a strong upward move. Positive momentum suggests a great entry point.";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
      verdictText =
        "The outlook is positive. Technicals suggest growth; buying on dips is recommended.";
    } else if (score <= 40) {
      recommendation = "SELL";
      color = "#EF4444";
      verdictText =
        "Weakness detected. The trend is downward; consider exiting or waiting.";
    } else if (score <= 25) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
      verdictText =
        "Critical bearish signals. Momentum is negative. Avoid long positions.";
    } else {
      verdictText =
        "The market is undecided. Signals are mixed. Best to wait for a clearer direction.";
    }

    // 5. Response
    const response = {
      symbol: cleanSymbol,
      price: currentPrice,
      date: lastDate,
      indicators: { rsi: Number(rsiVal) },
      isPro,
      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,
      technicalSummary: isPro ? techText : "Login to view detailed analysis.",
      finalVerdict: isPro ? verdictText : "Login to view the AI verdict.",
    };

    if (isPro) {
      response.indicators.macd = Number(macd).toFixed(2);
      response.indicators.ema = Number(ema20).toFixed(2);
      response.indicators.volume = Number(currentVolume).toLocaleString();
    } else {
      response.indicators.macd = "LOCKED";
      response.indicators.ema = "LOCKED";
      response.indicators.volume = "LOCKED";
    }

    res.json(response);
  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getTopPicks = async (req, res) => {
  res.json([]);
};
