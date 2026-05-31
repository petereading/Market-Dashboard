import { stage1Symbols } from "./stage1Symbols.js";

const basePrices = {
  "^HSI": 26080,
  "^HSCE": 9480,
  "^GSPC": 6845,
  "^IXIC": 22860,
  "^NDX": 25140,
  "0700.HK": 628,
  "9988.HK": 158,
  "3690.HK": 116,
  "0005.HK": 104,
  "1299.HK": 72,
  AAPL: 286,
  MSFT: 512,
  NVDA: 188,
  AMZN: 234,
  META: 642,
  TSLA: 418,
  "BTC-USD": 116500,
  "ETH-USD": 4260,
  "GC=F": 3920,
  "CL=F": 78,
  "GBPHKD=X": 10.32,
  "AUDHKD=X": 5.08,
  "CADHKD=X": 5.72
};

const statusCycle = ["強勢", "改善中", "中性", "轉弱", "弱勢"];
const maPeriods = [20, 50, 100, 150, 200];

function createPriceSeries(symbol, base) {
  const seed = Array.from(symbol).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const today = new Date("2026-05-19T00:00:00Z");

  return Array.from({ length: 90 }, (_, index) => {
    const daysBack = 89 - index;
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - daysBack);

    const wave = Math.sin((index + seed) / 8) * 0.05;
    const drift = (index - 45) * 0.0012;
    const noise = Math.cos((index + seed) / 3) * 0.015;
    const close = base * (1 + wave + drift + noise);
    const open = index === 0 ? close * 0.995 : base * (1 + Math.sin((index - 1 + seed) / 8) * 0.05 + (index - 46) * 0.0012);
    const high = Math.max(open, close) * (1 + 0.004 + (index % 4) * 0.001);
    const low = Math.min(open, close) * (1 - 0.004 - (index % 3) * 0.001);

    return {
      date: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(base > 100 ? 2 : 4)),
      high: Number(high.toFixed(base > 100 ? 2 : 4)),
      low: Number(low.toFixed(base > 100 ? 2 : 4)),
      close: Number(close.toFixed(base > 100 ? 2 : 4))
    };
  });
}

function createIndicatorHistory(prices) {
  const closes = prices.map((point) => point.close);

  return prices.map((point, index) => {
    const window = closes.slice(Math.max(0, index - 119), index + 1);
    const low = Math.min(...window);
    const high = Math.max(...window);
    const prValue = high === low ? 50 : ((closes[index] - low) / (high - low)) * 100;
    const prValues = closes.slice(0, index + 1).map((close, prIndex) => {
      const prWindow = closes.slice(Math.max(0, prIndex - 119), prIndex + 1);
      const prLow = Math.min(...prWindow);
      const prHigh = Math.max(...prWindow);
      return prHigh === prLow ? 50 : ((close - prLow) / (prHigh - prLow)) * 100;
    });
    const smaWindow = prValues.slice(-10);
    const sma1 = smaWindow.reduce((sum, value) => sum + value, 0) / smaWindow.length;

    return {
      date: point.date,
      prValue: Number(prValue.toFixed(1)),
      sma1: Number(sma1.toFixed(1))
    };
  });
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createMaHistory(prices) {
  const closes = prices.map((point) => Number(point.close));

  return Object.fromEntries(
    maPeriods.map((period) => [
      String(period),
      prices.map((point, index) => {
        const window = closes.slice(Math.max(0, index - period + 1), index + 1);
        return {
          date: point.date,
          value: Number(average(window).toFixed(4))
        };
      })
    ])
  );
}

export const mockSnapshots = stage1Symbols.map((definition, index) => {
  const base = basePrices[definition.symbol] ?? 100;
  const prices = createPriceSeries(definition.symbol, base);
  const history = createIndicatorHistory(prices);
  const maHistory = createMaHistory(prices);
  const price = prices.at(-1)?.close ?? base;
  const monthDivider = Number((price * (0.95 + (index % 5) * 0.015)).toFixed(base > 100 ? 2 : 4));
  const prValue = 42 + ((index * 7) % 51);
  const sma1 = 48 + ((index * 5) % 36);
  const status = statusCycle[index % statusCycle.length];

  return {
    definition,
    prices,
    indicator: {
      symbol: definition.symbol,
      asOf: "2026-05-19",
      price,
      dailyChangePct: Number((((index % 7) - 3) * 0.42).toFixed(2)),
      prValue,
      sma1,
      prMinusSma: prValue - sma1,
      movingAverages: Object.fromEntries(
        maPeriods.map((period) => [String(period), maHistory[String(period)].at(-1)?.value ?? price])
      ),
      maHistory,
      dividers: {
        week: Number((price * 0.985).toFixed(base > 100 ? 2 : 4)),
        month: monthDivider,
        quarter: Number((price * 0.93).toFixed(base > 100 ? 2 : 4)),
        year: Number((price * 0.86).toFixed(base > 100 ? 2 : 4))
      },
      pricePosition: price >= monthDivider ? "高於月分界" : "低於月分界",
      distanceToMonthPct: Number((((price - monthDivider) / monthDivider) * 100).toFixed(2)),
      status,
      rank: index + 1,
      signal: prValue > sma1 ? "動能改善" : "等待確認",
      history
    },
    coachSummary:
      status === "強勢" || status === "改善中"
        ? "圖表節奏偏向改善，重點是價格能否守在月分界上方，並讓 PR 值維持高於 SMA1。"
        : "圖表仍需要確認，重點不是單日反彈，而是能否重新站回關鍵分界並延續。",
    newsSummary: "Stage 1 使用示範新聞摘要；正式版本會接入新聞來源並按 symbol 生成週度重點。",
    fundamentalsSummary: "Stage 1 使用示範基本面欄位；正式版本會加入市值、估值、盈利及增長資料。"
  };
});
