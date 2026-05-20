const defaultProfile = {
  tier: "visitor",
  selectedSymbol: "^HSI",
  followedSymbols: [],
  includeSymbolDetails: true
};

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

function buildRestUrl(config, path, params = {}) {
  const url = new URL(`/rest/v1/${path}`, config.supabase.url);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

async function request(config, path, options = {}) {
  const response = await fetch(buildRestUrl(config, path, options.params), {
    method: options.method ?? "GET",
    headers: {
      apikey: config.supabase.publishableKey,
      Authorization: `Bearer ${config.supabase.publishableKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation",
      ...(options.headers ?? {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadProfile(config, memberId) {
  const [profiles, settings, followedSymbols] = await Promise.all([
    request(config, "member_profiles", {
      params: {
        id: `eq.${memberId}`,
        select: "id,tier"
      }
    }),
    request(config, "member_settings", {
      params: {
        member_id: `eq.${memberId}`,
        select: "selected_symbol,include_symbol_details_in_email"
      }
    }),
    request(config, "member_followed_symbols", {
      params: {
        member_id: `eq.${memberId}`,
        select: "symbol",
        order: "created_at.asc"
      }
    })
  ]);

  const profile = profiles[0];
  if (!profile) {
    return null;
  }

  const setting = settings[0] ?? {};

  return normalizeProfile({
    tier: profile.tier,
    selectedSymbol: setting.selected_symbol,
    includeSymbolDetails: setting.include_symbol_details_in_email,
    followedSymbols: followedSymbols.map((item) => item.symbol)
  });
}

async function saveSettings(config, memberId, profile) {
  await request(config, "member_settings", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      member_id: memberId,
      selected_symbol: profile.selectedSymbol,
      include_symbol_details_in_email: profile.includeSymbolDetails
    }
  });
}

async function saveFollowedSymbols(config, memberId, symbols) {
  await request(config, "member_followed_symbols", {
    method: "DELETE",
    prefer: "return=minimal",
    params: {
      member_id: `eq.${memberId}`
    }
  });

  if (symbols.length === 0) {
    return;
  }

  await request(config, "member_followed_symbols", {
    method: "POST",
    prefer: "return=minimal",
    body: symbols.map((symbol) => ({
      member_id: memberId,
      symbol
    }))
  });
}

export const supabaseMemberProfileStore = {
  canUse(config) {
    return Boolean(
      config?.profileStorage === "supabase" &&
        config?.supabase?.enabled &&
        config?.stage1?.memberId &&
        typeof fetch === "function"
    );
  },

  async load(config) {
    return loadProfile(config, config.stage1.memberId);
  },

  async save(config, profile) {
    const normalized = normalizeProfile(profile);
    const memberId = config.stage1.memberId;

    await saveSettings(config, memberId, normalized);
    await saveFollowedSymbols(config, memberId, normalized.followedSymbols);

    return normalized;
  }
};
