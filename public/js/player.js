const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const playerNameEl = document.getElementById("playerName");
const subtitleEl = document.getElementById("playerSubtitle");
const recentMatchesEl = document.getElementById("recentMatches");
const bestGamesEl = document.getElementById("bestGames");
const worstGamesEl = document.getElementById("worstGames");
const bestStatsEl = document.getElementById("bestStats");
const worstStatsEl = document.getElementById("worstStats");

const summaryEls = {
  matches: document.getElementById("summaryMatches"),
  wins: document.getElementById("summaryWins"),
  losses: document.getElementById("summaryLosses"),
  winPct: document.getElementById("summaryWinPct"),
  avgWinners: document.getElementById("summaryAvgWinners"),
  avgErrors: document.getElementById("summaryAvgErrors"),
  totalSpent: document.getElementById("summarySpent")
};

const breakdownContainers = {
  type: document.getElementById("breakdownType"),
  location: document.getElementById("breakdownLocation"),
  partner: document.getElementById("breakdownPartner"),
  opponent: document.getElementById("breakdownOpponent"),
  day: document.getElementById("breakdownDay"),
  level: document.getElementById("breakdownLevel"),
  time: document.getElementById("breakdownTime")
};

const financeEls = {
  total: document.getElementById("financeTotal"),
  byMonth: document.getElementById("financeByMonth"),
  byLocation: document.getElementById("financeByLocation")
};

const tableSortState = new Map();

const calendarContainer = document.getElementById("matchCalendar");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message || "";
}

function setError(message) {
  if (errorEl) errorEl.textContent = message || "";
}

function escapeHtml(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value, decimals = 1) {
  if (value == null || Number.isNaN(value)) return "0";
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "€0.00";
  const num = Number(value);
  if (!Number.isFinite(num)) return "€0.00";
  return `€${num.toFixed(2)}`;
}

function formatNameLink(entry) {
  if (!entry || !entry.name) return "-";
  if (entry.id) {
    return `<a class="player-link" href="/player/${entry.id}">${escapeHtml(entry.name)}</a>`;
  }
  return escapeHtml(entry.name);
}

function pickExtremeList(data, keys) {
  if (!data) return [];
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const direct = data[key];
    if (Array.isArray(direct)) return direct;
    if (direct && typeof direct === "object") return [direct];
    if (data.extremes) {
      const nested = data.extremes[key];
      if (Array.isArray(nested)) return nested;
      if (nested && typeof nested === "object") return [nested];
    }
  }
  return [];
}

function renderSummary(data) {
  if (!summaryEls.matches) return;
  summaryEls.matches.textContent = data.totalMatches ?? 0;
  summaryEls.wins.textContent = data.wins ?? 0;
  summaryEls.losses.textContent = data.losses ?? 0;
  summaryEls.winPct.textContent = formatPercent(data.winPct);
  summaryEls.avgWinners.textContent = formatNumber(data.avgWinners ?? 0);
  summaryEls.avgErrors.textContent = formatNumber(data.avgErrors ?? 0);
  if (summaryEls.totalSpent) {
    summaryEls.totalSpent.textContent = formatCurrency(data.totalSpent ?? 0);
  }
}

function renderBreakdown(container, rows, opts = {}) {
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="empty-state">No data available yet.</div>';
    return;
  }

  const containerId = container.id || `table-${Math.random().toString(36).slice(2)}`;
  const columns = [
    { key: "label", label: "Category", sortable: false },
    { key: "matches", label: "Matches", sortable: true },
    { key: "wins", label: "Wins", sortable: true },
    { key: "winPct", label: "Win %", sortable: true },
    { key: "avgWinners", label: "Avg W", sortable: true },
    { key: "avgErrors", label: "Avg E", sortable: true }
  ];

  const sortState = tableSortState.get(containerId) || { key: "matches", dir: "desc" };
  const sortedRows = [...rows].sort((a, b) => {
    const key = sortState.key;
    const dir = sortState.dir === "asc" ? 1 : -1;
    const va = a[key] ?? -Infinity;
    const vb = b[key] ?? -Infinity;
    if (va === vb) return 0;
    return va > vb ? dir : -dir;
  });

  const best = {};
  ["matches", "wins", "winPct", "avgWinners", "avgErrors"].forEach((key) => {
    best[key] = Math.max(...rows.map((r) => (Number.isFinite(r[key]) ? r[key] : -Infinity)));
  });

  const cellClassFor = (key, value) => {
    if (!Number.isFinite(value)) return "";
    if (key === "avgErrors") {
      return value === best[key] ? "best-cell-bad" : "";
    }
    return value === best[key] ? "best-cell-good" : "";
  };

  const allowLinks = Boolean(opts.allowLinks);
  const html = `
    <table>
      <thead>
        <tr>
          ${columns
            .map((col) => {
              const indicator =
                sortState.key === col.key ? `<span class="sort-indicator">${sortState.dir === "asc" ? "▲" : "▼"}</span>` : "";
              const classes = ["number", col.sortable ? "sortable" : null].filter(Boolean).join(" ");
              return `<th class="${classes}" ${col.sortable ? `data-sort-key="${col.key}"` : ""}>${col.label}${indicator}</th>`;
            })
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${sortedRows
          .map((row) => {
            const label = allowLinks && row.relatedPlayerId
              ? `<a class="player-link" href="/player/${row.relatedPlayerId}">${escapeHtml(row.label)}</a>`
              : escapeHtml(row.label);
            return `
              <tr>
                <td>${label}</td>
                <td class="number ${cellClassFor("matches", row.matches)}">${row.matches}</td>
                <td class="number ${cellClassFor("wins", row.wins)}">${row.wins}</td>
                <td class="number ${cellClassFor("winPct", row.winPct)}">${formatPercent(row.winPct)}</td>
                <td class="number ${cellClassFor("avgWinners", row.avgWinners)}">${formatNumber(row.avgWinners ?? 0)}</td>
                <td class="number ${cellClassFor("avgErrors", row.avgErrors)}">${formatNumber(row.avgErrors ?? 0)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.innerHTML = html;

  container.querySelectorAll("th[data-sort-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      const current = tableSortState.get(containerId) || { key: "matches", dir: "desc" };
      const dir = current.key === key && current.dir === "desc" ? "asc" : "desc";
      tableSortState.set(containerId, { key, dir });
      renderBreakdown(container, rows, opts);
    });
  });
}

function renderFinance(finance) {
  if (financeEls.total) {
    financeEls.total.textContent = formatCurrency(finance?.totalSpent ?? 0);
  }

  const byMonth = Array.isArray(finance?.byMonth) ? finance.byMonth : [];
  const byLocation = Array.isArray(finance?.byLocation) ? finance.byLocation : [];

  const renderTable = (rows) => {
    if (!rows.length) {
      return '<div class="empty-state">No cost data yet.</div>';
    }
    const bestCost = Math.max(...rows.map((r) => (Number.isFinite(r.cost) ? r.cost : -Infinity)));
    return `
      <tr>
        <th>Label</th>
        <th class="number">Spent</th>
      </tr>
      ${rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.label || "-")}</td>
              <td class="number ${row.cost === bestCost ? "best-cell-bad" : ""}">${formatCurrency(row.cost ?? 0)}</td>
            </tr>
          `
        )
        .join("")}
    `;
  };

  if (financeEls.byMonth) {
    financeEls.byMonth.innerHTML = renderTable(byMonth);
  }
  if (financeEls.byLocation) {
    financeEls.byLocation.innerHTML = renderTable(byLocation);
  }
}

function renderCalendar(entries) {
  if (!calendarContainer) return;
  const dates = Array.isArray(entries) ? entries : [];
  if (!dates.length) {
    calendarContainer.innerHTML = '<div class="empty-state">No matches recorded yet.</div>';
    return;
  }

  const countByDate = new Map();
  let minDate = null;
  dates.forEach((entry) => {
    if (!entry || !entry.date) return;
    const count = Number(entry.count || 0);
    countByDate.set(entry.date, Number.isFinite(count) ? count : 0);
    const d = new Date(entry.date);
    if (!Number.isNaN(d.getTime())) {
      if (!minDate || d < minDate) {
        minDate = d;
      }
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = minDate ? new Date(minDate) : new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(1); // begin at first day of first activity month

  const days = [];
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= today.getTime(); t += MS_PER_DAY) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const count = countByDate.get(iso) || 0;
    days.push({ date: iso, count });
  }

  const maxCount = days.reduce((max, d) => Math.max(max, d.count), 0);
  const levelFor = (count) => {
    if (count === 0) return 0;
    if (maxCount <= 4) return Math.min(count, 4);
    if (count >= maxCount * 0.75) return 4;
    if (count >= maxCount * 0.5) return 3;
    if (count >= maxCount * 0.25) return 2;
    return 1;
  };

  const months = new Map();
  days.forEach((day) => {
    const d = new Date(day.date);
    if (Number.isNaN(d.getTime())) return;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    if (!months.has(monthKey)) {
      months.set(monthKey, { label: monthLabel, cells: [] });
    }
    months.get(monthKey).cells.push({
      weekday: d.getDay(),
      count: day.count,
      date: day.date
    });
  });

  const monthBlocks = Array.from(months.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, month]) => {
      // pad to start on Sunday with blanks to align weekdays
      const firstWeekday = new Date(`${month.cells[0].date}T00:00:00Z`).getDay();
      const paddedCells = [];
      for (let i = 0; i < firstWeekday; i++) paddedCells.push({ count: 0, date: null });
      paddedCells.push(
        ...month.cells.map((cell) => ({
          ...cell,
          level: levelFor(cell.count),
        }))
      );

      const grid = paddedCells
        .map((cell) => {
          const levelClass = cell.level ? `level-${cell.level}` : "";
          const title = cell.date ? `${cell.date}: ${cell.count} match${cell.count === 1 ? "" : "es"}` : "";
          return `<div class="calendar-cell ${levelClass}" title="${title}"></div>`;
        })
        .join("");

      return `
        <div class="calendar-month">
          <h4>${escapeHtml(month.label)}</h4>
          <div class="calendar-month-grid">${grid}</div>
        </div>
      `;
    })
    .join("");

  const legendLevels = [0, 1, 2, 3, 4]
    .map(
      (lvl) => `<span class="legend-swatch ${lvl ? `level-${lvl}` : ""}" title="${
        lvl === 0 ? "No matches" : ""
      }"></span>`
    )
    .join("");

  calendarContainer.innerHTML = `
    <div class="calendar">${monthBlocks}</div>
    <div class="calendar-legend">
      <span>Less</span>
      ${legendLevels}
      <span>More</span>
    </div>
  `;
}

function renderRecent(matches) {
  if (!recentMatchesEl) return;
  if (!matches || !matches.length) {
    recentMatchesEl.innerHTML = '<div class="empty-state">No matches recorded yet.</div>';
    return;
  }

  const items = matches
    .map((match) => {
      const partnerLabel = match.partner ? formatNameLink(match.partner) : "-";
      const opponentsLabel =
        match.opponents && match.opponents.length
          ? match.opponents.map(formatNameLink).join(" / ")
          : "-";
      const context = [match.matchType, match.matchLocation].filter(Boolean).join(" | ") || "-";
      const scorePart = match.score ? ` | ${escapeHtml(match.score)}` : "";
      const resultText = `${escapeHtml(match.result || "-")}${scorePart}`;
      const matchUrl = match.matchId ? `/match/${encodeURIComponent(match.matchId)}` : null;
      const resultContent = matchUrl
        ? `<a class="recent-result-link" href="${matchUrl}">${resultText}</a>`
        : resultText;
      return `
        <div class="recent-card">
          <div>
            <strong>Result</strong>
            <span>${resultContent}</span>
          </div>
          <div>
            <strong>Partner</strong>
            <span>${partnerLabel}</span>
          </div>
          <div>
            <strong>Opponents</strong>
            <span>${opponentsLabel}</span>
          </div>
          <div>
            <strong>When</strong>
            <span>${formatDate(match.finishedAt)}</span>
          </div>
          <div>
            <strong>Context</strong>
            <span>${escapeHtml(context)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  recentMatchesEl.innerHTML = items;
}

function renderExtremeGames(container, matches) {
  if (!container) return;
  if (!matches || !matches.length) {
    container.innerHTML = '<div class="empty-state">No matches recorded yet.</div>';
    return;
  }
  const items = matches
    .map((match) => {
      const partnerLabel = match.partner ? formatNameLink(match.partner) : "-";
      const opponentsLabel =
        match.opponents && match.opponents.length
          ? match.opponents.map(formatNameLink).join(" / ")
          : "-";
      const context = [match.matchType, match.matchLocation].filter(Boolean).join(" | ") || "-";
      const scorePart = match.score ? ` | ${escapeHtml(match.score)}` : "";
      const resultText = `${escapeHtml(match.result || "-")}${scorePart}`;
      const matchUrl = match.matchId ? `/match/${encodeURIComponent(match.matchId)}` : null;
      const resultContent = matchUrl
        ? `<a class="recent-result-link" href="${matchUrl}">${resultText}</a>`
        : resultText;
      return `
        <div class="recent-card">
          <div>
            <strong>Result</strong>
            <span>${resultContent}</span>
          </div>
          <div>
            <strong>Partner</strong>
            <span>${partnerLabel}</span>
          </div>
          <div>
            <strong>Opponents</strong>
            <span>${opponentsLabel}</span>
          </div>
          <div>
            <strong>When</strong>
            <span>${formatDate(match.finishedAt)}</span>
          </div>
          <div>
            <strong>Context</strong>
            <span>${escapeHtml(context)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = items;
}

function renderExtremeStats(container, stats) {
  if (!container) return;
  if (!stats || !stats.length) {
    container.innerHTML = '<div class="empty-state">No stats available yet.</div>';
    return;
  }
  const items = stats
    .map((entry) => {
      const value =
        entry && entry.value != null
          ? typeof entry.value === "number"
            ? formatNumber(entry.value, entry.decimals ?? 2)
            : escapeHtml(String(entry.value))
          : "-";
      const suffix = entry?.suffix ? ` ${escapeHtml(entry.suffix)}` : "";
      return `
        <div class="stat-line">
          <span class="label">${escapeHtml(entry.label || "-")}</span>
          <span class="value">${value}${suffix}</span>
        </div>
      `;
    })
    .join("");

  container.innerHTML = items;
}

function getPlayerIdFromPath() {
  const match = window.location.pathname.match(/\/player\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function deriveFallbackGames(recentMatches, kind) {
  if (!Array.isArray(recentMatches) || !recentMatches.length) return [];
  const wins = recentMatches.filter((m) =>
    typeof m.result === "string" ? m.result.toLowerCase().startsWith("win") : false
  );
  const losses = recentMatches.filter((m) =>
    typeof m.result === "string" ? m.result.toLowerCase().startsWith("loss") : false
  );
  if (kind === "best") {
    if (wins.length) return wins.slice(0, 3);
    return recentMatches.slice(0, 3);
  }
  if (kind === "worst") {
    if (losses.length) return losses.slice(0, 3);
    return recentMatches.slice(-3);
  }
  return [];
}

function buildStatsFallback(summary = {}) {
  const best = [];
  const worst = [];
  if (summary.winPct != null) {
    best.push({ label: "Win %", value: summary.winPct * 100, decimals: 1, suffix: "%" });
  }
  if (summary.avgWinners != null) {
    best.push({ label: "Avg Winners", value: summary.avgWinners, decimals: 1 });
  }
  if (summary.totalMatches != null) {
    best.push({ label: "Matches Played", value: summary.totalMatches, decimals: 0 });
  }
  if (summary.avgErrors != null) {
    worst.push({ label: "Avg Errors", value: summary.avgErrors, decimals: 1 });
  }
  if (summary.losses != null) {
    worst.push({ label: "Losses", value: summary.losses, decimals: 0 });
  }
  return { best, worst };
}

async function loadProfile() {
  const playerId = getPlayerIdFromPath();
  if (!playerId) {
    setError("Player id missing from URL");
    return;
  }

  try {
    setStatus("Loading profile...");
    setError("");
    const res = await fetch(`/api/player/${playerId}/profile`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.player) {
      setError("Player profile unavailable.");
      setStatus("");
      return;
    }

    playerNameEl.textContent = data.player.name || `Player #${data.player.id}`;
    subtitleEl.textContent = data.player.joinedAt
      ? `Profile created ${formatDate(data.player.joinedAt)}`
      : "Player profile";

    renderSummary(data.summary || {});
    renderBreakdown(breakdownContainers.type, data.breakdowns?.byType || []);
    renderBreakdown(breakdownContainers.location, data.breakdowns?.byLocation || []);
    renderBreakdown(breakdownContainers.partner, data.breakdowns?.byPartner || [], { allowLinks: true });
    renderBreakdown(breakdownContainers.opponent, data.breakdowns?.byOpponent || [], { allowLinks: true });
    renderBreakdown(breakdownContainers.day, data.breakdowns?.byDayOfWeek || []);
    renderBreakdown(breakdownContainers.level, data.breakdowns?.byLevel || []);
    renderBreakdown(breakdownContainers.time, data.breakdowns?.byTimeOfDay || []);
    renderFinance(data.finance || {});
    renderCalendar(data.calendarDates || []);
    const recent = data.recentMatches || [];
    renderRecent(recent);

    const bestGamesData = pickExtremeList(data, ["bestGames", "bestGame"]) || [];
    const worstGamesData = pickExtremeList(data, ["worstGames", "worstGame"]) || [];
    renderExtremeGames(bestGamesEl, bestGamesData.length ? bestGamesData : deriveFallbackGames(recent, "best"));
    renderExtremeGames(worstGamesEl, worstGamesData.length ? worstGamesData : deriveFallbackGames(recent, "worst"));
    const bestStatsData = pickExtremeList(data, ["bestStats", "bestStat"]);
    const worstStatsData = pickExtremeList(data, ["worstStats", "worstStat"]);
    const statsFallback = buildStatsFallback(data.summary || {});
    renderExtremeStats(bestStatsEl, bestStatsData.length ? bestStatsData : statsFallback.best);
    renderExtremeStats(worstStatsEl, worstStatsData.length ? worstStatsData : statsFallback.worst);

    setStatus(`Loaded profile with ${data.summary?.totalMatches ?? 0} matches.`);
  } catch (err) {
    console.error(err);
    setError(`Failed to load player profile: ${err.message}`);
    setStatus("");
  }
}

loadProfile();
