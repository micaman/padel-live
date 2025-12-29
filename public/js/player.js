import {
  serverPlayerIndex,
  serverTeamFromServerField,
  shouldHideSetForFinishedMatch,
  splitTeamPlayers
} from "./shared.js";

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const playerNameEl = document.getElementById("playerName");
const subtitleEl = document.getElementById("playerSubtitle");
const recentMatchesEl = document.getElementById("recentMatches");

const summaryEls = {
  matches: document.getElementById("summaryMatches"),
  wins: document.getElementById("summaryWins"),
  losses: document.getElementById("summaryLosses"),
  winPct: document.getElementById("summaryWinPct"),
  avgWinners: document.getElementById("summaryAvgWinners"),
  avgErrors: document.getElementById("summaryAvgErrors"),
  mvpPct: document.getElementById("summaryMvpPct"),
  timePlaying: document.getElementById("summaryTimePlaying"),
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
const MOBILE_BREAKPOINT = 520;

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

function formatDurationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

function parseSets(sets) {
  if (typeof sets === "string") {
    return sets
      .split("/")
      .map((s) => {
        const m = s.trim().match(/(\d+)\s*-\s*(\d+)/);
        return m ? { t1: m[1], t2: m[2] } : null;
      })
      .filter(Boolean);
  }
  if (sets && typeof sets === "object") {
    const t1 = Number(sets.team1 ?? sets.t1 ?? sets[1]);
    const t2 = Number(sets.team2 ?? sets.t2 ?? sets[2]);
    if (Number.isFinite(t1) && Number.isFinite(t2)) {
      return [{ t1, t2 }];
    }
  }
  return [];
}

function computeMvpIndicesFromSnap(snap) {
  const players = Array.isArray(snap?.players) ? snap.players : [];
  if (!players.length) return [];
  const impacts = [];
  for (let i = 0; i < 4; i++) {
    const pl = players[i] || { winners: 0, errors: 0 };
    impacts.push(Number(pl.winners || 0) - Number(pl.errors || 0));
  }
  const maxImpact = Math.max(...impacts);
  if (!Number.isFinite(maxImpact)) return [];
  return impacts.reduce((acc, val, idx) => {
    if (val === maxImpact) acc.push(idx);
    return acc;
  }, []);
}

function formatCardName(name) {
  const safeName = name || "";
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    const parts = safeName.trim().split(/\s+/);
    if (parts.length > 1) {
      const initial = parts[0].charAt(0);
      const rest = parts.slice(1).join(" ");
      return `${initial}. ${rest}`.toUpperCase();
    }
  }
  return safeName.toUpperCase();
}

function normalizeTeamPlayers(players, fallbackLabel) {
  if (Array.isArray(players) && players.length) {
    const cleaned = players.filter(Boolean).slice(0, 2);
    while (cleaned.length < 2) {
      cleaned.push(`${fallbackLabel} P${cleaned.length + 1}`);
    }
    return cleaned;
  }
  return splitTeamPlayers(fallbackLabel, fallbackLabel);
}

function formatNameLink(entry) {
  if (!entry || !entry.name) return "-";
  if (entry.id) {
    return `<a class="player-link" href="/player/${entry.id}">${escapeHtml(entry.name)}</a>`;
  }
  return escapeHtml(entry.name);
}

function pickExtremeList() {
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
  if (summaryEls.mvpPct) {
    summaryEls.mvpPct.textContent = formatPercent(data.mvpRate);
  }
  if (summaryEls.timePlaying) {
    summaryEls.timePlaying.textContent = formatDurationLabel(data.totalDurationSec ?? 0);
  }
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
            const baseLabel = allowLinks && row.relatedPlayerId
              ? `<a class="player-link" href="/player/${row.relatedPlayerId}">${escapeHtml(row.label)}</a>`
              : escapeHtml(row.label);
            const label = row.isBest
              ? `${baseLabel} <span class="mvp-badge mvp-badge--inline" title="Top win %"></span>`
              : baseLabel;
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

function buildScoreboardElement(match) {
  const wrapper = document.createElement("div");
  wrapper.className = "scoreboard-wrapper";
  wrapper.innerHTML = `
    <div class="scoreboard">
      <div class="sb-icon"><img src="https://i.imgur.com/GLjjux7.png" width="32" height="32" alt=""></div>

      <div class="sb-teams">
        <div class="sb-row">
          <div class="team-name" data-team="1">
            <span class="player-chip" data-player-index="0">
              <span class="server-dot" style="display:none"></span>
              <span class="player-name"></span>
              <span class="mvp-badge" aria-label="MVP" title="Match MVP"></span>
            </span>
            <span class="player-sep">/</span>
            <span class="player-chip" data-player-index="1">
              <span class="server-dot" style="display:none"></span>
              <span class="player-name"></span>
              <span class="mvp-badge" aria-label="MVP" title="Match MVP"></span>
            </span>
          </div>
        </div>
        <div class="sb-row">
          <div class="team-name" data-team="2">
            <span class="player-chip" data-player-index="2">
              <span class="server-dot" style="display:none"></span>
              <span class="player-name"></span>
              <span class="mvp-badge" aria-label="MVP" title="Match MVP"></span>
            </span>
            <span class="player-sep">/</span>
            <span class="player-chip" data-player-index="3">
              <span class="server-dot" style="display:none"></span>
              <span class="player-name"></span>
              <span class="mvp-badge" aria-label="MVP" title="Match MVP"></span>
            </span>
          </div>
        </div>
      </div>

      <div class="sb-sets">
        <div class="sb-set-col"><div>-</div><div>-</div></div>
        <div class="sb-set-col"><div>-</div><div>-</div></div>
        <div class="sb-set-col"><div>-</div><div>-</div></div>
      </div>

      <div class="sb-points">
        <div class="sb-point-top">0</div>
        <div class="sb-point-bottom">0</div>
      </div>
    </div>
  `;

  const snap = match?.lastSnapshot || {};
  const pts = snap.points || {};
  const sets = parseSets(snap.sets);
  const team1Players = normalizeTeamPlayers(match?.team1Players, match?.team1Name || "Team 1");
  const team2Players = normalizeTeamPlayers(match?.team2Players, match?.team2Name || "Team 2");
  const playerNames = [...team1Players, ...team2Players].map(formatCardName);

  playerNames.forEach((name, idx) => {
    const nameEl = wrapper.querySelector(
      `.player-chip[data-player-index="${idx}"] .player-name`
    );
    if (nameEl) nameEl.textContent = name;
  });

  const setCols = wrapper.querySelectorAll(".sb-set-col");
  setCols.forEach((col) => {
    col.style.display = "";
    col.children[0].textContent = "-";
    col.children[1].textContent = "-";
  });

  sets.forEach((s, i) => {
    if (!setCols[i] || !s) return;
    setCols[i].children[0].textContent = s.t1;
    setCols[i].children[1].textContent = s.t2;
  });

  setCols.forEach((col, i) => {
    const score = sets[i];
    const top = score?.t1 ?? col.children[0].textContent;
    const bottom = score?.t2 ?? col.children[1].textContent;
    if (shouldHideSetForFinishedMatch(match, top, bottom)) {
      col.style.display = "none";
    }
  });

  const pointTop = wrapper.querySelector(".sb-point-top");
  const pointBottom = wrapper.querySelector(".sb-point-bottom");
  if (pointTop) pointTop.textContent = pts.team1 ?? "0";
  if (pointBottom) pointBottom.textContent = pts.team2 ?? "0";

  const serverIdx = serverPlayerIndex(snap.server);
  const serverTeam = serverTeamFromServerField(snap.server);
  const isFinished =
    (match.status && String(match.status).toLowerCase() === "finished") ||
    Boolean(match.finishedAt || snap.finishedAt);
  const dots = wrapper.querySelectorAll(".player-chip .server-dot");
  dots.forEach((dot) => {
    dot.style.display = "none";
  });
  if (!isFinished && serverIdx != null) {
    const dot = wrapper.querySelector(
      `.player-chip[data-player-index="${serverIdx}"] .server-dot`
    );
    if (dot) dot.style.display = "inline-block";
  } else if (!isFinished && (serverTeam === 1 || serverTeam === 2)) {
    const fallbackIdx = serverTeam === 1 ? 0 : 2;
    const dot = wrapper.querySelector(
      `.player-chip[data-player-index="${fallbackIdx}"] .server-dot`
    );
    if (dot) dot.style.display = "inline-block";
  }

  const mvpIndices = isFinished ? computeMvpIndicesFromSnap(snap) : [];
  const chips = wrapper.querySelectorAll(".player-chip");
  chips.forEach((chip) => chip.classList.remove("is-mvp"));
  mvpIndices.forEach((idx) => {
    const chip = wrapper.querySelector(`.player-chip[data-player-index="${idx}"]`);
    if (chip) chip.classList.add("is-mvp");
  });

  return wrapper;
}

function buildRecentCard(match) {
  const card = document.createElement("div");
  card.className = "recent-card recent-card--scoreboard";
  const linkEl = document.createElement(match.matchId ? "a" : "div");
  linkEl.className = "recent-card-link";
  if (match.matchId) {
    linkEl.href = `/match/${encodeURIComponent(match.matchId)}`;
  }
  linkEl.appendChild(buildScoreboardElement(match));
  card.appendChild(linkEl);
  return card;
}

function renderRecent(matches) {
  if (!recentMatchesEl) return;
  recentMatchesEl.innerHTML = "";
  if (!matches || !matches.length) {
    recentMatchesEl.innerHTML = '<div class="empty-state">No matches recorded yet.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.slice(0, 3).forEach((match) => {
    fragment.appendChild(buildRecentCard(match));
  });
  recentMatchesEl.appendChild(fragment);
}

function getPlayerIdFromPath() {
  const match = window.location.pathname.match(/\/player\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function deriveFallbackGames() {
  return [];
}

function buildStatsFallback() {
  return { best: [], worst: [] };
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

    setStatus(`Loaded profile with ${data.summary?.totalMatches ?? 0} matches.`);
  } catch (err) {
    console.error(err);
    setError(`Failed to load player profile: ${err.message}`);
    setStatus("");
  }
}

loadProfile();
