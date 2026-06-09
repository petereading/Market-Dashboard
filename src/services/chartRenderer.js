const dividerStyles = [
  ["week", "週分界", "#d946ef"],
  ["month", "月分界", "#ff8a00"],
  ["quarter", "季分界", "#2563eb"],
  ["year", "年分界", "#9ca3af"]
];

const maColors = ["#0f766e", "#7c3aed", "#db2777", "#ca8a04", "#64748b"];

function getLibrary() {
  return window.LightweightCharts;
}

function toCandleData(prices) {
  return prices.map((point, index) => {
    const close = Number(point.close);
    const open = Number(point.open ?? prices[index - 1]?.close ?? close);
    const high = Number(point.high ?? Math.max(open, close));
    const low = Number(point.low ?? Math.min(open, close));

    return {
      time: point.date,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close
    };
  });
}

function buildPrototypeMomentumHistory(snapshot) {
  const source = snapshot.indicator.history;
  if (Array.isArray(source) && source.length > 0) {
    return source.map((point) => ({
      time: point.date,
      prValue: Number(point.prValue),
      sma1: Number(point.sma1)
    }));
  }

  const closes = snapshot.prices.map((point) => Number(point.close));
  return snapshot.prices.map((point, index) => {
    const windowStart = Math.max(0, index - 119);
    const window = closes.slice(windowStart, index + 1);
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
      time: point.date,
      prValue: Number(prValue.toFixed(1)),
      sma1: Number(sma1.toFixed(1))
    };
  });
}

function getRangeCount(range, dataLength) {
  const counts = {
    "3M": 63,
    "6M": 126,
    "1Y": 252
  };

  return Math.min(counts[range] ?? dataLength, dataLength);
}

function applyRange(chart, range, dataLength) {
  if (range === "All" || dataLength <= 0) {
    chart.timeScale().fitContent();
    return;
  }

  const visibleCount = getRangeCount(range, dataLength);
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, dataLength - visibleCount),
    to: dataLength + 2
  });
}

function createBaseChart(container, height, rightPriceScaleVisible = true) {
  const LightweightCharts = getLibrary();

  return LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height,
    autoSize: true,
    layout: {
      background: { type: "solid", color: "#ffffff" },
      textColor: "#4f5b5a",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    },
    grid: {
      vertLines: { color: "#eef0ec" },
      horzLines: { color: "#eef0ec" }
    },
    rightPriceScale: {
      visible: rightPriceScaleVisible,
      borderColor: "#d9ded8"
    },
    timeScale: {
      borderColor: "#d9ded8",
      rightOffset: 4,
      barSpacing: 8,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal
    }
  });
}

function getDividerSeriesData(snapshot, key) {
  const source = snapshot.indicator.dividerHistory?.[key];
  if (Array.isArray(source) && source.length > 0) {
    return source.map((point) => ({
      time: point.date,
      value: Number(point.value)
    }));
  }

  const value = snapshot.indicator.dividers[key];
  return snapshot.prices.map((point) => ({ time: point.date, value }));
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeValue(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function getMaSeriesData(snapshot, period) {
  const closes = snapshot.prices.map((point) => Number(point.close));
  return snapshot.prices.map((point, index) => {
    const window = closes.slice(Math.max(0, index - period + 1), index + 1);
    return {
      time: point.date,
      value: average(window)
    };
  });
}

function getRsiSeriesData(snapshot, period = 14) {
  const closes = snapshot.prices.map((point) => Number(point.close));
  if (closes.length <= period) {
    return [];
  }

  const values = [];
  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gainSum += Math.max(change, 0);
    lossSum += Math.max(-change, 0);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (let index = period; index < closes.length; index += 1) {
    if (index > period) {
      const change = closes[index] - closes[index - 1];
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }

    const rsi = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
    values.push({
      time: snapshot.prices[index].date,
      value: normalizeValue(rsi, 2)
    });
  }

  return values;
}

function getEmaValues(values, period) {
  const multiplier = 2 / (period + 1);
  const emaValues = [];
  let ema = values[0] ?? 0;

  values.forEach((value, index) => {
    ema = index === 0 ? value : value * multiplier + ema * (1 - multiplier);
    emaValues.push(ema);
  });

  return emaValues;
}

function getMacdSeriesData(snapshot, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const closes = snapshot.prices.map((point) => Number(point.close));
  if (closes.length < slowPeriod) {
    return {
      macd: [],
      signal: [],
      histogram: []
    };
  }

  const fastEma = getEmaValues(closes, fastPeriod);
  const slowEma = getEmaValues(closes, slowPeriod);
  const macdValues = closes.map((_close, index) => fastEma[index] - slowEma[index]);
  const signalValues = getEmaValues(macdValues, signalPeriod);

  return {
    macd: macdValues.map((value, index) => ({
      time: snapshot.prices[index].date,
      value: normalizeValue(value, 4)
    })),
    signal: signalValues.map((value, index) => ({
      time: snapshot.prices[index].date,
      value: normalizeValue(value, 4)
    })),
    histogram: macdValues.map((value, index) => {
      const histogram = value - signalValues[index];
      return {
        time: snapshot.prices[index].date,
        value: normalizeValue(histogram, 4),
        color: histogram >= 0 ? "#2f8f83" : "#d9574d"
      };
    })
  };
}

function sanitizeMaPeriods(periods) {
  const values = Array.isArray(periods) ? periods : [];
  const unique = [];

  values.forEach((period) => {
    const value = Math.round(Number(period));
    if (Number.isFinite(value) && value >= 2 && value <= 400 && !unique.includes(value)) {
      unique.push(value);
    }
  });

  return unique.slice(0, 5);
}

function getChartSettings(settings) {
  const multiMa =
    typeof settings?.overlays?.multiMa === "object"
      ? settings.overlays.multiMa
      : {
          enabled: settings?.overlays?.multiMa === true,
          periods: [20, 50, 100, 150, 200]
        };

  return {
    overlays: {
      multiMa: {
        enabled: multiMa.enabled === true,
        periods: sanitizeMaPeriods(multiMa.periods)
      }
    },
    lowerPanes: {
      pr: settings?.lowerPanes?.pr !== false,
      rsi: settings?.lowerPanes?.rsi === true,
      macd: settings?.lowerPanes?.macd === true
    }
  };
}

function syncCrosshair(sourceChart, targetChart, targetSeries, dataByTime) {
  let syncingCrosshair = false;

  sourceChart.subscribeCrosshairMove((param) => {
    if (syncingCrosshair) {
      return;
    }

    if (!param.time) {
      targetChart.clearCrosshairPosition?.();
      return;
    }

    const value = dataByTime.get(param.time);
    if (!Number.isFinite(value)) {
      targetChart.clearCrosshairPosition?.();
      return;
    }

    syncingCrosshair = true;
    targetChart.setCrosshairPosition?.(value, param.time, targetSeries);
    syncingCrosshair = false;
  });
}

export function renderMarketChart(container, snapshot, range = "6M", settings = {}) {
  const LightweightCharts = getLibrary();
  const chartSettings = getChartSettings(settings);
  container.replaceChildren();
  const activeLowerPaneKeys = ["pr", "rsi", "macd"].filter((key) => chartSettings.lowerPanes[key]);
  container.classList.toggle("single-pane", activeLowerPaneKeys.length === 0);

  if (!LightweightCharts) {
    const message = document.createElement("div");
    message.className = "chart-empty";
    message.textContent = "Chart library is loading. Refresh if the chart does not appear.";
    container.append(message);
    return;
  }

  const pricePane = document.createElement("div");
  pricePane.className = "chart-pane price-pane";
  container.append(pricePane);

  const lowerCharts = [];

  const candleData = toCandleData(snapshot.prices);
  const priceChart = createBaseChart(pricePane, 330, true);
  const candleSeries = priceChart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#2f8f83",
    downColor: "#d9574d",
    borderUpColor: "#2f8f83",
    borderDownColor: "#d9574d",
    wickUpColor: "#2f8f83",
    wickDownColor: "#d9574d",
    priceLineVisible: false,
    lastValueVisible: false
  });
  candleSeries.setData(candleData);

  dividerStyles.forEach(([key, _label, color]) => {
    const value = snapshot.indicator.dividers[key];
    if (!Number.isFinite(Number(value))) {
      return;
    }

    const lineSeries = priceChart.addSeries(LightweightCharts.LineSeries, {
      color,
      lineWidth: 2,
      lineType: LightweightCharts.LineType.WithSteps,
      pointMarkersVisible: true,
      pointMarkersRadius: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });
    lineSeries.setData(getDividerSeriesData(snapshot, key));
  });

  if (chartSettings.overlays.multiMa.enabled) {
    chartSettings.overlays.multiMa.periods.forEach((period, index) => {
      const lineSeries = priceChart.addSeries(LightweightCharts.LineSeries, {
        color: maColors[index] ?? "#64748b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false
      });
      lineSeries.setData(getMaSeriesData(snapshot, period));
    });
  }

  const priceCloseByTime = new Map(candleData.map((point) => [point.time, point.close]));

  function addLowerPane(className, height = 150) {
    const pane = document.createElement("div");
    pane.className = `chart-pane ${className}`;
    container.append(pane);

    const chart = createBaseChart(pane, height, true);
    lowerCharts.push({
      chart,
      dataLength: candleData.length
    });
    return chart;
  }

  if (chartSettings.lowerPanes.pr) {
    const momentumHistory = buildPrototypeMomentumHistory(snapshot);
    const momentumChart = addLowerPane("momentum-pane", 150);
    const prSeries = momentumChart.addSeries(LightweightCharts.LineSeries, {
      color: "#245c58",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });
    prSeries.setData(momentumHistory.map((point) => ({ time: point.time, value: point.prValue })));

    const smaSeries = momentumChart.addSeries(LightweightCharts.LineSeries, {
      color: "#b64f36",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    });
    smaSeries.setData(momentumHistory.map((point) => ({ time: point.time, value: point.sma1 })));

    momentumChart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.15, bottom: 0.15 }
    });

    const prByTime = new Map(momentumHistory.map((point) => [point.time, point.prValue]));
    syncCrosshair(priceChart, momentumChart, prSeries, prByTime);
    syncCrosshair(momentumChart, priceChart, candleSeries, priceCloseByTime);
  }

  if (chartSettings.lowerPanes.rsi) {
    const rsiData = getRsiSeriesData(snapshot);
    const rsiChart = addLowerPane("rsi-pane", 130);
    const rsiSeries = rsiChart.addSeries(LightweightCharts.LineSeries, {
      color: "#7c3aed",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });
    rsiSeries.setData(rsiData);
    rsiChart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 }
    });

    const rsiByTime = new Map(rsiData.map((point) => [point.time, point.value]));
    syncCrosshair(priceChart, rsiChart, rsiSeries, rsiByTime);
    syncCrosshair(rsiChart, priceChart, candleSeries, priceCloseByTime);
  }

  if (chartSettings.lowerPanes.macd) {
    const macdData = getMacdSeriesData(snapshot);
    const macdChart = addLowerPane("macd-pane", 150);
    const histogramSeries = macdChart.addSeries(LightweightCharts.HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false
    });
    histogramSeries.setData(macdData.histogram);

    const macdSeries = macdChart.addSeries(LightweightCharts.LineSeries, {
      color: "#245c58",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });
    macdSeries.setData(macdData.macd);

    const signalSeries = macdChart.addSeries(LightweightCharts.LineSeries, {
      color: "#b64f36",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false
    });
    signalSeries.setData(macdData.signal);
    macdChart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.18, bottom: 0.18 }
    });

    const macdByTime = new Map(macdData.macd.map((point) => [point.time, point.value]));
    syncCrosshair(priceChart, macdChart, macdSeries, macdByTime);
    syncCrosshair(macdChart, priceChart, candleSeries, priceCloseByTime);
  }

  applyRange(priceChart, range, candleData.length);
  lowerCharts.forEach(({ chart, dataLength }) => applyRange(chart, range, dataLength));

  let syncingCharts = false;

  priceChart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
    if (syncingCharts) {
      return;
    }
    if (logicalRange) {
      syncingCharts = true;
      lowerCharts.forEach(({ chart }) => chart.timeScale().setVisibleLogicalRange(logicalRange));
      syncingCharts = false;
    }
  });

  lowerCharts.forEach(({ chart }) => {
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (syncingCharts) {
        return;
      }
      if (logicalRange) {
        syncingCharts = true;
        priceChart.timeScale().setVisibleLogicalRange(logicalRange);
        lowerCharts
          .filter((item) => item.chart !== chart)
          .forEach((item) => item.chart.timeScale().setVisibleLogicalRange(logicalRange));
        syncingCharts = false;
      }
    });
  });
}
