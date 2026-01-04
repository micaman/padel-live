import { escapeHtml } from "./shared.js";

const matchSelect = document.getElementById("matchSelect");
const matchInput = document.getElementById("matchInput");
const runBtn = document.getElementById("runBtn");
const reloadBtn = document.getElementById("reloadBtn");
const statusLine = document.getElementById("statusLine");
const errorLine = document.getElementById("errorLine");
const summaryCards = document.getElementById("summaryCards");
const skillCards = document.getElementById("skillCards");
const eventLog = document.getElementById("eventLog");
const configMeta = document.getElementById("configMeta");
const viewModeSelect = document.getElementById("viewModeSelect");

let config = null;
let matchesCache = [];
let pagination = { offset: 0, hasMore: true };
let viewMode = "timeline";

function setStatus(text) {
  statusLine.textContent = text || "";
}

function setError(text) {
  errorLine.textContent = text || "";
}

function normalizePointStr(value) {
  if (value == null) return "0";
  return String(value).trim().toUpperCase() || "0";
}

function parsePoints(snapshot = {}) {
  const pts = snapshot.points || {};
  return {
    team1: normalizePointStr(pts.team1 ?? pts.t1),
    team2: normalizePointStr(pts.team2 ?? pts.t2)
  };
}

function parseGames(snapshot = {}) {
  const hasGamesField = Object.prototype.hasOwnProperty.call(snapshot, "games");
  const gamesRaw = snapshot.games;

  if (typeof gamesRaw === "string") {
    const m = gamesRaw.match(/(\d+)\s*-\s*(\d+)/);
    if (m) {
      return {
        team1: Number.parseInt(m[1], 10) || 0,
        team2: Number.parseInt(m[2], 10) || 0,
        present: true
      };
    }
  }

  const games = gamesRaw || {};
  const hasTeam1 = games.team1 != null || games.t1 != null;
  const hasTeam2 = games.team2 != null || games.t2 != null;
  const present = hasGamesField || hasTeam1 || hasTeam2;
  return {
    team1: Number.parseInt(games.team1 ?? games.t1, 10) || 0,
    team2: Number.parseInt(games.team2 ?? games.t2, 10) || 0,
    present
  };
}

function parseGamesFromSetsString(snapshot = {}) {
  const setsRaw = snapshot.sets;
  if (typeof setsRaw !== "string" || !setsRaw.trim()) {
    return { team1: 0, team2: 0, present: false };
  }
  const parts = setsRaw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const m = last.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return { team1: 0, team2: 0, present: false };
  return {
    team1: Number.parseInt(m[1], 10) || 0,
    team2: Number.parseInt(m[2], 10) || 0,
    present: true
  };
}

function parseSets(snapshot = {}) {
  const sets = snapshot.sets || {};
  if (typeof sets === "string") {
    const parts = sets
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    let team1 = 0;
    let team2 = 0;
    for (const part of parts) {
      const m = part.match(/(\d+)\s*-\s*(\d+)/);
      if (!m) continue;
      const a = Number.parseInt(m[1], 10);
      const b = Number.parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const max = Math.max(a, b);
      const diff = Math.abs(a - b);
      const isFinishedSet =
        (max >= 6 && diff >= 2) || (max >= 7 && diff >= 1); // allow 7-6 style tiebreak
      if (!isFinishedSet) continue;
      if (a > b) team1++;
      else if (b > a) team2++;
    }
    return { team1, team2 };
  }
  return {
    team1: Number.parseInt(sets.team1 ?? sets.t1, 10) || 0,
    team2: Number.parseInt(sets.team2 ?? sets.t2, 10) || 0
  };
}

function serverTeamFromSnapshot(snapshot = {}) {
  const server = snapshot.server ?? snapshot.serverTeam ?? snapshot.server_team;
  if (typeof server !== "number") return null;
  if (server >= 1 && server <= 4) return server <= 2 ? 1 : 2;
  if (server === 1 || server === 2) return server;
  return null;
}

function isClassicBreakPoint(serverPts, recvPts) {
  const s = normalizePointStr(serverPts);
  const r = normalizePointStr(recvPts);
  if (r === "40" && (s === "0" || s === "15" || s === "30")) return true;
  if ((r === "AD" || r === "A") && s === "40") return true;
  return false;
}

function isBreakPointForTeam(serverTeam, points, team) {
  if (serverTeam !== 1 && serverTeam !== 2) return false;
  if (team === serverTeam) return false;
  const serverPts = serverTeam === 1 ? points.team1 : points.team2;
  const recvPts = serverTeam === 1 ? points.team2 : points.team1;
  return isClassicBreakPoint(serverPts, recvPts);
}

function isGamePoint(teamPts, oppPts) {
  const a = normalizePointStr(teamPts);
  const b = normalizePointStr(oppPts);
  if (a === "AD" || a === "A") return true;
  if (a === "40" && (b === "0" || b === "15" || b === "30")) return true;
  if (a === "40" && b === "40") return true; // golden style deuce
  return false;
}

function isSetPoint(teamGames, oppGames) {
  const a = Number(teamGames) || 0;
  const b = Number(oppGames) || 0;
  return a >= 5 && a - b >= 1;
}

function isFirstPoint(points) {
  return normalizePointStr(points.team1) === "0" && normalizePointStr(points.team2) === "0";
}

function normalizePlayerArray(rawPlayers) {
  const arr = Array.isArray(rawPlayers) ? rawPlayers : [];
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = arr[i] || {};
    players.push({
      winners: Number(p.winners || 0),
      errors: Number(p.errors || 0)
    });
  }
  return players;
}

function playerTeamFromIndex(idx) {
  return idx <= 1 ? 1 : 2;
}

function buildPlayerNames(historyPlayers = []) {
  const fallback = ["Team 1 - P1", "Team 1 - P2", "Team 2 - P1", "Team 2 - P2"];
  if (!Array.isArray(historyPlayers) || !historyPlayers.length) return fallback;
  const names = [...fallback];
  for (const entry of historyPlayers) {
    if (!entry) continue;
    const team = Number(entry.team);
    const slot = Number(entry.slot);
    if (!team || !slot) continue;
    const idx = team === 1 ? slot - 1 : 1 + slot;
    if (idx >= 0 && idx < names.length && entry.name) {
      names[idx] = entry.name;
    }
  }
  return names;
}

function tierForExp(exp, tiering) {
  if (!tiering || !Array.isArray(tiering.tiers)) return null;
  let current = tiering.tiers[0] || null;
  for (const tier of tiering.tiers) {
    if (exp >= tier.exp) current = tier;
    else break;
  }
  return current;
}

function badgeForSkill(exp, badgeList = []) {
  let current = null;
  for (const badge of badgeList) {
    if (exp >= badge.exp) current = badge;
    else break;
  }
  return current;
}

function sumSkillTotals(players, key) {
  return players.reduce((acc, p) => acc + (p.skills?.[key] || 0), 0);
}

function formatScoreLabel(points, games, sets) {
  return `Sets ${sets.team1}-${sets.team2} | Games ${games.team1}-${games.team2} | Points ${points.team1}-${points.team2}`;
}

function computeSkillGains(delta, eventType, tags, onServe, skillGainConfig) {
  const gains = { serve: 0, defense: 0, mental: 0, endurance: 0 };
  const cfg = skillGainConfig || {};
  const clutchTags = new Set(
    cfg.clutchTags || ["golden_point", "set_point", "game_point", "break_point", "save_break_point", "streak"]
  );
  const winnerCfg = cfg.winner || {};
  const errorCfg = cfg.error || {};

  const magnitude = Math.abs(delta);
  const sign = delta >= 0 ? 1 : -1;

  if (eventType === "winner") {
    const serveWeight = winnerCfg.serveWeight ?? 1;
    const defenseWeight = winnerCfg.defenseWeight ?? 1;
    const mentalClutchMultiplier = winnerCfg.mentalClutchMultiplier ?? 0.6;
    const enduranceMultiplier = winnerCfg.enduranceMultiplier ?? 0.25;
    const streakMentalMultiplier = winnerCfg.streakMentalMultiplier ?? 0.35;
    const streakMentalFloor = winnerCfg.streakMentalFloor ?? 1;
    const bbMentalMultiplier = winnerCfg.bounceBackMentalMultiplier ?? 0.3;
    const bbMentalFloor = winnerCfg.bounceBackMentalFloor ?? 1;
    const bbEnduranceMultiplier = winnerCfg.bounceBackEnduranceMultiplier ?? 0.3;
    const bbEnduranceFloor = winnerCfg.bounceBackEnduranceFloor ?? 1;

    if (onServe) gains.serve += delta * serveWeight;
    else gains.defense += delta * defenseWeight;
    if (tags.some((t) => clutchTags.has(t))) {
      gains.mental += Math.round(magnitude * mentalClutchMultiplier) * sign;
    }
    gains.endurance += Math.round(magnitude * enduranceMultiplier) * sign;
    if (tags.includes("streak")) {
      gains.mental += Math.max(streakMentalFloor, Math.round(magnitude * streakMentalMultiplier)) * sign;
    }
    if (tags.includes("bounce_back")) {
      gains.mental += Math.max(bbMentalFloor, Math.round(magnitude * bbMentalMultiplier)) * sign;
      gains.endurance += Math.max(bbEnduranceFloor, Math.round(magnitude * bbEnduranceMultiplier)) * sign;
    }
  } else if (eventType === "error") {
    const serveMultiplier = errorCfg.serveMultiplier ?? 0.6;
    const defenseMultiplier = errorCfg.defenseMultiplier ?? 0.6;
    const clutchMentalMultiplier = errorCfg.mentalClutchMultiplier ?? 0.7;
    const enduranceMultiplier = errorCfg.enduranceMultiplier ?? 0.4;

    if (onServe) gains.serve += Math.round(delta * serveMultiplier);
    else gains.defense += Math.round(delta * defenseMultiplier);
    if (tags.some((t) => clutchTags.has(t))) {
      gains.mental += Math.round(delta * clutchMentalMultiplier);
    }
    gains.endurance += Math.round(delta * enduranceMultiplier);
  }
  return gains;
}

function buildSnapshotTimeline(history) {
  const fromEvents = Array.isArray(history.events)
    ? history.events
        .map((e) => e?.raw)
        .filter((raw) => raw && typeof raw === "object")
    : [];
  if (fromEvents.length) return fromEvents;
  return Array.isArray(history.snapshots) ? history.snapshots : [];
}

function simulateExp(history, configData) {
  const snapshots = buildSnapshotTimeline(history);
  if (snapshots.length < 2) {
    return { players: [], events: [] };
  }

  const names = buildPlayerNames(history.players);
  const tiering = configData.tiering || { tiers: [] };
  const baseEvents = configData.baseEvents || {};
  const bonuses = configData.bonuses || {};
  const badges = configData.badges || {};

  const state = {
    winnerStreak: [0, 0, 0, 0],
    errorStreak: [0, 0, 0, 0],
    heatBonusByGame: new Map(), // playerIdx -> Map<gameKey, usedBonus>
    coldPenaltyByGame: new Map(), // playerIdx -> Map<gameKey, usedPenaltyMagnitude>
    lastKnownGames: { team1: 0, team2: 0 }
  };

  const players = names.map((name, idx) => ({
    id: idx,
    team: playerTeamFromIndex(idx),
    name,
    totalExp: 0,
    baseExp: 0,
    bonusExp: 0,
    skills: { serve: 0, defense: 0, mental: 0, endurance: 0 },
    tier: null,
    badges: {}
  }));

  const events = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1] || {};
    const curr = snapshots[i] || {};

    const prevPlayers = normalizePlayerArray(prev.players);
    const currPlayers = normalizePlayerArray(curr.players);

    const pointsBefore = parsePoints(prev);
    const gamesPrev = parseGames(prev);
    const gamesCurr = parseGames(curr);
    const gamesPrevFromSets = parseGamesFromSetsString(prev);
    const gamesCurrFromSets = parseGamesFromSetsString(curr);

    let gamesDisplay = state.lastKnownGames;
    if (gamesPrev.present) {
      gamesDisplay = { team1: gamesPrev.team1, team2: gamesPrev.team2 };
    } else if (gamesPrevFromSets.present) {
      gamesDisplay = { team1: gamesPrevFromSets.team1, team2: gamesPrevFromSets.team2 };
    } else if (gamesCurr.present) {
      gamesDisplay = { team1: gamesCurr.team1, team2: gamesCurr.team2 };
    } else if (gamesCurrFromSets.present) {
      gamesDisplay = { team1: gamesCurrFromSets.team1, team2: gamesCurrFromSets.team2 };
    }
    state.lastKnownGames = gamesDisplay;

    const setsBefore = parseSets(prev);
    const serverTeam = serverTeamFromSnapshot(prev);
    const gameKey = `${gamesDisplay.team1}-${gamesDisplay.team2}`;

    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const deltaW = Math.max(0, currPlayers[pIdx].winners - prevPlayers[pIdx].winners);
      const deltaE = Math.max(0, currPlayers[pIdx].errors - prevPlayers[pIdx].errors);
      const deltas = [
        ...Array(deltaW).fill("winner"),
        ...Array(deltaE).fill("error")
      ];

      for (const eventType of deltas) {
        const actor = players[pIdx];
        if (!actor) continue;
        const actorTeam = actor.team;
        const opponentTeam = actorTeam === 1 ? 2 : 1;

        const tags = [];
        let streakInfo = null;
        const onServe = serverTeam === actorTeam;
        const onReturn = serverTeam && serverTeam !== actorTeam;

        let baseKey = "regular";
        const isGolden = normalizePointStr(pointsBefore.team1) === "40" && normalizePointStr(pointsBefore.team2) === "40";
        const isBreakForActor = isBreakPointForTeam(serverTeam, pointsBefore, actorTeam);
        const isBreakAgainstActor = isBreakPointForTeam(serverTeam, pointsBefore, opponentTeam) && onServe;
        const actorPts = actorTeam === 1 ? pointsBefore.team1 : pointsBefore.team2;
        const oppPts = actorTeam === 1 ? pointsBefore.team2 : pointsBefore.team1;
        const actorGames = actorTeam === 1 ? gamesDisplay.team1 : gamesDisplay.team2;
        const oppGames = actorTeam === 1 ? gamesDisplay.team2 : gamesDisplay.team1;

        const isGamePt = isGamePoint(actorPts, oppPts);
        const isOppGamePt = isGamePoint(oppPts, actorPts);
        const isSetPt = isSetPoint(actorGames, oppGames);
        const isOppSetPt = isSetPoint(oppGames, actorGames);

        if (isGolden) {
          baseKey = "golden_point";
          tags.push("golden_point", "clutch");
        } else if (isOppSetPt) {
          baseKey = "save_set_point";
          tags.push("save_set_point", "clutch");
        } else if (isSetPt) {
          baseKey = "set_point";
          tags.push("set_point", "clutch");
        } else if (isOppGamePt) {
          baseKey = "save_game_point";
          tags.push("save_game_point", "clutch");
        } else if (isGamePt) {
          baseKey = "game_point";
          tags.push("game_point", "clutch");
        } else if (isBreakForActor) {
          baseKey = "break_point";
          tags.push("break_point", "clutch");
        } else if (isBreakAgainstActor) {
          baseKey = "save_break_point";
          tags.push("save_break_point", "clutch");
        } else if (isFirstPoint(pointsBefore)) {
          baseKey = "first_point";
          tags.push("first_point");
        }

        const baseCfg = baseEvents[baseKey] || baseEvents.regular || { winner: 0, error: 0 };
        const baseDelta = baseCfg[eventType] ?? 0;

        let bonusDelta = 0;
        const priorErrors = state.errorStreak[pIdx];

        if (eventType === "winner") {
          state.winnerStreak[pIdx] += 1;
          state.errorStreak[pIdx] = 0;

          const heatCfg = bonuses.heat || {};
          const startAt = heatCfg.startAt ?? 2;
          const tier2At = heatCfg.tier2At ?? 3;
          const bonus1 = heatCfg.bonusAfterStart ?? 2;
          const bonus2 = heatCfg.bonusAfterTier2 ?? 4;
          const perGameCap = heatCfg.perGameCap ?? 999;

          const heatMap = state.heatBonusByGame.get(pIdx) || new Map();
          const usedThisGame = heatMap.get(gameKey) || 0;
          let streakBonus = 0;
          if (state.winnerStreak[pIdx] >= tier2At) {
            streakBonus = bonus2;
          } else if (state.winnerStreak[pIdx] >= startAt) {
            streakBonus = bonus1;
          }

          const allowed = Math.max(0, perGameCap - usedThisGame);
          const appliedStreak = Math.min(streakBonus, allowed);
          if (appliedStreak > 0) {
            bonusDelta += appliedStreak;
            heatMap.set(gameKey, usedThisGame + appliedStreak);
            state.heatBonusByGame.set(pIdx, heatMap);
            tags.push("streak");
            streakInfo = {
              type: "hot",
              count: state.winnerStreak[pIdx],
              tier: state.winnerStreak[pIdx] >= tier2At ? "tier2" : "tier1"
            };
          }

          const bounceCfg = bonuses.bounceBack || {};
          if (priorErrors >= (bounceCfg.afterErrors ?? 2)) {
            const bb = Math.max(0, bounceCfg.bonus ?? 0);
            if (bb > 0) {
              bonusDelta += bb;
              tags.push("bounce_back", "clutch");
            }
          } else if (priorErrors === 1 && bonuses.grit) {
            const gritBonus = Math.max(0, bonuses.grit.avoidDoubleErrorBonus ?? 0);
            if (gritBonus > 0) {
              bonusDelta += gritBonus;
              tags.push("grit");
            }
          }
        } else if (eventType === "error") {
          state.errorStreak[pIdx] += 1;
          state.winnerStreak[pIdx] = 0;

          const coldCfg = bonuses.cold || {};
          const startAt = coldCfg.startAt ?? 2;
          const tier2At = coldCfg.tier2At ?? 3;
          const penalty1 = coldCfg.penaltyAfterStart ?? 0;
          const penalty2 = coldCfg.penaltyAfterTier2 ?? 0;
          const perGameCap = coldCfg.perGameCap ?? 999;

          const coldMap = state.coldPenaltyByGame.get(pIdx) || new Map();
          const usedThisGame = coldMap.get(gameKey) || 0;
          let streakPenalty = 0;
          if (state.errorStreak[pIdx] >= tier2At) {
            streakPenalty = -penalty2;
          } else if (state.errorStreak[pIdx] >= startAt) {
            streakPenalty = -penalty1;
          }

          if (streakPenalty < 0 && perGameCap > 0) {
            const allowed = Math.max(0, perGameCap - usedThisGame);
            const appliedMagnitude = Math.min(Math.abs(streakPenalty), allowed);
            const appliedPenalty = -appliedMagnitude;
            if (appliedPenalty < 0) {
              bonusDelta += appliedPenalty;
              coldMap.set(gameKey, usedThisGame + appliedMagnitude);
              state.coldPenaltyByGame.set(pIdx, coldMap);
              tags.push("error_streak");
              streakInfo = {
                type: "cold",
                count: state.errorStreak[pIdx],
                tier: state.errorStreak[pIdx] >= tier2At ? "tier2" : "tier1"
              };
            }
          }
        }

        const totalDelta = baseDelta + bonusDelta;

        actor.baseExp += baseDelta;
        actor.bonusExp += bonusDelta;
        actor.totalExp += totalDelta;

        const skillGain = computeSkillGains(totalDelta, eventType, tags, onServe, configData.skillGains);
        for (const [k, v] of Object.entries(skillGain)) {
          actor.skills[k] = (actor.skills[k] || 0) + v;
        }

        events.push({
          player: actor.name,
          team: actor.team,
          tag: baseKey,
          tags,
          type: eventType,
          delta: totalDelta,
          base: baseDelta,
          bonus: bonusDelta,
          skills: skillGain,
          streakInfo,
          score: formatScoreLabel(pointsBefore, gamesDisplay, setsBefore)
        });
      }
    }
  }

  // Participation: grant small EXP for being in sets
  const finalSets = parseSets(snapshots[snapshots.length - 1] || {});
  const setsPlayed =
    Math.max(1, (finalSets.team1 || 0) + (finalSets.team2 || 0) || 0);
  const setEntryExp = configData.participation?.setEntryExp ?? 0;
  const participationEvents = [];
  if (setEntryExp) {
    for (const p of players) {
      const delta = setEntryExp * setsPlayed;
      p.baseExp += delta;
      p.totalExp += delta;
      p.skills.endurance += delta;
      participationEvents.push({
        player: p.name,
        team: p.team,
        tag: "set_entry",
        tags: ["set_entry"],
        type: "participation",
        delta,
        base: delta,
        bonus: 0,
        skills: { endurance: delta },
        score: `Sets played: ${setsPlayed}`
      });
    }
  }

  const allEvents = [...participationEvents, ...events];

  // finalize badges/tiers after participation
  for (const p of players) {
    p.tier = tierForExp(p.totalExp, tiering);
    p.badges.serve = badgeForSkill(p.skills.serve, badges.serve);
    p.badges.defense = badgeForSkill(p.skills.defense, badges.defense);
    p.badges.mental = badgeForSkill(p.skills.mental, badges.mental);
    p.badges.endurance = badgeForSkill(p.skills.endurance, badges.endurance);
  }

  // assign chronological seq
  allEvents.forEach((ev, idx) => {
    ev.seq = idx + 1;
  });

  return { players, events: allEvents };
}

async function loadConfig() {
  try {
    const res = await fetch("/rpg-config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load config");
    config = await res.json();
    const tiers = config?.tiering?.tiers?.length || 0;
    configMeta.textContent = `${config.name || "RPG config"} · ${tiers} tiers · positive-only weights`;
  } catch (e) {
    setError("Could not load /rpg-config.json");
    console.error(e);
  }
}

function populateMatchesSelect(items = []) {
  matchSelect.innerHTML = "";
  if (!items.length) {
    matchSelect.innerHTML = `<option value="">No matches available</option>`;
    return;
  }
  for (const item of items) {
    const label = `#${item.matchId} ${item.team1Name || "Team 1"} vs ${item.team2Name || "Team 2"} ${item.setsString || ""}`.trim();
    const opt = document.createElement("option");
    opt.value = item.matchId;
    opt.textContent = label;
    matchSelect.appendChild(opt);
  }
}

async function loadMatches(reset = true) {
  if (reset) {
    matchesCache = [];
    pagination = { offset: 0, hasMore: true };
  }
  if (!pagination.hasMore && !reset) return;

  const offset = pagination.offset || 0;
  const limit = 20;

  setStatus(`Loading matches ${offset + 1}-${offset + limit} from /api/db-matches...`);
  setError("");
  try {
    const res = await fetch(`/api/db-matches?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error("Failed to fetch matches");
    const data = await res.json();
    const newItems = [...(data.items || [])];
    const newExtras = reset ? [...(data.extras || [])] : [];
    matchesCache = [...matchesCache, ...newItems, ...newExtras];
    pagination.offset = offset + (data.limit || limit);
    pagination.hasMore = Boolean(data.hasMore);
    populateMatchesSelect(matchesCache);
    setStatus(
      `Loaded ${matchesCache.length} matches${pagination.hasMore ? " (more available)" : ""}`
    );
  } catch (e) {
    setError("Could not load matches (is Supabase configured?)");
    console.error(e);
  }
}

function renderPlayerCards(players) {
  summaryCards.innerHTML = "";
  skillCards.innerHTML = "";
  if (!players.length) return;

  for (const p of players) {
    const card = document.createElement("div");
    card.className = "card";

    const tierLabel = p.tier ? `${p.tier.label} (${p.tier.exp}+)` : "No tier";
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="meta">Team ${p.team} · ${tierLabel}</div>
      <div class="totals">
        <span class="chip accent">Total EXP ${Math.round(p.totalExp)}</span>
        <span class="chip">Base ${Math.round(p.baseExp)}</span>
        <span class="chip clutch">Bonus ${Math.round(p.bonusExp)}</span>
      </div>
      <div class="meta badge-list">
        ${p.badges.serve ? `<span class="chip">Serve: ${escapeHtml(p.badges.serve.label)}</span>` : ""}
        ${p.badges.defense ? `<span class="chip">Defense: ${escapeHtml(p.badges.defense.label)}</span>` : ""}
        ${p.badges.mental ? `<span class="chip">Mental: ${escapeHtml(p.badges.mental.label)}</span>` : ""}
        ${p.badges.endurance ? `<span class="chip">Endurance: ${escapeHtml(p.badges.endurance.label)}</span>` : ""}
      </div>
    `;
    summaryCards.appendChild(card);

    const skillCard = document.createElement("div");
    skillCard.className = "card";
    const maxSkill = Math.max(...Object.values(p.skills || {}), 1);
    skillCard.innerHTML = `
      <h3>${escapeHtml(p.name)} · Skills</h3>
      ${Object.entries(p.skills).map(([key, value]) => {
        const pct = Math.min(100, Math.round((value / maxSkill) * 100));
        return `
          <div class="meta">${escapeHtml(key.charAt(0).toUpperCase() + key.slice(1))}: ${Math.round(value)} XP</div>
          <div class="bar"><div style="width:${pct}%"></div></div>
        `;
      }).join("")}
    `;
    skillCards.appendChild(skillCard);
  }
}

function renderEvents(events) {
  eventLog.innerHTML = "";
  if (!events.length) {
    eventLog.textContent = "No events found for this match.";
    return;
  }

  if (viewMode === "timeline") {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = "<h3>Full Timeline</h3>";

    for (const ev of events) {
      const tagLabel = ev.tag.replace(/_/g, " ");
      const skills = Object.entries(ev.skills || {}).filter(([, v]) => v);
      const skillStr = skills
        .map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${Math.round(v)}`)
        .join(" · ");
      const deltaLabel = `${ev.delta > 0 ? "+" : ""}${Math.round(ev.delta)} XP`;
      const bonusLabel =
        ev.bonus || ev.bonus === 0
          ? `${ev.bonus > 0 ? "+" : ""}${Math.round(ev.bonus)} bonus`
          : "";
      const bonusTags = (ev.tags || []).filter((t) =>
        ["streak", "bounce_back", "grit"].includes(t)
      );
      const bonusInfo = bonusTags.length ? `Bonus: ${bonusTags.join(", ")}` : "";
      const deltaClass = ev.delta < 0 ? "neg" : "pos";
      const streakLabel = ev.streakInfo
        ? `Streak ${ev.streakInfo.type === "hot" ? "hot" : "cold"} ${ev.streakInfo.count} (${ev.streakInfo.tier})`
        : "";

      const row = document.createElement("div");
      row.className = "event-row";
      row.innerHTML = `
        <div class="who">#${ev.seq} ${escapeHtml(ev.player)}</div>
        <div class="delta ${deltaClass}">${escapeHtml(deltaLabel)}</div>
        <div class="tag">${escapeHtml(bonusLabel)}</div>
        <div class="tag">${escapeHtml(bonusInfo)}</div>
        <div class="tag">${escapeHtml(streakLabel)}</div>
        <div class="type">${escapeHtml(ev.type)}</div>
        <div class="tag">${escapeHtml(tagLabel)}</div>
        <div class="tag">${escapeHtml(ev.score)}</div>
        <div class="tag">${skillStr ? escapeHtml(skillStr) : ""}</div>
      `;
      card.appendChild(row);
    }

    eventLog.appendChild(card);
    return;
  }

  const byPlayer = new Map();
  for (const ev of events) {
    if (!byPlayer.has(ev.player)) byPlayer.set(ev.player, []);
    byPlayer.get(ev.player).push(ev);
  }

  for (const [player, list] of byPlayer.entries()) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${escapeHtml(player)}</h3>`;

    for (const ev of list) {
      const tagLabel = ev.tag.replace(/_/g, " ");
      const skills = Object.entries(ev.skills || {}).filter(([, v]) => v);
      const skillStr = skills
        .map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${Math.round(v)}`)
        .join(" · ");
        const deltaLabel = `${ev.delta > 0 ? "+" : ""}${Math.round(ev.delta)} XP`;
        const bonusLabel =
          ev.bonus || ev.bonus === 0
            ? `${ev.bonus > 0 ? "+" : ""}${Math.round(ev.bonus)} bonus`
            : "";
        const bonusTags = (ev.tags || []).filter((t) =>
          ["streak", "bounce_back", "grit"].includes(t)
        );
        const bonusInfo = bonusTags.length ? `Bonus: ${bonusTags.join(", ")}` : "";
        const deltaClass = ev.delta < 0 ? "neg" : "pos";
        const streakLabel = ev.streakInfo
          ? `Streak ${ev.streakInfo.type === "hot" ? "hot" : "cold"} ${ev.streakInfo.count} (${ev.streakInfo.tier})`
          : "";

        const row = document.createElement("div");
        row.className = "event-row";
        row.innerHTML = `
          <div class="who">#${ev.seq} ${escapeHtml(tagLabel)}</div>
          <div class="tag">${escapeHtml(bonusLabel)}</div>
          <div class="tag">${escapeHtml(bonusInfo)}</div>
          <div class="tag">${escapeHtml(streakLabel)}</div>
          <div class="tag">${escapeHtml(ev.score)}</div>
          <div class="tag">${skillStr ? escapeHtml(skillStr) : ""}</div>
          <div class="delta ${deltaClass}">${escapeHtml(deltaLabel)}</div>
          <div class="type">${escapeHtml(ev.type)}</div>
        `;
      card.appendChild(row);
    }

    eventLog.appendChild(card);
  }
}

async function runSimulation() {
  if (!config) await loadConfig();
  const manualId = matchInput.value.trim();
  const selectedId = matchSelect.value;
  const matchId = manualId || selectedId;
  if (!matchId) {
    setError("Select or enter a match id first.");
    return;
  }

  setStatus(`Loading match ${matchId}...`);
  setError("");
  try {
    const res = await fetch(`/api/match/${matchId}/history`);
    if (!res.ok) throw new Error("Failed to load match history");
    const history = await res.json();
    const { players, events } = simulateExp(history, config);
    renderPlayerCards(players);
    renderEvents(events);
    setStatus(`Simulated ${events.length} events for match ${matchId}`);
  } catch (e) {
    setError("Could not load match history (is Supabase populated?)");
    console.error(e);
  }
}

runBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  runSimulation();
});

reloadBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadMatches(true);
});

document.getElementById("loadMoreBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  loadMatches(false);
});

(async function init() {
  await loadConfig();
  await loadMatches(true);
  setStatus("Pick a match and hit Simulate EXP");
})();

viewModeSelect?.addEventListener("change", (e) => {
  viewMode = e.target.value === "timeline" ? "timeline" : "grouped";
});
