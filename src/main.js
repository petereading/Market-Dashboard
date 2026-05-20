import { canFollowSymbol, entitlements, getTierMessage } from "./domain/entitlements.js";
import { buildWeeklyDigest } from "./domain/weeklyDigest.js";
import { renderMarketChart } from "./services/chartRenderer.js?v=labels-20260520";
import { marketDataProvider } from "./services/marketDataProvider.js";
import { memberProfileStore } from "./services/memberProfileStore.js";

const defaultFollowedSymbols = ["^HSI", "^GSPC", "BTC-USD"];

const state = {
  tier: "visitor",
  selectedSymbol: "^HSI",
  followedSymbols: [],
  query: "",
  chartRange: "6M",
  includeSymbolDetails: true,
  snapshots: [],
  snapshotMeta: null
};

const app = document.querySelector("#app");

if (!app) {
  throw new Error("App root not found");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) < 20 ? 4 : 2
  }).format(value);
}

function getVisibleSnapshots() {
  const query = state.query.trim().toLowerCase();
  const entitlement = entitlements[state.tier];

  return state.snapshots
    .filter((snapshot) => entitlement.canSearchFullUniverse || snapshot.definition.publicDemo)
    .filter((snapshot) => {
      if (!query) {
        return true;
      }

      return `${snapshot.definition.symbol} ${snapshot.definition.displayName}`
        .toLowerCase()
        .includes(query);
    });
}

function getSelectedSnapshot() {
  return (
    state.snapshots.find((snapshot) => snapshot.definition.symbol === state.selectedSymbol) ??
    state.snapshots[0]
  );
}

function getEmailSnapshots() {
  if (state.tier === "visitor") {
    return [];
  }

  const symbols = state.followedSymbols.length > 0 ? state.followedSymbols : defaultFollowedSymbols;
  return symbols
    .map((symbol) => state.snapshots.find((snapshot) => snapshot.definition.symbol === symbol))
    .filter(Boolean);
}

function persistProfile() {
  memberProfileStore.save({
    tier: state.tier,
    selectedSymbol: state.selectedSymbol,
    followedSymbols: state.followedSymbols,
    includeSymbolDetails: state.includeSymbolDetails
  });
}

function clampFollowedSymbols(tier, symbols) {
  const maxFollowedSymbols = entitlements[tier].maxFollowedSymbols;
  if (tier === "visitor") {
    return [];
  }

  return [...new Set(symbols)].slice(0, maxFollowedSymbols);
}

function applyStoredProfile(profile) {
  const tier = entitlements[profile.tier] ? profile.tier : "visitor";
  state.tier = tier;
  const visibleSymbols = new Set(getVisibleSnapshots().map((snapshot) => snapshot.definition.symbol));
  const fallbackSymbol = state.snapshots[0]?.definition.symbol;

  state.followedSymbols = clampFollowedSymbols(tier, profile.followedSymbols ?? []);
  state.includeSymbolDetails = profile.includeSymbolDetails !== false;
  state.selectedSymbol = visibleSymbols.has(profile.selectedSymbol)
    ? profile.selectedSymbol
    : visibleSymbols.values().next().value ?? fallbackSymbol;
}

function handleTierChange(tier) {
  state.tier = tier;
  state.followedSymbols = tier === "visitor" ? [] : defaultFollowedSymbols.slice(0, entitlements[tier].maxFollowedSymbols);

  const visible = getVisibleSnapshots();
  if (!visible.some((snapshot) => snapshot.definition.symbol === state.selectedSymbol)) {
    state.selectedSymbol = visible[0]?.definition.symbol ?? state.snapshots[0]?.definition.symbol;
  }

  persistProfile();
  render();
}

function handleFollowToggle(symbol) {
  const isFollowing = state.followedSymbols.includes(symbol);

  if (isFollowing) {
    state.followedSymbols = state.followedSymbols.filter((item) => item !== symbol);
    persistProfile();
    render();
    return;
  }

  if (canFollowSymbol(state.tier, state.followedSymbols.length)) {
    state.followedSymbols = [...state.followedSymbols, symbol];
    persistProfile();
  }

  render();
}

function renderSidebar() {
  const visibleSnapshots = getVisibleSnapshots();
  const entitlement = entitlements[state.tier];

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-kicker">Math of Stars</span>
        <h1>Market Dashboard</h1>
      </div>

      <section class="tier-switcher">
        <span class="label">Access mode</span>
        <div class="segmented">
          ${["visitor", "free", "paid"]
            .map(
              (tier) => `
                <button class="segment ${state.tier === tier ? "active" : ""}" data-tier="${tier}">
                  ${entitlements[tier].label}
                </button>
              `
            )
            .join("")}
        </div>
        <p class="side-note">${getTierMessage(state.tier)}</p>
      </section>

      <section class="search-block">
        <span class="label">${entitlement.canSearchFullUniverse ? "Search supported symbols" : "Search public demo symbols"}</span>
        <input class="search-input" value="${state.query}" placeholder="Symbol or name" data-search />
      </section>

      <section class="watchlist-block">
        <span class="label">Symbols</span>
        <div class="symbol-list">
          ${visibleSnapshots
            .map((snapshot) => {
              const isFollowing = state.followedSymbols.includes(snapshot.definition.symbol);
              const followDisabled =
                state.tier === "visitor" ||
                (!isFollowing && !canFollowSymbol(state.tier, state.followedSymbols.length));

              return `
                <button class="symbol-button ${state.selectedSymbol === snapshot.definition.symbol ? "active" : ""}" data-symbol="${snapshot.definition.symbol}">
                  <span class="symbol-name">
                    <strong>${snapshot.definition.symbol}</strong>
                    <span>${snapshot.definition.displayName}</span>
                  </span>
                  <span class="follow-button" role="button" data-follow="${snapshot.definition.symbol}" ${followDisabled ? "data-disabled=\"true\"" : ""}>
                    ${isFollowing ? "−" : "+"}
                  </span>
                </button>
              `;
            })
            .join("")}
        </div>
        <p class="side-note">
          Followed: ${state.followedSymbols.length}/${entitlement.maxFollowedSymbols}
        </p>
      </section>
    </aside>
  `;
}

function renderMain() {
  const snapshot = getSelectedSnapshot();
  const emailSnapshots = getEmailSnapshots();
  const entitlement = entitlements[state.tier];
  const digest =
    state.tier === "visitor"
      ? "訪客不會收到 email digest。登入 Patreon 免費會員後，可建立 3 個 symbol 的追蹤清單並收到每週總覽。"
      : buildWeeklyDigest(
          emailSnapshots,
          state.tier,
          entitlement.canIncludeSymbolDetailsInEmail && state.includeSymbolDetails
        );

  return `
    <main class="main">
      <header class="topbar">
        <div>
          <h2>${snapshot.definition.displayName}</h2>
          <span>${snapshot.definition.symbol} · ${snapshot.definition.region} · ${snapshot.definition.assetClass}</span>
        </div>
        <span class="status-pill">${snapshot.indicator.status} · ${snapshot.indicator.signal}</span>
      </header>

      <div class="workspace">
        <section class="chart-section">
          <div class="chart-toolbar">
            <div class="chart-legend">
              <span><i class="legend-swatch price"></i>Price</span>
            </div>
            <div class="range-controls" aria-label="Chart range">
              ${["3M", "6M", "1Y", "All"]
                .map(
                  (range) => `
                    <button class="range-button ${state.chartRange === range ? "active" : ""}" data-range="${range}">
                      ${range}
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="chart-wrap">
            <div class="chart" data-chart></div>
          </div>
          <div class="divider-legend" aria-label="Divider legend">
            <span><i class="legend-dot momentum"></i>動能指數</span>
            <span><i class="legend-dot week"></i>週分界</span>
            <span><i class="legend-dot month"></i>月分界</span>
            <span><i class="legend-dot quarter"></i>季分界</span>
            <span><i class="legend-dot year"></i>年分界</span>
          </div>
          <div class="chart-meta">最後更新日期：${snapshot.indicator.asOf}</div>

          <div class="metric-grid summary-metrics">
            <div class="metric"><span>現價</span><strong>${formatNumber(snapshot.indicator.price)}</strong></div>
            <div class="metric"><span>動能指數</span><strong>${snapshot.indicator.prValue}</strong></div>
          </div>

          <div class="metric-grid">
            <div class="metric"><span>週分界</span><strong>${formatNumber(snapshot.indicator.dividers.week)}</strong></div>
            <div class="metric"><span>月分界</span><strong>${formatNumber(snapshot.indicator.dividers.month)}</strong></div>
            <div class="metric"><span>季分界</span><strong>${formatNumber(snapshot.indicator.dividers.quarter)}</strong></div>
            <div class="metric"><span>年分界</span><strong>${formatNumber(snapshot.indicator.dividers.year)}</strong></div>
          </div>
        </section>

        <section class="insight-section">
          <article class="panel">
            <h3>Chart-reading coach</h3>
            <p>${snapshot.coachSummary}</p>
          </article>
          <article class="panel">
            <h3>News summary</h3>
            <p>${snapshot.newsSummary}</p>
          </article>
          <article class="panel">
            <h3>Fundamental update</h3>
            <p>${snapshot.fundamentalsSummary}</p>
          </article>
          <article class="panel">
            <h3>Weekly email preview</h3>
            ${
              state.tier === "paid"
                ? `<div class="settings-row"><label class="toggle"><input type="checkbox" data-include-details ${state.includeSymbolDetails ? "checked" : ""} /> Include followed symbol details</label></div>`
                : ""
            }
            <pre>${digest}</pre>
          </article>
        </section>
      </div>

      <footer class="footer-note">
        圖表閱讀、教育及研究用途，不構成投資建議。${state.snapshotMeta ? `Data updated ${state.snapshotMeta.generatedAt}; indicator engine ${state.snapshotMeta.indicatorEngine}.` : "Stage 1 uses mock snapshots if the live data file is unavailable."}
      </footer>
    </main>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-tier]").forEach((button) => {
    button.addEventListener("click", () => {
      const tier = button.dataset.tier;
      if (tier) {
        handleTierChange(tier);
      }
    });
  });

  document.querySelector("[data-search]")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  document.querySelectorAll("[data-symbol]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const target = event.target;
      const followTarget = target.closest("[data-follow]");
      if (followTarget) {
        event.stopPropagation();

        if (followTarget.dataset.disabled === "true") {
          return;
        }

        const symbol = followTarget.dataset.follow;
        if (symbol) {
          handleFollowToggle(symbol);
        }
        return;
      }

      const symbol = button.dataset.symbol;
      if (symbol) {
        state.selectedSymbol = symbol;
        persistProfile();
        render();
      }
    });
  });

  document.querySelector("[data-include-details]")?.addEventListener("change", (event) => {
    state.includeSymbolDetails = event.target.checked;
    persistProfile();
    render();
  });

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.range;
      if (range) {
        state.chartRange = range;
        render();
      }
    });
  });
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      ${renderMain()}
    </div>
  `;

  bindEvents();

  const chart = document.querySelector("[data-chart]");
  if (chart) {
    renderMarketChart(chart, getSelectedSnapshot(), state.chartRange);
  }
}

async function boot() {
  const payload = await marketDataProvider.load();
  state.snapshots = payload.snapshots;
  state.snapshotMeta = payload.meta;
  applyStoredProfile(memberProfileStore.load());
  render();
}

void boot();