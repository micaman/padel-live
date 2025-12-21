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
  avgErrors: document.getElementById("summaryAvgErrors")
};

const breakdownContainers = {
  type: document.getElementById("breakdownType"),
  location: document.getElementById("breakdownLocation"),
  partner: document.getElementById("breakdownPartner"),
  opponent: document.getElementById("breakdownOpponent"),
  day: document.getElementById("breakdownDay")
};

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
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value, decimals = 1) {
  if (value == null || Number.isNaN(value)) return "0";
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatNameLink(entry) {
  if (!entry || !entry.name) return "—";
  if (entry.id) {
    return `<a class="player-link" href="/player/${entry.id}">${escapeHtml(entry.name)}</a>`;
  }
  return escapeHtml(entry.name);
}

function renderSummary(data) {
  if (!summaryEls.matches) return;
  summaryEls.matches.textContent = data.totalMatches ?? 0;
  summaryEls.wins.textContent = data.wins ?? 0;
  summaryEls.losses.textContent = data.losses ?? 0;
  summaryEls.winPct.textContent = formatPercent(data.winPct);
  summaryEls.avgWinners.textContent = formatNumber(data.avgWinners ?? 0);
  summaryEls.avgErrors.textContent = formatNumber(data.avgErrors ?? 0);
}

function renderBreakdown(container, rows, opts = {}) {
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="empty-state">No data available yet.</div>';
    return;
  }

  const allowLinks = Boolean(opts.allowLinks);
  const html = `
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th class="number">Matches</th>
          <th class="number">Wins</th>
          <th class="number">Win %</th>
          <th class="number">Avg W</th>
          <th class="number">Avg E</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const label = allowLinks && row.relatedPlayerId
              ? `<a class="player-link" href="/player/${row.relatedPlayerId}">${escapeHtml(row.label)}</a>`
              : escapeHtml(row.label);
            return `
              <tr>
                <td>${label}</td>
                <td class="number">${row.matches}</td>
                <td class="number">${row.wins}</td>
                <td class="number">${formatPercent(row.winPct)}</td>
                <td class="number">${formatNumber(row.avgWinners ?? 0)}</td>
                <td class="number">${formatNumber(row.avgErrors ?? 0)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

function renderRecent(matches) {
  if (!recentMatchesEl) return;
  if (!matches || !matches.length) {
    recentMatchesEl.innerHTML = '<div class="empty-state">No matches recorded yet.</div>';
    return;
  }

  const items = matches
    .map((match) => {
      const partnerLabel = match.partner ? formatNameLink(match.partner) : "—";
      const opponentsLabel =
        match.opponents && match.opponents.length
          ? match.opponents.map(formatNameLink).join(" / ")
          : "—";
      const context = [match.matchType, match.matchLocation].filter(Boolean).join(" · ") || "—";
      const scorePart = match.score ? ` · ${escapeHtml(match.score)}` : "";
      return `
        <div class="recent-card">
          <div>
            <strong>Result</strong>
            <span>${escapeHtml(match.result || "—")}${scorePart}</span>
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

function getPlayerIdFromPath() {
  const match = window.location.pathname.match(/\/player\/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function loadProfile() {
  const playerId = getPlayerIdFromPath();
  if (!playerId) {
    setError("Player id missing from URL");
    return;
  }

  try {
    setStatus("Loading profile…");
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
    renderRecent(data.recentMatches || []);

    setStatus(`Loaded profile with ${data.summary?.totalMatches ?? 0} matches.`);
  } catch (err) {
    console.error(err);
    setError(`Failed to load player profile: ${err.message}`);
    setStatus("");
  }
}

loadProfile();
