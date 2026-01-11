import { formatDuration, serverTeamFromServerField } from "./stats.js";

const dom = {
  status: document.getElementById("status"),
  pointList: document.getElementById("pointList"),
  playBtn: document.getElementById("playBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  speedInput: document.getElementById("speedInput"),
  pointCounter: document.getElementById("pointCounter"),
  serverLabel: document.getElementById("serverLabel"),
  durationLabel: document.getElementById("durationLabel"),
  resultLabel: document.getElementById("resultLabel"),
  scoreLabel: document.getElementById("scoreLabel"),
  backLink: document.getElementById("backLink"),
  courtWrapper: document.getElementById("courtWrapper"),
};

const state = {
  matchId: parseMatchId(),
  snapshots: [],
  points: [],
  playerNames: ["P1", "P2", "P3", "P4"],
  playing: true,
  speed: 1,
  currentPointIndex: 0,
  currentTime: 0,
  lastFrameMs: null,
  sketch: null,
  players: [],
  courtBounds: null,
  ballSegments: [],
  ballTrail: [],
  outcomeEffect: null,
  outcomeStartMs: null,
  currentPointAnimDuration: null,
  awaitingFx: false,
  effectEndMs: null,
  moveOrders: [[], [], [], []],
  ballImg: null,
  ballImgReady: false,
  ballImgPromise: null,
  ballImgBlobUrl: null,
  matchFinished: false,
  celebrationStartMs: null,
  celebrationData: null,
};

const BALL_SPEED_MULT = 0.2; // <1 speeds ball; point anim runs at half real duration

const COURT = {
  netY: 0.5,
  serviceLineTop: 0.5 - 6.95 / 20, // normalized
  serviceLineBottom: 0.5 + 6.95 / 20,
};

const BALL_IMG_URL =
  "https://i.imgur.com/EjvkOx0.png";

const WINNER_DETAIL_KEYS = ["normal", "home", "x3", "x4", "door", "barbaridad"];

function parseMatchId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  // /match/:id/animation
  const idx = parts.indexOf("match");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => {
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

function setStatus(message) {
  if (dom.status) dom.status.textContent = message;
}

function setBackLink(matchId) {
  if (!dom.backLink) return;
  dom.backLink.href = matchId ? `/match/${matchId}` : "/";
}

function normalizePointStrLocal(value) {
  if (value == null) return "";
  return String(value).trim().toUpperCase();
}

function formatPointScoreLabel(points = {}) {
  const p1 = normalizePointStrLocal(points.team1) || "-";
  const p2 = normalizePointStrLocal(points.team2) || "-";
  return `${p1}-${p2}`;
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

function playerName(index) {
  return state.playerNames[index] || `P${index + 1}`;
}

function playerInitials(index) {
  const name = playerName(index);
  if (!name || typeof name !== "string") return `P${index + 1}`;
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return `P${index + 1}`;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getExtraInfoFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  return snap.extraInfo ?? snap.extra_info ?? null;
}

function collectPointEvents(prev, curr, pointIndex) {
  const events = [];
  const prevPlayers = Array.isArray(prev?.players) ? prev.players : [];
  const currPlayers = Array.isArray(curr?.players) ? curr.players : [];
  const extraInfo = getExtraInfoFromSnapshot(curr);
  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const prevStats = prevPlayers[pIdx] || { winners: 0, errors: 0 };
    const currStats = currPlayers[pIdx] || { winners: 0, errors: 0 };
    const wDiff = Number(currStats.winners || 0) - Number(prevStats.winners || 0);
    const eDiff = Number(currStats.errors || 0) - Number(prevStats.errors || 0);
    if (wDiff > 0) {
      events.push({
        index: pointIndex,
        playerIndex: pIdx,
        team: pIdx < 2 ? 1 : 2,
        eventType: "winner",
        detail: extraInfo,
      });
    }
    if (eDiff > 0) {
      events.push({
        index: pointIndex,
        playerIndex: pIdx,
        team: pIdx < 2 ? 1 : 2,
        eventType: "error",
        detail: extraInfo,
      });
    }
  }
  return events;
}

function deriveOutcome(events) {
  if (!events.length) return null;
  const winner = [...events].reverse().find((ev) => ev.eventType === "winner");
  if (winner) {
    return {
      ...winner,
      detailKey: normalizeWinnerDetail(winner.detail),
    };
  }
  const error = [...events].reverse().find((ev) => ev.eventType === "error");
  if (error) return { ...error };
  return null;
}

function normalizeWinnerDetail(detailRaw) {
  const detail = typeof detailRaw === "string" ? detailRaw.trim().toLowerCase() : "";
  if (!detail) return "normal";
  return WINNER_DETAIL_KEYS.includes(detail) ? detail : "normal";
}

function buildPointsFromSnapshots(snapshots) {
  const points = [];
  const times = computeRelativePointTimes(snapshots);
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const duration = Math.max(1, (times[i] ?? 0) - (times[i - 1] ?? 0));
    const serverRaw = curr.server ?? prev.server ?? null;
    const serverTeam = serverTeamFromServerField(serverRaw);
    const serverPlayerIndex =
      Number.isFinite(serverRaw) && serverRaw >= 1 && serverRaw <= 4
        ? serverRaw - 1
        : null;
    const events = collectPointEvents(prev, curr, i);
    const outcome = deriveOutcome(events);
    points.push({
      index: i,
      durationSec: duration,
      serverRaw,
      serverTeam,
      serverPlayerIndex,
      scoreLabel: formatPointScoreLabel(curr.points || {}),
      events,
      outcome,
      startTime: times[i - 1] ?? 0,
      endTime: times[i] ?? duration,
    });
  }
  return points;
}

function applyPlayers(playersFromDb) {
  if (!Array.isArray(playersFromDb) || !playersFromDb.length) return;
  const byKey = {};
  playersFromDb.forEach((p) => {
    byKey[`${p.team}-${p.slot}`] = p.name || null;
  });
  state.playerNames = [
    byKey["1-1"] || state.playerNames[0],
    byKey["1-2"] || state.playerNames[1],
    byKey["2-1"] || state.playerNames[2],
    byKey["2-2"] || state.playerNames[3],
  ];
}

function buildPointList() {
  if (!dom.pointList) return;
  dom.pointList.innerHTML = "";
  state.points.forEach((pt, idx) => {
    const extra = formatExtraInfo(pt);
    const li = document.createElement("li");
    li.dataset.index = idx;
    li.innerHTML = `
      <div><strong>Point ${idx + 1}</strong> <span class="pill">${pt.scoreLabel}</span></div>
      <div class="muted">Server: ${serverLabel(pt)} • ${formatDuration(pt.durationSec)}</div>
      <div>${resultLabel(pt)}</div>
      ${extra ? `<div class="pill pill--info">Extra: ${escapeHtml(extra)}</div>` : ""}
    `;
    li.addEventListener("click", () => jumpToPoint(idx));
    dom.pointList.appendChild(li);
  });
  highlightActivePoint();
}

function formatExtraInfo(point) {
  if (!point || !point.outcome) return "";
  const raw = point.outcome.detail ?? point.outcome.detailKey ?? null;
  if (!raw) return "";
  const key = normalizeWinnerDetail(raw);
  const labels = {
    normal: "Normal",
    home: "Home",
    x3: "x3",
    x4: "x4",
    door: "Door",
    barbaridad: "Barbaridad",
  };
  return labels[key] || String(raw);
}

function serverLabel(point) {
  if (point.serverPlayerIndex != null) return playerName(point.serverPlayerIndex);
  if (point.serverTeam === 1) return "Team 1";
  if (point.serverTeam === 2) return "Team 2";
  return "Unknown";
}

function resultLabel(point) {
  const oc = point.outcome;
  if (!oc) return '<span class="pill">Rally</span>';
  const name = playerName(oc.playerIndex);
  const cls = oc.eventType === "winner" ? "pill pill--win" : "pill pill--err";
  return `<span class="${cls}">${name} ${oc.eventType}</span>`;
}

function syncUi() {
  const pt = state.points[state.currentPointIndex];
  if (!pt) {
    setStatus("No points to show.");
    return;
  }
  dom.pointCounter.textContent = `Point ${state.currentPointIndex + 1} / ${state.points.length}`;
  dom.serverLabel.textContent = serverLabel(pt);
  dom.durationLabel.textContent = formatDuration(pt.durationSec);
  dom.resultLabel.innerHTML = resultLabel(pt);
  dom.scoreLabel.textContent = pt.scoreLabel;
  dom.playBtn.textContent = state.playing ? "Pause" : "Play";
  highlightActivePoint();
}

function highlightActivePoint() {
  const nodes = dom.pointList?.querySelectorAll("li") || [];
  let activeNode = null;
  nodes.forEach((li, idx) => {
    if (idx === state.currentPointIndex) {
      li.classList.add("active");
      activeNode = li;
    } else {
      li.classList.remove("active");
    }
  });
  ensureActivePointVisible(activeNode);
}

function ensureActivePointVisible(activeNode) {
  if (!dom.pointList || !activeNode) return;
  const container = dom.pointList;
  const containerTop = container.scrollTop;
  const containerBottom = containerTop + container.clientHeight;
  const itemTop = activeNode.offsetTop;
  const itemBottom = itemTop + activeNode.offsetHeight;
  const isVisible = itemTop >= containerTop && itemBottom <= containerBottom;
  if (!isVisible) {
    const targetTop = Math.max(0, itemTop - activeNode.offsetHeight);
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }
}

function jumpToPoint(idx) {
  if (idx < 0 || idx >= state.points.length) return;
  state.currentPointIndex = idx;
  resetPlaybackForPoint();
  syncUi();
}

function togglePlay() {
  state.playing = !state.playing;
  dom.playBtn.textContent = state.playing ? "Pause" : "Play";
}

function nextPoint() {
  const next = state.currentPointIndex + 1;
  if (next >= state.points.length) return;
  state.currentPointIndex = next;
  resetPlaybackForPoint();
  syncUi();
}

function prevPoint() {
  const prev = state.currentPointIndex - 1;
  if (prev < 0) return;
  state.currentPointIndex = prev;
  resetPlaybackForPoint();
  syncUi();
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function teamForPlayer(idx) {
  return idx < 2 ? 1 : 2;
}

function ballColor(seg) {
  if (seg?.outcome?.eventType === "winner") return [87, 214, 87];
  if (seg?.outcome?.eventType === "error") return [255, 107, 107];
  return [247, 201, 72];
}

function pickOpponent(playerIndex) {
  const team = playerIndex < 2 ? 1 : 2;
  const pool = team === 1 ? [2, 3] : [0, 1];
  return pool[Math.floor(Math.random() * pool.length)];
}

function isSameTeam(a, b) {
  if (a == null || b == null) return false;
  const ta = a < 2 ? 1 : 2;
  const tb = b < 2 ? 1 : 2;
  return ta === tb;
}

function computeCourtLayout(p) {
  const padding = Math.max(24, Math.min(p.width, p.height) * 0.04);
  const usableWidth = p.width - padding * 2;
  const usableHeight = p.height - padding * 2;
  const scale = Math.min(usableWidth / 10, usableHeight / 20); // 10m x 20m court
  const courtWidth = 10 * scale;
  const courtHeight = 20 * scale;
  const x0 = (p.width - courtWidth) / 2;
  const y0 = (p.height - courtHeight) / 2;
  const lineWidth = Math.max(1.4, 0.05 * scale); // 5 cm official line width
  return { x0, y0, width: courtWidth, height: courtHeight, scale, lineWidth };
}

function buildBallSegments(point) {
  const total = Math.max(0.8, point.durationSec || 1);
  const segments = [];
  let lastHitter = point.serverPlayerIndex ?? Math.floor(Math.random() * 4);
  const receiverIdx = diagonalReceiverIndex(lastHitter);
  const serveDuration = Math.min(0.55, Math.max(0.32, total * 0.2));
  let prevEndNorm = null;
  const resolveNorm = (target) => {
    if (target && typeof target === "object" && target.norm) return target.norm;
    if (typeof target === "number") return playerPosNorm(target);
    return targetPosNorm(target);
  };
  const pushSegment = (seg) => {
    const fromNorm =
      seg.fromNorm ?? (seg.from != null ? resolveNorm(seg.from) : prevEndNorm);
    const toNorm = seg.toNorm ?? resolveNorm(seg.to);
    const data = { ...seg, fromNorm, toNorm };
    segments.push(data);
    if (typeof seg.to === "number") {
      setChaseTarget(seg.to, toNorm, seg.chaseSpeed ?? 0.1);
    }
    prevEndNorm = toNorm;
  };
  let t = 0;
  if (receiverIdx != null) {
    const serveTarget = randomServiceBoxTarget(lastHitter);
    const catchNorm = {
      x: serveTarget.norm.x + randomBetween(-0.02, 0.02),
      y: serveTarget.norm.y + (lastHitter < 2 ? 0.06 : -0.06),
    };
    pushSegment({
      from: lastHitter,
      toNorm: catchNorm,
      start: 0,
      duration: serveDuration,
      serve: true,
      receiverIndex: receiverIdx,
    });
    // snap receiver to catch spot to avoid ball teleport on the reply
    setPlayerPosNorm(receiverIdx, catchNorm);
    lastHitter = receiverIdx;
    t = serveDuration;
  }
  const finisher =
    point.outcome?.playerIndex != null
      ? point.outcome.playerIndex
      : pickOpponent(lastHitter);
  const terminalDur = Math.min(0.4, Math.max(0.22, total * 0.12));
  while (t < total - (terminalDur + 0.35) && segments.length < 10) {
    const dur = randomBetween(0.18, 0.5);
    const target =
      t >= total - (terminalDur + 1.1) ? finisher : pickOpponent(lastHitter);
    pushSegment({ from: lastHitter, to: target, start: t, duration: dur });
    t += dur;
    lastHitter = target;
  }
  // If the current hitter is on the same team as the finisher, route once through an opponent first
  if (isSameTeam(lastHitter, finisher)) {
    const opp = pickOpponent(finisher);
    const dur = Math.min(0.3, Math.max(0.16, total - t - terminalDur));
    if (dur > 0.14) {
      pushSegment({
        from: lastHitter,
        to: opp,
        start: t,
        duration: dur,
      });
      t += dur;
      lastHitter = opp;
    }
  }
  // Ensure ball travels into finisher before strike
  if (lastHitter !== finisher) {
    const dur = Math.min(0.35, Math.max(0.18, total - t - terminalDur));
    pushSegment({
      from: lastHitter,
      to: finisher,
      start: t,
      duration: dur,
    });
    t += dur;
    lastHitter = finisher;
  }

  const remaining = Math.max(0.18, total - t);
  const outcome = point.outcome;
  if (outcome && outcome.playerIndex != null) {
    const winnerDetail =
      outcome.eventType === "winner"
        ? normalizeWinnerDetail(outcome.detailKey ?? outcome.detail)
        : "normal";
    const special =
      outcome.eventType === "winner"
        ? buildSpecialWinnerSegments(
            winnerDetail,
            lastHitter,
            t,
            remaining,
            outcome,
          )
        : null;
    if (special && Array.isArray(special.segments) && special.segments.length) {
      special.segments.forEach((seg) => pushSegment(seg));
    } else {
      const to =
        outcome.eventType === "winner"
          ? chooseWinnerTarget(outcome.playerIndex)
          : chooseErrorTarget(outcome.playerIndex);
      const duration = computeDistanceScaledDuration(lastHitter, to, remaining);
      pushSegment({
        from: lastHitter,
        to,
        start: t,
        duration,
        terminal: true,
        outcome,
      });
    }
  } else {
    const target = pickOpponent(lastHitter);
    const duration = computeDistanceScaledDuration(lastHitter, target, remaining);
    pushSegment({
      from: lastHitter,
      to: target,
      start: t,
      duration,
      terminal: true,
    });
  }
  const baseTotal =
    segments.length > 0
      ? segments[segments.length - 1].start + segments[segments.length - 1].duration
      : total;
  const scaleToPoint = baseTotal > 0 ? total / baseTotal : 1;

  // Scale to the point's real duration, then slow the ball by the global multiplier
  let acc = 0;
  const slowedSegments = segments.map((seg) => {
    const dur = seg.duration * scaleToPoint * BALL_SPEED_MULT;
    const next = { ...seg, start: acc, duration: dur };
    acc += dur;
    return next;
  });

  return { segments: slowedSegments, animDuration: acc || total * BALL_SPEED_MULT };
}

function initPlayers() {
  state.players = [
    createPlayer(1), // team 1, slot 1
    createPlayer(1),
    createPlayer(2),
    createPlayer(2),
  ];
}

function createPlayer(team) {
  return {
    team,
    pos: { x: Math.random(), y: Math.random() },
    target: { x: Math.random(), y: Math.random() },
    speed: randomBetween(0.04, 0.08),
  };
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function updatePlayers() {
  if (state.matchFinished && state.celebrationData) {
    const t =
      state.celebrationStartMs != null
        ? (performance.now() - state.celebrationStartMs) / 1000
        : 0;
    const { winTeam, runner, chaser, basePos } = state.celebrationData;
    state.players.forEach((pl, idx) => {
      const zone = state.matchFinished
        ? { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 }
        : playerZone(idx);
      const base = basePos[idx] || { x: 0.5, y: 0.5 };
      if (teamForPlayer(idx) === winTeam) {
        const radius = 0.03;
        const speed = 3 + idx;
        pl.target = {
          x: clamp(base.x + Math.cos(t * speed + idx) * radius, zone.x0, zone.x1),
          y: clamp(base.y + Math.sin(t * speed + idx) * radius, zone.y0, zone.y1),
        };
        pl.speed = 0.12;
      } else if (idx === runner) {
        const dir = Math.sin(t * 3.2 + Math.sin(t * 2.4) * 1.5) > 0 ? 1 : -1;
        pl.target = {
          x: clamp(base.x + dir * 0.22, zone.x0, zone.x1),
          y: clamp(base.y + Math.sin(t * 3.8 + idx) * 0.16, zone.y0, zone.y1),
        };
        pl.speed = 0.46; // runner much faster
      } else if (idx === chaser) {
        const runnerPos = state.players[runner]?.pos || base;
        pl.target = {
          x: clamp(runnerPos.x, 0.02, 0.98), // chase across full court, not just half
          y: clamp(runnerPos.y, 0.02, 0.98),
        };
        pl.speed = 0.12; // slower chaser
      } else {
        pl.target = { ...base };
        pl.speed = 0.08;
      }
      pl.pos.x += (pl.target.x - pl.pos.x) * pl.speed;
      pl.pos.y += (pl.target.y - pl.pos.y) * pl.speed;
      pl.pos.x = clamp(pl.pos.x, zone.x0, zone.x1);
      pl.pos.y = clamp(pl.pos.y, zone.y0, zone.y1);
    });
    return;
  }

  state.players.forEach((pl, idx) => {
    const zone = playerZone(idx);
    const orders = state.moveOrders[idx] || [];
    const activeOrder = orders.find(
      (o) => state.currentTime >= o.start && state.currentTime <= o.lockUntil,
    );
    if (activeOrder) {
      pl.target = {
        x: clamp(activeOrder.target.x, zone.x0, zone.x1),
        y: clamp(activeOrder.target.y, zone.y0, zone.y1),
      };
      pl.speed = Math.max(pl.speed, 0.12); // move fast to receive
    }
    // Move toward target
    pl.pos.x += (pl.target.x - pl.pos.x) * pl.speed;
    pl.pos.y += (pl.target.y - pl.pos.y) * pl.speed;
    pl.pos.x = clamp(pl.pos.x, zone.x0, zone.x1);
    pl.pos.y = clamp(pl.pos.y, zone.y0, zone.y1);
    const dist = Math.hypot(pl.target.x - pl.pos.x, pl.target.y - pl.pos.y);
    const canWander = !activeOrder;
    if (dist < 0.02 && canWander) {
      pl.target = {
        x: randomBetween(zone.x0, zone.x1),
        y: randomBetween(zone.y0, zone.y1),
      };
      pl.speed = randomBetween(0.04, 0.08);
    }
  });
}

function playerZone(idx) {
  const isTop = idx < 2;
  const left = idx % 2 === 0;
  return {
    x0: left ? 0.08 : 0.52,
    x1: left ? 0.48 : 0.92,
    y0: isTop ? 0.05 : 0.55,
    y1: isTop ? 0.45 : 0.95,
  };
}

function randomPosInBox(x0, x1, y0, y1) {
  return {
    x: randomBetween(x0, x1),
    y: randomBetween(y0, y1),
  };
}

function setPlayerPos(idx, pos) {
  if (!state.players[idx]) return;
  state.players[idx].pos = { ...pos };
  state.players[idx].target = { ...pos };
}

function setPlayerPosNorm(idx, norm) {
  setPlayerPos(idx, norm);
}

function setChaseTarget(idx, norm, speed = 0.1) {
  if (!state.players[idx] || !norm) return;
  state.players[idx].target = {
    x: clamp(norm.x, 0.05, 0.95),
    y: clamp(norm.y, 0.05, 0.95),
  };
  state.players[idx].speed = speed;
}

function winningTeamFromOutcome(outcome) {
  if (!outcome) return null;
  if (outcome.eventType === "winner") return outcome.team ?? teamForPlayer(outcome.playerIndex ?? 0);
  if (outcome.eventType === "error") {
    const errTeam = outcome.team ?? teamForPlayer(outcome.playerIndex ?? 0);
    return errTeam === 1 ? 2 : errTeam === 2 ? 1 : null;
  }
  return null;
}

function computeTopErrorPlayer(losingTeam) {
  const errors = [0, 0, 0, 0];
  state.points.forEach((pt) => {
    (pt.events || []).forEach((ev) => {
      if (ev.eventType === "error") errors[ev.playerIndex] += 1;
    });
  });
  const candidates = losingTeam === 1 ? [0, 1] : [2, 3];
  let bestIdx = candidates[0];
  let bestVal = -Infinity;
  candidates.forEach((idx) => {
    if (errors[idx] > bestVal) {
      bestVal = errors[idx];
      bestIdx = idx;
    }
  });
  const partner = candidates.find((idx) => idx !== bestIdx);
  return { runner: bestIdx, chaser: partner ?? null };
}

function startCelebration(finalPoint) {
  const winTeam = winningTeamFromOutcome(finalPoint?.outcome);
  if (!winTeam) return;
  const loseTeam = winTeam === 1 ? 2 : 1;
  const { runner, chaser } = computeTopErrorPlayer(loseTeam);
  state.matchFinished = true;
  state.celebrationStartMs = performance.now();
  state.celebrationData = {
    winTeam,
    loseTeam,
    runner,
    chaser,
    basePos: state.players.map((pl) => ({ ...pl.pos })),
  };
}

function buildMoveOrders(segments) {
  const orders = [[], [], [], []];
  segments.forEach((seg) => {
    const playerIdx =
      typeof seg.to === "number"
        ? seg.to
        : Number.isInteger(seg.receiverIndex)
          ? seg.receiverIndex
          : null;
    if (playerIdx != null && seg.toNorm) {
      const start = Math.max(0, seg.start - 0.25); // leave early to meet the ball
      const lockUntil = seg.start + seg.duration + 0.05; // hold through strike
      orders[playerIdx].push({
        start,
        lockUntil,
        target: seg.toNorm,
      });
    }
  });
  return orders;
}

function diagonalReceiverIndex(serverIdx) {
  switch (serverIdx) {
    case 0:
      return 3;
    case 1:
      return 2;
    case 2:
      return 1;
    case 3:
      return 0;
    default:
      return null;
  }
}

function randomServiceBoxTarget(serverIdx) {
  const marginX = 0.06;
  const topBoxY0 = COURT.serviceLineTop + 0.02;
  const topBoxY1 = COURT.netY - 0.02;
  const bottomBoxY0 = COURT.netY + 0.02;
  const bottomBoxY1 = COURT.serviceLineBottom - 0.02;
  switch (serverIdx) {
    case 0: // top-left -> bottom-right box
      return {
        norm: {
          x: randomBetween(0.55 + marginX, 0.92),
          y: randomBetween(bottomBoxY0, bottomBoxY1),
        },
      };
    case 1: // top-right -> bottom-left box
      return {
        norm: {
          x: randomBetween(0.08, 0.45 - marginX),
          y: randomBetween(bottomBoxY0, bottomBoxY1),
        },
      };
    case 2: // bottom-left -> top-right box
      return {
        norm: {
          x: randomBetween(0.55 + marginX, 0.92),
          y: randomBetween(topBoxY0, topBoxY1),
        },
      };
    case 3: // bottom-right -> top-left box
      return {
        norm: {
          x: randomBetween(0.08, 0.45 - marginX),
          y: randomBetween(topBoxY0, topBoxY1),
        },
      };
    default:
      return { norm: { x: 0.5, y: COURT.netY + 0.1 } };
  }
}

function pushReceiverTowardServe(serverIdx, serveTarget, catchNorm) {
  const receiverIdx = diagonalReceiverIndex(serverIdx);
  if (receiverIdx == null || !state.players[receiverIdx]) return;
  const jitter = 0.02;
  const norm = catchNorm || serveTarget?.norm || { x: 0.5, y: COURT.netY + 0.12 };
  state.players[receiverIdx].target = {
    x: clamp(
      norm.x + randomBetween(-jitter, jitter),
      0.05,
      0.95,
    ),
    y: clamp(
      norm.y + randomBetween(-jitter, jitter),
      0.05,
      0.95,
    ),
  };
  state.players[receiverIdx].speed = 0.12; // move much faster to receive
}


function placeServerForPoint(point) {
  if (!point || point.serverPlayerIndex == null) return;
  const idx = point.serverPlayerIndex;
  const isTop = idx < 2;
  const left = idx % 2 === 0;
  const x0 = left ? 0.12 : 0.58;
  const x1 = left ? 0.42 : 0.88;
  // Keep server behind the service line on their side
  const y0 = isTop ? 0.04 : COURT.serviceLineBottom + 0.02;
  const y1 = isTop ? COURT.serviceLineTop - 0.02 : 0.96;
  const pos = randomPosInBox(x0, x1, y0, y1);
  setPlayerPos(idx, pos);
}

function randomBackcourtPos(team, isLeft) {
  const x0 = isLeft ? 0.12 : 0.58;
  const x1 = isLeft ? 0.42 : 0.88;
  const y0 = team === 1 ? 0.08 : 0.78;
  const y1 = team === 1 ? 0.18 : 0.92;
  return randomPosInBox(x0, x1, y0, y1);
}

function resetPlayersBehindLine() {
  state.players.forEach((pl, idx) => {
    const team = idx < 2 ? 1 : 2;
    const left = idx % 2 === 0;
    const pos = randomBackcourtPos(team, left);
    setPlayerPos(idx, pos);
    // Keep them still until next point starts
    pl.target = { ...pos };
    pl.speed = randomBetween(0.03, 0.06);
  });
}

function playerPosPx(idx, p) {
  const pos = state.players[idx]?.pos || { x: 0.5, y: 0.5 };
  const bounds =
    state.courtBounds || { x0: 0, y0: 0, width: p.width, height: p.height };
  return {
    x: bounds.x0 + pos.x * bounds.width,
    y: bounds.y0 + pos.y * bounds.height,
  };
}

function playerPosNorm(idx) {
  const pos = state.players[idx]?.pos || { x: 0.5, y: 0.5 };
  return { ...pos };
}

function targetPosPx(target, p) {
  const bounds =
    state.courtBounds || { x0: 0, y0: 0, width: p.width, height: p.height };
  const normToPx = (norm) => ({
    x: bounds.x0 + norm.x * bounds.width,
    y: bounds.y0 + norm.y * bounds.height,
  });
  if (target && typeof target === "object" && target.norm) {
    return normToPx(target.norm);
  }
  if (typeof target === "number") return playerPosPx(target, p);
  const norm = targetPosNorm(target);
  return normToPx(norm);
}

function targetPosNorm(target) {
  if (target && typeof target === "object" && target.norm) return target.norm;
  if (target === "net")
    return {
      x: randomBetween(0.08, 0.92),
      y: 0.5,
    };
  if (target === "error-wall-top")
    return { x: randomBetween(0.08, 0.92), y: 0 }; // stick to wall edge
  if (target === "error-wall-bottom")
    return { x: randomBetween(0.08, 0.92), y: 1 };
  if (target === "error-wall-left")
    return { x: 0, y: randomBetween(0.08, 0.92) };
  if (target === "error-wall-right")
    return { x: 1, y: randomBetween(0.08, 0.92) };
  if (target === "winnerOut")
    return { x: 0.5, y: 1.08 };
  if (target == null) return { x: 0.5, y: 0.5 };
  return playerPosNorm(target);
}

function computeDistanceScaledDuration(fromIdx, target, maxDur) {
  const fromPos = playerPosNorm(fromIdx);
  const toPos = targetPosNorm(target);
  const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
  const duration = dist * 0.6; // scale factor for speed
  return Math.min(maxDur, Math.max(0.14, duration));
}

function chooseErrorTarget(playerIdx) {
  // Errors can go to net or any wall on the hitter's side
  const isTop = playerIdx < 2;
  const keyOptions = [
    "net",
    isTop ? "error-wall-top" : "error-wall-bottom",
    "error-wall-left",
    "error-wall-right",
  ];
  const key = keyOptions[Math.floor(Math.random() * keyOptions.length)];
  const coord = targetPosNorm(key);
  return { key, norm: coord };
}

function chooseWinnerTarget(playerIdx) {
  const isTop = playerIdx < 2;
  return {
    key: "winnerOut",
    norm: {
      x: randomBetween(0.2, 0.8),
      // Land deep in opponent's side (second bounce implied)
      y: isTop ? randomBetween(0.65, 0.9) : randomBetween(0.1, 0.35),
    },
  };
}

function segmentDurationFromNorm(fromNorm, toNorm, maxSlice, speedScale = 1) {
  if (!fromNorm || !toNorm) return Math.max(0.16, (maxSlice || 0.2) * speedScale);
  const dist = Math.hypot(toNorm.x - fromNorm.x, toNorm.y - fromNorm.y);
  const base = Math.max(0.16, dist * 0.6 * speedScale);
  if (Number.isFinite(maxSlice) && maxSlice > 0) return Math.min(base, maxSlice * 1.4);
  return base;
}

function buildPathSegments(hitterIdx, startTime, points, remaining, outcome, options = {}) {
  if (!points || !points.length) return null;
  const segments = [];
  let current = playerPosNorm(hitterIdx);
  let t = startTime;
  const totalAvail = Math.max(remaining, 0.3);
  points.forEach((pt, idx) => {
    const toNorm = pt.norm || pt;
    const segmentsLeft = points.length - idx;
    const slice = totalAvail / segmentsLeft;
    const dur = segmentDurationFromNorm(
      current,
      toNorm,
      slice,
      pt.durationMultiplier || options.durationMultiplier || 1,
    );
    segments.push({
      from: hitterIdx,
      fromNorm: { ...current },
      toNorm,
      start: t,
      duration: dur,
      terminal: idx === points.length - 1 ? pt.terminal !== false : false,
      outcome: idx === points.length - 1 ? outcome : undefined,
    });
    t += dur;
    current = toNorm;
  });
  return { segments, totalDuration: t - startTime };
}

function buildSpecialWinnerSegments(detail, hitterIdx, startTime, remaining, outcome) {
  const detailKey = normalizeWinnerDetail(detail);
  if (detailKey === "normal" || detailKey === "barbaridad") return null;
  const isTop = hitterIdx < 2;
  const bounce = {
    norm: {
      x: randomBetween(0.22, 0.78),
      y: isTop ? randomBetween(0.66, 0.86) : randomBetween(0.12, 0.34),
    },
  };
  if (detailKey === "home") {
    const wall = {
      norm: {
        x: clamp(bounce.norm.x + randomBetween(-0.12, 0.12), 0.08, 0.92),
        y: isTop ? 1.06 : -0.06,
      },
    };
    const returnPos = {
      norm: {
        x: clamp(bounce.norm.x + randomBetween(-0.18, 0.18), 0.08, 0.92),
        y: isTop ? randomBetween(0.18, 0.32) : randomBetween(0.68, 0.82),
      },
      terminal: true,
    };
    return buildPathSegments(
      hitterIdx,
      startTime,
      [bounce, wall, returnPos],
      remaining,
      outcome,
      { durationMultiplier: 1 },
    );
  }
  if (detailKey === "x3") {
    const wall = {
      norm: {
        x: clamp(bounce.norm.x + randomBetween(-0.1, 0.1), 0.08, 0.92),
        y: isTop ? 1.04 : -0.04,
      },
    };
    const exitSideLeft = Math.random() < 0.5;
    const exit = {
      norm: {
        x: exitSideLeft ? -0.08 : 1.08,
        y: isTop ? randomBetween(0.52, 0.65) : randomBetween(0.35, 0.48),
      },
      terminal: true,
    };
    return buildPathSegments(
      hitterIdx,
      startTime,
      [bounce, wall, exit],
      remaining,
      outcome,
      { durationMultiplier: 1.1 },
    );
  }
  if (detailKey === "x4") {
    const exit = {
      norm: {
        x: clamp(bounce.norm.x + randomBetween(-0.1, 0.1), 0.08, 0.92),
        y: isTop ? 1.12 : -0.12,
      },
      terminal: true,
    };
    return buildPathSegments(
      hitterIdx,
      startTime,
      [bounce, exit],
      remaining,
      outcome,
      { durationMultiplier: 1.05 },
    );
  }
  if (detailKey === "door") {
    const wallSideLeft = Math.random() < 0.5;
    const softBounce = {
      norm: {
        x: wallSideLeft ? 0.08 : 0.92,
        y: isTop ? randomBetween(0.52, 0.6) : randomBetween(0.4, 0.48),
      },
      durationMultiplier: 1.2,
    };
    const exit = {
      norm: {
        x: wallSideLeft ? -0.08 : 1.08,
        y: clamp(softBounce.norm.y + randomBetween(-0.05, 0.05), 0.02, 0.98),
      },
      durationMultiplier: 1.2,
      terminal: true,
    };
    return buildPathSegments(
      hitterIdx,
      startTime,
      [softBounce, exit],
      remaining,
      outcome,
      { durationMultiplier: 1.15 },
    );
  }
  return null;
}

function finishPoint() {
  const pt = state.points[state.currentPointIndex];
  const hasOutcome = pt?.outcome != null;
  if (!hasOutcome) {
    advanceAfterFx();
    return;
  }
  if (state.awaitingFx) return;
  //resetPlayersBehindLine();
  state.playing = false;
  state.awaitingFx = true;
  const doneTime =
    state.currentPointAnimDuration != null
      ? state.currentPointAnimDuration
      : pt.durationSec * BALL_SPEED_MULT;
  state.currentTime = doneTime;
  state.outcomeStartMs = state.outcomeStartMs ?? performance.now();
  state.effectEndMs =
    pt.outcome.eventType === "winner" ? 1200 : 2000;
}

function advanceAfterFx() {
  //resetPlayersBehindLine();
  if (state.currentPointIndex < state.points.length - 1) {
    state.currentPointIndex += 1;
    resetPlaybackForPoint();
    syncUi();
    state.playing = true;
  } else {
    state.playing = false;
    dom.playBtn.textContent = "Play";
    startCelebration(state.points[state.currentPointIndex]);
  }
  state.awaitingFx = false;
}

function resetPlaybackForPoint() {
  state.currentTime = 0;
  state.lastFrameMs = null;
  const pt = state.points[state.currentPointIndex];
  state.matchFinished = false;
  state.celebrationData = null;
  state.celebrationStartMs = null;
  resetPlayersBehindLine();
  placeServerForPoint(pt);
  const built = buildBallSegments(pt);
  state.ballSegments = built.segments;
  state.currentPointAnimDuration = built.animDuration;
  state.moveOrders = buildMoveOrders(built.segments);
  state.ballTrail = [];
  if (built.segments?.length) {
    const serveSeg = built.segments.find((s) => s.serve);
    if (serveSeg) pushReceiverTowardServe(pt.serverPlayerIndex, null, serveSeg.toNorm);
  }
  state.outcomeEffect = "burst";
  state.outcomeStartMs = null;
  state.awaitingFx = false;
  state.effectEndMs = null;
}

function advanceTime(deltaSec) {
  if (!state.playing) return;
  state.currentTime += deltaSec * state.speed;
  const pt = state.points[state.currentPointIndex];
  const doneTime =
    state.currentPointAnimDuration != null
      ? state.currentPointAnimDuration
      : pt.durationSec * BALL_SPEED_MULT;
  if (state.currentTime >= doneTime) {
    finishPoint();
  }
}

function activeSegment(time) {
  for (const seg of state.ballSegments) {
    if (time >= seg.start && time <= seg.start + seg.duration) return seg;
  }
  return state.ballSegments[state.ballSegments.length - 1] || null;
}

function drawCourt(p) {
  p.background("#0c0f1b");
  p.noStroke();
  p.fill("#0f2030");
  p.rect(0, 0, p.width, p.height);

  const layout = computeCourtLayout(p);
  state.courtBounds = layout;
  const { x0, y0, width: cw, height: ch, scale, lineWidth } = layout;
  const cx = x0 + cw * 0.5;
  const cy = y0 + ch * 0.5;
  const serviceOffset = 6.95 * scale;
  const centerExtension = 0;

  // outer bounds
  p.stroke("#d9e6ff");
  p.strokeWeight(lineWidth);
  p.noFill();
  p.rect(x0, y0, cw, ch, 10);

  // lightly tint service boxes for readability
  p.noStroke();
  p.fill(255, 255, 255, 8);
  p.rect(x0, cy - serviceOffset, cw, serviceOffset * 2);

  // net
  p.stroke("#f7c948");
  p.strokeWeight(lineWidth * 1.2);
  p.line(x0, cy, x0 + cw, cy);

  // service lines
  p.stroke("#d9e6ff");
  p.strokeWeight(lineWidth);
  p.line(x0, cy - serviceOffset, x0 + cw, cy - serviceOffset);
  p.line(x0, cy + serviceOffset, x0 + cw, cy + serviceOffset);

  // central service line (no extra extension to keep length tidy on canvas)
  p.line(cx, cy, cx, cy - serviceOffset - centerExtension);
  p.line(cx, cy, cx, cy + serviceOffset + centerExtension);
}

function drawPlayers(p) {
  p.strokeWeight(0);
  state.players.forEach((pl, idx) => {
    const pos = playerPosPx(idx, p);
    const color = idx === 0 ? "#5ab0ff" : idx === 1 ? "#57d657" : idx === 2 ? "#f5a623" : "#ff6b6b";
    p.fill(color);
    p.circle(pos.x, pos.y, 30);
    p.textSize(13);
    p.fill("#0c0f1b");
    p.textAlign(p.CENTER, p.CENTER);
    p.text(playerInitials(idx), pos.x, pos.y - 1);
  });
}

function drawBall(p) {
  const pt = state.points[state.currentPointIndex];
  if (!pt) return;
  const seg = activeSegment(state.currentTime);
  if (!seg) return;
  if (seg.terminal && seg.outcome && state.outcomeStartMs == null) {
    state.outcomeStartMs = performance.now();
    state.effectEndMs =
      seg.outcome.eventType === "winner" ? 12000 : 2000; // ms
  }
  const from = seg.fromNorm
    ? targetPosPx({ norm: seg.fromNorm }, p)
    : playerPosPx(seg.from, p);
  const to = seg.toNorm ? targetPosPx({ norm: seg.toNorm }, p) : targetPosPx(seg.to, p);
  const prog = clamp(
    (state.currentTime - seg.start) / (seg.duration || 1),
    0,
    1,
  );
  const x = from.x + (to.x - from.x) * prog;
  const y = from.y + (to.y - from.y) * prog;
  const col = ballColor(seg);
  state.ballTrail.push({ x, y, col });
  if (state.ballTrail.length > 18) state.ballTrail.shift();
  // Trail
  p.noStroke();
  state.ballTrail.forEach((ptNode, idx) => {
    const alpha = ((idx + 1) / state.ballTrail.length) * 80;
    p.fill(ptNode.col[0], ptNode.col[1], ptNode.col[2], alpha);
    p.circle(ptNode.x, ptNode.y, 6 + idx * 0.4);
  });
  // Ball
  if (state.ballImgReady && state.ballImg) {
    const size = 26;
    p.imageMode(p.CENTER);
    p.image(state.ballImg, x, y, size, size);
  } else {
    p.fill(col[0], col[1], col[2]);
    p.circle(x, y, 12);
  }
  if (seg.terminal && prog >= 0.98 && seg.outcome) {
    drawOutcomeFx(p, seg, x, y);
  }
  if (
    seg.terminal &&
    state.awaitingFx &&
    state.outcomeStartMs != null &&
    state.effectEndMs != null
  ) {
    const elapsed = performance.now() - state.outcomeStartMs;
    if (elapsed >= state.effectEndMs) {
      advanceAfterFx();
    }
  }
}

function chooseEffectStyle() {
  return "burst";
}

function drawOutcomeFx(p, seg, x, y) {
  const isWinner = seg.outcome.eventType === "winner";
  const label = isWinner ? "WINNER" : "ERROR";
  const baseColor = isWinner ? [87, 214, 87] : [255, 107, 107];
  const elapsed =
    state.outcomeStartMs != null ? performance.now() - state.outcomeStartMs : 0;
  if (!isWinner && elapsed > 2000) return; // limit error FX to 2s
  // burst only
  p.push();
  p.stroke(baseColor[0], baseColor[1], baseColor[2], 220);
  p.strokeWeight(3);
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.2;
    const len = 22 + Math.random() * 10;
    p.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
  }
  p.noStroke();
  p.fill(baseColor[0], baseColor[1], baseColor[2], 230);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(18);
  p.text(label, x, y - 22);
  p.pop();
}

function createSketch() {
  const parent = dom.courtWrapper;
  if (!parent) return;
  const sketch = (p) => {
    const ensureBallImage = () => {
      if (state.ballImg) return Promise.resolve(state.ballImg);
      if (state.ballImgPromise) return state.ballImgPromise;
      state.ballImgReady = false;
      // Fetch once (avoids p5 issuing its own second request) then load from the blob URL.
      state.ballImgPromise = fetch(BALL_IMG_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (state.ballImgBlobUrl) URL.revokeObjectURL(state.ballImgBlobUrl);
          state.ballImgBlobUrl = URL.createObjectURL(blob);
          return new Promise((resolve, reject) => {
            p.loadImage(
              state.ballImgBlobUrl,
              (img) => {
                state.ballImg = img;
                state.ballImgReady = true;
                state.ballImgPromise = null;
                resolve(img);
              },
              (err) => {
                state.ballImgReady = false;
                state.ballImgPromise = null;
                reject(err);
              },
            );
          });
        })
        .catch((err) => {
          state.ballImgReady = false;
          state.ballImgPromise = null;
          throw err;
        });
      return state.ballImgPromise;
    };
    p.setup = () => {
      const { width } = parent.getBoundingClientRect();
      const h = Math.max(620, width * 1.6);
      p.createCanvas(width, h);
      initPlayers();
      resetPlaybackForPoint();
      ensureBallImage();
    };
    p.windowResized = () => {
      const { width } = parent.getBoundingClientRect();
      const h = Math.max(620, width * 1.6);
      p.resizeCanvas(width, h);
    };
    p.draw = () => {
      const now = performance.now();
      if (state.lastFrameMs != null) {
        const deltaSec = (now - state.lastFrameMs) / 1000;
        advanceTime(deltaSec);
        updatePlayers();
      }
      state.lastFrameMs = now;
      drawCourt(p);
      drawPlayers(p);
      drawBall(p);
    };
  };
  state.sketch = new p5(sketch, parent);
}

async function loadMatch() {
  if (!state.matchId) {
    setStatus("No match id found in URL.");
    return;
  }
  setBackLink(state.matchId);
  try {
    setStatus(`Loading match ${state.matchId}...`);
    const res = await fetch(`/api/match/${state.matchId}/history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    applyPlayers(data.players || []);
    state.points = buildPointsFromSnapshots(state.snapshots);
    if (!state.points.length) {
      setStatus("This match has no points yet.");
      return;
    }
    buildPointList();
    resetPlaybackForPoint();
    syncUi();
    setStatus("Loaded.");
    createSketch();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load: ${err.message}`);
  }
}

function wireControls() {
  dom.playBtn?.addEventListener("click", togglePlay);
  dom.nextBtn?.addEventListener("click", nextPoint);
  dom.prevBtn?.addEventListener("click", prevPoint);
  dom.speedInput?.addEventListener("input", (e) => {
    const val = Number(e.target.value);
    if (Number.isFinite(val)) state.speed = val;
  });
}

function init() {
  wireControls();
  loadMatch();
}

document.addEventListener("DOMContentLoaded", init);
