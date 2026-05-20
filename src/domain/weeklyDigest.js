export function buildWeeklyDigest(snapshots, tier, includeSymbolDetails) {
  const improving = snapshots.filter((item) => item.indicator.prMinusSma > 0);
  const aboveMonth = snapshots.filter((item) => item.indicator.distanceToMonthPct >= 0);
  const weakest = [...snapshots].sort((a, b) => a.indicator.prValue - b.indicator.prValue)[0];
  const strongest = [...snapshots].sort((a, b) => b.indicator.prValue - a.indicator.prValue)[0];

  const lines = [
    "一句話總結",
    `本週追蹤清單中，${improving.length} 個 symbol 的 PR 值高於 SMA1，${aboveMonth.length} 個仍站在月分界上方，整體屬於需要分層觀察的狀態。`,
    "",
    "本週焦點",
    strongest
      ? `${strongest.definition.displayName} 暫時是清單內相對較強的項目，重點是動能能否維持而不是單日價格表現。`
      : "暫未有足夠資料判斷相對強弱。",
    weakest
      ? `${weakest.definition.displayName} 的 PR 值相對落後，若價格仍低於月分界，應先視為修復不足。`
      : "",
    "",
    "先教你看圖",
    "PR 值可視為動能溫度計，SMA1 則幫助判斷動能是否正在改善。價格站在月分界上方時，代表節奏較容易由弱轉穩；若跌回分界下方，原本的改善訊號需要下調可信度。",
    "",
    "風險提示",
    "這是圖表閱讀、教育及研究用途，不構成投資建議。"
  ].filter(Boolean);

  if (tier === "paid" && includeSymbolDetails) {
    lines.splice(
      lines.length - 2,
      0,
      "",
      "個別 symbol 摘要",
      ...snapshots.slice(0, 5).map((item, index) => {
        const marker = ["第一", "第二", "第三", "第四", "第五"][index];
        return `${marker}，${item.definition.displayName}：${item.coachSummary}`;
      })
    );
  }

  return lines.join("\n");
}
