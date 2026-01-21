/**
 * The "Robo-Advisor" Brain 🧠
 * Analyzes technical indicators and generates human-readable conclusions.
 */

const analyzeStock = (symbol, price, indicators) => {
  let signals = [];
  let score = 0;

  const { rsi, macd, ema50, ema200, volume, averageVolume } = indicators;

  // --- 1. RSI ANALYSIS ---
  if (rsi < 30) {
    score += 2; // Strong Buy signal
    signals.push({
      type: "BULLISH",
      indicator: "RSI",
      message: `RSI is ${rsi.toFixed(
        1
      )} (Oversold). The stock may be undervalued and due for a bounce.`,
      score: 2,
    });
  } else if (rsi > 70) {
    score -= 2; // Strong Sell signal
    signals.push({
      type: "BEARISH",
      indicator: "RSI",
      message: `RSI is ${rsi.toFixed(
        1
      )} (Overbought). The stock may be overvalued and due for a correction.`,
      score: -2,
    });
  } else if (rsi > 50 && rsi < 70) {
    score += 0.5;
    signals.push({
      type: "BULLISH",
      indicator: "RSI",
      message: `RSI is ${rsi.toFixed(
        1
      )} (Bullish Zone). Momentum is positive but not overheated.`,
      score: 0.5,
    });
  }

  // --- 2. MACD ANALYSIS ---
  // Bullish Crossover: MACD Line crosses ABOVE Signal Line
  if (macd.value > macd.signal) {
    score += 1.5;
    signals.push({
      type: "BULLISH",
      indicator: "MACD",
      message:
        "MACD Line has crossed above the Signal Line (Bullish Crossover).",
      score: 1.5,
    });
  } else if (macd.value < macd.signal) {
    score -= 1.5;
    signals.push({
      type: "BEARISH",
      indicator: "MACD",
      message:
        "MACD Line has crossed below the Signal Line (Bearish Crossover).",
      score: -1.5,
    });
  }

  // --- 3. TREND ANALYSIS (EMA) ---
  // Golden Cross / Death Cross logic would go here if we tracked history,
  // but for now we check Price vs EMA.
  if (price > ema200) {
    score += 2;
    signals.push({
      type: "BULLISH",
      indicator: "Trend",
      message: "Price is above the 200-day EMA. The long-term trend is Up.",
      score: 2,
    });
  } else {
    score -= 2;
    signals.push({
      type: "BEARISH",
      indicator: "Trend",
      message: "Price is below the 200-day EMA. The long-term trend is Down.",
      score: -2,
    });
  }

  // --- 4. VOLUME ANALYSIS ---
  if (volume > averageVolume * 1.5) {
    // High volume validates the trend.
    // If score is positive, high volume is good. If negative, it's bad.
    const type = score > 0 ? "BULLISH" : "BEARISH";
    const impact = score > 0 ? 1 : -1;
    score += impact;

    signals.push({
      type: type,
      indicator: "Volume",
      message: `Volume is 50% higher than average. This confirms the current ${type.toLowerCase()} trend.`,
      score: impact,
    });
  }

  // --- 5. FINAL VERDICT ---
  let recommendation = "HOLD";
  if (score >= 4) recommendation = "STRONG BUY";
  else if (score >= 1.5) recommendation = "BUY";
  else if (score <= -4) recommendation = "STRONG SELL";
  else if (score <= -1.5) recommendation = "SELL";

  return {
    signals,
    totalScore: score,
    recommendation,
  };
};

module.exports = { analyzeStock };
