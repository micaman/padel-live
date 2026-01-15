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
const gamesListEl = document.getElementById("gamesList");
const detailCardsEl = document.getElementById("playerDetailCards");

const summaryEls = {
  matches: document.getElementById("summaryMatches"),
  sets: document.getElementById("summarySets"),
  wins: document.getElementById("summaryWins"),
  losses: document.getElementById("summaryLosses"),
  winPct: document.getElementById("summaryWinPct"),
  totalWinners: document.getElementById("summaryTotalWinners"),
  totalErrors: document.getElementById("summaryTotalErrors"),
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
const gamesSortState = { key: "finishedAt", dir: "desc" };
let gamesCache = null;

const calendarContainer = document.getElementById("matchCalendar");
const MOBILE_BREAKPOINT = 520;
const WINNER_DETAIL_KEYS = ["normal", "home", "x3", "x4", "door", "barbaridad"];
const ERROR_DETAIL_KEYS = ["unforced", "forced", "beer"];
const WINNER_DETAIL_LABELS = {
  normal: "Normal",
  home: "Home",
  x3: "x3",
  x4: "x4",
  door: "Door",
  barbaridad: "Barbaridad",
};
const ERROR_DETAIL_LABELS = {
  unforced: "Unforced",
  forced: "Forced",
  beer: "Beer",
};
const NORMAL_WINNER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trophy" viewBox="0 0 16 16"><path d="M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935M3.504 1q.01.775.056 1.469c.13 2.028.457 3.546.87 4.667C5.294 9.48 6.484 10 7 10a.5.5 0 0 1 .5.5v2.61a1 1 0 0 1-.757.97l-1.426.356a.5.5 0 0 0-.179.085L4.5 15h7l-.638-.479a.5.5 0 0 0-.18-.085l-1.425-.356a1 1 0 0 1-.757-.97V10.5A.5.5 0 0 1 9 10c.516 0 1.706-.52 2.57-2.864.413-1.12.74-2.64.87-4.667q.045-.694.056-1.469z"/></svg>';
const HOME_WINNER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house" viewBox="0 0 16 16"><path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/></svg>';
const DOOR_WINNER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-door-closed" viewBox="0 0 16 16"><path d="M3 2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v13h1.5a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1H3zm1 13h8V2H4z"/><path d="M9 9a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/></svg>';
const BARBARIDAD_WINNER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-star" viewBox="0 0 16 16"><path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"/></svg>';
const BEER_ERROR_ICON =
  '<svg height="200px" width="200px" version="1.1" id="_x34_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <polygon style="opacity:0.6;fill:#E7E6E1;" points="340.904,156.427 339.074,180.447 338.998,180.447 335.566,224.979 325.272,357.128 321.841,401.66 317.647,455.572 317.113,462.282 26.128,462.282 25.594,455.572 5.692,199.892 2.641,160.087 2.336,156.427 "></polygon> <path style="opacity:0.6;fill:#E7E6E1;" d="M314.596,512H29.254c-1.677,0-3.279-0.229-4.728-0.61 c-6.558-1.677-11.438-6.863-13.116-13.115c-0.991-3.584-0.839-7.55,0.61-11.362l14.107-24.63h290.986l14.336,25.164 C336.024,499.266,327.255,512,314.596,512z"></path> <polygon style="fill:#E9CB53;" points="287.436,432.589 55.807,432.589 32.05,186.112 311.192,186.112 "></polygon> <path style="opacity:0.6;fill:#E7E6E1;" d="M448.624,220.545v141.056c0,22.108-17.981,40.09-40.09,40.09h-86.699l3.459-44.544 h78.786V224.999h-68.525l3.46-44.544h69.52C430.643,180.456,448.624,198.436,448.624,220.545z"></path> <circle style="fill:#F9F9F7;" cx="56.917" cy="143.036" r="56.917"></circle> <circle style="fill:#F9F9F7;" cx="67.223" cy="56.918" r="56.917"></circle> <circle style="fill:#F9F9F7;" cx="113.835" cy="170.752" r="56.917"></circle> <circle style="fill:#F9F9F7;" cx="193.431" cy="152.935" r="56.917"></circle> <circle style="fill:#F9F9F7;" cx="254.308" cy="163.823" r="56.917"></circle> <path style="fill:#F9F9F7;" d="M284.552,71.251c0,14.564-5.49,27.909-14.564,37.898c-6.939,7.854-16.09,13.802-26.536,16.776 c-0.305,0.076-0.61,0.153-0.991,0.229c-4.728,1.297-9.684,1.983-14.793,1.983c-5.414,0-10.676-0.762-15.632-2.211 c-13.192-3.736-24.401-12.125-31.798-23.257c-0.915-1.372-1.83-2.898-2.592-4.347c-4.347-8.083-6.863-17.31-6.863-27.07 c0-10.828,2.974-20.894,8.236-29.434c9.913-16.547,27.985-27.528,48.65-27.528c28.138,0,51.472,20.36,55.97,47.201 C284.248,64.693,284.552,67.896,284.552,71.251z"></path> <path style="fill:#F9F9F7;" d="M355.393,116.394c0,15.632-6.329 29.815-16.547 40.033-7.625 7.702-17.386 13.192-28.29 15.556-3.889 0.839-7.93 1.297-12.125 1.297-15.785 0-30.044-6.406-40.415-16.852-3.126-3.127-5.872-6.634-8.159-10.523-3.66-5.948-6.253-12.582-7.396-19.75-0.229-0.915-0.381-1.754-0.381-2.669-0.382-2.287-0.534-4.728-0.534-7.092 0-2.745 0.229-5.491 0.61-8.159 3.203-22.647 19.75-41.025 41.482-46.744 4.728-1.373 9.684-2.059 14.793-2.059 7.321 0 14.259 1.373 20.665 3.965 14.793 5.643 26.613 17.462 32.332 32.332 2.689 6.482 4.062 13.421 4.062 20.742z"></path> <path style="fill:#F9F9F7;" d="M188.472,73.31c0,8.465-1.83 16.471-5.262 23.715-0.839 1.906-1.83 3.813-2.974 5.643-6.71 11.285-17.386 20.055-30.044 24.325-2.669 0.991-5.49 1.754-8.388 2.211-3.279 0.686-6.71 0.991-10.218 0.991-7.092 0-13.954-1.296-20.207-3.813-5.948-2.135-11.438-5.338-16.242-9.379-1.22-0.991-2.364-1.983-3.431-3.127-1.373-1.296-2.592-2.669-3.736-4.041-4.957-5.795-8.693-12.582-10.904-19.979-1.602-5.262-2.44-10.828-2.44-16.548 0-24.096 14.946-44.685 36.144-52.997 6.482-2.592 13.497-3.965 20.817-3.965 15.861 0 30.273 6.558 40.567 17.081 2.593 2.593 4.88 5.414 6.863 8.388 8.227 12.636 11.734 23.465 11.734 35.055z"></path> <circle style="fill:#E7E6E1;" cx="72.245" cy="243.004" r="6.929"></circle> <circle style="fill:#E7E6E1;" cx="119.757" cy="304.437" r="6.929"></circle> <circle style="fill:#E7E6E1;" cx="138.163" cy="261.52" r="6.929"></circle> <circle style="fill:#E7E6E1;" cx="195.41" cy="239.634" r="6.929"></circle> <circle style="fill:#E7E6E1;" cx="231.834" cy="291.073" r="6.929"></circle> <circle style="fill:#E7E6E1;" cx="254.308" cy="241.98" r="6.929"></circle> <polygon style="opacity:0.1;fill:#E7E6E1;" points="317.647,455.572 317.113,462.282 26.128,462.282 25.594,455.572 "></polygon> </g> <path style="opacity:0.2;fill:#FFFFFF;" d="M179.017,41.817c-1.983-2.974-4.27-5.795-6.863-8.388 c-10.294-10.523-24.706-17.081-40.567-17.081c-7.317,0-14.33,1.372-20.81,3.962C100.336,7.901,84.709,0,67.223,0 C35.788,0,10.305,25.483,10.305,56.917c0,14.945,5.805,28.501,15.226,38.657C10.153,105.764,0,123.206,0,143.036 c0,5.989,0.936,11.756,2.651,17.177l3.041,39.679l19.902,255.68l0.534,6.71l-14.107,24.63c-1.449,3.813-1.601,7.778-0.61,11.362 c1.677,6.252,6.558,11.438,13.115,13.115c1.449,0.381,3.05,0.61,4.728,0.61h175.228V19.291 C193.874,24.044,184.96,31.897,179.017,41.817z"></path> </g> </g></svg>';
let impactChart = null;
let lastImpactLines = [];
let selectedImpactLineId = "all";

function heatColor(value, min, max) {
  if (!Number.isFinite(value)) return "hsl(200, 50%, 60%)";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "hsl(200, 50%, 60%)";
  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const hue = 10 + t * 120; // red-ish (low) to green (high)
  return `hsl(${hue}, 70%, 55%)`;
}

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

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "€0.00";
  const num = Number(value);
  if (!Number.isFinite(num)) return "€0.00";
  return `€${num.toFixed(2)}`;
}

function createWinnerDetailBuckets() {
  return WINNER_DETAIL_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function createErrorDetailBuckets() {
  return ERROR_DETAIL_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function getDetailIcon(key, label) {
  switch (key) {
    case "normal":
      return NORMAL_WINNER_ICON;
    case "home":
      return HOME_WINNER_ICON;
    case "door":
      return DOOR_WINNER_ICON;
    case "barbaridad":
      return BARBARIDAD_WINNER_ICON;
    case "x3":
      return "x3";
    case "x4":
      return "x4";
    case "beer":
      return BEER_ERROR_ICON;
    default:
      return (label || "").charAt(0).toUpperCase() || "+";
  }
}

function formatDetailChips(detailMap, keys, labels) {
  const chips = keys
    .map((key) => {
      const value = Number(detailMap[key] || 0);
      if (value <= 0) return "";
      const icon = getDetailIcon(key, labels[key]);
      return `<span class="detail-chip detail-chip--${key}">
        <span class="detail-chip__icon">${icon}</span>
        ${value}
      </span>`;
    })
    .filter(Boolean);
  if (!chips.length) {
    return '<span class="empty-state">No data yet.</span>';
  }
  return `<div class="detail-chips">${chips.join("")}</div>`;
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
  if (summaryEls.sets) summaryEls.sets.textContent = data.totalSets ?? 0;
  summaryEls.wins.textContent = data.wins ?? 0;
  summaryEls.losses.textContent = data.losses ?? 0;
  summaryEls.winPct.textContent = formatPercent(data.winPct);
  if (summaryEls.totalWinners) summaryEls.totalWinners.textContent = data.totalWinners ?? 0;
  if (summaryEls.totalErrors) summaryEls.totalErrors.textContent = data.totalErrors ?? 0;
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

  const sortState = tableSortState.get(containerId) || { key: "wins", dir: "desc" };
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
      const current = tableSortState.get(containerId) || { key: "wins", dir: "desc" };
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
    col.children[0].classList.remove("sb-set--high");
    col.children[1].classList.remove("sb-set--high");
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
    const nTop = Number(top);
    const nBottom = Number(bottom);
    if (Number.isFinite(nTop) && Number.isFinite(nBottom) && nTop !== nBottom) {
      const winnerEl = nTop > nBottom ? col.children[0] : col.children[1];
      winnerEl.classList.add("sb-set--high");
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

function renderGames(games) {
  if (!gamesListEl) return;
  gamesListEl.innerHTML = "";
  if (Array.isArray(games)) {
    const rows = [...games];
    if (!rows.length) {
      gamesListEl.innerHTML = '<div class="empty-state">No games yet.</div>';
      gamesCache = { rows: [], bestVals: null, worstVals: null };
      return;
    }
    const mappedRows = rows.map((row) => {
      const finishedAtTs = row.finishedAt ? new Date(row.finishedAt).getTime() : 0;
      const resultScore = row.result === "W" ? 1 : row.result === "L" ? 0 : null;
      const forcedErrors = Number(row.errorsDetail?.forced || 0);
      const beerErrors = Number(row.errorsDetail?.beer || 0);
      return { ...row, finishedAtTs, resultScore, forcedErrors, beerErrors };
    });
    const bestVals = {
      result: Math.max(...mappedRows.map((r) => (r.resultScore != null ? r.resultScore : -Infinity))),
      winners: Math.max(...mappedRows.map((r) => Number(r.winners || 0))),
      errors: Math.min(...mappedRows.map((r) => (Number.isFinite(r.errors) ? r.errors : Infinity))),
      forcedErrors: Math.min(
        ...mappedRows.map((r) => (Number.isFinite(r.forcedErrors) ? r.forcedErrors : Infinity))),
      beerErrors: Math.min(
        ...mappedRows.map((r) => (Number.isFinite(r.beerErrors) ? r.beerErrors : Infinity))),
    };
    const worstVals = {
      result: Math.min(...mappedRows.map((r) => (r.resultScore != null ? r.resultScore : Infinity))),
      winners: Math.min(...mappedRows.map((r) => Number(r.winners || 0))),
      errors: Math.max(...mappedRows.map((r) => (Number.isFinite(r.errors) ? r.errors : -Infinity))),
      forcedErrors: Math.max(
        ...mappedRows.map((r) => (Number.isFinite(r.forcedErrors) ? r.forcedErrors : -Infinity))),
      beerErrors: Math.max(
        ...mappedRows.map((r) => (Number.isFinite(r.beerErrors) ? r.beerErrors : -Infinity))),
    };
    gamesCache = { rows: mappedRows, bestVals, worstVals };
  }

  if (!gamesCache || !Array.isArray(gamesCache.rows) || !gamesCache.rows.length) {
    gamesListEl.innerHTML = '<div class="empty-state">No games yet.</div>';
    return;
  }
  const mappedRows = [...gamesCache.rows];
  const bestVals = gamesCache.bestVals || {};
  const worstVals = gamesCache.worstVals || {};

  const formatDetailSummary = (detailMap, labels, skipKey) => {
    if (!detailMap) return "";
    const parts = Object.keys(detailMap)
      .filter((key) => key !== skipKey)
      .map((key) => {
        const val = Number(detailMap[key] || 0);
        if (!val) return "";
        const label = labels[key] || key;
        return `${label} (${val})`;
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "";
  };

  const sortKey = gamesSortState.key;
  const dir = gamesSortState.dir === "asc" ? 1 : -1;
  mappedRows.sort((a, b) => {
    const valA =
      sortKey === "finishedAt" ? a.finishedAtTs : Number.isFinite(a[sortKey]) ? a[sortKey] : 0;
    const valB =
      sortKey === "finishedAt" ? b.finishedAtTs : Number.isFinite(b[sortKey]) ? b[sortKey] : 0;
    if (valA === valB) return 0;
    return valA > valB ? dir : -dir;
  });

  const html = `
    <table>
      <thead>
        <tr>
          <th data-sort-key="finishedAt">Match</th>
          <th data-sort-key="resultScore">Result</th>
          <th data-sort-key="winners" class="number">Winners</th>
          <th data-sort-key="errors" class="number">Errors</th>
          <th>Specials</th>
          <th data-sort-key="forcedErrors" class="number">Forced Errors</th>
          <th data-sort-key="beerErrors" class="number">Beers</th>
        </tr>
      </thead>
      <tbody>
        ${mappedRows
          .map((row) => {
            const link = row.matchId
              ? `<a class="player-link" href="/match/${row.matchId}">Match ${row.matchId}</a>`
              : "Match";
            const date = row.finishedAt ? `<div class="text-muted">${formatDate(row.finishedAt)}</div>` : "";
            const result = row.result === "W" ? "Win" : row.result === "L" ? "Loss" : "-";
            const specialWDetail = formatDetailSummary(row.winnersDetail, WINNER_DETAIL_LABELS, "normal");
            const forcedErrDetail = Number(row.errorsDetail?.forced || 0);
            const beerErrDetail = Number(row.errorsDetail?.beer || 0);
            const classFor = (key, value) => {
              if (!Number.isFinite(value)) return "";
              if (key === "result") {
                if (value === bestVals.result) return "best-cell-good";
                if (value === worstVals.result) return "best-cell-bad";
                return "";
              }
              if (key === "winners") {
                if (value === bestVals.winners) return "best-cell-good";
                if (value === worstVals.winners) return "best-cell-bad";
                return "";
              }
              if (key === "errors") {
                if (value === bestVals.errors) return "best-cell-good";
                if (value === worstVals.errors) return "best-cell-bad";
                return "";
              }
              if (key === "forcedErrors") {
                if (value === bestVals.forcedErrors) return "best-cell-good";
                if (value === worstVals.forcedErrors) return "best-cell-bad";
                return "";
              }
              if (key === "beerErrors") {
                if (value === bestVals.beerErrors) return "best-cell-good";
                if (value === worstVals.beerErrors) return "best-cell-bad";
                return "";
              }
              return "";
            };
            return `
              <tr>
                <td>${link}${date}</td>
                <td class="${classFor("result", row.resultScore)}">${result}</td>
                <td class="number ${classFor("winners", row.winners)}">${row.winners ?? 0}</td>
                <td class="number ${classFor("errors", row.errors)}">${row.errors ?? 0}</td>
                <td>${specialWDetail || "-"}</td>
                <td class="number ${classFor("forcedErrors", forcedErrDetail)}">${forcedErrDetail}</td>
                <td class="number ${classFor("beerErrors", beerErrDetail)}">${beerErrDetail}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  gamesListEl.innerHTML = html;

  gamesListEl.querySelectorAll("th[data-sort-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      if (!key) return;
      if (gamesSortState.key === key) {
        gamesSortState.dir = gamesSortState.dir === "asc" ? "desc" : "asc";
      } else {
        gamesSortState.key = key;
        gamesSortState.dir = "desc";
      }
      renderGames();
    });
  });
}

function renderDetailCard(detailTotals) {
  if (!detailCardsEl) return;
  const winners = detailTotals?.winners || createWinnerDetailBuckets();
  const errors = detailTotals?.errors || createErrorDetailBuckets();
  const totalWinners = WINNER_DETAIL_KEYS.reduce(
    (sum, key) => sum + Number(winners[key] || 0),
    0
  );
  const totalErrors = ERROR_DETAIL_KEYS.reduce(
    (sum, key) => sum + Number(errors[key] || 0),
    0
  );
  if (!totalWinners && !totalErrors) {
    detailCardsEl.innerHTML = '<div class="empty-state">No detailed stats yet.</div>';
    return;
  }
  const winnersHtml = formatDetailChips(winners, WINNER_DETAIL_KEYS, WINNER_DETAIL_LABELS);
  const errorsHtml = formatDetailChips(errors, ERROR_DETAIL_KEYS, ERROR_DETAIL_LABELS);
  const impact = totalWinners - totalErrors;
  const nameLabel = escapeHtml(playerNameEl?.textContent || "Player");
  detailCardsEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-card__header">
        <span>${nameLabel}</span>
        <div class="detail-card__badges">
          <span class="detail-card__badge">${totalWinners}W / ${totalErrors}E</span>
          <span class="detail-card__badge detail-card__badge--impact">${impact >= 0 ? "+" : ""}${impact}</span>
        </div>
      </div>
      <div class="detail-card__section">
        <div class="detail-section-title">Winners</div>
        ${winnersHtml}
      </div>
      <div class="detail-card__section" style="margin-top:8px;">
        <div class="detail-section-title">Errors</div>
        ${errorsHtml}
      </div>
    </div>
  `;
}

function renderImpactLines(lines) {
  lastImpactLines = Array.isArray(lines) ? lines : [];
  const filterEl = document.getElementById("impactFilter");
  if (filterEl) {
    const prev = selectedImpactLineId;
    const options = ["all", ...lastImpactLines.map((l) => String(l.lineId || l.matchId || ""))];
    const uniqueOptions = Array.from(new Set(options));
    filterEl.innerHTML = uniqueOptions
      .map((val) => {
        if (val === "all") return '<option value="all">Last 20 sets</option>';
        const label = lastImpactLines.find((l) => {
          const key = String(l.lineId || l.matchId || "");
          return key === val;
        })?.label;
        return `<option value="${val}">${label || `Line ${val}`}</option>`;
      })
      .join("");
    const nextValue = uniqueOptions.includes(prev) ? prev : "all";
    filterEl.value = nextValue;
    selectedImpactLineId = filterEl.value;
    filterEl.onchange = (e) => {
      selectedImpactLineId = e.target.value || "all";
      renderImpactLines(lastImpactLines);
    };
  }

  const filteredLines =
    selectedImpactLineId === "all"
      ? lastImpactLines
      : lastImpactLines.filter(
          (l) => String(l.lineId || l.matchId || "") === selectedImpactLineId
        );

  const canvas = document.getElementById("playerImpactChart");
  const emptyState = document.getElementById("impactEmpty");
  if (!canvas || typeof Chart === "undefined") return;

  const hasData = Array.isArray(filteredLines) && filteredLines.length;
  if (!hasData) {
    if (impactChart) {
      impactChart.destroy();
      impactChart = null;
    }
    canvas.style.display = "none";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  const endValuesAll = lastImpactLines
    .map((line) => {
      const pts = Array.isArray(line.points) ? line.points : [];
      if (!pts.length) return null;
      const firstVal = Number(pts[0]?.y);
      const lastVal = Number(pts[pts.length - 1]?.y);
      if (!Number.isFinite(lastVal)) return null;
      const baseline = Number.isFinite(firstVal) ? firstVal : 0;
      return lastVal - baseline;
    })
    .filter((v) => v !== null);
  const minEnd = endValuesAll.length ? Math.min(...endValuesAll) : 0;
  const maxEnd = endValuesAll.length ? Math.max(...endValuesAll) : 0;

  const datasets = filteredLines.map((line, idx) => {
    const pts = Array.isArray(line.points) ? line.points : [];
    const firstVal = Number(pts[0]?.y);
    const last = pts.length ? pts[pts.length - 1] : null;
    const endValRaw = Number(last?.y);
    const baseline = Number.isFinite(firstVal) ? firstVal : 0;
    const endVal = Number.isFinite(endValRaw) ? endValRaw - baseline : null;
    const color = heatColor(endVal, minEnd, maxEnd);
    const label = line.label || `Match ${idx + 1}`;
    const rawPoints = pts
      ? line.points.map((pt) => ({
          x: pt.x,
          y: pt.y,
          meta: {
            winners: pt.winners ?? 0,
            errors: pt.errors ?? 0,
          },
        }))
      : [];
    const points = rawPoints.map((pt) => ({
      ...pt,
      y: Number.isFinite(pt.y) ? Number(pt.y) - baseline : pt.y,
    }));
    return {
      label,
      data: points,
      borderWidth: 2,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      fill: false,
      spanGaps: true,
      parsing: false,
      matchMeta: {
        result: line.result || "",
        matchType: line.matchType || "",
        matchLocation: line.matchLocation || "",
        partner: line.partner?.name || "",
        setNumber: line.setNumber || null,
        matchId: line.matchId || null,
        opponents: Array.isArray(line.opponents)
          ? line.opponents.map((op) => op?.name).filter(Boolean)
          : [],
      },
    };
  });

  canvas.style.display = "block";
  if (emptyState) emptyState.style.display = "none";

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: -20,
        max: 10,
        ticks: { color: "#f5f5f5" },
        grid: { color: "rgba(255,255,255,0.1)" },
        title: { display: true, text: "Impact", color: "#f5f5f5" },
      },
      x: {
        type: "linear",
        ticks: { color: "#f5f5f5" },
        grid: { display: false },
        title: { display: true, text: "Point", color: "#f5f5f5" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title(items) {
            const ctx = items[0];
            const datasetLabel = ctx.dataset?.label || "Match";
            const pointNumber = ctx.raw?.x != null ? `Point ${ctx.raw.x}` : "";
            return [datasetLabel, pointNumber].filter(Boolean).join(" - ");
          },
          label(context) {
            return `Impact: ${context.formattedValue}`;
          },
          afterBody(items) {
            const ctx = items[0];
            const meta = ctx.raw?.meta || {};
            const matchMeta = ctx.dataset?.matchMeta || {};
            const pre = [];
            if (matchMeta.setNumber != null) pre.push(`Set ${matchMeta.setNumber}`);
            if (matchMeta.matchId != null) pre.push(`Match ${matchMeta.matchId}`);
            const lines = [
              ...pre,
              `Winners: ${meta.winners ?? 0}`,
              `Errors: ${meta.errors ?? 0}`,
            ];
            if (matchMeta.result) lines.push(`Result: ${matchMeta.result}`);
            const extra = [matchMeta.matchType, matchMeta.matchLocation].filter(Boolean);
            if (extra.length) lines.push(extra.join(" · "));
            if (matchMeta.partner) lines.push(`Partner: ${matchMeta.partner}`);
            if (matchMeta.opponents?.length) lines.push(`Opponents: ${matchMeta.opponents.join(" / ")}`);
            return lines;
          },
        },
      },
    },
  };

  if (impactChart) {
    impactChart.data.datasets = datasets;
    impactChart.update();
    return;
  }

  const ctx = canvas.getContext("2d");
  impactChart = new Chart(ctx, { type: "line", data: { datasets }, options });
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
    renderGames(data.games || []);
    renderDetailCard(data.detailTotals || {});
    renderImpactLines(data.impactLines || []);

    setStatus(`Loaded profile with ${data.summary?.totalMatches ?? 0} matches.`);
  } catch (err) {
    console.error(err);
    setError(`Failed to load player profile: ${err.message}`);
    setStatus("");
  }
}

loadProfile();
