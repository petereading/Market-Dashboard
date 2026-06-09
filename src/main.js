import { canFollowSymbol, entitlements, getTierMessage } from "./domain/entitlements.js";
import { buildWeeklyDigest } from "./domain/weeklyDigest.js";
import { renderMarketChart } from "./services/chartRenderer.js?v=indicator-settings-20260609";
import { loadAppVersion } from "./services/appVersionProvider.js";
import { marketDataProvider } from "./services/marketDataProvider.js";
import { memberProfileRepository } from "./services/memberProfileRepository.js";

const defaultFollowedSymbols = ["^HSI", "^GSPC", "BTC-USD"];

const state = {
  tier: "visitor",
  selectedSymbol: "^HSI",
  followedSymbols: [],
  query: "",
  chartRange: "6M",
  chartSettings: {
    timeframe: "daily",
    overlays: {
      multiMa: {
        enabled: false,
        periods: [20, 50, 100, 150, 200]
      }
    },
    lowerPanes: {
      pr: true,
      rsi: false,
      macd: false
    },
    indicators: {
      rsi: {
        period: 14
      },
      macd: {
        fast: 12,
        slow: 26,
        signal: 9
      }
    }
  },
  includeSymbolDetails: true,
  snapshots: [],
  snapshotMeta: null,
  appVersion: null
};

const maxLowerPanes = 2;
const maxMaLines = 5;
const maColors = ["#0f766e", "#7c3aed", "#db2777", "#ca8a04", "#64748b"];
let maInputRenderTimer = null;
let indicatorInputRenderTimer = null;

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

function getFollowedSnapshots() {
  return state.followedSymbols
    .map((symbol) => state.snapshots.find((snapshot) => snapshot.definition.symbol === symbol))
    .filter(Boolean);
}

function persistProfile() {
  void memberProfileRepository
    .save({
      tier: state.tier,
      selectedSymbol: state.selectedSymbol,
      followedSymbols: state.followedSymbols,
      includeSymbolDetails: state.includeSymbolDetails
    })
    .catch((error) => {
      console.warn("Unable to persist member profile.", error);
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

function renderVersionBadge() {
  const label = state.appVersion?.label ?? "local";
  return `<span class="version-badge" title="Build ${state.appVersion?.buildId ?? label}">v ${label}</span>`;
}

function getActiveLowerPaneCount() {
  return Object.values(state.chartSettings.lowerPanes).filter(Boolean).length;
}

function getMultiMaSettings() {
  const multiMa = state.chartSettings.overlays.multiMa;
  if (typeof multiMa === "boolean") {
    return {
      enabled: multiMa,
      periods: [20, 50, 100, 150, 200]
    };
  }

  return {
    enabled: multiMa.enabled === true,
    periods: sanitizeMaPeriods(multiMa.periods)
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

  return unique.slice(0, maxMaLines);
}

function setMaPeriods(periods) {
  state.chartSettings.overlays.multiMa = {
    ...getMultiMaSettings(),
    periods: sanitizeMaPeriods(periods)
  };
}

function applyMaInputs(inputs) {
  const periods = [...inputs].map((input) => input.value);
  const sanitized = sanitizeMaPeriods(periods);
  if (sanitized.length !== periods.length) {
    return false;
  }

  setMaPeriods(periods);
  return true;
}

function sanitizeIndicatorPeriod(value, fallback, { min = 2, max = 400 } = {}) {
  const period = Math.round(Number(value));
  if (Number.isFinite(period) && period >= min && period <= max) {
    return period;
  }

  return fallback;
}

function getRsiSettings() {
  const settings = state.chartSettings.indicators?.rsi ?? {};
  return {
    period: sanitizeIndicatorPeriod(settings.period, 14, { min: 2, max: 100 })
  };
}

function getMacdSettings() {
  const settings = state.chartSettings.indicators?.macd ?? {};
  const fast = sanitizeIndicatorPeriod(settings.fast, 12, { min: 2, max: 200 });
  const slow = sanitizeIndicatorPeriod(settings.slow, 26, { min: 3, max: 400 });
  const signal = sanitizeIndicatorPeriod(settings.signal, 9, { min: 2, max: 200 });

  return {
    fast: Math.min(fast, slow - 1),
    slow,
    signal
  };
}

function setRsiSettings(settings) {
  state.chartSettings.indicators = {
    ...state.chartSettings.indicators,
    rsi: {
      ...getRsiSettings(),
      ...settings
    }
  };
}

function setMacdSettings(settings) {
  const next = {
    ...getMacdSettings(),
    ...settings
  };

  state.chartSettings.indicators = {
    ...state.chartSettings.indicators,
    macd: {
      fast: sanitizeIndicatorPeriod(next.fast, 12, { min: 2, max: 200 }),
      slow: sanitizeIndicatorPeriod(next.slow, 26, { min: 3, max: 400 }),
      signal: sanitizeIndicatorPeriod(next.signal, 9, { min: 2, max: 200 })
    }
  };
}

function applyRsiInput(input) {
  const value = Math.round(Number(input.value));
  if (!Number.isFinite(value) || value < 2 || value > 100) {
    return false;
  }

  setRsiSettings({ period: value });
  return true;
}

function applyMacdInputs(inputs) {
  const values = Object.fromEntries([...inputs].map((input) => [input.dataset.macdSetting, Number(input.value)]));
  const fast = Math.round(values.fast);
  const slow = Math.round(values.slow);
  const signal = Math.round(values.signal);

  if (
    !Number.isFinite(fast) ||
    !Number.isFinite(slow) ||
    !Number.isFinite(signal) ||
    fast < 2 ||
    slow < 3 ||
    signal < 2 ||
    fast >= slow ||
    fast > 200 ||
    slow > 400 ||
    signal > 200
  ) {
    return false;
  }

  setMacdSettings({ fast, slow, signal });
  return true;
}

function renderChartSettings() {
  const lowerPaneCount = getActiveLowerPaneCount();
  const multiMa = getMultiMaSettings();
  const rsi = getRsiSettings();
  const macd = getMacdSettings();
  const controls = [
    {
      key: "multiMa",
      type: "overlay",
      label: "多重 MA",
      enabled: multiMa.enabled,
      supported: true,
      note: `${multiMa.periods.length}線組`
    },
    {
      key: "pr",
      type: "lower-pane",
      label: "動能指數",
      enabled: state.chartSettings.lowerPanes.pr,
      supported: true,
      note: "下方面板"
    },
    {
      key: "rsi",
      type: "lower-pane",
      label: "RSI",
      enabled: state.chartSettings.lowerPanes.rsi,
      supported: true,
      note: `${rsi.period}`
    },
    {
      key: "macd",
      type: "lower-pane",
      label: "MACD",
      enabled: state.chartSettings.lowerPanes.macd,
      supported: true,
      note: `${macd.fast}·${macd.slow}·${macd.signal}`
    }
  ];

  return `
    <div class="chart-settings" aria-label="Chart indicator settings">
      <div class="timeframe-controls" aria-label="Chart timeframe">
        <button class="timeframe-button active" type="button">日線</button>
        <button class="timeframe-button" type="button" disabled title="週線需要獨立重新計算指標">週線</button>
      </div>
      <div class="indicator-controls" aria-label="Chart indicators">
        ${controls
          .map((control) => {
            const blockedByPaneLimit =
              control.supported &&
              control.type === "lower-pane" &&
              !control.enabled &&
              lowerPaneCount >= maxLowerPanes;

            return `
              <button
                class="indicator-button ${control.enabled ? "active" : ""}"
                type="button"
                data-indicator-type="${control.type}"
                data-indicator-key="${control.key}"
                ${control.supported && !blockedByPaneLimit ? "" : "disabled"}
                title="${blockedByPaneLimit ? `最多同時顯示 ${maxLowerPanes} 個下方面板` : control.note}"
              >
                <span>${control.label}</span>
                <small>${control.note}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
    ${multiMa.enabled ? renderMaPeriodSettings(multiMa.periods) : ""}
    ${renderLowerIndicatorSettings()}
  `;
}

function renderMaPeriodSettings(periods) {
  return `
    <div class="ma-settings" aria-label="MA period settings">
      <span class="ma-settings-label">MA</span>
      ${periods
        .map(
          (period, index) => `
            <label class="ma-period-control">
              <span>MA${index + 1}</span>
              <input type="number" min="2" max="400" step="1" value="${period}" data-ma-period="${index}" />
              ${
                periods.length > 1
                  ? `<button type="button" class="ma-remove-button" data-ma-remove="${index}" aria-label="Remove MA ${period}">−</button>`
                  : ""
              }
            </label>
          `
        )
        .join("")}
      ${
        periods.length < maxMaLines
          ? `<button type="button" class="ma-add-button" data-ma-add>+</button>`
          : ""
      }
    </div>
  `;
}

function renderLowerIndicatorSettings() {
  const rsi = getRsiSettings();
  const macd = getMacdSettings();
  const hasRsi = state.chartSettings.lowerPanes.rsi;
  const hasMacd = state.chartSettings.lowerPanes.macd;

  if (!hasRsi && !hasMacd) {
    return "";
  }

  return `
    <div class="lower-indicator-settings" aria-label="Lower indicator settings">
      ${hasRsi
        ? `
          <label class="indicator-period-control">
            <span>RSI</span>
            <input type="number" min="2" max="100" step="1" value="${rsi.period}" data-rsi-period />
          </label>
        `
        : ""}
      ${hasMacd
        ? `
          <div class="macd-settings-group" aria-label="MACD settings">
            <span class="macd-settings-label">MACD</span>
            <label class="indicator-period-control">
              <span>Fast</span>
              <input type="number" min="2" max="200" step="1" value="${macd.fast}" data-macd-setting="fast" />
            </label>
            <label class="indicator-period-control">
              <span>Slow</span>
              <input type="number" min="3" max="400" step="1" value="${macd.slow}" data-macd-setting="slow" />
            </label>
            <label class="indicator-period-control">
              <span>Signal</span>
              <input type="number" min="2" max="200" step="1" value="${macd.signal}" data-macd-setting="signal" />
            </label>
          </div>
        `
        : ""}
    </div>
  `;
}

function handleIndicatorToggle(type, key) {
  if (type === "overlay") {
    if (!(key in state.chartSettings.overlays)) {
      return;
    }

    if (key === "multiMa") {
      const multiMa = getMultiMaSettings();
      state.chartSettings.overlays.multiMa = {
        ...multiMa,
        enabled: !multiMa.enabled
      };
      render();
      return;
    }

    state.chartSettings.overlays[key] = !state.chartSettings.overlays[key];
    render();
    return;
  }

  if (type !== "lower-pane") {
    return;
  }

  if (!(key in state.chartSettings.lowerPanes)) {
    return;
  }

  const isActive = state.chartSettings.lowerPanes[key];
  if (!isActive && getActiveLowerPaneCount() >= maxLowerPanes) {
    return;
  }

  state.chartSettings.lowerPanes[key] = !isActive;
  render();
}

function renderFollowedList(entitlement) {
  if (state.tier === "visitor") {
    return `<p class="side-note compact">登入 Patreon 後可建立個人追蹤清單。</p>`;
  }

  const followedSnapshots = getFollowedSnapshots();

  if (followedSnapshots.length === 0) {
    return `<p class="side-note compact">尚未追蹤 symbol。從下方搜尋結果加入。</p>`;
  }

  return `
    <div class="followed-list">
      ${followedSnapshots
        .map(
          (snapshot) => `
            <button class="followed-item ${state.selectedSymbol === snapshot.definition.symbol ? "active" : ""}" data-followed-select="${snapshot.definition.symbol}">
              <span class="symbol-name">
                <strong>${snapshot.definition.symbol}</strong>
                <span>${snapshot.definition.displayName}</span>
              </span>
              <span class="remove-follow" role="button" data-unfollow="${snapshot.definition.symbol}" aria-label="Remove ${snapshot.definition.symbol}">−</span>
            </button>
          `
        )
        .join("")}
    </div>
    <p class="side-note compact">Followed: ${state.followedSymbols.length}/${entitlement.maxFollowedSymbols}</p>
  `;
}

function renderSidebar() {
  const visibleSnapshots = getVisibleSnapshots();
  const entitlement = entitlements[state.tier];

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-kicker">Math of Stars ${renderVersionBadge()}</span>
        <h1>Market Dashboard</h1>
        <a href="/reports.html" style="width:fit-content;margin-top:8px;border-radius:6px;padding:7px 10px;background:#e8f0ed;color:#2f7672;font-size:0.82rem;text-decoration:none;">Report Preview</a>
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

      <section class="followed-block">
        <span class="label">Followed symbols</span>
        ${renderFollowedList(entitlement)}
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
      </section>
    </aside>
  `;
}

function renderMain() {
  const snapshot = getSelectedSnapshot();
  const emailSnapshots = getEmailSnapshots();
  const entitlement = entitlements[state.tier];
  const multiMa = getMultiMaSettings();
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
          ${renderChartSettings()}
          <div class="chart-wrap">
            <div class="chart" data-chart></div>
          </div>
          <div class="divider-legend" aria-label="Divider legend">
            ${state.chartSettings.lowerPanes.pr ? `<span><i class="legend-dot momentum"></i>動能指數</span>` : ""}
            ${state.chartSettings.lowerPanes.rsi ? `<span><i class="legend-dot rsi"></i>RSI</span>` : ""}
            ${state.chartSettings.lowerPanes.macd ? `<span><i class="legend-dot macd"></i>MACD</span>` : ""}
            ${
              multiMa.enabled
                ? multiMa.periods
                    .map(
                      (period, index) => `
                        <span><i style="width:18px;height:0;display:inline-block;border-top:2px solid ${maColors[index]};"></i>MA${period}</span>
                      `
                    )
                    .join("")
                : ""
            }
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

  document.querySelectorAll("[data-followed-select]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const target = event.target;
      const unfollowTarget = target.closest("[data-unfollow]");
      if (unfollowTarget) {
        event.stopPropagation();

        const symbol = unfollowTarget.dataset.unfollow;
        if (symbol) {
          handleFollowToggle(symbol);
        }
        return;
      }

      const symbol = button.dataset.followedSelect;
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

  document.querySelectorAll("[data-indicator-key]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      handleIndicatorToggle(button.dataset.indicatorType, button.dataset.indicatorKey);
    });
  });

  document.querySelectorAll("[data-ma-period]").forEach((input) => {
    input.addEventListener("input", () => {
      if (maInputRenderTimer) {
        window.clearTimeout(maInputRenderTimer);
      }

      maInputRenderTimer = window.setTimeout(() => {
        if (applyMaInputs(document.querySelectorAll("[data-ma-period]"))) {
          render();
        }
      }, 350);
    });

    input.addEventListener("change", () => {
      if (maInputRenderTimer) {
        window.clearTimeout(maInputRenderTimer);
      }

      if (applyMaInputs(document.querySelectorAll("[data-ma-period]"))) {
        render();
      }
    });
  });

  document.querySelectorAll("[data-ma-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const removeIndex = Number(button.dataset.maRemove);
      const periods = getMultiMaSettings().periods.filter((_period, index) => index !== removeIndex);
      setMaPeriods(periods.length > 0 ? periods : [20]);
      render();
    });
  });

  document.querySelector("[data-ma-add]")?.addEventListener("click", () => {
    const periods = getMultiMaSettings().periods;
    const nextPeriod = periods.at(-1) ? Math.min(periods.at(-1) + 50, 400) : 20;
    setMaPeriods([...periods, nextPeriod]);
    render();
  });

  document.querySelector("[data-rsi-period]")?.addEventListener("input", (event) => {
    if (indicatorInputRenderTimer) {
      window.clearTimeout(indicatorInputRenderTimer);
    }

    indicatorInputRenderTimer = window.setTimeout(() => {
      if (applyRsiInput(event.target)) {
        render();
      }
    }, 350);
  });

  document.querySelector("[data-rsi-period]")?.addEventListener("change", (event) => {
    if (indicatorInputRenderTimer) {
      window.clearTimeout(indicatorInputRenderTimer);
    }

    if (applyRsiInput(event.target)) {
      render();
    }
  });

  document.querySelectorAll("[data-macd-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      if (indicatorInputRenderTimer) {
        window.clearTimeout(indicatorInputRenderTimer);
      }

      indicatorInputRenderTimer = window.setTimeout(() => {
        if (applyMacdInputs(document.querySelectorAll("[data-macd-setting]"))) {
          render();
        }
      }, 350);
    });

    input.addEventListener("change", () => {
      if (indicatorInputRenderTimer) {
        window.clearTimeout(indicatorInputRenderTimer);
      }

      if (applyMacdInputs(document.querySelectorAll("[data-macd-setting]"))) {
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
    renderMarketChart(chart, getSelectedSnapshot(), state.chartRange, state.chartSettings);
  }
}

async function boot() {
  const [payload, appVersion] = await Promise.all([marketDataProvider.load(), loadAppVersion()]);
  state.snapshots = payload.snapshots;
  state.snapshotMeta = payload.meta;
  state.appVersion = appVersion;
  applyStoredProfile(await memberProfileRepository.load());
  render();
}

void boot();
