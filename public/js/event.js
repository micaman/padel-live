import {
  escapeHtml,
  formatDate,
  serverPlayerIndex,
  serverTeamFromServerField,
  splitTeamPlayers,
  shouldHideSetForFinishedMatch
} from "./shared.js";

const errorEl = document.getElementById("error");
const eventTitleEl = document.getElementById("eventTitle");
const eventSubtitleEl = document.getElementById("eventSubtitle");
const eventTimeEl = document.getElementById("eventTime");
const eventTypeIconEl = document.getElementById("eventTypeIcon");
const eventLocationIconEl = document.getElementById("eventLocationIcon");
const eventMatchesEl = document.getElementById("eventMatches");

const MOBILE_BREAKPOINT = 520;
const tableSortStates = new WeakMap();

function formatDateOnly(dateKey) {
  if (!dateKey) return "-";
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTimeOnly(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function formatMatchIdLabel(matchId) {
  const str = matchId == null ? "" : String(matchId);
  const tail = str ? str.slice(-4) : "";
  return `#${tail}`;
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

function computeMvpIndicesFromSnap(snap, isFinished) {
  if (!isFinished) return [];
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

function shouldHideSet(match, top, bottom) {
  return shouldHideSetForFinishedMatch(match, top, bottom);
}

function getPlayerRows(match, playerNames) {
  const snap = match.lastSnapshot || {};
  const players = Array.isArray(snap?.players) ? snap.players : [];
  const unforcedErrors = Array.isArray(match.unforcedErrors)
    ? match.unforcedErrors
    : [];
  const playerIds = Array.isArray(match.playerIds) ? match.playerIds : [];
  const buildLabel = (name, idx) => {
    const safeName = escapeHtml(name);
    const id = playerIds[idx];
    const isTeam2 = idx >= 2;
    if (isTeam2 && id) {
      return `<a class="player-link" href="/player/${id}">${safeName}</a>`;
    }
    return safeName;
  };
  return playerNames
    .map((name, idx) => buildLabel(name, idx))
    .map((label, idx) => {
      const pl = players[idx] || { winners: 0, errors: 0 };
      const winners = Number(pl.winners || 0);
      const totalErrors = Number(pl.errors || 0);
      const unforced = Number.isFinite(unforcedErrors[idx])
        ? Number(unforcedErrors[idx])
        : totalErrors;
      const impact = winners - totalErrors;
      return {
        index: idx,
        label,
        winners,
        errors: totalErrors,
        errorsUnforced: unforced,
        errorsDisplay: `${totalErrors} (${unforced})`,
        impact,
      };
    });
}

function getSortState(tableEl, defaultKey = "impact", defaultDir = "desc") {
  if (!tableSortStates.has(tableEl)) {
    tableSortStates.set(tableEl, { key: defaultKey, dir: defaultDir });
  }
  return tableSortStates.get(tableEl);
}

function renderSortableHeader(tableEl, columns, defaultKey, onSortChange) {
  if (!tableEl) return;
  const thead = tableEl.querySelector("thead");
  if (!thead) return;
  const sortState = getSortState(tableEl, defaultKey);
  thead.innerHTML = `<tr>${columns
    .map((col) => {
      const indicator =
        sortState && sortState.key === col.key && col.sortable
          ? `<span class="sort-indicator">${sortState.dir === "asc" ? "&uarr;" : "&darr;"}</span>`
          : "";
      const classes = [
        col.numeric ? "stat-number" : "",
        col.sortable ? "sortable" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const dataAttr = col.sortable ? `data-sort-key="${col.key}"` : "";
      return `<th class="${classes}" ${dataAttr}>${col.label}${indicator}</th>`;
    })
    .join("")}</tr>`;

  thead.querySelectorAll("th[data-sort-key]").forEach((th) => {
    const key = th.dataset.sortKey;
    const column = columns.find((col) => col.key === key);
    if (!column || !column.sortable) return;
    th.addEventListener("click", () => {
      const current = getSortState(tableEl, defaultKey);
      const dir = current.key === key && current.dir === "desc" ? "asc" : "desc";
      current.key = key;
      current.dir = dir;
      onSortChange?.();
    });
  });
}

function sortPlayerRows(rows, tableEl) {
  const sortState = getSortState(tableEl, "impact", "desc");
  const dir = sortState.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[sortState.key];
    const vb = b[sortState.key];
    if (va === vb) return a.index - b.index;
    return va > vb ? dir : -dir;
  });
}

function renderPlayerStatsTable(tableEl, rows) {
  if (!tableEl) return;
  const tbody = tableEl.querySelector("tbody");
  if (!tbody) return;
  const columns = [
    { key: "label", label: "Player", sortable: false },
    { key: "winners", label: "Winners", sortable: true, numeric: true },
    { key: "errors", label: "Errors (Unf)", sortable: true, numeric: true },
    { key: "impact", label: "Impact (W - E)", sortable: true, numeric: true },
  ];

  renderSortableHeader(tableEl, columns, "impact", () =>
    renderPlayerStatsTable(tableEl, rows),
  );

  const sortedRows = sortPlayerRows(rows, tableEl);
  const best = {
    winners: Math.max(...rows.map((r) => r.winners)),
    impact: Math.max(...rows.map((r) => r.impact)),
  };
  const worst = {
    errors: Math.max(...rows.map((r) => r.errors)),
    impact: Math.min(...rows.map((r) => r.impact)),
  };
  const cellClass = (key, value) => {
    if (!Number.isFinite(value)) return "";
    if (key === "errors") return value === worst.errors ? "best-cell-bad" : "";
    if (key === "impact") {
      if (value === best.impact) return "best-cell-good";
      if (value === worst.impact) return "best-cell-bad";
      return "";
    }
    if (key === "winners")
      return value === best.winners ? "best-cell-good" : "";
    return "";
  };

  tbody.innerHTML = sortedRows
    .map(
      (row) => `
        <tr>
          <td>${row.label}</td>
          <td class="stat-number ${cellClass("winners", row.winners)}">${row.winners}</td>
          <td class="stat-number ${cellClass("errors", row.errors)}">${row.errorsDisplay}</td>
          <td class="stat-number ${cellClass("impact", row.impact)}">${row.impact}</td>
        </tr>
      `,
    )
    .join("");
}

function createMatchCard(match) {
  const card = document.createElement("section");
  card.className = "event-match";

  card.innerHTML = `
    <div class="scoreboard-wrapper">
      <div class="scoreboard">
        <div class="sb-icon"><img src="https://i.imgur.com/GLjjux7.png" width="32px" height="32px" alt=""></div>

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

    <div class="panel event-stats-panel">
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th class="stat-number">Winners</th>
            <th class="stat-number">Errors</th>
            <th class="stat-number">Impact (W - E)</th>
          </tr>
        </thead>
        <tbody class="event-player-stats"></tbody>
      </table>
    </div>
  `;

  const snap = match.lastSnapshot || {};
  const pts = snap.points || {};
  const sets = parseSets(snap.sets);
  const team1Players = splitTeamPlayers(match.team1Name, "Team 1");
  const team2Players = splitTeamPlayers(match.team2Name, "Team 2");
  const playerNames = [...team1Players, ...team2Players];
  const formattedNames = playerNames.map(formatCardName);

  formattedNames.forEach((name, idx) => {
    const nameEl = card.querySelector(
      `.player-chip[data-player-index="${idx}"] .player-name`
    );
    if (nameEl) nameEl.textContent = name;
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
    if (shouldHideSet(match, top, bottom)) {
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
    (match.status && String(match.status).toLowerCase() === "finished") ||
    Boolean(match.finishedAt || snap.finishedAt);
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

  const mvpIndices = computeMvpIndicesFromSnap(snap, isFinished);
  const chips = card.querySelectorAll(".player-chip");
  chips.forEach((chip) => chip.classList.remove("is-mvp"));
  mvpIndices.forEach((idx) => {
    const chip = card.querySelector(`.player-chip[data-player-index="${idx}"]`);
    if (chip) chip.classList.add("is-mvp");
  });

  const statsTable = card.querySelector(".event-stats-panel table");
  if (statsTable) {
    const rows = getPlayerRows(match, playerNames);
    renderPlayerStatsTable(statsTable, rows);
  }

  return card;
}

async function loadEvent() {
  const params = new URLSearchParams(window.location.search);
  const dateKey = params.get("date") || "";
  const typeParam = params.get("type") || "";
  const locationParam = params.get("location") || "";

  const typeLabel = typeParam || "Unknown type";
  const locationLabel = locationParam || "Unknown location";

  if (eventTitleEl) {
    eventTitleEl.textContent = `${typeLabel} | ${locationLabel}`;
  }
  if (eventSubtitleEl) {
    eventSubtitleEl.textContent = formatDateOnly(dateKey);
  }

  if (!dateKey) {
    errorEl.textContent = "Missing event date.";
    return;
  }

    errorEl.textContent = "";

  try {
    const url = `/api/event-matches?date=${encodeURIComponent(
      dateKey
    )}&type=${encodeURIComponent(typeParam)}&location=${encodeURIComponent(
      locationParam
    )}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const matches = Array.isArray(data.matches) ? data.matches : [];

    if (eventTypeIconEl) {
      if (data.matchType && data.matchType.iconUrl) {
        eventTypeIconEl.src = data.matchType.iconUrl;
        eventTypeIconEl.style.display = "inline-flex";
      } else {
        eventTypeIconEl.style.display = "none";
      }
    }
    if (eventLocationIconEl) {
      if (data.matchLocation && data.matchLocation.logoUrl) {
        eventLocationIconEl.src = data.matchLocation.logoUrl;
        eventLocationIconEl.style.display = "inline-flex";
      } else {
        eventLocationIconEl.style.display = "none";
      }
    }

    eventMatchesEl.innerHTML = "";
    matches.forEach((m) => {
      eventMatchesEl.appendChild(createMatchCard(m));
    });

    if (eventTimeEl) {
      const timeSource = matches.find((m) => m.scheduledAt || m.lastTimestamp);
      eventTimeEl.textContent = timeSource
        ? `Time: ${formatTimeOnly(timeSource.scheduledAt || timeSource.lastTimestamp)}`
        : "-";
    }

  } catch (err) {
    console.error(err);
    errorEl.textContent = "Failed to load event matches.";
  }
}

loadEvent();
