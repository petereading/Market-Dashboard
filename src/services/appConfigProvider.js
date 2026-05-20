const fallbackConfig = {
  profileStorage: "local",
  supabase: {
    enabled: false,
    url: "",
    publishableKey: ""
  },
  stage1: {
    memberId: ""
  }
};

const configUrls = ["/app-config.json", "/public/app-config.json"];

function normalizeConfig(config) {
  const supabaseUrl = String(config?.supabase?.url ?? "").trim();
  const supabasePublishableKey = String(config?.supabase?.publishableKey ?? "").trim();
  const profileStorage = config?.profileStorage === "supabase" ? "supabase" : "local";

  return {
    ...fallbackConfig,
    ...config,
    profileStorage,
    supabase: {
      enabled: Boolean(config?.supabase?.enabled && supabaseUrl && supabasePublishableKey),
      url: supabaseUrl,
      publishableKey: supabasePublishableKey
    },
    stage1: {
      memberId: String(config?.stage1?.memberId ?? "").trim()
    }
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Config fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function loadAppConfig() {
  if (typeof fetch !== "function") {
    return fallbackConfig;
  }

  for (const configUrl of configUrls) {
    try {
      return normalizeConfig(await fetchJson(configUrl));
    } catch {
      continue;
    }
  }

  return fallbackConfig;
}
