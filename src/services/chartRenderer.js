const dividerStyles = [
  ["week", "週分界", "#d946ef"],
  ["month", "月分界", "#ff8a00"],
  ["quarter", "季分界", "#2563eb"],
  ["year", "年分界", "#9ca3af"]
];

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

export function renderMarketChart(container, snapshot, range = "6M") {
  const LightweightCharts = getLibrary();
  container.replaceChildren();

  if (!LightweightCharts) {
    const message = document.createElement("div");
    message.className = "chart-empty";
    message.textContent = "Chart library is loading. Refresh if the chart does not appear.";
    container.append(message);
    return;
  }

  const pricePane = document.createElement("div");
  pricePane.className = "chart-pane price-pane";
  const momentumPane = document.createElement("div");
  momentumPane.className = "chart-pane momentum-pane";
  container.append(pricePane, momentumPane);

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

  const momentumHistory = buildPrototypeMomentumHistory(snapshot);
  const momentumChart = createBaseChart(momentumPane, 150, true);
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

  applyRange(priceChart, range, candleData.length);
  applyRange(momentumChart, range, momentumHistory.length);

  let syncingCharts = false;

  priceChart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
    if (syncingCharts) {
      return;
    }
    if (logicalRange) {
      syncingCharts = true;
      momentumChart.timeScale().setVisibleLogicalRange(logicalRange);
      syncingCharts = false;
    }
  });

  momentumChart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
    if (syncingCharts) {
      return;
    }
    if (logicalRange) {
      syncingCharts = true;
      priceChart.timeScale().setVisibleLogicalRange(logicalRange);
      syncingCharts = false;
    }
  });
}
