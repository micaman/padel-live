const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const tableContainer = document.getElementById("tableContainer");
const minMatchesInput = document.getElementById("minMatchesInput");
const minMatchesValue = document.getElementById("minMatchesValue");
const applyFilterBtn = document.getElementById("applyFilterBtn");
let minMatches = minMatchesInput ? Number(minMatchesInput.value) || 1 : 1;
let sortState = { key: "winPct", dir: "desc" };

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

function syncMinMatchesLabel() {
  if (minMatchesValue) {
    minMatchesValue.textContent = String(minMatches);
  }
}

function renderTable(items) {
  if (!tableContainer) return;

  if (!items || !items.length) {
    tableContainer.innerHTML = '<div class="empty-state">No players to compare yet.</div>';
    return;
  }

  const sortedItems = [...items].sort((a, b) => {
    const { key, dir } = sortState;
    const direction = dir === "asc" ? 1 : -1;
    const getVal = (row) => {
      switch (key) {
        case "player":
          return row.name?.toLowerCase?.() || "";
        default:
          return row[key] ?? -Infinity;
      }
    };
    const va = getVal(a);
    const vb = getVal(b);
    if (va === vb) return 0;
    return va > vb ? direction : -direction;
  });

  const rows = sortedItems
    .map((row, idx) => {
      const playerLink = row.id
        ? `<a class="player-link" href="/player/${row.id}">${escapeHtml(row.name)}</a>`
        : escapeHtml(row.name);
      const record = `${row.wins ?? 0}-${row.losses ?? 0}`;
      const mvpBadge = row.isMvpLeader ? ' <span class="mvp-badge mvp-badge--leader" title="Top MVP rate"></span>' : "";
      const mvpRateLabel = `${formatPercent(row.mvpRate)} <span class="pill">${row.mvpCount ?? 0}/${row.matches ?? 0}</span>`;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${playerLink}${mvpBadge}</td>
          <td>${row.matches ?? 0} <span class="pill">${record}</span></td>
          <td>${formatPercent(row.winPct)}</td>
          <td>${mvpRateLabel}</td>
          <td>${formatNumber(row.avgWinners ?? 0)}</td>
          <td>${formatNumber(row.avgErrors ?? 0)}</td>
          <td>${formatNumber(row.avgImpact ?? 0)}</td>
        </tr>
      `;
    })
    .join("");

  tableContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="sortable" data-key="rank"># <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="player">Player <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="matches">Matches <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="winPct">Win % <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="mvpRate">MVP / match <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="avgWinners">Avg W / set <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="avgErrors">Avg E / set <span class="sort-indicator"></span></th>
          <th class="sortable" data-key="avgImpact">Avg impact <span class="sort-indicator"></span></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  const headers = tableContainer.querySelectorAll("th.sortable");
  headers.forEach((th) => {
    const key = th.getAttribute("data-key");
    const indicator = th.querySelector(".sort-indicator");
    if (indicator) {
      indicator.textContent =
        sortState.key === key ? (sortState.dir === "asc" ? "▲" : "▼") : "";
    }
    th.onclick = () => {
      if (key === "rank") return;
      if (sortState.key === key) {
        sortState = { key, dir: sortState.dir === "asc" ? "desc" : "asc" };
      } else {
        sortState = { key, dir: key === "player" ? "asc" : "desc" };
      }
      renderTable(items);
    };
  });
}

async function loadRankings() {
  try {
    syncMinMatchesLabel();
    setStatus(`Loading rankings (min ${minMatches} matches)...`);
    setError("");
    const res = await fetch(`/api/players/rankings?minMatches=${encodeURIComponent(minMatches)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    renderTable(data.items || []);
    setStatus(`Loaded ${data.items?.length ?? 0} players (min ${minMatches} matches).`);
  } catch (err) {
    console.error(err);
    setError(`Failed to load rankings: ${err.message}`);
    setStatus("");
  }
}

function setupControls() {
  if (!minMatchesInput) return;

  const applyFilter = () => {
    const next = Math.max(Number(minMatchesInput.value) || 1, 1);
    minMatches = next;
    syncMinMatchesLabel();
    loadRankings();
  };

  syncMinMatchesLabel();

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", applyFilter);
  }

  minMatchesInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      applyFilter();
    }
  });
}

setupControls();
loadRankings();
