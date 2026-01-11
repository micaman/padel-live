import {
  computeBreakStats,
  computeTimeStats,
  formatDuration,
  parseSetsArray,
  serverTeamFromServerField,
} from "./stats.js";
import {
  renderSetColumns as renderSetColumnsModule,
  renderPointsAndServer as renderPointsAndServerModule,
  updateNamesOnScoreboard as updateNamesOnScoreboardModule,
} from "./match/scoreboard.js";
import { createMetaHandlers } from "./match/meta.js";
import { createReplayControls } from "./match/replay.js";
const PLAYER_COLORS = ["#5ab0ff", "#57d657", "#f5a623", "#ff6b6b"];
const METRIC_COLORS = [
  "#f7c948",
  "#5ab0ff",
  "#57d657",
  "#ff6b6b",
  "#a970ff",
  "#00d1b2",
  "#f5a623",
];
const METRIC_DEFS = [
  { key: "calories", label: "Calories", path: ["metrics", "calories"] },
  { key: "distance", label: "Distance", path: ["metrics", "distance"] },
  { key: "steps", label: "Steps", path: ["metrics", "steps"] },
  {
    key: "stressScore",
    label: "Stress Score",
    path: ["metrics", "stressScore"],
  },
  {
    key: "respirationRate",
    label: "Respiration Rate",
    path: ["metrics", "respirationRate"],
  },
  {
    key: "heartRateMain",
    label: "Heart Rate (metrics)",
    path: ["metrics", "heartRate"],
  },
  {
    key: "heartRateAdditional",
    label: "Heart Rate (additional)",
    path: ["metrics", "additionalMetrics", "heartRate"],
  },
  {
    key: "temperature",
    label: "Temperature",
    path: ["metrics", "additionalMetrics", "temperature"],
  },
  {
    key: "pressure",
    label: "Pressure",
    path: ["metrics", "additionalMetrics", "pressure"],
  },
  {
    key: "oxygenSaturation",
    label: "Oxygen Saturation",
    path: ["metrics", "additionalMetrics", "oxygenSaturation"],
  },
  {
    key: "altitude",
    label: "Altitude",
    path: ["metrics", "additionalMetrics", "altitude"],
  },
];
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
const HEART_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-heart-fill" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314"/></svg>';
const AUTO_REFRESH_INTERVAL_MS = 5000;
const state = {
  snapshots: [],
  events: [],
  visibleSnapshots: [],
  visibleEvents: [],
  impactChart: null,
  metricCharts: {},
  currentNames: ["P1", "P2", "P3", "P4"],
  playerRefs: [
    { id: null, name: "P1" },
    { id: null, name: "P2" },
    { id: null, name: "P3" },
    { id: null, name: "P4" },
  ],
  currentMatchId: null,
  neighbors: {
    previous: null,
    next: null,
  },
  matchNote: "",
  matchType: null,
  matchLocation: null,
  matchTypeOptions: [],
  matchLocationOptions: [],
  matchStatus: null,
  winnerTeam: null,
  finishedAt: null,
  scheduledAt: null,
  matchLevel: null,
  matchCost: null,
  missingMetaCount: 0,
  deleteMode: false,
  isDeleting: false,
  isMatchFinished: false,
  autoRefreshEnabled: true,
  autoRefreshTimerId: null,
  isAutoRefreshing: false,
  sortState: {
    team: { key: "impact", dir: "desc" },
    player: { key: "impact", dir: "desc" },
  },
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
  replayBtn: document.getElementById("replayBtn"),
  team1Name: document.getElementById("team1Name"),
  team2Name: document.getElementById("team2Name"),
  team1Points: document.getElementById("team1Points"),
  team2Points: document.getElementById("team2Points"),
  t1p1Name: document.getElementById("t1p1Name"),
  t1p2Name: document.getElementById("t1p2Name"),
  t2p1Name: document.getElementById("t2p1Name"),
  t2p2Name: document.getElementById("t2p2Name"),
  t1p1ServerDot: document.getElementById("t1p1ServerDot"),
  t1p2ServerDot: document.getElementById("t1p2ServerDot"),
  t2p1ServerDot: document.getElementById("t2p1ServerDot"),
  t2p2ServerDot: document.getElementById("t2p2ServerDot"),
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
  playerStatsDetailsCards: document.getElementById("playerStatsDetailsCards"),
  timeStatsBody: document.getElementById("timeStatsBody"),
  notePanel: document.getElementById("notePanel"),
  matchTypeIcon: document.getElementById("matchTypeIcon"),
  matchLocationLogo: document.getElementById("matchLocationLogo"),
  matchTypeDisplay: document.getElementById("matchTypeDisplay"),
  matchLocationDisplay: document.getElementById("matchLocationDisplay"),
  scheduledAtDisplay: document.getElementById("scheduledAtDisplay"),
  matchLevelDisplay: document.getElementById("matchLevelDisplay"),
  matchCostDisplay: document.getElementById("matchCostDisplay"),
  noteDisplay: document.getElementById("noteDisplay"),
  keyMomentsList: document.getElementById("keyMomentsList"),
  matchMetaForm: document.getElementById("matchMetaForm"),
  matchTypeSelect: document.getElementById("matchTypeSelect"),
  matchLocationSelect: document.getElementById("matchLocationSelect"),
  matchTypeNewInput: document.getElementById("matchTypeNewInput"),
  matchLocationNewInput: document.getElementById("matchLocationNewInput"),
  scheduledAtInput: document.getElementById("scheduledAtInput"),
  matchLevelSelect: document.getElementById("matchLevelSelect"),
  matchCostInput: document.getElementById("matchCostInput"),
  noteInput: document.getElementById("noteInput"),
  saveMetaBtn: document.getElementById("saveMetaBtn"),
  applyMetaAllBtn: document.getElementById("applyMetaAllBtn"),
  gameHistoryBody: document.getElementById("gameHistoryBody"),
  gameHistoryActionHeader: document.getElementById("gameHistoryActionHeader"),
  metricsCharts: document.getElementById("metricsCharts"),
  metricsEmpty: document.getElementById("metricsEmpty"),
  prevMatchLink: document.getElementById("prevMatchLink"),
  nextMatchLink: document.getElementById("nextMatchLink"),
  playerMomentsList: document.getElementById("playerMomentsList"),
  teamMomentsList: document.getElementById("teamMomentsList"),
  adminActions: document.getElementById("adminActions"),
  deleteMatchBtn: document.getElementById("deleteMatchBtn"),
  autoRefreshBtn: document.getElementById("autoRefreshBtn"),
  livePill: document.getElementById("livePill"),
};
const playerNameEls = [dom.t1p1Name, dom.t1p2Name, dom.t2p1Name, dom.t2p2Name];
const serverDots = [
  dom.t1p1ServerDot,
  dom.t1p2ServerDot,
  dom.t2p1ServerDot,
  dom.t2p2ServerDot,
];
function computeMvpIndicesFromSnapshot(snap) {
  if (!state.isMatchFinished) return [];
  const players = Array.isArray(snap?.players) ? snap.players : [];
  if (!players.length) return [];
  const impacts = [];
  for (let i = 0; i < 4; i++) {
    const pl = players[i] || { winners: 0, errors: 0 };
    const impact = Number(pl.winners || 0) - Number(pl.errors || 0);
    impacts.push(impact);
  }
  const maxImpact = Math.max(...impacts);
  if (!Number.isFinite(maxImpact)) return [];
  return impacts.reduce((acc, val, idx) => {
    if (val === maxImpact) acc.push(idx);
    return acc;
  }, []);
}
function updateMvpBadges(snap) {
  const chips = document.querySelectorAll(".player-chip");
  chips.forEach((chip) => chip.classList.remove("is-mvp"));
  if (!snap || !state.isMatchFinished) return;
  const mvpIndices = computeMvpIndicesFromSnapshot(snap);
  mvpIndices.forEach((idx) => {
    const chip = document.querySelector(
      `.player-chip[data-player-index="${idx}"]`,
    );
    if (chip) chip.classList.add("is-mvp");
  });
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
function stripHtmlTags(value) {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "");
}
function getPlayerRef(index) {
  return (
    state.playerRefs[index] || {
      id: null,
      name: state.currentNames[index] || `P${index + 1}`,
    }
  );
}
function renderPlayerName(index, options = {}) {
  const ref = getPlayerRef(index);
  const baseName = state.currentNames[index] || ref.name || `P${index + 1}`;
  const labelBase =
    window.innerWidth <= 520 ? abbreviateName(baseName) : baseName;
  const label = options.uppercase ? labelBase.toUpperCase() : labelBase;
  const safeLabel = escapeHtml(label);
  if (ref.id) {
    return `<a class="player-link" href="/player/${ref.id}">${safeLabel}</a>`;
  }
  return safeLabel;
}
function abbreviateName(name) {
  if (typeof name !== "string") return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  const initial = first.charAt(0);
  return `${initial}. ${rest}`;
}
function abbreviateToInitials(name) {
  if (typeof name !== "string") return name;
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return name;
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}
function normalizePlayerRef(entry, fallbackName, index) {
  if (entry) {
    return {
      id: entry.id ?? entry.playerId ?? null,
      name: entry.name || fallbackName || `P${index + 1}`,
    };
  }
  return {
    id: null,
    name: fallbackName || `P${index + 1}`,
  };
}
function formatEventPlayerLabel(index) {
  const base = state.currentNames[index] || `P${index + 1}`;
  const isCompact = window.innerWidth <= 640;
  const label = isCompact ? abbreviateToInitials(base) : base;
  return escapeHtml(label);
}
const setCells = [
  {
    root: document.getElementById("setCol1"),
    t1: document.getElementById("set1T1"),
    t2: document.getElementById("set1T2"),
  },
  {
    root: document.getElementById("setCol2"),
    t1: document.getElementById("set2T1"),
    t2: document.getElementById("set2T2"),
  },
  {
    root: document.getElementById("setCol3"),
    t1: document.getElementById("set3T1"),
    t2: document.getElementById("set3T2"),
  },
];
const {
  updateMatchMeta: updateMatchMetaBase,
  toggleMatchMetaForm,
  handleSaveMatchMeta,
  handleMetaSelectChange,
} = createMetaHandlers({ state, dom, setStatus, setError, clearError });
const { stopReplay, applySliderValue, startReplay, syncSlider } =
  createReplayControls({ state, dom, buildFromVisible });
document.addEventListener("DOMContentLoaded", () => {
  wireEventListeners();
  syncAutoRefreshUi();
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
  dom.saveMetaBtn?.addEventListener("click", async () => {
    const result = await handleSaveMatchMeta();
    syncMetaApplyState(result);
    syncAutoRefreshState();
  });
  dom.applyMetaAllBtn?.addEventListener("click", async () => {
    const result = await handleSaveMatchMeta({ applyToAll: true });
    syncMetaApplyState(result);
    syncAutoRefreshState();
  });
  dom.matchTypeSelect?.addEventListener("change", () =>
    handleMetaSelectChange("type"),
  );
  dom.matchLocationSelect?.addEventListener("change", () =>
    handleMetaSelectChange("location"),
  );
  dom.loadBtn?.addEventListener("click", handleManualLoad);
  dom.autoRefreshBtn?.addEventListener("click", () => {
    state.autoRefreshEnabled = !state.autoRefreshEnabled;
    syncAutoRefreshState(true);
  });
  dom.timeSlider?.addEventListener("input", () => {
    stopReplay();
    applySliderValue(dom.timeSlider.value);
  });
  dom.replayBtn?.addEventListener("click", startReplay);
  dom.applyNamesBtn?.addEventListener("click", handleApplyNames);
  dom.deleteMatchBtn?.addEventListener("click", handleDeleteMatch);
  dom.gameHistoryBody?.addEventListener("click", handleGameHistoryClick);
}
function initializeFromUrl() {
  const parts = window.location.pathname.split("/");
  const matchId = parts[parts.length - 1] || null;
  state.currentMatchId = matchId;
  const params = new URLSearchParams(window.location.search);
  state.deleteMode = params.has("delete");
  updateDeleteModeUi();
  syncAutoRefreshUi();
  if (!matchId) {
    setStatus("No match ID in URL.");
    return;
  }
  setStatus(`Loading match ${matchId}...`);
  autoLoadFromServer(matchId);
}
function normalizeEventsPayload(events, snapshotsFallback = []) {
  if (Array.isArray(events) && events.length) {
    return events.filter(Boolean).map((ev) => ({
      id: ev.id ?? null,
      raw: ev.raw || {},
      watchTimestamp: ev.watchTimestamp ?? ev.watch_timestamp ?? null,
      receivedAt: ev.receivedAt ?? ev.received_at ?? null,
    }));
  }
  return (Array.isArray(snapshotsFallback) ? snapshotsFallback : []).map(
    (snap) => ({
      id: null,
      raw: snap || {},
      watchTimestamp: snap?.timestamp ?? null,
      receivedAt: null,
    }),
  );
}
function setEventsState(events, snapshotsFallback = []) {
  state.events = normalizeEventsPayload(events, snapshotsFallback);
  state.snapshots = state.events.map((e) => e.raw);
  state.visibleEvents = state.events.slice();
  state.visibleSnapshots = state.snapshots.slice();
}
function syncAutoRefreshUi() {
  if (dom.autoRefreshBtn) {
    const disableRefresh = state.isMatchFinished || !state.currentMatchId;
    const enabled = state.autoRefreshEnabled && !disableRefresh;
    let label = "Auto refresh: Off";
    if (state.isMatchFinished) {
      label = "Match finished";
    } else if (!state.currentMatchId) {
      label = "Auto refresh unavailable";
    } else if (state.autoRefreshEnabled) {
      label = "Auto refresh: On";
    }
    dom.autoRefreshBtn.textContent = label;
    dom.autoRefreshBtn.classList.toggle("pill-btn--off", !enabled);
    dom.autoRefreshBtn.disabled = disableRefresh;
  }
  if (dom.livePill) {
    const show =
      state.autoRefreshEnabled &&
      !state.isMatchFinished &&
      Boolean(state.autoRefreshTimerId);
    dom.livePill.style.display = show ? "inline-flex" : "none";
  }
}
function syncApplyMetaAllButton() {
  if (!dom.applyMetaAllBtn) return;
  const count = Number(state.missingMetaCount || 0);
  const remaining = Math.max(0, count - 1);
  if (remaining > 0) {
    dom.applyMetaAllBtn.style.display = "inline-flex";
    dom.applyMetaAllBtn.textContent = `Apply to ${remaining} other infoless match${
      remaining === 1 ? "" : "es"
    }`;
  } else {
    dom.applyMetaAllBtn.style.display = "none";
  }
}
function syncMetaApplyState(result) {
  if (result && typeof result.missingMetaCount === "number") {
    state.missingMetaCount = result.missingMetaCount;
  }
  syncApplyMetaAllButton();
}
function stopAutoRefresh() {
  if (state.autoRefreshTimerId) {
    clearInterval(state.autoRefreshTimerId);
    state.autoRefreshTimerId = null;
  }
}
function startAutoRefresh(immediate = false) {
  if (state.autoRefreshTimerId) return;
  if (
    !state.currentMatchId ||
    state.isMatchFinished ||
    !state.autoRefreshEnabled
  )
    return;
  state.autoRefreshTimerId = setInterval(() => {
    refreshMatchQuietly();
  }, AUTO_REFRESH_INTERVAL_MS);
  if (immediate) {
    refreshMatchQuietly();
  }
}
async function refreshMatchQuietly() {
  if (!state.currentMatchId || state.isAutoRefreshing) return;
  state.isAutoRefreshing = true;
  try {
    await autoLoadFromServer(state.currentMatchId, {
      silent: true,
      skipNeighbors: true,
    });
  } catch (err) {
    console.error("Auto-refresh failed:", err);
  } finally {
    state.isAutoRefreshing = false;
  }
}
function syncAutoRefreshState(immediate = false) {
  if (
    !state.autoRefreshEnabled ||
    state.isMatchFinished ||
    !state.currentMatchId
  ) {
    stopAutoRefresh();
  } else {
    startAutoRefresh(immediate);
  }
  syncAutoRefreshUi();
}
function updateMatchMeta(meta) {
  updateMatchMetaBase(meta);
  syncAutoRefreshState();
}
async function autoLoadFromServer(matchId, options = {}) {
  const { silent = false, skipNeighbors = false } = options || {};
  try {
    clearError();
    if (!matchId) {
      setStatus("No match ID in URL.");
      return;
    }
    if (!silent) {
      setStatus(`Loading match ${matchId}...`);
    }
    const res = await fetch(`/api/match/${matchId}/history`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.missingMetaCount =
      typeof data.missingMetaCount === "number" ? data.missingMetaCount : 0;
    const snapshotsFromApi = Array.isArray(data.snapshots)
      ? data.snapshots
      : [];
    setEventsState(data.events, snapshotsFromApi);
    if (!state.snapshots.length) {
      if (!silent) {
        setStatus("No snapshots found in DB for this match.");
      }
      syncApplyMetaAllButton();
      syncAutoRefreshState();
      return;
    }
    applyDbNames(data.players || []);
    updateMatchMeta({
      note: data.note,
      matchType: data.matchType,
      matchLocation: data.matchLocation,
      matchTypeOptions: data.matchTypeOptions,
      matchLocationOptions: data.matchLocationOptions,
      status: data.status,
      winnerTeam: data.winnerTeam,
      finishedAt: data.finishedAt,
      scheduledAt: data.scheduledAt,
      matchLevel: data.matchLevel,
      matchCost: data.matchCost,
    });
    syncApplyMetaAllButton();
    showMainView();
    syncSlider();
    if (!silent) {
      setStatus(
        `Loaded ${state.snapshots.length} payloads for match ${matchId}.`,
      );
    }
    buildFromVisible();
    if (!skipNeighbors) {
      fetchNeighbors(matchId);
    }
  } catch (err) {
    console.error(err);
    if (!silent) {
      setError(`Failed to load match from server: ${err.message}`);
    }
  } finally {
    syncAutoRefreshUi();
  }
}
function applyDbNames(playersFromDb) {
  if (!playersFromDb.length) {
    state.playerRefs = state.currentNames.map((name, idx) => ({
      id: null,
      name: name || `P${idx + 1}`,
    }));
    if (dom.namesPanel) dom.namesPanel.style.display = "block";
    return;
  }
  const byKey = {};
  playersFromDb.forEach((p) => {
    byKey[`${p.team}-${p.slot}`] = {
      name: p.name,
      id: p.playerId || null,
    };
  });
  state.currentNames = [
    byKey["1-1"]?.name || state.currentNames[0],
    byKey["1-2"]?.name || state.currentNames[1],
    byKey["2-1"]?.name || state.currentNames[2],
    byKey["2-2"]?.name || state.currentNames[3],
  ];
  state.playerRefs = [
    normalizePlayerRef(byKey["1-1"], state.currentNames[0], 0),
    normalizePlayerRef(byKey["1-2"], state.currentNames[1], 1),
    normalizePlayerRef(byKey["2-1"], state.currentNames[2], 2),
    normalizePlayerRef(byKey["2-2"], state.currentNames[3], 3),
  ];
  if (dom.namesPanel) dom.namesPanel.style.display = "none";
}
function showMainView() {
  if (dom.mainView) dom.mainView.style.display = "block";
  if (dom.inputPanel) dom.inputPanel.style.display = "none";
}
function updateDeleteModeUi() {
  if (dom.adminActions)
    dom.adminActions.style.display = state.deleteMode ? "flex" : "none";
  if (dom.gameHistoryActionHeader)
    dom.gameHistoryActionHeader.style.display = state.deleteMode ? "" : "none";
}
function handleManualLoad() {
  clearError();
  setStatus("");
  if (dom.mainView) dom.mainView.style.display = "none";
  state.snapshots = [];
  state.events = [];
  state.visibleSnapshots = [];
  state.visibleEvents = [];
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
  setStatus(
    `Loaded ${state.snapshots.length} payloads for match ${matchId ?? "?"}.`,
  );
  showMainView();
  setEventsState([], state.snapshots);
  updateMatchMeta({
    note: "",
    matchType: null,
    matchLocation: null,
    matchTypeOptions: [],
    matchLocationOptions: [],
    status: null,
    winnerTeam: null,
    finishedAt: null,
    scheduledAt: null,
    matchLevel: null,
    matchCost: null,
  });
  state.missingMetaCount = 0;
  syncApplyMetaAllButton();
  syncSlider();
  buildFromVisible();
}
function handleApplyNames() {
  state.currentNames = [
    dom.t1p1Input?.value || "P1",
    dom.t1p2Input?.value || "P2",
    dom.t2p1Input?.value || "P3",
    dom.t2p2Input?.value || "P4",
  ];
  state.playerRefs = state.currentNames.map((name, idx) => ({
    id: state.playerRefs[idx]?.id ?? null,
    name: name || state.playerRefs[idx]?.name || `P${idx + 1}`,
  }));
  updateNamesOnScoreboard();
  updateTeamStats();
  updatePlayerStatsTable();
  updatePlayerStatsDetailsTable();
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
        team2: { p1: state.currentNames[2], p2: state.currentNames[3] },
      }),
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
    players[3]?.name || state.currentNames[3] || "P4",
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
      typeof snap.sets === "string"
        ? snap.sets
        : JSON.stringify(snap.sets || {}, null, 2);
  }
  if (dom.snapshotIndexDebug) {
    dom.snapshotIndexDebug.textContent = `${idx + 1} / ${state.snapshots.length}`;
  }
  if (dom.lastPayloadDebug) {
    dom.lastPayloadDebug.textContent = JSON.stringify(snap, null, 2);
  }
  renderSetColumns(snap);
  renderPointsAndServer(snap);
  updateMvpBadges(snap);
  updateTeamStats();
  updatePlayerStatsTable();
  updatePlayerStatsDetailsTable();
  updateTimeStats();
  updateImpactChart();
  updateMetricsCharts();
  updateGameHistory();
  renderKeyMoments();
}
function renderSetColumns(snap) {
  const setsArr = parseSetsArray(
    typeof snap.sets === "string" ? snap.sets : "",
    snap.sets && typeof snap.sets === "object" ? snap.sets : null,
    snap.games,
  );
  renderSetColumnsModule(setsArr, state.isMatchFinished, setCells);
}
function renderPointsAndServer(snap) {
  renderPointsAndServerModule(snap, dom, serverDots, state.isMatchFinished);
}
function updateNamesOnScoreboard() {
  updateNamesOnScoreboardModule(renderPlayerName, playerNameEls);
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
      dom.prevMatchLink.textContent = `\u2190 Previous match`;
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
      dom.nextMatchLink.textContent = `Next match \u2192`;
      dom.nextMatchLink.style.display = "inline-block";
      dom.nextMatchLink.classList.remove("nav-link--disabled");
    } else {
      dom.nextMatchLink.href = "#";
      dom.nextMatchLink.style.display = "none";
      dom.nextMatchLink.classList.add("nav-link--disabled");
    }
  }
}
function getSortState(key, defaultKey, defaultDir = "desc") {
  if (!state.sortState[key]) {
    state.sortState[key] = { key: defaultKey, dir: defaultDir };
  }
  return state.sortState[key];
}
function renderSortableHeader(tableEl, columns, sortKey, onSortChange) {
  if (!tableEl) return;
  const thead = tableEl.querySelector("thead");
  if (!thead) return;
  const sortState = getSortState(
    sortKey,
    columns.find((c) => c.sortable)?.key ?? null,
  );
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
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      const current = getSortState(
        sortKey,
        columns.find((c) => c.sortable)?.key ?? key,
      );
      const dir =
        current.key === key && current.dir === "desc" ? "asc" : "desc";
      state.sortState[sortKey] = { key, dir };
      onSortChange?.();
    });
  });
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
      errors: Number(a.errors || 0) + Number(b.errors || 0),
    };
  };
  const team1 = getTotals(0, 1);
  const team2 = getTotals(2, 3);
  const bpStats = computeBreakStats(state.visibleSnapshots) || {
    team1: { breaks: 0, bps: 0 },
    team2: { breaks: 0, bps: 0 },
  };
  const team1Label = `${renderPlayerName(0)} / ${renderPlayerName(1)}`;
  const team2Label = `${renderPlayerName(2)} / ${renderPlayerName(3)}`;
  const rows = [
    {
      label: team1Label,
      winners: team1.winners,
      errors: team1.errors,
      impact: team1.winners - team1.errors,
      breaks: Number(bpStats.team1.breaks || 0),
      bps: Number(bpStats.team1.bps || 0),
    },
    {
      label: team2Label,
      winners: team2.winners,
      errors: team2.errors,
      impact: team2.winners - team2.errors,
      breaks: Number(bpStats.team2.breaks || 0),
      bps: Number(bpStats.team2.bps || 0),
    },
  ];
  const columns = [
    { key: "label", label: "Team", sortable: false },
    { key: "winners", label: "Winners", sortable: true, numeric: true },
    { key: "errors", label: "Errors", sortable: true, numeric: true },
    { key: "impact", label: "Impact (W - E)", sortable: true, numeric: true },
    { key: "breaks", label: "Breaks/BPs", sortable: true, numeric: true },
  ];
  const tableEl = dom.statsTableBody.closest("table");
  renderSortableHeader(tableEl, columns, "team", () => updateTeamStats());
  const sortState = getSortState("team", "impact");
  const sortableKeys = new Set(
    columns.filter((c) => c.sortable).map((c) => c.key),
  );
  const sortKey = sortableKeys.has(sortState.key) ? sortState.key : "impact";
  const dir = sortState.dir === "asc" ? 1 : -1;
  const sortedRows = [...rows].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === vb) return 0;
    return va > vb ? dir : -dir;
  });
  const best = {
    winners: Math.max(...rows.map((r) => r.winners)),
    breaks: Math.max(...rows.map((r) => r.breaks)),
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
    if (key === "winners" || key === "breaks") {
      return value === best[key] ? "best-cell-good" : "";
    }
    return "";
  };
  dom.statsTableBody.innerHTML = sortedRows
    .map(
      (row) => `
      <tr>
        <td>${row.label}</td>
        <td class="stat-number ${cellClass("winners", row.winners)}">${row.winners}</td>
        <td class="stat-number ${cellClass("errors", row.errors)}">${row.errors}</td>
        <td class="stat-number ${cellClass("impact", row.impact)}">${row.impact}</td>
        <td class="stat-number ${cellClass("breaks", row.breaks)}">${row.breaks}/${row.bps}</td>
      </tr>
    `,
    )
    .join("");
}
function getPlayerSummaryRows() {
  if (!state.visibleSnapshots.length) return [];
  const last = state.visibleSnapshots[state.visibleSnapshots.length - 1];
  const players = Array.isArray(last.players) ? last.players : [];
  const playerRows = [];
  for (let i = 0; i < 4; i++) {
    const pl = players[i] || { winners: 0, errors: 0 };
    const w = Number(pl.winners || 0);
    const e = Number(pl.errors || 0);
    const impact = w - e;
    playerRows.push({
      index: i,
      winners: w,
      errors: e,
      impact,
    });
  }
  return playerRows;
}
function sortPlayerRows(rows) {
  const sortState = getSortState("player", "impact");
  const sortableKeys = new Set(["winners", "errors", "impact"]);
  const sortKey = sortableKeys.has(sortState.key) ? sortState.key : "impact";
  const dir = sortState.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === vb) return a.index - b.index;
    return va > vb ? dir : -dir;
  });
}
function updatePlayerStatsTable() {
  if (!dom.playerStatsBody) return;
  if (!state.visibleSnapshots.length) {
    dom.playerStatsBody.innerHTML = "";
    return;
  }
  const playerRows = getPlayerSummaryRows();
  const columns = [
    { key: "label", label: "Player", sortable: false },
    { key: "winners", label: "Winners", sortable: true, numeric: true },
    { key: "errors", label: "Errors", sortable: true, numeric: true },
    { key: "impact", label: "Impact (W - E)", sortable: true, numeric: true },
  ];
  const tableEl = dom.playerStatsBody.closest("table");
  renderSortableHeader(tableEl, columns, "player", () => {
    updatePlayerStatsTable();
    updatePlayerStatsDetailsTable();
  });
  const sortedRows = sortPlayerRows(playerRows);
  const best = {
    winners: Math.max(...playerRows.map((r) => r.winners)),
    impact: Math.max(...playerRows.map((r) => r.impact)),
  };
  const worst = {
    errors: Math.max(...playerRows.map((r) => r.errors)),
    impact: Math.min(...playerRows.map((r) => r.impact)),
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
  dom.playerStatsBody.innerHTML = sortedRows
    .map(
      (row) => `
      <tr>
        <td>${renderPlayerName(row.index)}</td>
        <td class="stat-number ${cellClass("winners", row.winners)}">${row.winners}</td>
        <td class="stat-number ${cellClass("errors", row.errors)}">${row.errors}</td>
        <td class="stat-number ${cellClass("impact", row.impact)}">${row.impact}</td>
      </tr>
    `,
    )
    .join("");
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
    return `<span class="text-muted">None yet</span>`;
  }
  return `<div class="detail-chips">${chips.join("")}</div>`;
}
function updatePlayerStatsDetailsTable() {
  const detailData = computePlayerDetailBreakdown(state.visibleSnapshots);
  const playerRows = getPlayerSummaryRows();
  const playerOrder = sortPlayerRows(playerRows).map((row) => row.index);
  renderDetailCards(detailData, playerOrder);
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
function renderDetailCards(detailData, playerOrder = []) {
  const container = dom.playerStatsDetailsCards;
  if (!container) return;
  if (!state.visibleSnapshots.length) {
    container.innerHTML = "";
    return;
  }
  if (!detailData.totalEvents) {
    container.innerHTML = `<div class="text-muted">No detailed stats yet.</div>`;
    return;
  }
  const effectiveOrder =
    playerOrder && playerOrder.length
      ? playerOrder
      : detailData.rows.map((_, idx) => idx);
  container.innerHTML = effectiveOrder
    .map((playerIdx) => {
      const row = detailData.rows[playerIdx] || {
        winners: createWinnerDetailBuckets(),
        errors: createErrorDetailBuckets(),
      };
      const totalWinners = WINNER_DETAIL_KEYS.reduce(
        (sum, key) => sum + Number(row.winners[key] || 0),
        0,
      );
      const totalErrors = ERROR_DETAIL_KEYS.reduce(
        (sum, key) => sum + Number(row.errors[key] || 0),
        0,
      );
      const winnersHtml = formatDetailChips(
        row.winners,
        WINNER_DETAIL_KEYS,
        WINNER_DETAIL_LABELS,
      );
      const errorsHtml = formatDetailChips(
        row.errors,
        ERROR_DETAIL_KEYS,
        ERROR_DETAIL_LABELS,
      );
      const impact = totalWinners - totalErrors;
      const winnersSectionHtml =
        totalWinners > 0
          ? `
          <div class="detail-card__section">
            <div class="detail-section-title">Winners</div>
            ${winnersHtml}
          </div>`
          : "";
      const errorsSectionMargin = winnersSectionHtml ? ' style="margin-top:8px;"' : "";
      return `
        <div class="detail-card">
          <div class="detail-card__header">
            <span>${renderPlayerName(playerIdx)}</span>
            <div class="detail-card__badges">
              <span class="detail-card__badge">${totalWinners}W / ${totalErrors}E / ${impact >= 0 ? "+" : ""}${impact}</span>
            </div>
          </div>
          ${winnersSectionHtml}
          <div class="detail-card__section"${errorsSectionMargin}>
            <div class="detail-section-title">Errors</div>
            ${errorsHtml}
          </div>
        </div>
      `;
    })
    .join("");
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
function renderKeyMoments() {
  const moments = computeKeyMoments(state.visibleSnapshots);
  const renderList = (el, list) => {
    if (!el) return;
    if (!list || !list.length) {
      el.innerHTML = "<li>Not enough data yet.</li>";
      return;
    }
    el.innerHTML = list.map((entry) => `<li>${entry.text}</li>`).join("");
  };
  renderList(dom.playerMomentsList, moments.player);
  renderList(dom.teamMomentsList, moments.team);
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
      fill: false,
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
          grid: { color: "rgba(255,255,255,0.1)" },
        },
        x: {
          ticks: { color: "#f5f5f5" },
          grid: { display: false },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#f5f5f5" },
        },
      },
    },
  });
}
function readMetricValue(snap, path) {
  if (!snap) return null;
  let current = snap;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  if (current === null || current === undefined || current === "") return null;
  const num = Number(current);
  return Number.isFinite(num) ? num : null;
}
function collectMetricSeries() {
  if (!state.visibleSnapshots.length) return [];
  const times = computeRelativePointTimes(state.visibleSnapshots);
  return METRIC_DEFS.map((def, idx) => {
    const points = state.visibleSnapshots.map((snap, snapIdx) => ({
      x: times[snapIdx] ?? snapIdx,
      y: readMetricValue(snap, def.path),
    }));
    const hasValue = points.some((pt) => pt.y !== null);
    return {
      ...def,
      color: METRIC_COLORS[idx % METRIC_COLORS.length],
      points,
      hasValue,
    };
  }).filter((series) => series.hasValue);
}
function destroyMetricCharts() {
  Object.values(state.metricCharts).forEach((chart) => chart.destroy());
  state.metricCharts = {};
}
function ensureMetricCard(key, label) {
  if (!dom.metricsCharts) return null;
  let card = dom.metricsCharts.querySelector(`[data-metric="${key}"]`);
  if (!card) {
    card = document.createElement("div");
    card.className = "metric-card";
    card.setAttribute("data-metric", key);
    const title = document.createElement("div");
    title.className = "metric-title";
    title.textContent = label;
    const canvas = document.createElement("canvas");
    canvas.className = "metric-chart";
    card.appendChild(title);
    card.appendChild(canvas);
    dom.metricsCharts.appendChild(card);
    return canvas;
  }
  return card.querySelector("canvas");
}
function updateMetricsCharts() {
  if (!dom.metricsCharts) return;
  const seriesList = collectMetricSeries();
  if (!seriesList.length) {
    destroyMetricCharts();
    dom.metricsCharts.innerHTML = "";
    if (dom.metricsEmpty) dom.metricsEmpty.style.display = "block";
    return;
  }
  if (dom.metricsEmpty) dom.metricsEmpty.style.display = "none";
  destroyMetricCharts();
  dom.metricsCharts.innerHTML = "";
  seriesList.forEach((series) => {
    const canvas = ensureMetricCard(series.key, series.label);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    state.metricCharts[series.key] = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: series.label,
            data: series.points,
            parsing: false,
            borderColor: series.color,
            backgroundColor: series.color,
            tension: 0.25,
            pointRadius: 2,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Elapsed time", color: "#f5f5f5" },
            ticks: {
              color: "#f5f5f5",
              callback: (value) => formatDuration(Number(value)),
            },
            grid: { color: "rgba(255,255,255,0.1)" },
          },
          y: {
            ticks: { color: "#f5f5f5" },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) =>
                items.length
                  ? `Elapsed: ${formatDuration(items[0].parsed.x)}`
                  : "",
              label: (item) => `${series.label}: ${item.parsed.y ?? "N/A"}`,
            },
          },
        },
      },
    });
  });
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
  let g1 = 0;
  let g2 = 0;
  for (const s of setArr) {
    const t1 = scoreValueToInt(s.team1);
    const t2 = scoreValueToInt(s.team2);
    if (t1 != null) {
      totalGames += t1;
      g1 += t1;
    }
    if (t2 != null) {
      totalGames += t2;
      g2 += t2;
    }
  }
  return {
    g1,
    g2,
    totalGames,
    setSlices: setArr.length,
  };
}
function normalizePointStrLocal(value) {
  if (value == null) return "";
  return String(value).trim().toUpperCase();
}
function getExtraInfoFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  return snap.extraInfo ?? snap.extra_info ?? null;
}
function normalizeWinnerDetail(detailRaw) {
  const detail = String(detailRaw || "")
    .trim()
    .toLowerCase();
  if (!detail) return "normal";
  if (WINNER_DETAIL_KEYS.includes(detail)) return detail;
  return "normal";
}
function normalizeErrorDetail(detailRaw) {
  const detail = String(detailRaw || "")
    .trim()
    .toLowerCase();
  if (!detail) return "unforced";
  if (ERROR_DETAIL_KEYS.includes(detail)) return detail;
  return "unforced";
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
function collectPointEvents(snaps) {
  const events = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const curr = snaps[i];
    const extraInfo = getExtraInfoFromSnapshot(curr);
    const prevPlayers = Array.isArray(prev.players) ? prev.players : [];
    const currPlayers = Array.isArray(curr.players) ? curr.players : [];
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const prevStats = prevPlayers[pIdx] || { winners: 0, errors: 0 };
      const currStats = currPlayers[pIdx] || { winners: 0, errors: 0 };
      const wDiff =
        Number(currStats.winners || 0) - Number(prevStats.winners || 0);
      const eDiff =
        Number(currStats.errors || 0) - Number(prevStats.errors || 0);
      if (wDiff > 0) {
        events.push({
          index: i,
          playerIndex: pIdx,
          team: pIdx < 2 ? 1 : 2,
          eventType: "winner",
          detail: extraInfo,
        });
      }
      if (eDiff > 0) {
        events.push({
          index: i,
          playerIndex: pIdx,
          team: pIdx < 2 ? 1 : 2,
          eventType: "error",
          detail: extraInfo,
        });
      }
    }
  }
  return events;
}
function computePlayerDetailBreakdown(snapshots) {
  const rows = Array.from({ length: 4 }, () => ({
    winners: createWinnerDetailBuckets(),
    errors: createErrorDetailBuckets(),
  }));
  let totalEvents = 0;
  const events = collectPointEvents(snapshots);
  for (const ev of events) {
    const target = rows[ev.playerIndex];
    if (!target) continue;
    if (ev.eventType === "winner") {
      const key = normalizeWinnerDetail(ev.detail);
      target.winners[key] += 1;
      totalEvents += 1;
    } else if (ev.eventType === "error") {
      const key = normalizeErrorDetail(ev.detail);
      target.errors[key] += 1;
      totalEvents += 1;
    }
  }
  return { rows, totalEvents };
}
function computeKeyMoments(snapshots) {
  if (!snapshots || snapshots.length < 2) return [];
  const events = collectPointEvents(snapshots);
  const eventsByIndex = new Map();
  events.forEach((ev) => {
    if (!eventsByIndex.has(ev.index)) eventsByIndex.set(ev.index, []);
    eventsByIndex.get(ev.index).push(ev);
  });
  const times = computeRelativePointTimes(snapshots);
  const timeStats = computeTimeStats(snapshots);
  const matchDurationSec =
    timeStats?.matchDuration ?? (times.length ? times[times.length - 1] : 0);
  const playerGoldenWon = [0, 0, 0, 0];
  const playerGoldenLost = [0, 0, 0, 0];
  const playerBreakWon = [0, 0, 0, 0];
  const playerBreakLost = [0, 0, 0, 0];
  const playerLastWon = [0, 0, 0, 0];
  const playerLastLost = [0, 0, 0, 0];
  const playerBestWinnerStreak = [0, 0, 0, 0];
  const playerErrorStreak = [0, 0, 0, 0];
  const playerBestErrorStreak = [0, 0, 0, 0];
  const playerPointWinStreak = [0, 0, 0, 0];
  const playerBestWinnerStreakIdx = [null, null, null, null];
  const playerBestErrorStreakIdx = [null, null, null, null];
  const playerErrorEvents = [[], [], [], []]; // { time, index }
  const playerGoldenWonIdx = [null, null, null, null];
  const playerGoldenLostIdx = [null, null, null, null];
  const playerBreakWonIdx = [null, null, null, null];
  const playerBreakLostIdx = [null, null, null, null];
  const playerLastWonIdx = [null, null, null, null];
  const playerLastLostIdx = [null, null, null, null];
  const teamGoldenWon = { 1: 0, 2: 0 };
  const teamGoldenLost = { 1: 0, 2: 0 };
  const teamBreakWon = { 1: 0, 2: 0 };
  const teamBreakLost = { 1: 0, 2: 0 };
  const teamLastWon = { 1: 0, 2: 0 };
  const teamLastLost = { 1: 0, 2: 0 };
  const teamWinnerStreak = { 1: 0, 2: 0 };
  const teamBestWinnerStreak = { 1: 0, 2: 0 };
  const teamErrorStreak = { 1: 0, 2: 0 };
  const teamBestErrorStreak = { 1: 0, 2: 0 };
  const teamPointStreak = { 1: 0, 2: 0 };
  const teamBestPointStreak = { 1: 0, 2: 0 };
  const teamBestWinnerStreakIdx = { 1: null, 2: null };
  const teamBestErrorStreakIdx = { 1: null, 2: null };
  const teamBestPointStreakIdx = { 1: null, 2: null };
  const teamErrorEvents = { 1: [], 2: [] }; // { time, index }
  const teamGoldenWonIdx = { 1: null, 2: null };
  const teamGoldenLostIdx = { 1: null, 2: null };
  const teamBreakWonIdx = { 1: null, 2: null };
  const teamBreakLostIdx = { 1: null, 2: null };
  const teamLastWonIdx = { 1: null, 2: null };
  const teamLastLostIdx = { 1: null, 2: null };
  const pointWinnerTeam = (ev) =>
    ev.eventType === "winner" ? ev.team : ev.team === 1 ? 2 : 1;
  // Track streaks, points, and error times from point-by-point events
  for (const ev of events) {
    const winnerTeam = pointWinnerTeam(ev);
    const losingTeam = winnerTeam === 1 ? 2 : 1;
    // Reset streaks when switching event types
    if (ev.eventType !== "winner") {
      for (let i = 0; i < 4; i++) playerPointWinStreak[i] = 0;
      teamWinnerStreak[1] = 0;
      teamWinnerStreak[2] = 0;
    }
    if (ev.eventType !== "error") {
      for (let i = 0; i < 4; i++) playerErrorStreak[i] = 0;
      teamErrorStreak[1] = 0;
      teamErrorStreak[2] = 0;
    }
    // Point streak per team
    teamPointStreak[winnerTeam] += 1;
    if (teamPointStreak[winnerTeam] > teamBestPointStreak[winnerTeam]) {
      teamBestPointStreak[winnerTeam] = teamPointStreak[winnerTeam];
      teamBestPointStreakIdx[winnerTeam] = ev.index;
    }
    teamPointStreak[losingTeam] = 0;
    // Winner/error streaks
    if (ev.eventType === "winner") {
      playerPointWinStreak[ev.playerIndex] += 1;
      if (
        playerPointWinStreak[ev.playerIndex] >
        playerBestWinnerStreak[ev.playerIndex]
      ) {
        playerBestWinnerStreak[ev.playerIndex] =
          playerPointWinStreak[ev.playerIndex];
        playerBestWinnerStreakIdx[ev.playerIndex] = ev.index;
      }
      for (let i = 0; i < 4; i++) {
        if (i !== ev.playerIndex) playerPointWinStreak[i] = 0;
      }
      teamWinnerStreak[ev.team] += 1;
      if (teamWinnerStreak[ev.team] > teamBestWinnerStreak[ev.team]) {
        teamBestWinnerStreak[ev.team] = teamWinnerStreak[ev.team];
        teamBestWinnerStreakIdx[ev.team] = ev.index;
      }
      teamWinnerStreak[losingTeam] = 0;
    } else if (ev.eventType === "error") {
      playerErrorStreak[ev.playerIndex] += 1;
      if (
        playerErrorStreak[ev.playerIndex] >
        playerBestErrorStreak[ev.playerIndex]
      ) {
        playerBestErrorStreak[ev.playerIndex] =
          playerErrorStreak[ev.playerIndex];
        playerBestErrorStreakIdx[ev.playerIndex] = ev.index;
      }
      for (let i = 0; i < 4; i++) {
        if (i !== ev.playerIndex) playerErrorStreak[i] = 0;
      }
      teamErrorStreak[ev.team] += 1;
      if (teamErrorStreak[ev.team] > teamBestErrorStreak[ev.team]) {
        teamBestErrorStreak[ev.team] = teamErrorStreak[ev.team];
        teamBestErrorStreakIdx[ev.team] = ev.index;
      }
      teamErrorStreak[winnerTeam] = 0;
      teamWinnerStreak[ev.team] = 0;
    }
    // Track error times for gaps
    if (ev.eventType === "error") {
      const t = times[ev.index] ?? 0;
      playerErrorEvents[ev.playerIndex].push({ time: t, index: ev.index });
      teamErrorEvents[ev.team].push({ time: t, index: ev.index });
    }
  }
  // Game-by-game scan for golden points, breaks, and last points
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const prevGames = countGamesAndSets(prev);
    const currGames = countGamesAndSets(curr);
    const deltaG1 = currGames.g1 - prevGames.g1;
    const deltaG2 = currGames.g2 - prevGames.g2;
    const totalDelta = deltaG1 + deltaG2;
    const gameWinner = totalDelta === 1 ? (deltaG1 === 1 ? 1 : 2) : null;
    if (!gameWinner) continue;
    const loser = gameWinner === 1 ? 2 : 1;
    const serverTeam = serverTeamFromServerField(curr.server ?? prev.server);
    const points = prev.points || {};
    const p1 = normalizePointStrLocal(points.team1);
    const p2 = normalizePointStrLocal(points.team2);
    const wasGolden = p1 === "40" && p2 === "40";
    const gameEvents = eventsByIndex.get(i) || [];
    const finalEvent = gameEvents[gameEvents.length - 1] || null;
    const creditWinToPlayers = (targetTeam, arr) => {
      if (
        finalEvent &&
        finalEvent.team === targetTeam &&
        finalEvent.eventType === "winner"
      ) {
        arr[finalEvent.playerIndex] += 1;
      }
    };
    const creditLossToPlayers = (targetTeam, arr) => {
      if (
        finalEvent &&
        finalEvent.team === targetTeam &&
        finalEvent.eventType === "error"
      ) {
        arr[finalEvent.playerIndex] += 1;
      }
    };
    // Golden points
    if (wasGolden) {
      teamGoldenWon[gameWinner] += 1;
      teamGoldenLost[loser] += 1;
      creditWinToPlayers(gameWinner, playerGoldenWon);
      creditLossToPlayers(loser, playerGoldenLost);
      teamGoldenWonIdx[gameWinner] = i;
      teamGoldenLostIdx[loser] = i;
      if (
        finalEvent &&
        finalEvent.team === gameWinner &&
        finalEvent.eventType === "winner"
      ) {
        playerGoldenWonIdx[finalEvent.playerIndex] = i;
      }
      if (
        finalEvent &&
        finalEvent.team === loser &&
        finalEvent.eventType === "error"
      ) {
        playerGoldenLostIdx[finalEvent.playerIndex] = i;
      }
    }
    // Break points (game won by returning team)
    if (serverTeam && serverTeam !== gameWinner) {
      teamBreakWon[gameWinner] += 1;
      teamBreakLost[serverTeam] += 1;
      creditWinToPlayers(gameWinner, playerBreakWon);
      creditLossToPlayers(serverTeam, playerBreakLost);
      teamBreakWonIdx[gameWinner] = i;
      teamBreakLostIdx[serverTeam] = i;
      if (
        finalEvent &&
        finalEvent.team === gameWinner &&
        finalEvent.eventType === "winner"
      ) {
        playerBreakWonIdx[finalEvent.playerIndex] = i;
      }
      if (
        finalEvent &&
        finalEvent.team === serverTeam &&
        finalEvent.eventType === "error"
      ) {
        playerBreakLostIdx[finalEvent.playerIndex] = i;
      }
    }
    // Last point of game
    const gamePointWonByWinner =
      finalEvent &&
      finalEvent.team === gameWinner &&
      finalEvent.eventType === "winner";
    const gamePointLostByError =
      finalEvent &&
      finalEvent.team === loser &&
      finalEvent.eventType === "error";
    if (gamePointWonByWinner) {
      teamLastWon[gameWinner] += 1;
      teamLastWonIdx[gameWinner] = i;
      creditWinToPlayers(gameWinner, playerLastWon);
      playerLastWonIdx[finalEvent.playerIndex] = i;
    }
    if (gamePointLostByError) {
      teamLastLost[loser] += 1;
      teamLastLostIdx[loser] = i;
      creditLossToPlayers(loser, playerLastLost);
      playerLastLostIdx[finalEvent.playerIndex] = i;
    }
  }
  const teamLabel = (team) =>
    team === 1
      ? `${renderPlayerName(0)} / ${renderPlayerName(1)}`
      : `${renderPlayerName(2)} / ${renderPlayerName(3)}`;
  const playerLabel = (idx) => renderPlayerName(idx);
  const topPlayers = (arr) => {
    let max = Math.max(...arr);
    if (max <= 0) return { max: 0, list: [] };
    const list = arr
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v === max)
      .map(({ i }) => i);
    return { max, list };
  };
  const topTeams = (obj) => {
    const values = [obj[1] ?? 0, obj[2] ?? 0];
    const max = Math.max(...values);
    if (max <= 0) return { max: 0, list: [] };
    const list = [];
    if (values[0] === max) list.push(1);
    if (values[1] === max) list.push(2);
    return { max, list };
  };
  const formatNames = (indices) => indices.map(playerLabel).join(" / ");
  const formatTeams = (teams) => teams.map((t) => teamLabel(t)).join(" | ");
  const errorGapFromEvents = (evArr) => {
    if (!evArr.length) return { gap: matchDurationSec, index: null };
    if (evArr.length === 1)
      return { gap: matchDurationSec - evArr[0].time, index: evArr[0].index };
    let best = 0;
    let bestIdx = evArr[0].index;
    for (let i = 1; i < evArr.length; i++) {
      const diff = evArr[i].time - evArr[i - 1].time;
      if (diff > best) {
        best = diff;
        bestIdx = evArr[i].index;
      }
    }
    return { gap: best, index: bestIdx };
  };
  const playerErrorGaps = playerErrorEvents.map(errorGapFromEvents);
  const teamErrorGaps = {
    1: errorGapFromEvents(teamErrorEvents[1]),
    2: errorGapFromEvents(teamErrorEvents[2]),
  };
  // Align break counts with shared break stats to avoid mismatches
  const breakStats = computeBreakStats(snapshots) || {
    team1: { breaks: 0, bps: 0 },
    team2: { breaks: 0, bps: 0 },
  };
  teamBreakWon[1] = breakStats.team1.breaks ?? teamBreakWon[1];
  teamBreakWon[2] = breakStats.team2.breaks ?? teamBreakWon[2];
  teamBreakLost[1] = breakStats.team2.breaks ?? teamBreakLost[1]; // team1 lost serve when team2 broke
  teamBreakLost[2] = breakStats.team1.breaks ?? teamBreakLost[2];
  // If a team has zero breaks, zero out player break wins for that team to prevent phantom entries
  if (!teamBreakWon[1]) {
    playerBreakWon[0] = 0;
    playerBreakWon[1] = 0;
    playerBreakWonIdx[0] = null;
    playerBreakWonIdx[1] = null;
  }
  if (!teamBreakWon[2]) {
    playerBreakWon[2] = 0;
    playerBreakWon[3] = 0;
    playerBreakWonIdx[2] = null;
    playerBreakWonIdx[3] = null;
  }
  // If a team has zero breaks against them, zero player break losses for that team
  if (!teamBreakLost[1]) {
    playerBreakLost[0] = 0;
    playerBreakLost[1] = 0;
    playerBreakLostIdx[0] = null;
    playerBreakLostIdx[1] = null;
  }
  if (!teamBreakLost[2]) {
    playerBreakLost[2] = 0;
    playerBreakLost[3] = 0;
    playerBreakLostIdx[2] = null;
    playerBreakLostIdx[3] = null;
  }
  const playerMoments = [];
  const teamMoments = [];
  const pushPlayer = (condition, text, pointIndex) => {
    if (condition)
      playerMoments.push({ text, pointIndex, plainText: stripHtmlTags(text) });
  };
  const pushTeam = (condition, text, pointIndex) => {
    if (condition)
      teamMoments.push({ text, pointIndex, plainText: stripHtmlTags(text) });
  };
  const topPlayersWithIdx = (arr, idxArr) => {
    const base = topPlayers(arr);
    const firstIdx = base.list.length ? idxArr[base.list[0]] : null;
    return { ...base, firstIdx };
  };
  const topTeamsWithIdx = (obj, idxObj) => {
    const base = topTeams(obj);
    const firstTeam = base.list.length ? base.list[0] : null;
    const firstIdx = firstTeam != null ? idxObj[firstTeam] : null;
    return { ...base, firstIdx };
  };
  const goldenWinPlayers = topPlayersWithIdx(
    playerGoldenWon,
    playerGoldenWonIdx,
  );
  pushPlayer(
    goldenWinPlayers.max > 1,
    `Most winners on golden point: ${formatNames(goldenWinPlayers.list)} (${goldenWinPlayers.max}).`,
    goldenWinPlayers.firstIdx,
  );
  const goldenLossPlayers = topPlayersWithIdx(
    playerGoldenLost,
    playerGoldenLostIdx,
  );
  pushPlayer(
    goldenLossPlayers.max > 1,
    `Most errors on golden point: ${formatNames(goldenLossPlayers.list)} (${goldenLossPlayers.max}).`,
    goldenLossPlayers.firstIdx,
  );
  const lastWinPlayers = topPlayersWithIdx(playerLastWon, playerLastWonIdx);
  pushPlayer(
    lastWinPlayers.max > 1,
    `Most winners on game points: ${formatNames(lastWinPlayers.list)} (${lastWinPlayers.max}).`,
    lastWinPlayers.firstIdx,
  );
  const lastLossPlayers = topPlayersWithIdx(playerLastLost, playerLastLostIdx);
  pushPlayer(
    lastLossPlayers.max > 1,
    `Most errors on game points: ${formatNames(lastLossPlayers.list)} (${lastLossPlayers.max}).`,
    lastLossPlayers.firstIdx,
  );
  const winnerStreakPlayers = topPlayersWithIdx(
    playerBestWinnerStreak,
    playerBestWinnerStreakIdx,
  );
  pushPlayer(
    winnerStreakPlayers.max > 1,
    `Longest winner streak: ${formatNames(winnerStreakPlayers.list)} (${winnerStreakPlayers.max}).`,
    winnerStreakPlayers.firstIdx,
  );
  const errorStreakPlayers = topPlayersWithIdx(
    playerBestErrorStreak,
    playerBestErrorStreakIdx,
  );
  pushPlayer(
    errorStreakPlayers.max > 1,
    `Longest error streak: ${formatNames(errorStreakPlayers.list)} (${errorStreakPlayers.max}).`,
    errorStreakPlayers.firstIdx,
  );
  const lastWinTeams = topTeamsWithIdx(teamLastWon, teamLastWonIdx);
  pushTeam(
    lastWinTeams.max > 1,
    `Most team winners on game points: ${formatTeams(lastWinTeams.list)} (${lastWinTeams.max}).`,
    lastWinTeams.firstIdx,
  );
  const winnerStreakTeams = topTeamsWithIdx(
    teamBestWinnerStreak,
    teamBestWinnerStreakIdx,
  );
  pushTeam(
    winnerStreakTeams.max > 1,
    `Longest team winner streak: ${formatTeams(winnerStreakTeams.list)} (${winnerStreakTeams.max}).`,
    winnerStreakTeams.firstIdx,
  );
  const errorStreakTeams = topTeamsWithIdx(
    teamBestErrorStreak,
    teamBestErrorStreakIdx,
  );
  pushTeam(
    errorStreakTeams.max > 1,
    `Longest team error streak: ${formatTeams(errorStreakTeams.list)} (${errorStreakTeams.max}).`,
    errorStreakTeams.firstIdx,
  );
  const playerErrorGapTop = topPlayers(playerErrorGaps.map((v) => v.gap));
  pushPlayer(
    playerErrorGapTop.max > 0,
    `Longest time between errors: ${formatNames(playerErrorGapTop.list)} (${formatDuration(playerErrorGapTop.max)}).`,
    playerErrorGapTop.list.length
      ? playerErrorGaps[playerErrorGapTop.list[0]].index
      : null,
  );
  const teamErrorGapTop = topTeams({
    1: teamErrorGaps[1].gap,
    2: teamErrorGaps[2].gap,
  });
  pushTeam(
    teamErrorGapTop.max > 0,
    `Longest time between errors: ${formatTeams(teamErrorGapTop.list)} (${formatDuration(teamErrorGapTop.max)}).`,
    teamErrorGapTop.list.length
      ? teamErrorGaps[teamErrorGapTop.list[0]].index
      : null,
  );
  const bestPointRunTeam = topTeamsWithIdx(
    teamBestPointStreak,
    teamBestPointStreakIdx,
  );
  pushTeam(
    bestPointRunTeam.max > 0,
    `Longest point run: ${formatTeams(bestPointRunTeam.list)} (${bestPointRunTeam.max} consecutive points).`,
    bestPointRunTeam.firstIdx,
  );
  return {
    player: playerMoments,
    team: teamMoments,
  };
}
function formatPointScoreLabel(points = {}) {
  const p1 = normalizePointStrLocal(points.team1) || "-";
  const p2 = normalizePointStrLocal(points.team2) || "-";
  return `${p1}-${p2}`;
}
function pointLabelToValue(label) {
  const norm = normalizePointStrLocal(label);
  switch (norm) {
    case "AD":
      return 50;
    case "40":
      return 40;
    case "30":
      return 30;
    case "15":
      return 15;
    case "0":
    case "LOVE":
    case "":
      return 0;
    default: {
      const num = Number(norm);
      return Number.isFinite(num) ? num : 0;
    }
  }
}
function hasGamePoint(points = {}, targetTeam) {
  const pTeam = pointLabelToValue(
    targetTeam === 1 ? points.team1 : points.team2,
  );
  const pOpp = pointLabelToValue(
    targetTeam === 1 ? points.team2 : points.team1,
  );
  if (pTeam >= 50) return true; // Advantage
  if (pTeam === 40 && pOpp < 40) return true; // 40-0/15/30
  if (pTeam === 40 && pOpp === 40) return true; // Golden point
  return false;
}
function derivePointEventLabel(prevSnap, currSnap, eventsForPoint = []) {
  const latestEvent = eventsForPoint[eventsForPoint.length - 1] || null;
  if (latestEvent) {
    const playerLabel = formatEventPlayerLabel(latestEvent.playerIndex);
    const suffix = latestEvent.eventType === "winner" ? "Winner" : "Error";
    return { label: `${playerLabel} ${suffix}`, team: latestEvent.team };
  }
  const prevPlayers = Array.isArray(prevSnap?.players) ? prevSnap.players : [];
  const currPlayers = Array.isArray(currSnap?.players) ? currSnap.players : [];
  let fallback = null;
  let fallbackTeam = null;
  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const prevStats = prevPlayers[pIdx] || { winners: 0, errors: 0 };
    const currStats = currPlayers[pIdx] || { winners: 0, errors: 0 };
    const wDiff =
      Number(currStats.winners || 0) - Number(prevStats.winners || 0);
    const eDiff = Number(currStats.errors || 0) - Number(prevStats.errors || 0);
    const playerLabel = formatEventPlayerLabel(pIdx);
    const teamForPlayer = pIdx < 2 ? 1 : 2;
    if (wDiff > 0)
      return { label: `${playerLabel} Winner`, team: teamForPlayer };
    if (eDiff > 0 && !fallback) {
      fallback = `${playerLabel} Error`;
      fallbackTeam = teamForPlayer;
    }
  }
  return { label: fallback || "Point", team: fallbackTeam };
}
function updateGameHistory() {
  const body = dom.gameHistoryBody;
  if (!body) return;
  const emptyColspan = state.deleteMode ? 7 : 6;
  if (dom.gameHistoryActionHeader) {
    dom.gameHistoryActionHeader.style.display = state.deleteMode ? "" : "none";
  }
  if (!state.visibleSnapshots.length || state.visibleSnapshots.length < 2) {
    body.innerHTML = `<tr><td colspan="${emptyColspan}" class="stat-number">No points yet.</td></tr>`;
    return;
  }
  const eventsForVisible =
    state.visibleEvents?.length === state.visibleSnapshots.length
      ? state.visibleEvents
      : state.visibleSnapshots.map((raw) => ({ raw, id: null }));
  const times = computeRelativePointTimes(state.visibleSnapshots);
  const keyMoments = computeKeyMoments(state.visibleSnapshots);
  const pointEvents = collectPointEvents(state.visibleSnapshots);
  const pointEventsByIndex = new Map();
  pointEvents.forEach((ev) => {
    if (!pointEventsByIndex.has(ev.index)) pointEventsByIndex.set(ev.index, []);
    pointEventsByIndex.get(ev.index).push(ev);
  });
  const heartRatePath = ["metrics", "additionalMetrics", "heartRate"];
  const heartValues = state.visibleSnapshots.map((snap) =>
    readMetricValue(snap, heartRatePath),
  );
  let heartMinIdx = null;
  let heartMaxIdx = null;
  let heartMinVal = Infinity;
  let heartMaxVal = -Infinity;
  heartValues.forEach((val, idx) => {
    if (val == null) return;
    if (val < heartMinVal) {
      heartMinVal = val;
      heartMinIdx = idx;
    }
    if (val > heartMaxVal) {
      heartMaxVal = val;
      heartMaxIdx = idx;
    }
  });
  const durations = [];
  let shortestIdx = null;
  let longestIdx = null;
  let shortestVal = Infinity;
  let longestVal = -Infinity;
  for (let i = 1; i < state.visibleSnapshots.length; i++) {
    const durationSec = Math.max(0, (times[i] ?? 0) - (times[i - 1] ?? 0));
    durations[i] = durationSec;
    if (durationSec < shortestVal) {
      shortestVal = durationSec;
      shortestIdx = i;
    }
    if (durationSec > longestVal) {
      longestVal = durationSec;
      longestIdx = i;
    }
  }
  const keyMomentsByIndex = new Map();
  const combinedMoments = [
    ...(keyMoments.player || []),
    ...(keyMoments.team || []),
  ];
  combinedMoments.forEach((km) => {
    if (km.pointIndex == null || Number.isNaN(Number(km.pointIndex))) return;
    if (!keyMomentsByIndex.has(km.pointIndex))
      keyMomentsByIndex.set(km.pointIndex, []);
    keyMomentsByIndex.get(km.pointIndex).push(km.plainText || km.text);
  });
  const rows = [];
  for (let i = 1; i < state.visibleSnapshots.length; i++) {
    const prev = state.visibleSnapshots[i - 1];
    const curr = state.visibleSnapshots[i];
    const currEvent = eventsForVisible[i] || {};
    const durationSec = durations[i] ?? 0;
    const durationLabel = durationSec > 0 ? formatDuration(durationSec) : "-";
    const durationClass =
      i === longestIdx
        ? "duration-longest"
        : i === shortestIdx
          ? "duration-shortest"
          : "";
    const scoreLabel = formatPointScoreLabel(curr.points || {});
    const currSets = extractSetArrayFromSnapshot(curr);
    const lastSet = currSets[currSets.length - 1] || {};
    const setLabel = `${lastSet.team1 ?? "-"}-${lastSet.team2 ?? "-"}`;
    const eventsForPoint = pointEventsByIndex.get(i) || [];
    const { label: eventLabel, team: eventTeam } = derivePointEventLabel(
      prev,
      curr,
      eventsForPoint,
    );
    const latestDetailEvent = [...eventsForPoint]
      .reverse()
      .find((ev) => ev.eventType === "winner" || ev.eventType === "error");
    let detailIconHtml = "";
    if (latestDetailEvent) {
      const isWinner = latestDetailEvent.eventType === "winner";
      const key = isWinner
        ? normalizeWinnerDetail(latestDetailEvent.detail)
        : normalizeErrorDetail(latestDetailEvent.detail);
      const label =
        (isWinner ? WINNER_DETAIL_LABELS[key] : ERROR_DETAIL_LABELS[key]) ||
        (isWinner ? "Winner" : "Error");
      const icon = getDetailIcon(key, label);
      const title = `${label} ${isWinner ? "winner" : "error"}`;
      detailIconHtml = `<span class="detail-chip-inline detail-chip--${key}" title="${escapeHtml(title)}"><span class="detail-chip__icon detail-chip__icon--inline">${icon}</span></span>`;
    }
    let coloredEvent = eventLabel;
    const lowerEvent = eventLabel.toLowerCase();
    const eventBaseLabel = detailIconHtml
      ? eventLabel.replace(/\s+(winner|error)$/i, "")
      : eventLabel;
    if (lowerEvent.includes("winner")) {
      const content = detailIconHtml
        ? `${eventBaseLabel} ${detailIconHtml}`
        : eventLabel;
      coloredEvent = `<span class="event-winner">${content}</span>`;
    } else if (lowerEvent.includes("error")) {
      const content = detailIconHtml
        ? `${eventBaseLabel} ${detailIconHtml}`
        : eventLabel;
      coloredEvent = `<span class="event-error">${content}</span>`;
    }
    const notes = [];
    const serverTeam = serverTeamFromServerField(curr.server ?? prev.server);
    const receivingTeam = serverTeam === 1 ? 2 : serverTeam === 2 ? 1 : null;
    const prevPoints = prev.points || {};
    const wasGolden =
      normalizePointStrLocal(prevPoints.team1) === "40" &&
      normalizePointStrLocal(prevPoints.team2) === "40";
    if (wasGolden) notes.push({ label: "Golden Point" });
    const prevGames = countGamesAndSets(prev);
    const currGames = countGamesAndSets(curr);
    const deltaG1 = currGames.g1 - prevGames.g1;
    const deltaG2 = currGames.g2 - prevGames.g2;
    const totalDelta = deltaG1 + deltaG2;
    const gameWinner = totalDelta === 1 ? (deltaG1 === 1 ? 1 : 2) : null;
    if (receivingTeam && hasGamePoint(prevPoints, receivingTeam)) {
      notes.push({ label: "Breakpoint" });
    }
    if (gameWinner && serverTeam && serverTeam !== gameWinner) {
      notes.push({ label: "Break" });
    }
    if (heartMinIdx === i && Number.isFinite(heartMinVal)) {
      notes.push({
        type: "heart",
        html: `<span class="note-heart note-heart--min">${HEART_ICON} Low HR (${heartMinVal})</span>`,
      });
    }
    if (heartMaxIdx === i && Number.isFinite(heartMaxVal)) {
      notes.push({
        type: "heart",
        html: `<span class="note-heart note-heart--max">${HEART_ICON} High HR (${heartMaxVal})</span>`,
      });
    }
    const setFinished = currGames.setSlices > prevGames.setSlices;
    const matchFinished =
      state.isMatchFinished && i === state.visibleSnapshots.length - 1;
    if (setFinished || matchFinished) {
      notes.push({
        label: "Key Moment",
        type: "key",
        tooltip: matchFinished ? "Match finished" : "Set finished",
      });
    }
    const kmForRow = keyMomentsByIndex.get(i);
    if (kmForRow?.length) {
      notes.push({
        label: "Key Moments",
        type: "key-list",
        tooltip: kmForRow.join("\n"),
      });
    }
    const eventTeam1Html =
      eventTeam === 1 || eventTeam == null ? coloredEvent : "";
    const eventTeam2Html = eventTeam === 2 ? coloredEvent : "";
    const notesHtml = notes.length
      ? notes
          .map((note) => {
            if (note.type === "key") {
              const tip = escapeHtml(
                note.tooltip || note.label || "Key moment",
              );
              return escapeHtml(tip);
            }
            if (note.type === "key-list") {
              const tip = escapeHtml(
                note.tooltip || note.label || "Key moments",
              );
              return escapeHtml(tip);
            }
            if (note.type === "heart") {
              return note.html || "";
            }
            return escapeHtml(note.label || "");
          })
          .join(", ")
      : "-";
    const deleteCell = state.deleteMode
      ? `<td class="stat-number">${
          currEvent.id != null
            ? `<button type="button" class="table-action-btn btn-danger" data-delete-event-id="${currEvent.id}">Delete</button>`
            : '<span class="text-muted">N/A</span>'
        }</td>`
      : "";
    rows.push(
      `<tr>
        <td>${eventTeam1Html}</td>
        <td>${eventTeam2Html}</td>
        <td>${scoreLabel}</td>
        <td>${escapeHtml(setLabel)}</td>
        <td class="stat-number ${durationClass}">${durationLabel}</td>
        <td>${notesHtml}</td>
        ${deleteCell}
      </tr>`,
    );
  }
  body.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="${emptyColspan}" class="stat-number">No points yet.</td></tr>`;
}
function handleGameHistoryClick(event) {
  const btn = event.target?.closest?.("[data-delete-event-id]");
  if (!btn || !state.deleteMode) return;
  const eventId = btn.getAttribute("data-delete-event-id");
  if (!eventId) return;
  deleteEventById(eventId);
}
async function deleteEventById(eventId) {
  if (!state.currentMatchId || state.isDeleting) return;
  if (!window.confirm("Delete this point from the database?")) return;
  state.isDeleting = true;
  clearError();
  setStatus("Deleting event...");
  try {
    const res = await fetch(
      `/api/match/${state.currentMatchId}/events/${eventId}`,
      {
        method: "DELETE",
      },
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    setStatus(`Deleted event ${eventId}. Reloading...`);
    await autoLoadFromServer(state.currentMatchId);
  } catch (err) {
    console.error(err);
    setError(`Failed to delete event: ${err.message}`);
  } finally {
    state.isDeleting = false;
  }
}
async function handleDeleteMatch() {
  if (!state.currentMatchId || state.isDeleting) return;
  if (
    !window.confirm(
      "Delete this entire match and its history from the database? This cannot be undone.",
    )
  ) {
    return;
  }
  state.isDeleting = true;
  clearError();
  setStatus("Deleting match...");
  try {
    const res = await fetch(`/api/match/${state.currentMatchId}`, {
      method: "DELETE",
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    setStatus("Match deleted. Redirecting...");
    setTimeout(() => {
      window.location.href = "/";
    }, 800);
  } catch (err) {
    console.error(err);
    setError(`Failed to delete match: ${err.message}`);
  } finally {
    state.isDeleting = false;
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
