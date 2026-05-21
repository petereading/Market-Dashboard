const markerWords = ["第一", "第二", "第三", "第四", "第五"];

function sortByPr(snapshots, direction = "desc") {
  return [...snapshots].sort((a, b) => {
    const diff = a.indicator.prValue - b.indicator.prValue;
    return direction === "desc" ? -diff : diff;
  });
}

function toSummaryItem(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    symbol: snapshot.definition.symbol,
    displayName: snapshot.definition.displayName,
    prValue: snapshot.indicator.prValue,
    status: snapshot.indicator.status,
    signal: snapshot.indicator.signal,
    pricePosition: snapshot.indicator.pricePosition
  };
}

function summarizeUniverse(snapshots) {
  const improving = snapshots.filter((item) => item.indicator.prMinusSma > 0);
  const aboveMonth = snapshots.filter((item) => item.indicator.distanceToMonthPct >= 0);
  const strongest = sortByPr(snapshots, "desc")[0] ?? null;
  const weakest = sortByPr(snapshots, "asc")[0] ?? null;

  return {
    total: snapshots.length,
    improvingCount: improving.length,
    aboveMonthCount: aboveMonth.length,
    strongest: toSummaryItem(strongest),
    weakest: toSummaryItem(weakest)
  };
}

function buildDigestText(report) {
  const strongest = report.summary.strongest;
  const weakest = report.summary.weakest;
  const lines = [
    "一句話總結",
    `本週追蹤清單中，${report.summary.improvingCount} 個 symbol 的 PR 值高於 SMA1，${report.summary.aboveMonthCount} 個仍站在月分界上方，整體屬於需要分層觀察的狀態。`,
    "",
    "本週焦點",
    strongest
      ? `${strongest.displayName} 暫時是清單內相對較強的項目，重點是動能能否維持而不是單日價格表現。`
      : "暫未有足夠資料判斷相對強弱。",
    weakest
      ? `${weakest.displayName} 的 PR 值相對落後，若價格仍低於月分界，應先視為修復不足。`
      : "",
    "",
    "先教你看圖",
    "PR 值可視為動能溫度計，SMA1 則幫助判斷動能是否正在改善。價格站在月分界上方時，代表節奏較容易由弱轉穩；若跌回分界下方，原本的改善訊號需要下調可信度。",
    "",
    "風險提示",
    "這是圖表閱讀、教育及研究用途，不構成投資建議。"
  ].filter(Boolean);

  if (report.includeSymbolDetails) {
    lines.splice(
      lines.length - 2,
      0,
      "",
      "個別 symbol 摘要",
      ...report.symbolDetails.slice(0, 5).map((item, index) => {
        const marker = markerWords[index] ?? `${index + 1}`;
        return `${marker}，${item.displayName}：${item.coachSummary}`;
      })
    );
  }

  return lines.join("\n");
}

function buildSymbolDetails(snapshots) {
  return snapshots.map((snapshot) => ({
    symbol: snapshot.definition.symbol,
    displayName: snapshot.definition.displayName,
    assetClass: snapshot.definition.assetClass,
    region: snapshot.definition.region,
    asOf: snapshot.indicator.asOf,
    price: snapshot.indicator.price,
    prValue: snapshot.indicator.prValue,
    sma1: snapshot.indicator.sma1,
    prMinusSma: snapshot.indicator.prMinusSma,
    rank: snapshot.indicator.rank,
    status: snapshot.indicator.status,
    signal: snapshot.indicator.signal,
    pricePosition: snapshot.indicator.pricePosition,
    distanceToMonthPct: snapshot.indicator.distanceToMonthPct,
    dividers: snapshot.indicator.dividers,
    coachSummary: snapshot.coachSummary,
    newsSummary: snapshot.newsSummary,
    fundamentalsSummary: snapshot.fundamentalsSummary
  }));
}

export function buildWeeklyReport(snapshots, options = {}) {
  const tier = options.tier ?? "free";
  const includeSymbolDetails = Boolean(tier === "paid" && options.includeSymbolDetails);
  const reportSnapshots = snapshots.filter(Boolean);
  const summary = summarizeUniverse(reportSnapshots);
  const symbolDetails = buildSymbolDetails(reportSnapshots);
  const report = {
    title: options.title ?? "Market Dashboard Weekly Digest",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    tier,
    includeSymbolDetails,
    summary,
    symbolDetails
  };

  return {
    ...report,
    digestText: buildDigestText(report)
  };
}
