function emptyBreakStats() {
  return {
    team1: { bps: 0, breaks: 0 },
    team2: { bps: 0, breaks: 0 }
  };
}

const TEAM_IDS = [1, 2];

const ADVANCE_VALUES = new Set(["AD", "A"]);

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

export function parseSetsArray(setsString, setsObj, gamesObj) {
  const arr = [];

  if (typeof setsString === "string" && setsString.trim()) {
    const parts = setsString.split("/").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        arr.push({
          team1: toInt(match[1]) ?? 0,
          team2: toInt(match[2]) ?? 0
        });
      }
    }
  }

  if (!arr.length && setsObj && (setsObj.team1 != null || setsObj.team2 != null)) {
    arr.push({
      team1: toInt(setsObj.team1) ?? 0,
      team2: toInt(setsObj.team2) ?? 0
    });
  }

  if (!arr.length && gamesObj && (gamesObj.team1 != null || gamesObj.team2 != null)) {
    arr.push({
      team1: toInt(gamesObj.team1) ?? 0,
      team2: toInt(gamesObj.team2) ?? 0
    });
  } else if (arr.length && gamesObj) {
    const g1 = toInt(gamesObj.team1);
    const g2 = toInt(gamesObj.team2);
    if (g1 != null || g2 != null) {
      const idx = arr.length - 1;
      if (g1 != null) arr[idx].team1 = g1;
      if (g2 != null) arr[idx].team2 = g2;
    }
  }

  return arr;
}

export function serverTeamFromServerField(server) {
  if (typeof server !== "number") return null;
  if (server >= 1 && server <= 4) {
    return server <= 2 ? 1 : 2;
  }
  if (server === 1 || server === 2) return server;
  return null;
}

export function normalizePointStr(value) {
  if (value == null) return "";
  return String(value).trim().toUpperCase();
}

function isClassicBreakPoint(serverPts, recvPts) {
  const s = normalizePointStr(serverPts);
  const r = normalizePointStr(recvPts);

  if (r === "40" && (s === "0" || s === "15" || s === "30")) return true;
  if (ADVANCE_VALUES.has(r) && s === "40") return true;
  return false;
}

export function computeBreakStats(snapshots) {
  const n = snapshots.length;
  if (!n) return emptyBreakStats();

  const gameInfo = snapshots.map((snap) => {
    const setsString = typeof snap.sets === "string" ? snap.sets : "";
    const setsObj = snap.sets && typeof snap.sets === "object" ? snap.sets : null;
    const arr = parseSetsArray(setsString, setsObj, snap.games);

    let g1 = 0;
    let g2 = 0;
    for (const s of arr) {
      const a = toInt(s.team1);
      const b = toInt(s.team2);
      if (a != null) g1 += a;
      if (b != null) g2 += b;
    }
    return { g1, g2, total: g1 + g2 };
  });

  const games = new Map();

  for (let i = 0; i < n; i++) {
    const snap = snapshots[i];
    const gi = gameInfo[i];
    const gameIndex = gi.total;

    if (!games.has(gameIndex)) {
      games.set(gameIndex, {
        startIndex: i,
        endIndex: i,
        serverTeam: null,
        bpChances: { 1: 0, 2: 0 },
        lastBpScoreKey: { 1: null, 2: null },
        sawAdvantageState: false
      });
    }

    const rec = games.get(gameIndex);
    rec.endIndex = i;

    let sTeam = serverTeamFromServerField(snap.server);
    if (!rec.serverTeam && sTeam) {
      rec.serverTeam = sTeam;
    } else if (!sTeam) {
      sTeam = rec.serverTeam;
    }

    const pts = snap.points || {};
    const p1 = pts.team1;
    const p2 = pts.team2;
    const n1 = normalizePointStr(p1);
    const n2 = normalizePointStr(p2);

    if (ADVANCE_VALUES.has(n1) || ADVANCE_VALUES.has(n2)) {
      rec.sawAdvantageState = true;
    }

    const bpNow = { 1: false, 2: false };
    if (sTeam === 1 || sTeam === 2) {
      const recvTeam = sTeam === 1 ? 2 : 1;
      const classic = sTeam === 1 ? isClassicBreakPoint(p1, p2) : isClassicBreakPoint(p2, p1);
      if (classic) bpNow[recvTeam] = true;
    }

    if (
      !rec.sawAdvantageState &&
      n1 === "40" &&
      n2 === "40" &&
      (rec.serverTeam === 1 || rec.serverTeam === 2)
    ) {
      const recvTeam = rec.serverTeam === 1 ? 2 : 1;
      bpNow[recvTeam] = true;
    }

    const scoreKey = `${n1}|${n2}`;
    for (const team of TEAM_IDS) {
      if (bpNow[team]) {
        if (rec.lastBpScoreKey[team] !== scoreKey) {
          rec.bpChances[team]++;
          rec.lastBpScoreKey[team] = scoreKey;
        }
      } else {
        rec.lastBpScoreKey[team] = null;
      }
    }
  }

  const totals = { bps: { 1: 0, 2: 0 }, breaks: { 1: 0, 2: 0 } };

  const sortedIndices = Array.from(games.keys()).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const rec = games.get(idx);
    const startIdx = rec.startIndex;
    const endIdx = rec.endIndex;
    const startG1 = gameInfo[startIdx].g1;
    const startG2 = gameInfo[startIdx].g2;

    const gameHadBP1 = rec.bpChances[1] > 0;
    const gameHadBP2 = rec.bpChances[2] > 0;

    totals.bps[1] += rec.bpChances[1];
    totals.bps[2] += rec.bpChances[2];

    let winner = null;
    for (let j = endIdx + 1; j < n; j++) {
      const gj = gameInfo[j];
      if (gj.total > idx) {
        const d1 = gj.g1 - startG1;
        const d2 = gj.g2 - startG2;
        if (d1 + d2 === 1) {
          if (d1 === 1) winner = 1;
          else if (d2 === 1) winner = 2;
        }
        break;
      }
    }

    if (winner === 1 && gameHadBP1) totals.breaks[1]++;
    if (winner === 2 && gameHadBP2) totals.breaks[2]++;
  }

  return {
    team1: { bps: totals.bps[1], breaks: totals.breaks[1] },
    team2: { bps: totals.bps[2], breaks: totals.breaks[2] }
  };
}

export function computeTimeStats(snapshots) {
  const n = snapshots.length;
  if (n < 2) return null;

  const times = snapshots.map((snap) => {
    if (!snap || snap.timestamp == null) return NaN;
    const value = Number(snap.timestamp);
    return Number.isFinite(value) ? value : NaN;
  });

  const validPairs = [];
  for (let i = 1; i < n; i++) {
    const t0 = times[i - 1];
    const t1 = times[i];
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      validPairs.push(t1 - t0);
    }
  }

  if (!validPairs.length) return null;

  const tStart = times.find(Number.isFinite);
  let tEnd = null;
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isFinite(times[i])) {
      tEnd = times[i];
      break;
    }
  }

  if (!Number.isFinite(tStart) || !Number.isFinite(tEnd) || tEnd < tStart) return null;

  const matchDuration = tEnd - tStart;
  let min = validPairs[0];
  let max = validPairs[0];
  let sum = 0;
  for (const delta of validPairs) {
    if (delta < min) min = delta;
    if (delta > max) max = delta;
    sum += delta;
  }

  return {
    matchDuration,
    shortestPoint: min,
    longestPoint: max,
    averagePoint: sum / validPairs.length,
    pointCount: validPairs.length
  };
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (val) => (val < 10 ? `0${val}` : String(val));

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
