export const entitlements = {
  visitor: {
    tier: "visitor",
    label: "Visitor",
    maxFollowedSymbols: 0,
    canSearchFullUniverse: false,
    canReceiveEmail: false,
    canIncludeSymbolDetailsInEmail: false
  },
  free: {
    tier: "free",
    label: "Free member",
    maxFollowedSymbols: 3,
    canSearchFullUniverse: false,
    canReceiveEmail: true,
    canIncludeSymbolDetailsInEmail: false
  },
  paid: {
    tier: "paid",
    label: "Paid member",
    maxFollowedSymbols: 20,
    canSearchFullUniverse: true,
    canReceiveEmail: true,
    canIncludeSymbolDetailsInEmail: true
  }
};

export function canFollowSymbol(tier, currentCount) {
  return currentCount < entitlements[tier].maxFollowedSymbols;
}

export function getTierMessage(tier) {
  if (tier === "visitor") {
    return "訪客可查看精選市場示範圖表；登入 Patreon 後可建立個人追蹤清單。";
  }

  if (tier === "free") {
    return "免費會員可追蹤最多 3 個 symbol，週報只提供整體 digest，不含逐一 symbol 詳解。";
  }

  return "付費會員可追蹤最多 20 個 symbol，並可選擇在週報加入個別 symbol 解讀。";
}
