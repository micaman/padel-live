import { escapeHtml } from "./shared.js";
import { simulateExp, tierForExp, badgeForSkill } from "./rpg-sim.js";

const statusLine = document.getElementById("statusLine");
const errorLine = document.getElementById("errorLine");
const configMeta = document.getElementById("configMeta");
const reloadBtn = document.getElementById("reloadBtn");
const leaderboardBody = document.getElementById("leaderboardBody");
const summaryMeta = document.getElementById("summaryMeta");

let config = null;
let leaderboardEntries = [];
let currentSort = { key: "totalExp", dir: "desc" };

function setStatus(text) {
  statusLine.textContent = text || "";
}

function setError(text) {
  errorLine.textContent = text || "";
}

async function loadConfig() {
  const res = await fetch("/rpg-config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load config");
  config = await res.json();
  const tiers = config?.tiering?.tiers?.length || 0;
  const name = config.name || "RPG config";
  configMeta.textContent = `${name} · ${tiers} tiers · positive-only weights`;
}

async function fetchAllMatches() {
  const all = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const res = await fetch(`/api/db-matches?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error("Failed to fetch matches");
    const data = await res.json();
    all.push(...(data.items || []));
    offset += data.limit || limit;
    if (!data.hasMore) break;
  }
  return all;
}

async function fetchHistory(matchId) {
  const res = await fetch(`/api/match/${matchId}/history`);
  if (!res.ok) throw new Error(`Failed to load history for match ${matchId}`);
  return res.json();
}

function normalizeKey(name) {
  if (typeof name !== "string") return "";
  const trimmed = name.trim();
  return trimmed.toLowerCase();
}

function aggregatePlayers(players, matchId, leaderboard) {
  for (const p of players) {
    const key = normalizeKey(p.name) || `player-${p.id || Math.random()}`;
    if (!leaderboard.has(key)) {
      leaderboard.set(key, {
        name: p.name || `Player ${p.id ?? ""}`.trim(),
        totalExp: 0,
        baseExp: 0,
        bonusExp: 0,
        skills: { serve: 0, defense: 0, mental: 0, endurance: 0 },
        matches: new Set()
      });
    }
    const agg = leaderboard.get(key);
    agg.name = p.name || agg.name;
    agg.totalExp += p.totalExp || 0;
    agg.baseExp += p.baseExp || 0;
    agg.bonusExp += p.bonusExp || 0;
    for (const [sk, val] of Object.entries(p.skills || {})) {
      agg.skills[sk] = (agg.skills[sk] || 0) + (val || 0);
    }
    agg.matches.add(matchId);
  }
}

function renderLeaderboard(entries) {
  leaderboardBody.innerHTML = "";
  if (!entries.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="10">No data yet.</td>`;
    leaderboardBody.appendChild(row);
    return;
  }

  entries.forEach((p, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.tier?.label || "—")}</td>
      <td>${Math.round(p.totalExp)}</td>
      <td>${Math.round(p.baseExp)}</td>
      <td>${Math.round(p.bonusExp)}</td>
      <td>${Math.round(p.skills.serve || 0)}</td>
      <td>${Math.round(p.skills.defense || 0)}</td>
      <td>${Math.round(p.skills.mental || 0)}</td>
      <td>${Math.round(p.skills.endurance || 0)}</td>
      <td>${escapeHtml(p.badges.serve?.label || "")}</td>
      <td>${escapeHtml(p.badges.defense?.label || "")}</td>
      <td>${escapeHtml(p.badges.mental?.label || "")}</td>
      <td>${escapeHtml(p.badges.endurance?.label || "")}</td>
      <td>${p.matches.size}</td>
    `;
    leaderboardBody.appendChild(row);
  });
}

function sortEntries(entries) {
  const dir = currentSort.dir === "asc" ? 1 : -1;
  const key = currentSort.key;
  const getVal = (p) => {
    switch (key) {
      case "name":
        return (p.name || "").toLowerCase();
      case "tier":
        return p.tier?.exp ?? -1;
      case "baseExp":
      case "bonusExp":
      case "totalExp":
        return p[key] || 0;
      case "serve":
      case "defense":
      case "mental":
      case "endurance":
        return p.skills[key] || 0;
      case "matches":
        return p.matches.size || 0;
      case "badgeServe":
        return p.badges.serve?.exp ?? -1;
      case "badgeDefense":
        return p.badges.defense?.exp ?? -1;
      case "badgeMental":
        return p.badges.mental?.exp ?? -1;
      case "badgeEndurance":
        return p.badges.endurance?.exp ?? -1;
      default:
        return p.totalExp || 0;
    }
  };
  return [...entries].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (typeof va === "string" || typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function refreshTable() {
  const sorted = sortEntries(leaderboardEntries);
  renderLeaderboard(sorted);
}

async function buildLeaderboard() {
  setError("");
  try {
    if (!config) {
      setStatus("Loading RPG config...");
      await loadConfig();
    }

    setStatus("Loading matches...");
    const matches = await fetchAllMatches();
    if (!matches.length) {
      setStatus("No matches found.");
      renderLeaderboard([]);
      return;
    }

    const leaderboard = new Map();
    let processed = 0;
    for (const match of matches) {
      processed++;
      setStatus(`Processing match ${match.matchId} (${processed}/${matches.length})...`);
      try {
        const history = await fetchHistory(match.matchId);
        const { players } = simulateExp(history, config);
        aggregatePlayers(players, match.matchId, leaderboard);
      } catch (err) {
        console.error(err);
        // skip match on error, but continue
      }
    }

    const entries = Array.from(leaderboard.values()).sort(
      (a, b) => b.totalExp - a.totalExp
    );
    for (const e of entries) {
      e.tier = tierForExp(e.totalExp, config.tiering);
      e.badges = {
        serve: badgeForSkill(e.skills.serve, config.badges?.serve),
        defense: badgeForSkill(e.skills.defense, config.badges?.defense),
        mental: badgeForSkill(e.skills.mental, config.badges?.mental),
        endurance: badgeForSkill(e.skills.endurance, config.badges?.endurance)
      };
    }
    leaderboardEntries = entries;
    refreshTable();
    const matchesCount = matches.length;
    const playerCount = entries.length;
    summaryMeta.textContent = `${playerCount} players across ${matchesCount} matches`;
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setError(err.message || "Failed to build leaderboard");
    setStatus("");
  }
}

reloadBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  buildLeaderboard();
});

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    if (currentSort.key === key) {
      currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
    } else {
      currentSort = { key, dir: key === "name" ? "asc" : "desc" };
    }
    refreshTable();
  });
});

(async function init() {
  await buildLeaderboard();
})();
