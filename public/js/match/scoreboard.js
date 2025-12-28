import { serverTeamFromServerField, serverPlayerIndex } from "../shared.js";

function shouldHideSetScore(isMatchFinished, top, bottom) {
  if (!isMatchFinished) return false;
  const normalize = (value) => {
    if (value == null) return null;
    if (value === "-" || value === "?") return null;
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

export function renderSetColumns(setsArray, isMatchFinished, setCells) {
  for (let i = 0; i < setCells.length; i++) {
    const column = setCells[i];
    const setScore = setsArray?.[i];
    const top = setScore && setScore.team1 != null ? setScore.team1 : "-";
    const bottom = setScore && setScore.team2 != null ? setScore.team2 : "-";
    column.t1.textContent = top;
    column.t2.textContent = bottom;
    if (column.root) {
      const hideColumn = shouldHideSetScore(isMatchFinished, top, bottom);
      column.root.style.display = hideColumn ? "none" : "";
    }
  }
}

export function renderPointsAndServer(snap, dom, serverDots, isMatchFinished = false) {
  const pts = snap.points || {};
  if (dom.team1Points) dom.team1Points.textContent = pts.team1 ?? "0";
  if (dom.team2Points) dom.team2Points.textContent = pts.team2 ?? "0";

  const serverIdx = serverPlayerIndex(snap.server);
  const serverTeam = serverTeamFromServerField(snap.server);
  const hideServers = Boolean(isMatchFinished);
  serverDots.forEach((dot, idx) => {
    if (!dot) return;
    const show =
      serverIdx != null
        ? idx === serverIdx
        : serverTeam === 1
        ? idx === 0
        : serverTeam === 2
        ? idx === 2
        : false;
    dot.style.display = show && !hideServers ? "inline-block" : "none";
  });
}

export function updateNamesOnScoreboard(renderPlayerName, playerNameEls) {
  playerNameEls.forEach((el, idx) => {
    if (!el) return;
    el.innerHTML = renderPlayerName(idx, { uppercase: true });
  });
}
