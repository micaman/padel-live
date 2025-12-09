const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Supabase setup ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn(
    'Supabase not configured (missing SUPABASE_URL or key). DB logging disabled.'
  );
}

// In-memory matches: matchId -> match object
const matches = new Map();

function defaultPlayers() {
  return [
    { id: 't1p1', team: 1, name: 'Team 1 - Player 1' },
    { id: 't1p2', team: 1, name: 'Team 1 - Player 2' },
    { id: 't2p1', team: 2, name: 'Team 2 - Player 1' },
    { id: 't2p2', team: 2, name: 'Team 2 - Player 2' },
  ];
}

// derive sets won per team from a string like "6-0 / 1-0"
function deriveSetCountsFromString(setsString) {
  let team1 = 0;
  let team2 = 0;
  if (!setsString || typeof setsString !== 'string') {
    return { team1, team2 };
  }

  const parts = setsString
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const m = part.match(/(\d+)\s*-\s*(\d+)/);
    if (!m) continue;

    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;

    const max = Math.max(a, b);
    const diff = Math.abs(a - b);

    // padel/tennis-style: set is "finished" if someone reached 6+ with 2+ diff
    if (max >= 6 && diff >= 2) {
      if (a > b) team1++;
      else if (b > a) team2++;
    }
  }

  return { team1, team2 };
}

function getOrCreateMatch(matchIdRaw) {
  const matchId = String(matchIdRaw);
  let match = matches.get(matchId);
  if (!match) {
    match = {
      matchId,
      // numeric "sets won" used by UI badges
      sets: { team1: 0, team2: 0 },
      // raw string from watch, e.g. "6-0 / 1-0"
      setsString: '0-0',
      games: { team1: 0, team2: 0 },
      points: { team1: '0', team2: '0' },
      // team-level server (1 = top, 2 = bottom)
      server: null,
      // player-level server index from watch, 1..4
      serverPlayer: null,
      // names edited from browser:
      players: defaultPlayers(),
      // stats from watch:
      playerStats: [],
      // timeline for winners−errors chart
      timeline: [],
      updatedAt: null,
    };
    matches.set(matchId, match);
  }
  return match;
}

function formatScoreSummary(m) {
  const points = m.points || {};
  const games = m.games || {};
  const setStr =
    m.setsString ||
    (m.sets && m.sets.team1 !== undefined && m.sets.team2 !== undefined
      ? `${m.sets.team1}-${m.sets.team2}`
      : '-');

  const pointStr =
    points.team1 !== undefined && points.team2 !== undefined
      ? `${points.team1}-${points.team2}`
      : '';

  const gameStr =
    games.team1 !== undefined && games.team2 !== undefined
      ? `${games.team1}-${games.team2}`
      : '';

  const parts = [];
  if (setStr) parts.push(`S ${setStr}`);
  if (gameStr) parts.push(`G ${gameStr}`);
  if (pointStr) parts.push(`P ${pointStr}`);

  return parts.join('  ');
}

// Called by the watch
app.post('/api/update', async (req, res) => {
  let body = req.body || {};

  // If watch sends payload=JSON_STRING, parse that
  if (typeof body.payload === 'string') {
    try {
      body = JSON.parse(body.payload);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in payload field' });
    }
  }

  const rawMatchId = body.matchId;
  const { games, points, players } = body;
  let { sets, server } = body;

  if (!rawMatchId || !points) {
    return res
      .status(400)
      .json({ error: 'matchId and points are required in payload' });
  }

  const matchId = String(rawMatchId);
  const match = getOrCreateMatch(matchId);

  // --- sets: can be string ("6-0 / 1-0") or object {team1,team2} ---
  if (typeof sets === 'string') {
    match.setsString = sets.trim();
    match.sets = deriveSetCountsFromString(match.setsString);
  } else if (sets && typeof sets === 'object') {
    match.sets = {
      team1: sets.team1 ?? match.sets.team1,
      team2: sets.team2 ?? match.sets.team2,
    };
    match.setsString = `${match.sets.team1}-${match.sets.team2}`;
  }

  // games optional in new format
  if (games && typeof games === 'object') {
    match.games = {
      team1: games.team1 ?? match.games.team1,
      team2: games.team2 ?? match.games.team2,
    };
  }

  if (points && typeof points === 'object') {
    match.points = {
      team1: points.team1 ?? match.points.team1,
      team2: points.team2 ?? match.points.team2,
    };
  }

  // --- server: team or player index ---
  if (typeof server === 'number') {
    match.serverPlayer = server;

    let serverTeam = null;
    if (server >= 1 && server <= 4) {
      // players 1,2 = team1; 3,4 = team2
      serverTeam = server <= 2 ? 1 : 2;
    } else if (server === 1 || server === 2) {
      // fallback: server already expressed as team
      serverTeam = server;
    }

    if (serverTeam === 1 || serverTeam === 2) {
      match.server = serverTeam;
    }
  }

  // stats per player from watch
  if (Array.isArray(players)) {
    match.playerStats = players;

    // winners - errors per player for chart
    const diff = players.map((p) => {
      const w = Number(p.winners || 0);
      const e = Number(p.errors || 0);
      return w - e;
    });

    const now = new Date().toISOString();
    match.timeline.push({ t: now, diff });
  }

  match.updatedAt = new Date().toISOString();

  // --- Supabase logging ---
  if (supabase) {
    const watchTimestamp =
      body.timestamp != null
        ? new Date(Number(body.timestamp) * 1000).toISOString()
        : null;

    const eventRow = {
      match_id: matchId,
      watch_timestamp: watchTimestamp,
      raw: body,
      sets_string: match.setsString || null,
      sets_team1:
        match.sets && typeof match.sets.team1 === 'number'
          ? match.sets.team1
          : null,
      sets_team2:
        match.sets && typeof match.sets.team2 === 'number'
          ? match.sets.team2
          : null,
      games_team1:
        match.games && typeof match.games.team1 === 'number'
          ? match.games.team1
          : null,
      games_team2:
        match.games && typeof match.games.team2 === 'number'
          ? match.games.team2
          : null,
      points_team1:
        match.points && match.points.team1 != null
          ? String(match.points.team1)
          : null,
      points_team2:
        match.points && match.points.team2 != null
          ? String(match.points.team2)
          : null,
      server_team: typeof match.server === 'number' ? match.server : null,
      server_player:
        typeof match.serverPlayer === 'number' ? match.serverPlayer : null,
    };

    try {
      const { error } = await supabase.from('watch_events').insert(eventRow);
      if (error) {
        console.error('Supabase watch_events insert error:', error);
      }
    } catch (e) {
      console.error('Supabase watch_events insert exception:', e);
    }
  }

  return res.json({ ok: true });
});

// Get single match data (for match page, last snapshot)
app.get('/api/match/:id', (req, res) => {
  const matchId = String(req.params.id);
  const match = matches.get(matchId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.json(match);
});

// Full history from DB for viewer
app.get('/api/match/:id/history', async (req, res) => {
  const matchId = String(req.params.id);

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // all events for this match, oldest first
    const { data: events, error } = await supabase
      .from('watch_events')
      .select('id, raw, watch_timestamp, received_at')
      .eq('match_id', matchId)
      .order('watch_timestamp', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Supabase watch_events select error:', error);
      return res.status(500).json({ error: 'Failed to load history' });
    }

    const snapshots = (events || []).map((e) => e.raw);

    // player names (if set)
    const { data: players, error: pErr } = await supabase
      .from('match_players')
      .select('team, slot, name')
      .eq('match_id', matchId)
      .order('team', { ascending: true })
      .order('slot', { ascending: true });

    if (pErr) {
      console.error('Supabase match_players select error:', pErr);
    }

    return res.json({
      matchId,
      snapshots,
      players: players || [],
    });
  } catch (e) {
    console.error('Supabase /api/match/:id/history exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// List matches for home page
app.get('/api/matches', (req, res) => {
  const list = Array.from(matches.values())
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .map((m) => ({
      matchId: m.matchId,
      score: formatScoreSummary(m),
      updatedAt: m.updatedAt,
    }));

  res.json(list);
});

// Set player NAMES for a given match (from browser)
app.post('/api/match/:id/players', async (req, res) => {
  const matchId = String(req.params.id);
  const { team1, team2 } = req.body || {};

  const match = getOrCreateMatch(matchId);

  const t1p1 = team1?.p1 || match.players[0].name;
  const t1p2 = team1?.p2 || match.players[1].name;
  const t2p1 = team2?.p1 || match.players[2].name;
  const t2p2 = team2?.p2 || match.players[3].name;

  match.players = [
    { id: 't1p1', team: 1, name: t1p1 },
    { id: 't1p2', team: 1, name: t1p2 },
    { id: 't2p1', team: 2, name: t2p1 },
    { id: 't2p2', team: 2, name: t2p2 },
  ];

  // Persist to Supabase
  if (supabase) {
    const rows = [
      { match_id: matchId, team: 1, slot: 1, name: t1p1 },
      { match_id: matchId, team: 1, slot: 2, name: t1p2 },
      { match_id: matchId, team: 2, slot: 1, name: t2p1 },
      { match_id: matchId, team: 2, slot: 2, name: t2p2 },
    ];

    try {
      const { error } = await supabase
        .from('match_players')
        .upsert(rows, { onConflict: 'match_id,team,slot' });

      if (error) {
        console.error('Supabase match_players upsert error:', error);
      }
    } catch (e) {
      console.error('Supabase match_players upsert exception:', e);
    }
  }

  return res.json({ ok: true, players: match.players });
});

// Home page (you can keep your existing index.html / list of matches)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Match viewer page: /match/6813, etc.
app.get('/match/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'match.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
