import {
  escapeHtml,
  formatDate,
  formatDateKey,
  normalizeGroupValue,
  serverPlayerIndex,
  serverTeamFromServerField,
  splitTeamPlayers,
  shouldHideSetForFinishedMatch
} from "./shared.js";

const matchesList = document.getElementById("matchesList");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

let offset = 0;
const limit = 10;
let hasMore = true;
let loading = false;
let shownCount = 0;
let lastGroupKey = null;
let lastGroupContainer = null;
const MOBILE_BREAKPOINT = 520;

function formatDateKeySafe(ts) {
  return formatDateKey(ts);
}

function parseSets(sets) {
  if (typeof sets !== "string") return [];
  return sets
    .split("/")
    .map((s) => {
      const m = s.trim().match(/(\d+)\s*-\s*(\d+)/);
      return m ? { t1: m[1], t2: m[2] } : null;
    })
    .filter(Boolean);
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

function shouldHideSet( match, top, bottom) {
  return shouldHideSetForFinishedMatch(match, top, bottom);
}

function normalizeDateValue(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function getScheduledDate(match) {
  const candidates = [
    match.scheduledAt,
    match.scheduledAtUtc,
    match.scheduledAtLocal,
    match.scheduled_at,
    match.scheduled_at_utc
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDateValue(candidate);
    if (normalized != null) return normalized;
  }
  return match.lastTimestamp;
}

function getGroupKey(match) {
  const typePart = normalizeGroupValue(match.matchType, "type-unknown");
  const locationPart = normalizeGroupValue(match.matchLocation, "location-unknown");
  const datePart = formatDateKeySafe(getScheduledDate(match));
  return `${typePart}|${locationPart}|${datePart}`;
}

function getGroupMeta(match) {
  const dateSource = getScheduledDate(match);
  return {
    typeLabel: match.matchType || "Unknown type",
    locationLabel: match.matchLocation || "Unknown location",
    dateLabel: formatDate(dateSource)
  };
}

function buildImageTag(imageUrl) {
  const srcAttr = imageUrl ? ` src="${escapeHtml(imageUrl)}"` : "";
  return `<span class="match-tag match-tag--logo"><img${srcAttr} alt=""></span>`;
}

function buildTextTag(label, extraClass = "") {
  const safeLabel = escapeHtml(label);
  const classes = ["match-tag", "match-tag--text"];
  if (extraClass) {
    classes.push(...extraClass.split(" ").filter(Boolean));
  }
  return `<span class="${classes.join(" ")}">${safeLabel}</span>`;
}

function formatMatchIdLabel(matchId) {
  const str = matchId == null ? "" : String(matchId);
  const tail = str ? str.slice(-4) : "";
  return `#${tail}`;
}

function renderMetaTags(match) {
  const tags = [];
  const matchIdLabel = formatMatchIdLabel(match.matchId);
  tags.push(buildTextTag(matchIdLabel));

  if (match.winnerTeam === 2) {
    tags.push(buildTextTag("W", "match-tag--result match-tag--win"));
  } else if (match.winnerTeam === 1) {
    tags.push(buildTextTag("L", "match-tag--result match-tag--loss"));
  }

  return tags.length ? `<div class="match-tags">${tags.join("")}</div>` : "";
}

function createGroupSection(match, key) {
  const meta = getGroupMeta(match);
  const section = document.createElement("section");
  section.className = "match-group";
  section.dataset.groupKey = key;

  const typeIcon = match.matchTypeIconUrl ? buildImageTag(match.matchTypeIconUrl) : "";
  const locationIcon = match.matchLocationLogoUrl ? buildImageTag(match.matchLocationLogoUrl) : "";

  const header = document.createElement("div");
  header.className = "match-group-header";
  header.innerHTML = `
      <div class="match-group-title">
        ${typeIcon}
        <span>${escapeHtml(meta.typeLabel)} | ${escapeHtml(meta.locationLabel)}</span>
        ${locationIcon}
      </div>
      <div class="match-group-date">${escapeHtml(meta.dateLabel)}</div>
    `;

  const itemsWrap = document.createElement("div");
  itemsWrap.className = "match-group-items";

  section.appendChild(header);
  section.appendChild(itemsWrap);
  matchesList.appendChild(section);

  return itemsWrap;
}

function ensureGroupContainer(match) {
  const key = getGroupKey(match);
  if (key !== lastGroupKey || !lastGroupContainer) {
    lastGroupKey = key;
    lastGroupContainer = createGroupSection(match, key);
  }
  return lastGroupContainer;
}

function createMatchCard(m) {
  const card = document.createElement("a");
  card.className = "match-card";
  card.href = `/match/${m.matchId}`;

  card.innerHTML = `
      <div class="scoreboard-wrapper">
        <div class="scoreboard">
          <div class="sb-icon"><img src="https://i.imgur.com/GLjjux7.png" width="32px" height="32px"></div>

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
      </div>

      ${renderMetaTags(m)}
    `;

  const snap = m.lastSnapshot || {};
  const pts = snap.points || {};
  const sets = parseSets(snap.sets);
  const team1Players = splitTeamPlayers(m.team1Name, "Team 1");
  const team2Players = splitTeamPlayers(m.team2Name, "Team 2");
  const playerNames = [...team1Players, ...team2Players].map(formatCardName);

  playerNames.forEach((name, idx) => {
    const nameEl = card.querySelector(
      `.player-chip[data-player-index="${idx}"] .player-name`
    );
    if (nameEl) nameEl.textContent = (name || "").toUpperCase();
  });

  const setCols = card.querySelectorAll(".sb-set-col");
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
    if (shouldHideSet(m, top, bottom)) {
      col.style.display = "none";
    }
    const nTop = Number(top);
    const nBottom = Number(bottom);
    if (Number.isFinite(nTop) && Number.isFinite(nBottom) && nTop !== nBottom) {
      const winnerEl = nTop > nBottom ? col.children[0] : col.children[1];
      winnerEl.classList.add("sb-set--high");
    }
  });

  card.querySelector(".sb-point-top").textContent = pts.team1 ?? "0";
  card.querySelector(".sb-point-bottom").textContent = pts.team2 ?? "0";

  const serverIdx = serverPlayerIndex(snap.server);
  const serverTeam = serverTeamFromServerField(snap.server);
  const isFinished =
    (m.status && String(m.status).toLowerCase() === "finished") ||
    Boolean(m.finishedAt || snap.finishedAt);
  const dots = card.querySelectorAll(".player-chip .server-dot");
  dots.forEach((dot) => {
    dot.style.display = "none";
  });
  if (!isFinished && serverIdx != null) {
    const dot = card.querySelector(
      `.player-chip[data-player-index="${serverIdx}"] .server-dot`
    );
    if (dot) dot.style.display = "inline-block";
  } else if (!isFinished && (serverTeam === 1 || serverTeam === 2)) {
    const fallbackIdx = serverTeam === 1 ? 0 : 2;
    const dot = card.querySelector(
      `.player-chip[data-player-index="${fallbackIdx}"] .server-dot`
    );
    if (dot) dot.style.display = "inline-block";
  }

  const mvpIndices = isFinished ? computeMvpIndicesFromSnap(snap) : [];
  const chips = card.querySelectorAll(".player-chip");
  chips.forEach((chip) => chip.classList.remove("is-mvp"));
  mvpIndices.forEach((idx) => {
    const chip = card.querySelector(`.player-chip[data-player-index="${idx}"]`);
    if (chip) chip.classList.add("is-mvp");
  });

  return card;
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

async function loadNext() {
  if (loading || !hasMore) return;
  loading = true;
  loadMoreBtn.disabled = true;
  errorEl.textContent = "";

  try {
    const res = await fetch(`/api/db-matches?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const items = data.items || [];
    const extras = Array.isArray(data.extras) ? data.extras : [];
    const batch = [...items, ...extras];

    batch.forEach((m) => {
      const groupContainer = ensureGroupContainer(m);
      groupContainer.appendChild(createMatchCard(m));
    });

    offset += items.length;
    shownCount += batch.length;
    hasMore = data.hasMore;

    statusEl.textContent = `Showing ${shownCount} matches`;
    loadMoreBtn.style.display = hasMore ? "inline-block" : "none";
  } catch (e) {
    console.error(e);
    errorEl.textContent = "Failed to load matches";
  } finally {
    loading = false;
    loadMoreBtn.disabled = false;
  }
}

loadMoreBtn.addEventListener("click", loadNext);

loadNext();
