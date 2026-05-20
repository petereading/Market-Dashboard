import { canFollowSymbol, entitlements, getTierMessage } from "./domain/entitlements.js";
import { buildWeeklyDigest } from "./domain/weeklyDigest.js";
import { marketDataProvider } from "./services/marketDataProvider.js";

const defaultFollowedSymbols = ["^HSI", "^GSPC", "BTC-USD"];

const state = {
  tier: "visitor",
  selectedSymbol: "^HSI",
  followedSymbols: [],
  query: "",
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

function handleTierChange(tier) {
  state.tier = tier;
  state.followedSymbols = tier === "visitor" ? [] : defaultFollowedSymbols.slice(0, entitlements[tier].maxFollowedSymbols);

  const visible = getVisibleSnapshots();
  if (!visible.some((snapshot) => snapshot.definition.symbol === state.selectedSymbol)) {
    state.selectedSymbol = visible[0]?.definition.symbol ?? state.snapshots[0]?.definition.symbol;
  }

  render();
}

function handleFollowToggle(symbol) {
  const isFollowing = state.followedSymbols.includes(symbol);

  if (isFollowing) {
    state.followedSymbols = state.followedSymbols.filter((item) => item !== symbol);
    render();
    return;
  }

  if (canFollowSymbol(state.tier, state.followedSymbols.length)) {
    state.followedSymbols = [...state.followedSymbols, symbol];
  }

  render();
}

function drawChart(canvas, snapshot) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  context.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 24, right: 58, bottom: 34, left: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = [
    ...snapshot.prices.map((point) => point.close),
    snapshot.indicator.dividers.week,
    snapshot.indicator.dividers.month,
    snapshot.indicator.dividers.quarter,
    snapshot.indicator.dividers.year
  ];
  const min = Math.min(...values) * 0.985;
  const max = Math.max(...values) * 1.015;

  const x = (index) =>
    padding.left + (index / Math.max(snapshot.prices.length - 1, 1)) * plotWidth;
  const y = (value) =>
    padding.top + ((max - value) / Math.max(max - min, 1)) * plotHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fffdf7";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#e4ddcf";
  context.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const gridY = padding.top + (plotHeight / 4) * index;
    context.beginPath();
    context.moveTo(padding.left, gridY);
    context.lineTo(width - padding.right, gridY);
    context.stroke();
  }

  context.strokeStyle = "#245c58";
  context.lineWidth = 2;
  context.beginPath();
  snapshot.prices.forEach((point, index) => {
    const pointX = x(index);
    const pointY = y(point.close);
    if (index === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  });
  context.stroke();

  const dividerStyles = [
    ["週", snapshot.indicator.dividers.week, "#8a7a35"],
    ["月", snapshot.indicator.dividers.month, "#b64f36"],
    ["季", snapshot.indicator.dividers.quarter, "#4f6fb6"],
    ["年", snapshot.indicator.dividers.year, "#655d74"]
  ];

  dividerStyles.forEach(([label, value, color]) => {
    const lineY = y(value);
    context.strokeStyle = color;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(padding.left, lineY);
    context.lineTo(width - padding.right, lineY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = color;
    context.font = "12px system-ui";
    context.fillText(`${label} ${formatNumber(value)}`, width - padding.right + 8, lineY + 4);
  });

  const latest = snapshot.prices.at(-1);
  if (latest) {
    context.fillStyle = "#245c58";
    context.beginPath();
    context.arc(x(snapshot.prices.length - 1), y(latest.close), 4, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "#69726f";
  context.font = "12px system-ui";
  context.fillText(snapshot.prices[0]?.date ?? "", padding.left, height - 12);
  context.textAlign = "right";
  context.fillText(snapshot.indicator.asOf, width - padding.right, height - 12);
  context.textAlign = "left";
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
          <div class="chart-wrap">
            <canvas class="chart" data-chart></canvas>
          </div>

          <div class="metric-grid">
            <div class="metric"><span>現價</span><strong>${formatNumber(snapshot.indicator.price)}</strong></div>
            <div class="metric"><span>PR 值</span><strong>${snapshot.indicator.prValue}</strong></div>
            <div class="metric"><span>SMA1</span><strong>${snapshot.indicator.sma1}</strong></div>
            <div class="metric"><span>月線距離</span><strong>${snapshot.indicator.distanceToMonthPct}%</strong></div>
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
        render();
      }
    });
  });

  document.querySelector("[data-include-details]")?.addEventListener("change", (event) => {
    state.includeSymbolDetails = event.target.checked;
    render();
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
    drawChart(chart, getSelectedSnapshot());
  }
}

async function boot() {
  const payload = await marketDataProvider.load();
  state.snapshots = payload.snapshots;
  state.snapshotMeta = payload.meta;
  render();

  window.addEventListener("resize", () => {
    const chart = document.querySelector("[data-chart]");
    if (chart) {
      drawChart(chart, getSelectedSnapshot());
    }
  });
}

void boot();
