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
  const res = 100 - 100 / (1 + rs);
  return isNaN(res) ? 50 : res;
};

const calculateEMA = (prices, period) => {
  if (!prices || prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return isNaN(ema) ? prices[prices.length - 1] : ema;
};

const calculateMACD = (prices) => {
  if (!prices || prices.length < 26) return { macd: 0 };
  const ema12 = calculateEMA(prices.slice(-26), 12);
  const ema26 = calculateEMA(prices.slice(-26), 26);
  const macdLine = ema12 - ema26;
  return { macd: isNaN(macdLine) ? 0 : macdLine };
};

// --- 2. MAIN CONTROLLER ---
exports.getAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cleanSymbol = symbol ? symbol.toUpperCase() : "";
    const isPro = !!req.user;

    // 1. Fetch History
    const rawHistory = await DailyMarket.find({ "stocks.symbol": cleanSymbol })
      .sort({ date: -1 })
      .limit(50)
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

    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // 4. Generate "Smart Paragraphs"
    let score = 50;

    // --- A. Build Technical Summary ---
    let techText = "";

    // RSI Text
    if (rsiVal < 30) {
      score += 20;
      techText += `The RSI is currently oversold at ${rsiVal.toFixed(
        1
      )}, indicating the stock is undervalued and due for a bounce. `;
    } else if (rsiVal > 70) {
      score -= 20;
      techText += `The RSI is overbought at ${rsiVal.toFixed(
        1
      )}, suggesting the price may be too high and could pull back. `;
    } else {
      techText += `The RSI is in the neutral zone at ${rsiVal.toFixed(
        1
      )}, leaving room for price movement in either direction. `;
    }

    // EMA Text
    if (currentPrice > ema20) {
      score += 15;
      techText += `The stock is trading above its 20-day Moving Average (Rs. ${ema20.toFixed(
        0
      )}), confirming a short-term uptrend. `;
    } else {
      score -= 15;
      techText += `The stock is trading below its 20-day Moving Average (Rs. ${ema20.toFixed(
        0
      )}), indicating short-term bearish pressure. `;
    }

    // MACD Text
    if (macd > 0) {
      score += 10;
      techText += `MACD momentum is positive (${macd.toFixed(
        2
      )}), supporting a bullish outlook. `;
    } else {
      score -= 10;
      techText += `MACD momentum is negative (${macd.toFixed(
        2
      )}), suggesting sellers are in control. `;
    }

    // Volume Text
    if (volumeRatio > 1.2)
      techText += `Additionally, trading volume is higher than usual, showing strong conviction in today's move.`;
    else
      techText += `Trading volume is normal, consistent with the recent trend.`;

    // --- B. Build Final Verdict ---
    let recommendation = "HOLD";
    let verdictText = "";
    let color = "#F59E0B";

    if (score >= 70) {
      recommendation = "STRONG BUY";
      color = "#10B981";
      verdictText =
        "All indicators align for a strong upward move. The combination of bullish momentum and uptrend suggests this is a great entry point for buyers.";
    } else if (score >= 60) {
      recommendation = "BUY";
      color = "#34D399";
      verdictText =
        "The technicals look good. While not explosive, the trend is positive and buying on dips is recommended.";
    } else if (score <= 40) {
      recommendation = "SELL";
      color = "#EF4444";
      verdictText =
        "The chart is showing weakness. Indicators suggest the price may drop further, making it a good time to book profits or exit.";
    } else if (score <= 25) {
      recommendation = "STRONG SELL";
      color = "#EF4444";
      verdictText =
        "Significant bearish signals detected. Momentum, trend, and relative strength are all negative. Staying away is advised.";
    } else {
      verdictText =
        "The market is undecided. Indicators are mixed with no clear direction. It is best to wait for a clearer signal before entering a trade.";
    }

    // 5. Response
    const response = {
      symbol: cleanSymbol,
      price: currentPrice,
      date: lastDate,
      indicators: {
        rsi: Number(rsiVal),
      },
      isPro,

      score: isPro ? score : "🔒",
      recommendation: isPro ? recommendation : "LOGIN_TO_VIEW",
      recommendationColor: color,

      // 🔥 NEW FIELDS FOR PARAGRAPHS
      technicalSummary: isPro ? techText : "Login to view detailed analysis.",
      finalVerdict: isPro ? verdictText : "Login to view the AI verdict.",
    };

    if (isPro) {
      response.indicators.macd = Number(macd).toFixed(2);
      response.indicators.ema = Number(ema20).toFixed(2);
      response.indicators.volume = Number(currentVolume).toLocaleString(); // Comma separated (e.g. 12,500)
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
