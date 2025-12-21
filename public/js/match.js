import {
  computeBreakStats,
  computeTimeStats,
  formatDuration,
  parseSetsArray,
  serverTeamFromServerField
} from "./stats.js";

const PLAYER_COLORS = ["#5ab0ff", "#57d657", "#f5a623", "#ff6b6b"];
const WINNER_COLOR = "#57d657";
const ERROR_COLOR = "#ff6b6b";
const TIMELINE_ARROW_COLOR = "#000000";
const GAME_MARKER_COLOR = "rgba(255,255,255,0.35)";
const SET_MARKER_COLOR = "#f7c948";
const TIMELINE_POINT_RADIUS = 9;

const state = {
  snapshots: [],
  visibleSnapshots: [],
  impactChart: null,
  timelineChart: null,
  currentNames: ["P1", "P2", "P3", "P4"],
  playerRefs: [
    { id: null, name: "P1" },
    { id: null, name: "P2" },
    { id: null, name: "P3" },
    { id: null, name: "P4" }
  ],
  currentMatchId: null,
  neighbors: {
    previous: null,
    next: null
  },
  matchNote: "",
  matchType: null,
  matchLocation: null,
  matchTypeOptions: [],
  matchLocationOptions: [],
  matchStatus: null,
  winnerTeam: null,
  finishedAt: null,
  isMatchFinished: false
};

const dom = {
  payloadInput: document.getElementById("payloadInput"),
  loadBtn: document.getElementById("loadBtn"),
  error: document.getElementById("error"),
  status: document.getElementById("status"),
  mainView: document.getElementById("mainView"),
  inputPanel: document.getElementById("inputPanel"),
  namesPanel: document.getElementById("namesPanel"),
  sliderRow: document.getElementById("sliderRow"),
  timeSlider: document.getElementById("timeSlider"),
  timeLabel: document.getElementById("timeLabel"),
  team1Name: document.getElementById("team1Name"),
  team2Name: document.getElementById("team2Name"),
  team1Points: document.getElementById("team1Points"),
  team2Points: document.getElementById("team2Points"),
  team1ServerDot: document.getElementById("team1ServerDot"),
  team2ServerDot: document.getElementById("team2ServerDot"),
  t1p1Input: document.getElementById("t1p1"),
  t1p2Input: document.getElementById("t1p2"),
  t2p1Input: document.getElementById("t2p1"),
  t2p2Input: document.getElementById("t2p2"),
  applyNamesBtn: document.getElementById("applyNamesBtn"),
  editNamesBtn: document.getElementById("editNamesBtn"),
  editMetaBtn: document.getElementById("editMetaBtn"),
  matchLabel: document.getElementById("matchLabel"),
  setsStringDebug: document.getElementById("setsStringDebug"),
  lastPayloadDebug: document.getElementById("lastPayloadDebug"),
  snapshotIndexDebug: document.getElementById("snapshotIndexDebug"),
  statsTableBody: document.getElementById("statsTableBody"),
  playerStatsBody: document.getElementById("playerStatsBody"),
  timeStatsBody: document.getElementById("timeStatsBody"),
  notePanel: document.getElementById("notePanel"),
  matchTypeIcon: document.getElementById("matchTypeIcon"),
  matchLocationLogo: document.getElementById("matchLocationLogo"),
  matchTypeDisplay: document.getElementById("matchTypeDisplay"),
  matchLocationDisplay: document.getElementById("matchLocationDisplay"),
  noteDisplay: document.getElementById("noteDisplay"),
  matchMetaForm: document.getElementById("matchMetaForm"),
  matchTypeSelect: document.getElementById("matchTypeSelect"),
  matchLocationSelect: document.getElementById("matchLocationSelect"),
  matchTypeNewInput: document.getElementById("matchTypeNewInput"),
  matchLocationNewInput: document.getElementById("matchLocationNewInput"),
  noteInput: document.getElementById("noteInput"),
  saveMetaBtn: document.getElementById("saveMetaBtn"),
  timelineChart: document.getElementById("timelineChart"),
  timelineEmpty: document.getElementById("timelineEmpty"),
  prevMatchLink: document.getElementById("prevMatchLink"),
  nextMatchLink: document.getElementById("nextMatchLink")
};

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

function getPlayerRef(index) {
  return (
    state.playerRefs[index] || {
      id: null,
      name: state.currentNames[index] || `P${index + 1}`
    }
  );
}

function renderPlayerName(index, options = {}) {
  const ref = getPlayerRef(index);
  const baseName = state.currentNames[index] || ref.name || `P${index + 1}`;
  const label = options.uppercase ? baseName.toUpperCase() : baseName;
  const safeLabel = escapeHtml(label);
  if (ref.id) {
    return `<a class="player-link" href="/player/${ref.id}">${safeLabel}</a>`;
  }
  return safeLabel;
}

function normalizePlayerRef(entry, fallbackName, index) {
  if (entry) {
    return {
      id: entry.id ?? entry.playerId ?? null,
      name: entry.name || fallbackName || `P${index + 1}`
    };
  }
  return {
    id: null,
    name: fallbackName || `P${index + 1}`
  };
}

const setCells = [
  {
    root: document.getElementById("setCol1"),
    t1: document.getElementById("set1T1"),
    t2: document.getElementById("set1T2")
  },
  {
    root: document.getElementById("setCol2"),
    t1: document.getElementById("set2T1"),
    t2: document.getElementById("set2T2")
  },
  {
    root: document.getElementById("setCol3"),
    t1: document.getElementById("set3T1"),
    t2: document.getElementById("set3T2")
  }
];

document.addEventListener("DOMContentLoaded", () => {
  wireEventListeners();
  initializeFromUrl();
});

function wireEventListeners() {
  dom.editNamesBtn?.addEventListener("click", () => {
    if (!dom.namesPanel) return;
    const isHidden =
      dom.namesPanel.style.display === "none" ||
      getComputedStyle(dom.namesPanel).display === "none";
    dom.namesPanel.style.display = isHidden ? "block" : "none";
  });

  dom.editMetaBtn?.addEventListener("click", () => toggleMatchMetaForm());
  dom.saveMetaBtn?.addEventListener("click", handleSaveMatchMeta);
  dom.matchTypeSelect?.addEventListener("change", () => handleMetaSelectChange("type"));
  dom.matchLocationSelect?.addEventListener("change", () => handleMetaSelectChange("location"));

  dom.loadBtn?.addEventListener("click", handleManualLoad);

  dom.timeSlider?.addEventListener("input", () => {
    const idx = Number(dom.timeSlider.value) - 1;
    const max = state.snapshots.length;
    const safeIdx = Math.min(Math.max(idx, 0), Math.max(max - 1, 0));
    state.visibleSnapshots = state.snapshots.slice(0, safeIdx + 1);
    if (dom.timeLabel) {
      dom.timeLabel.textContent = `Point ${safeIdx + 1} / ${max}`;
    }
    buildFromVisible();
  });

  dom.applyNamesBtn?.addEventListener("click", handleApplyNames);
}

function initializeFromUrl() {
  const parts = window.location.pathname.split("/");
  const matchId = parts[parts.length - 1] || null;
  state.currentMatchId = matchId;

  if (!matchId) {
    setStatus("No match ID in URL.");
    return;
  }

  setStatus(`Loading match ${matchId}...`);
  autoLoadFromServer(matchId);
}

async function autoLoadFromServer(matchId) {
  try {
    clearError();
    const res = await fetch(`/api/match/${matchId}/history`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    state.snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    if (!state.snapshots.length) {
      setStatus("No snapshots found in DB for this match.");
      return;
    }
    state.visibleSnapshots = state.snapshots.slice();

    applyDbNames(data.players || []);
    updateMatchMeta({
      note: data.note,
      matchType: data.matchType,
      matchLocation: data.matchLocation,
      matchTypeOptions: data.matchTypeOptions,
      matchLocationOptions: data.matchLocationOptions,
      status: data.status,
      winnerTeam: data.winnerTeam,
      finishedAt: data.finishedAt
    });
    showMainView();
    syncSlider();

    setStatus(`Loaded ${state.snapshots.length} payloads for match ${matchId}.`);
    buildFromVisible();
    fetchNeighbors(matchId);
  } catch (err) {
    console.error(err);
    setError(`Failed to load match from server: ${err.message}`);
  }
}

function applyDbNames(playersFromDb) {
  if (!playersFromDb.length) {
    state.playerRefs = state.currentNames.map((name, idx) => ({
      id: null,
      name: name || `P${idx + 1}`
    }));
    if (dom.namesPanel) dom.namesPanel.style.display = "block";
    return;
  }

  const byKey = {};
  playersFromDb.forEach((p) => {
    byKey[`${p.team}-${p.slot}`] = {
      name: p.name,
      id: p.playerId || null
    };
  });

  state.currentNames = [
    byKey["1-1"]?.name || state.currentNames[0],
    byKey["1-2"]?.name || state.currentNames[1],
    byKey["2-1"]?.name || state.currentNames[2],
    byKey["2-2"]?.name || state.currentNames[3]
  ];

  state.playerRefs = [
    normalizePlayerRef(byKey["1-1"], state.currentNames[0], 0),
    normalizePlayerRef(byKey["1-2"], state.currentNames[1], 1),
    normalizePlayerRef(byKey["2-1"], state.currentNames[2], 2),
    normalizePlayerRef(byKey["2-2"], state.currentNames[3], 3)
  ];

  if (dom.namesPanel) dom.namesPanel.style.display = "none";
}

function getMetaButtonLabel() {
  const hasMeta =
    Boolean(state.matchNote && state.matchNote.trim()) ||
    Boolean(state.matchType) ||
    Boolean(state.matchLocation);
  return hasMeta ? "Edit match info" : "Add match info";
}

function updateMatchMeta(meta = {}) {
  if (Object.prototype.hasOwnProperty.call(meta, "note")) {
    state.matchNote = typeof meta.note === "string" ? meta.note : "";
  }
  if (Object.prototype.hasOwnProperty.call(meta, "matchType")) {
    state.matchType = meta.matchType ? { ...meta.matchType } : null;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "matchLocation")) {
    state.matchLocation = meta.matchLocation ? { ...meta.matchLocation } : null;
  }
  if (Array.isArray(meta.matchTypeOptions)) {
    state.matchTypeOptions = meta.matchTypeOptions.map((opt) => ({
      id: opt.id,
      name: opt.name,
      iconUrl: opt.iconUrl || null
    }));
  }
  if (Array.isArray(meta.matchLocationOptions)) {
    state.matchLocationOptions = meta.matchLocationOptions.map((opt) => ({
      id: opt.id,
      name: opt.name,
      logoUrl: opt.logoUrl || null
    }));
  }
  if (Object.prototype.hasOwnProperty.call(meta, "status")) {
    state.matchStatus = meta.status || null;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "winnerTeam")) {
    const winner = Number(meta.winnerTeam);
    state.winnerTeam = Number.isFinite(winner) ? winner : null;
  }
  if (Object.prototype.hasOwnProperty.call(meta, "finishedAt")) {
    state.finishedAt = meta.finishedAt || null;
  }

  state.isMatchFinished = state.matchStatus === "finished";

  syncMatchMetaDisplay();
  if (dom.matchMetaForm?.style.display === "block") {
    syncMatchMetaForm();
  }
}

function syncMatchMetaDisplay() {
  if (dom.noteDisplay) {
    dom.noteDisplay.textContent = state.matchNote || "—";
  }
  if (dom.matchTypeDisplay) {
    dom.matchTypeDisplay.textContent = state.matchType?.name || "—";
  }
  if (dom.matchLocationDisplay) {
    dom.matchLocationDisplay.textContent = state.matchLocation?.name || "—";
  }

  if (dom.matchTypeIcon) {
    if (state.matchType?.iconUrl) {
      dom.matchTypeIcon.src = state.matchType.iconUrl;
      dom.matchTypeIcon.style.display = "inline-block";
    } else {
      dom.matchTypeIcon.removeAttribute("src");
      dom.matchTypeIcon.style.display = "none";
    }
  }

  if (dom.matchLocationLogo) {
    if (state.matchLocation?.logoUrl) {
      dom.matchLocationLogo.src = state.matchLocation.logoUrl;
      dom.matchLocationLogo.style.display = "inline-block";
    } else {
      dom.matchLocationLogo.removeAttribute("src");
      dom.matchLocationLogo.style.display = "none";
    }
  }

  if (dom.editMetaBtn && dom.matchMetaForm?.style.display !== "block") {
    dom.editMetaBtn.textContent = getMetaButtonLabel();
  }
}

function populateMetaSelect(selectEl, options, currentId, emptyLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = emptyLabel;
  selectEl.appendChild(defaultOpt);

  options.forEach((opt) => {
    const optionEl = document.createElement("option");
    optionEl.value = String(opt.id);
    optionEl.textContent = opt.name;
    selectEl.appendChild(optionEl);
  });

  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "Add new...";
  selectEl.appendChild(newOpt);

  if (currentId) {
    selectEl.value = String(currentId);
  } else {
    selectEl.value = "";
  }
}

function handleMetaSelectChange(kind) {
  const select = kind === "type" ? dom.matchTypeSelect : dom.matchLocationSelect;
  const input = kind === "type" ? dom.matchTypeNewInput : dom.matchLocationNewInput;
  if (!select || !input) return;
  const isNew = select.value === "__new__";
  input.style.display = isNew ? "block" : "none";
  if (!isNew) input.value = "";
  if (isNew) {
    input.focus();
  }
}

function syncMatchMetaForm() {
  if (dom.matchTypeSelect) {
    populateMetaSelect(
      dom.matchTypeSelect,
      state.matchTypeOptions,
      state.matchType?.id || null,
      "No match type"
    );
  }
  if (dom.matchLocationSelect) {
    populateMetaSelect(
      dom.matchLocationSelect,
      state.matchLocationOptions,
      state.matchLocation?.id || null,
      "No location"
    );
  }
  if (dom.noteInput) {
    dom.noteInput.value = state.matchNote || "";
  }
  handleMetaSelectChange("type");
  handleMetaSelectChange("location");
}

function toggleMatchMetaForm(force) {
  if (!dom.matchMetaForm) return;
  const isOpen = dom.matchMetaForm.style.display === "block";
  const show = typeof force === "boolean" ? force : !isOpen;
  dom.matchMetaForm.style.display = show ? "block" : "none";
  if (dom.editMetaBtn) {
    dom.editMetaBtn.textContent = show ? "Close match info editor" : getMetaButtonLabel();
  }
  if (show) {
    syncMatchMetaForm();
  } else {
    if (dom.matchTypeNewInput) dom.matchTypeNewInput.value = "";
    if (dom.matchLocationNewInput) dom.matchLocationNewInput.value = "";
  }
}

async function handleSaveMatchMeta() {
  if (!state.currentMatchId) return;
  clearError();

  const payload = {
    note: dom.noteInput?.value ?? ""
  };

  if (dom.matchTypeSelect) {
    const selection = dom.matchTypeSelect.value;
    if (selection === "__new__") {
      const newName = (dom.matchTypeNewInput?.value || "").trim();
      if (!newName) {
        setError("Enter a match type name.");
        return;
      }
      payload.matchTypeName = newName;
      payload.matchTypeId = null;
    } else if (selection === "") {
      payload.matchTypeId = null;
    } else {
      const parsed = Number(selection);
      if (!Number.isFinite(parsed)) {
        setError("Invalid match type selected.");
        return;
      }
      payload.matchTypeId = parsed;
    }
  }

  if (dom.matchLocationSelect) {
    const selection = dom.matchLocationSelect.value;
    if (selection === "__new__") {
      const newName = (dom.matchLocationNewInput?.value || "").trim();
      if (!newName) {
        setError("Enter a location name.");
        return;
      }
      payload.matchLocationName = newName;
      payload.matchLocationId = null;
    } else if (selection === "") {
      payload.matchLocationId = null;
    } else {
      const parsed = Number(selection);
      if (!Number.isFinite(parsed)) {
        setError("Invalid location selected.");
        return;
      }
      payload.matchLocationId = parsed;
    }
  }

  try {
    const res = await fetch(`/api/match/${state.currentMatchId}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    updateMatchMeta({
      note: data.note ?? payload.note,
      matchType: data.matchType ?? null,
      matchLocation: data.matchLocation ?? null,
      matchTypeOptions: data.matchTypeOptions || state.matchTypeOptions,
      matchLocationOptions: data.matchLocationOptions || state.matchLocationOptions,
      status: data.status ?? state.matchStatus,
      winnerTeam: data.winnerTeam ?? state.winnerTeam,
      finishedAt: data.finishedAt ?? state.finishedAt
    });
    toggleMatchMetaForm(false);
    setStatus("Match info saved.");
  } catch (err) {
    console.error("Failed to save match info:", err);
    setError(`Failed to save match info: ${err.message}`);
  }
}

function showMainView() {
  if (dom.mainView) dom.mainView.style.display = "block";
  if (dom.inputPanel) dom.inputPanel.style.display = "none";
}

function syncSlider() {
  if (!dom.timeSlider || !dom.sliderRow) return;

  if (state.snapshots.length > 1) {
    dom.sliderRow.style.display = "flex";
    dom.timeSlider.min = "1";
    dom.timeSlider.max = String(state.snapshots.length);
    dom.timeSlider.value = String(state.snapshots.length);
    if (dom.timeLabel) {
      dom.timeLabel.textContent = `Point ${state.snapshots.length} / ${state.snapshots.length}`;
    }
  } else {
    dom.sliderRow.style.display = "none";
  }
}

function handleManualLoad() {
  clearError();
  setStatus("");
  if (dom.mainView) dom.mainView.style.display = "none";
  state.snapshots = [];
  state.visibleSnapshots = [];

  const lines = (dom.payloadInput?.value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    setError("No payload lines found.");
    return;
  }

  let matchId = null;
  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      if (!obj || typeof obj !== "object") continue;
      state.snapshots.push(obj);
      if (matchId == null && obj.matchId != null) {
        matchId = obj.matchId;
      }
    } catch (err) {
      setError(`Error parsing line ${i + 1}: ${err.message}`);
      return;
    }
  }

  if (!state.snapshots.length) {
    setError("No valid JSON objects parsed.");
    return;
  }

  if (matchId != null) {
    state.currentMatchId = String(matchId);
  }

  setStatus(`Loaded ${state.snapshots.length} payloads for match ${matchId ?? "?"}.`);
  showMainView();
  state.visibleSnapshots = state.snapshots.slice();
  updateMatchMeta({
    note: "",
    matchType: null,
    matchLocation: null,
    matchTypeOptions: [],
    matchLocationOptions: [],
    status: null,
    winnerTeam: null,
    finishedAt: null
  });
  syncSlider();
  buildFromVisible();
}

function handleApplyNames() {
  state.currentNames = [
    dom.t1p1Input?.value || "P1",
    dom.t1p2Input?.value || "P2",
    dom.t2p1Input?.value || "P3",
    dom.t2p2Input?.value || "P4"
  ];
  state.playerRefs = state.currentNames.map((name, idx) => ({
    id: state.playerRefs[idx]?.id ?? null,
    name: name || state.playerRefs[idx]?.name || `P${idx + 1}`
  }));
  updateNamesOnScoreboard();
  updateTeamStats();
  updatePlayerStatsTable();
  updateTimeStats();
  updateImpactChart();

  if (state.currentMatchId) {
    saveNames();
  }

  if (dom.namesPanel) dom.namesPanel.style.display = "none";
  if (dom.inputPanel) dom.inputPanel.style.display = "none";
}

async function saveNames() {
  try {
    await fetch(`/api/match/${state.currentMatchId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team1: { p1: state.currentNames[0], p2: state.currentNames[1] },
        team2: { p1: state.currentNames[2], p2: state.currentNames[3] }
      })
    });
  } catch (err) {
    console.error("Failed to save names:", err);
  }
}

function buildFromVisible() {
  if (!state.visibleSnapshots.length) return;
  const idx = state.visibleSnapshots.length - 1;
  const snap = state.visibleSnapshots[idx];

  const players = Array.isArray(snap.players) ? snap.players : [];
  state.currentNames = [
    players[0]?.name || state.currentNames[0] || "P1",
    players[1]?.name || state.currentNames[1] || "P2",
    players[2]?.name || state.currentNames[2] || "P3",
    players[3]?.name || state.currentNames[3] || "P4"
  ];

  if (dom.t1p1Input) dom.t1p1Input.value = state.currentNames[0];
  if (dom.t1p2Input) dom.t1p2Input.value = state.currentNames[1];
  if (dom.t2p1Input) dom.t2p1Input.value = state.currentNames[2];
  if (dom.t2p2Input) dom.t2p2Input.value = state.currentNames[3];

  updateNamesOnScoreboard();

  if (dom.matchLabel) {
    dom.matchLabel.textContent = snap.matchId ?? state.currentMatchId ?? "";
  }
  if (dom.setsStringDebug) {
    dom.setsStringDebug.textContent =
      typeof snap.sets === "string" ? snap.sets : JSON.stringify(snap.sets || {}, null, 2);
  }
  if (dom.snapshotIndexDebug) {
    dom.snapshotIndexDebug.textContent = `${idx + 1} / ${state.snapshots.length}`;
  }
  if (dom.lastPayloadDebug) {
    dom.lastPayloadDebug.textContent = JSON.stringify(snap, null, 2);
  }

  renderSetColumns(snap);
  renderPointsAndServer(snap);
  updateTeamStats();
  updatePlayerStatsTable();
  updateTimeStats();
  updateImpactChart();
  updateTimelineChart();
}

function renderSetColumns(snap) {
  const setsArr = parseSetsArray(
    typeof snap.sets === "string" ? snap.sets : "",
    snap.sets && typeof snap.sets === "object" ? snap.sets : null,
    snap.games
  );

  for (let i = 0; i < setCells.length; i++) {
    const column = setCells[i];
    const setScore = setsArr[i];
    const top = setScore && setScore.team1 != null ? setScore.team1 : "-";
    const bottom = setScore && setScore.team2 != null ? setScore.team2 : "-";
    column.t1.textContent = top;
    column.t2.textContent = bottom;
    if (column.root) {
      const hideColumn =
        state.isMatchFinished && shouldHideSetScore(top, bottom);
      column.root.style.display = hideColumn ? "none" : "";
    }
  }
}

function shouldHideSetScore(top, bottom) {
  const normalize = (value) => {
    if (value == null) return null;
    if (value === "-" || value === "—") return null;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    return value;
  };

  const topNorm = normalize(top);
  const bottomNorm = normalize(bottom);
  const bothMissing = topNorm == null && bottomNorm == null;
  const bothDash = (top === "-" || top == null) && (bottom === "-" || bottom == null);
  const bothZero =
    typeof topNorm === "number" &&
    typeof bottomNorm === "number" &&
    topNorm === 0 &&
    bottomNorm === 0;

  return bothMissing || bothDash || bothZero;
}

function renderPointsAndServer(snap) {
  const pts = snap.points || {};
  if (dom.team1Points) dom.team1Points.textContent = pts.team1 ?? "0";
  if (dom.team2Points) dom.team2Points.textContent = pts.team2 ?? "0";

  const serverTeam = serverTeamFromServerField(snap.server);
  if (dom.team1ServerDot) {
    dom.team1ServerDot.style.display = serverTeam === 1 ? "inline-block" : "none";
  }
  if (dom.team2ServerDot) {
    dom.team2ServerDot.style.display = serverTeam === 2 ? "inline-block" : "none";
  }
}

function updateNamesOnScoreboard() {
  const team1 = `${renderPlayerName(0, { uppercase: true })} / ${renderPlayerName(
    1,
    { uppercase: true }
  )}`;
  const team2 = `${renderPlayerName(2, { uppercase: true })} / ${renderPlayerName(
    3,
    { uppercase: true }
  )}`;
  if (dom.team1Name) dom.team1Name.innerHTML = team1;
  if (dom.team2Name) dom.team2Name.innerHTML = team2;
}

async function fetchNeighbors(matchId) {
  try {
    const res = await fetch(`/api/match/${matchId}/neighbors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.neighbors.previous = data.previous || null;
    state.neighbors.next = data.next || null;
  } catch (err) {
    console.error("Failed to load neighbors:", err);
    state.neighbors.previous = null;
    state.neighbors.next = null;
  } finally {
    updateMatchNavigation();
  }
}

function updateMatchNavigation() {
  const { previous, next } = state.neighbors;
  if (dom.prevMatchLink) {
    if (previous?.matchId) {
      dom.prevMatchLink.href = `/match/${previous.matchId}`;
      dom.prevMatchLink.textContent = `← Match #${previous.matchId}`;
      dom.prevMatchLink.style.display = "inline-block";
      dom.prevMatchLink.classList.remove("nav-link--disabled");
    } else {
      dom.prevMatchLink.href = "#";
      dom.prevMatchLink.style.display = "none";
      dom.prevMatchLink.classList.add("nav-link--disabled");
    }
  }
  if (dom.nextMatchLink) {
    if (next?.matchId) {
      dom.nextMatchLink.href = `/match/${next.matchId}`;
      dom.nextMatchLink.textContent = `Match #${next.matchId} →`;
      dom.nextMatchLink.style.display = "inline-block";
      dom.nextMatchLink.classList.remove("nav-link--disabled");
    } else {
      dom.nextMatchLink.href = "#";
      dom.nextMatchLink.style.display = "none";
      dom.nextMatchLink.classList.add("nav-link--disabled");
    }
  }
}

function updateTeamStats() {
  if (!state.visibleSnapshots.length || !dom.statsTableBody) return;
  const last = state.visibleSnapshots[state.visibleSnapshots.length - 1];
  const players = Array.isArray(last.players) ? last.players : [];

  const getTotals = (idxA, idxB) => {
    const a = players[idxA] || { winners: 0, errors: 0 };
    const b = players[idxB] || { winners: 0, errors: 0 };
    return {
      winners: Number(a.winners || 0) + Number(b.winners || 0),
      errors: Number(a.errors || 0) + Number(b.errors || 0)
    };
  };

  const team1 = getTotals(0, 1);
  const team2 = getTotals(2, 3);
  const bpStats = computeBreakStats(state.visibleSnapshots);
  const team1Label = `${renderPlayerName(0)} / ${renderPlayerName(1)}`;
  const team2Label = `${renderPlayerName(2)} / ${renderPlayerName(3)}`;

  const rows = [
    `
      <tr>
        <td>${team1Label}</td>
        <td class="stat-number">${team1.winners}</td>
        <td class="stat-number">${team1.errors}</td>
        <td class="stat-number">${team1.winners - team1.errors}</td>
        <td class="stat-number">${bpStats.team1.breaks}/${bpStats.team1.bps}</td>
      </tr>
    `,
    `
      <tr>
        <td>${team2Label}</td>
        <td class="stat-number">${team2.winners}</td>
        <td class="stat-number">${team2.errors}</td>
        <td class="stat-number">${team2.winners - team2.errors}</td>
        <td class="stat-number">${bpStats.team2.breaks}/${bpStats.team2.bps}</td>
      </tr>
    `
  ];

  dom.statsTableBody.innerHTML = rows.join("");
}

function updatePlayerStatsTable() {
  if (!dom.playerStatsBody) return;
  if (!state.visibleSnapshots.length) {
    dom.playerStatsBody.innerHTML = "";
    return;
  }

  const last = state.visibleSnapshots[state.visibleSnapshots.length - 1];
  const players = Array.isArray(last.players) ? last.players : [];
  const playerRows = [];
  let bestImpact = -Infinity;

  for (let i = 0; i < 4; i++) {
    const pl = players[i] || { winners: 0, errors: 0 };
    const w = Number(pl.winners || 0);
    const e = Number(pl.errors || 0);
    const impact = w - e;
    playerRows.push({
      index: i,
      name: state.currentNames[i] || `P${i + 1}`,
      winners: w,
      errors: e,
      impact
    });
    if (impact > bestImpact) bestImpact = impact;
  }

  const rows = playerRows
    .map(
      (row) => `
      <tr class="${row.impact === bestImpact ? "best-player" : ""}">
        <td>${renderPlayerName(row.index)}</td>
        <td class="stat-number">${row.winners}</td>
        <td class="stat-number">${row.errors}</td>
        <td class="stat-number">${row.impact}</td>
      </tr>
    `
    )
    .join("");

  dom.playerStatsBody.innerHTML = rows;
}

function updateTimeStats() {
  if (!dom.timeStatsBody) return;
  const stats = computeTimeStats(state.visibleSnapshots);
  if (!stats) {
    dom.timeStatsBody.innerHTML = `
      <tr><td>Match duration</td><td class="stat-number">N/A</td></tr>
      <tr><td>Shortest point</td><td class="stat-number">N/A</td></tr>
      <tr><td>Longest point</td><td class="stat-number">N/A</td></tr>
      <tr><td>Average point</td><td class="stat-number">N/A</td></tr>
    `;
    return;
  }

  dom.timeStatsBody.innerHTML = `
    <tr>
      <td>Match duration</td>
      <td class="stat-number">${formatDuration(stats.matchDuration)}</td>
    </tr>
    <tr>
      <td>Shortest point</td>
      <td class="stat-number">${formatDuration(stats.shortestPoint)}</td>
    </tr>
    <tr>
      <td>Longest point</td>
      <td class="stat-number">${formatDuration(stats.longestPoint)}</td>
    </tr>
    <tr>
      <td>Average point</td>
      <td class="stat-number">${formatDuration(stats.averagePoint)}</td>
    </tr>
  `;
}

function updateImpactChart() {
  const canvas = document.getElementById("impactChart");
  if (!canvas || !state.visibleSnapshots.length) {
    if (state.impactChart) {
      state.impactChart.destroy();
      state.impactChart = null;
    }
    return;
  }

  const labels = state.visibleSnapshots.map((_, i) => i + 1);
  const playerCount = 4;
  const datasets = [];

  for (let i = 0; i < playerCount; i++) {
    const label = (state.currentNames[i] || `P${i + 1}`).toUpperCase();
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const data = state.visibleSnapshots.map((snap) => {
      const players = Array.isArray(snap.players) ? snap.players : [];
      const pl = players[i] || { winners: 0, errors: 0 };
      return Number(pl.winners || 0) - Number(pl.errors || 0);
    });

    datasets.push({
      label,
      data,
      borderWidth: 2,
      borderColor: color,
      backgroundColor: color,
      tension: 0.3,
      fill: false
    });
  }

  const ctx = canvas.getContext("2d");
  if (state.impactChart) {
    state.impactChart.data.labels = labels;
    state.impactChart.data.datasets = datasets;
    state.impactChart.update();
    return;
  }

  state.impactChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          suggestedMin: -5,
          suggestedMax: 5,
          ticks: { color: "#f5f5f5" },
          grid: { color: "rgba(255,255,255,0.1)" }
        },
        x: {
          ticks: { color: "#f5f5f5" },
          grid: { display: false }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#f5f5f5" }
        }
      }
    }
  });
}

function setTimelineEmpty(message) {
  if (dom.timelineEmpty) {
    dom.timelineEmpty.textContent = message;
    dom.timelineEmpty.style.display = "flex";
  }
}

function hideTimelineEmpty() {
  if (dom.timelineEmpty) {
    dom.timelineEmpty.style.display = "none";
  }
}

function destroyTimelineChart(message) {
  if (state.timelineChart) {
    state.timelineChart.destroy();
    state.timelineChart = null;
  }
  if (message) {
    setTimelineEmpty(message);
  }
}

function computeRelativePointTimes(snaps) {
  const times = [];
  let base = null;
  let last = 0;
  for (const snap of snaps) {
    const raw = Number(snap?.timestamp);
    if (Number.isFinite(raw)) {
      if (base == null) base = raw;
      last = raw - base;
      times.push(last);
    } else {
      times.push(times.length ? last : times.length);
    }
  }
  return times;
}

function scoreValueToInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function extractSetArrayFromSnapshot(snap) {
  const setsString = typeof snap.sets === "string" ? snap.sets : "";
  const setsObj = snap.sets && typeof snap.sets === "object" ? snap.sets : null;
  return parseSetsArray(setsString, setsObj, snap.games);
}

function countGamesAndSets(snap) {
  const setArr = extractSetArrayFromSnapshot(snap);
  let totalGames = 0;
  for (const s of setArr) {
    const t1 = scoreValueToInt(s.team1);
    const t2 = scoreValueToInt(s.team2);
    if (t1 != null) totalGames += t1;
    if (t2 != null) totalGames += t2;
  }
  return {
    totalGames,
    setSlices: setArr.length
  };
}

function collectGameSetMarkers(snaps, times) {
  const markers = { games: [], sets: [] };
  let prevGames = null;
  let prevSlices = null;

  for (let i = 0; i < snaps.length; i++) {
    const { totalGames, setSlices } = countGamesAndSets(snaps[i]);
    const timeSec = times[i];

    if (prevGames != null && totalGames > prevGames) {
      for (let g = prevGames + 1; g <= totalGames; g++) {
        markers.games.push({ timeSec, label: `Game ${g}` });
      }
    }

    if (prevSlices != null && setSlices > prevSlices) {
      const completed = setSlices - 1;
      if (completed > 0) {
        markers.sets.push({ timeSec, label: `Set ${completed}` });
      }
    }

    prevGames = totalGames;
    prevSlices = setSlices;
  }

  return markers;
}

const timelineArrowPlugin = {
  id: "timelineArrowPlugin",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((element, index) => {
        const raw = dataset.data[index];
        if (!raw) return;
        const arrowColor = TIMELINE_ARROW_COLOR;
        const size = 8;
        const center = element.getCenterPoint();
        ctx.save();
        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        if (raw.eventType === "winner") {
          ctx.moveTo(center.x, center.y - size / 2);
          ctx.lineTo(center.x - size / 2, center.y + size / 2);
          ctx.lineTo(center.x + size / 2, center.y + size / 2);
        } else {
          ctx.moveTo(center.x, center.y + size / 2);
          ctx.lineTo(center.x - size / 2, center.y - size / 2);
          ctx.lineTo(center.x + size / 2, center.y - size / 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    });
  }
};

const timelineMarkerPlugin = {
  id: "timelineMarkerPlugin",
  afterDraw(chart) {
    const markerOpts = chart.options?.plugins?.timelineMarkers;
    if (!markerOpts) return;
    const xScale = chart.scales.x;
    const ctx = chart.ctx;
    const { top, bottom } = chart.chartArea;
    const drawMarker = (timeSec, color, label) => {
      const xPos = xScale.getPixelForValue(timeSec);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, xPos, top + 4);
      ctx.restore();
    };

    markerOpts.games.forEach((m) => drawMarker(m.timeSec, GAME_MARKER_COLOR, m.label));
    markerOpts.sets.forEach((m) => drawMarker(m.timeSec, SET_MARKER_COLOR, m.label));
  }
};

function updateTimelineChart() {
  const canvas = dom.timelineChart;
  if (!canvas) return;

  if (state.visibleSnapshots.length < 2) {
    destroyTimelineChart("Timeline appears once two points exist.");
    return;
  }

  const times = computeRelativePointTimes(state.visibleSnapshots);
  const events = [];
  for (let i = 1; i < state.visibleSnapshots.length; i++) {
    const prev = state.visibleSnapshots[i - 1];
    const curr = state.visibleSnapshots[i];
    const prevPlayers = Array.isArray(prev.players) ? prev.players : [];
    const currPlayers = Array.isArray(curr.players) ? curr.players : [];

    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const prevStats = prevPlayers[pIdx] || { winners: 0, errors: 0 };
      const currStats = currPlayers[pIdx] || { winners: 0, errors: 0 };
      const wDiff = Number(currStats.winners || 0) - Number(prevStats.winners || 0);
      const eDiff = Number(currStats.errors || 0) - Number(prevStats.errors || 0);

      if (wDiff > 0) {
        events.push({
          timeSec: times[i],
          team: pIdx < 2 ? 1 : 2,
          playerIndex: pIdx,
          eventType: "winner"
        });
      }
      if (eDiff > 0) {
        events.push({
          timeSec: times[i],
          team: pIdx < 2 ? 1 : 2,
          playerIndex: pIdx,
          eventType: "error"
        });
      }
    }
  }

  if (!events.length) {
    destroyTimelineChart("No winners or errors recorded yet.");
    return;
  }

  hideTimelineEmpty();
  const markers = collectGameSetMarkers(state.visibleSnapshots, times);

  const datasets = [];
  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const playerColor = PLAYER_COLORS[pIdx % PLAYER_COLORS.length];
    const playerEvents = events
      .filter((ev) => ev.playerIndex === pIdx)
      .map((ev) => ({
        x: ev.timeSec,
        y: ev.team,
        eventType: ev.eventType
      }));

    datasets.push({
      label: (state.currentNames[pIdx] || `P${pIdx + 1}`).toUpperCase(),
      data: playerEvents,
      pointRadius: TIMELINE_POINT_RADIUS,
      pointBackgroundColor: playerColor,
      pointBorderColor: playerColor,
      pointBorderWidth: 0,
      showLine: false
    });
  }

  const config = {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#f5f5f5" }
        },
        tooltip: {
          callbacks: {
            title: (items) =>
              items.length ? `Elapsed: ${formatDuration(items[0].raw.x)}` : "",
            label: (item) =>
              `${item.dataset.label} – ${
                item.raw.eventType === "winner" ? "Winner" : "Error"
              }`
          }
        },
        timelineMarkers: markers
      },
      scales: {
        x: {
          title: { display: true, text: "Elapsed Time", color: "#f5f5f5" },
          ticks: {
            color: "#f5f5f5",
            callback: (value) => formatDuration(value)
          },
          grid: { color: "rgba(255,255,255,0.1)" }
        },
        y: {
          type: "linear",
          suggestedMin: 0.5,
          suggestedMax: 2.5,
          ticks: {
            stepSize: 1,
            color: "#f5f5f5",
            callback: (value) => {
              if (value === 1) return "Team 1";
              if (value === 2) return "Team 2";
              return "";
            }
          },
          grid: { display: false }
        }
      }
    },
    plugins: [timelineArrowPlugin, timelineMarkerPlugin]
  };

  const ctx = canvas.getContext("2d");
  if (state.timelineChart) {
    state.timelineChart.data = config.data;
    state.timelineChart.options = config.options;
    state.timelineChart.update();
  } else {
    state.timelineChart = new Chart(ctx, config);
  }
}

function setStatus(message) {
  if (dom.status) dom.status.textContent = message;
}

function setError(message) {
  if (dom.error) dom.error.textContent = message;
}

function clearError() {
  setError("");
}
