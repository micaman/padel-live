const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

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

function getOrCreateMatch(matchId) {
  let match = matches.get(matchId);
  if (!match) {
    match = {
      matchId,
      sets: { team1: 0, team2: 0 },
      games: { team1: 0, team2: 0 },
      points: { team1: '0', team2: '0' },
      server: null,
      // names edited from browser:
      players: defaultPlayers(),
      // stats from watch:
      playerStats: [],
      updatedAt: null,
    };
    matches.set(matchId, match);
  }
  return match;
}

function formatScoreSummary(m) {
  const sets = m.sets || {};
  const games = m.games || {};
  const points = m.points || {};

  const setStr =
    sets.team1 !== undefined && sets.team2 !== undefined
      ? `${sets.team1}-${sets.team2}`
      : '-';
  const gameStr =
    games.team1 !== undefined && games.team2 !== undefined
      ? `${games.team1}-${games.team2}`
      : '-';
  const pointStr =
    points.team1 !== undefined && points.team2 !== undefined
      ? `${points.team1}-${points.team2}`
      : '-';

  return `S ${setStr}  G ${gameStr}  P ${pointStr}`;
}

// Called by the watch
app.post('/api/update', (req, res) => {
  const { matchId, sets, games, points, server, players } = req.body || {};

  if (!matchId || !points) {
    return res
      .status(400)
      .json({ error: 'matchId and points are required in payload' });
  }

  const match = getOrCreateMatch(matchId);

  // Overwrite live state with latest snapshot from watch
  if (sets && typeof sets === 'object') {
    match.sets = {
      team1: sets.team1 ?? match.sets.team1,
      team2: sets.team2 ?? match.sets.team2,
    };
  }

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

  if (typeof server === 'number') {
    match.server = server;
  }

  // stats per player from watch (don’t touch name mapping)
  if (Array.isArray(players)) {
    match.playerStats = players;
  }

  match.updatedAt = new Date().toISOString();

  return res.json({ ok: true });
});

// Get single match data (for match page)
app.get('/api/match/:id', (req, res) => {
  const matchId = req.params.id;
  const match = matches.get(matchId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.json(match);
});

// List matches for home page
app.get('/api/matches', (req, res) => {
  const list = Array.from(matches.values())
    .sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    )
    .map((m) => ({
      matchId: m.matchId,
      score: formatScoreSummary(m),
      updatedAt: m.updatedAt,
    }));

  res.json(list);
});

// Set player NAMES for a given match (from browser)
app.post('/api/match/:id/players', (req, res) => {
  const matchId = req.params.id;
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

  return res.json({ ok: true, players: match.players });
});

// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
