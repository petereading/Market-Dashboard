const storageKey = "mathofstars.marketDashboard.memberProfile.v1";

const defaultProfile = {
  tier: "visitor",
  selectedSymbol: "^HSI",
  followedSymbols: [],
  includeSymbolDetails: true
};

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function uniqueSymbols(symbols) {
  return [...new Set(symbols.filter((symbol) => typeof symbol === "string" && symbol.trim()))];
}

function normalizeProfile(profile) {
  const tier = ["visitor", "free", "paid"].includes(profile?.tier) ? profile.tier : defaultProfile.tier;

  return {
    ...defaultProfile,
    ...profile,
    tier,
    followedSymbols: tier === "visitor" ? [] : uniqueSymbols(profile?.followedSymbols ?? []),
    includeSymbolDetails: Boolean(profile?.includeSymbolDetails ?? defaultProfile.includeSymbolDetails)
  };
}

export const memberProfileStore = {
  load() {
    if (!canUseLocalStorage()) {
      return { ...defaultProfile };
    }

    try {
      const stored = localStorage.getItem(storageKey);
      return normalizeProfile(stored ? JSON.parse(stored) : defaultProfile);
    } catch {
      return { ...defaultProfile };
    }
  },

  save(profile) {
    const normalized = normalizeProfile(profile);

    if (canUseLocalStorage()) {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    }

    return normalized;
  }
};