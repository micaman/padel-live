const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

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
      score: '',
      stats: {},
      updatedAt: null,
      players: defaultPlayers(),
    };
    matches.set(matchId, match);
  }
  return match;
}

// Called by the watch
app.post('/api/update', (req, res) => {
  const { matchId, score, stats } = req.body;

  if (!matchId || !score) {
    return res.status(400).json({ error: 'matchId and score are required' });
  }

  const match = getOrCreateMatch(matchId);

  match.score = score;
  if (stats && typeof stats === 'object') {
    match.stats = stats;
  }
  match.updatedAt = new Date().toISOString();

  return res.json({ ok: true });
});

// Get single match data (for the live page)
app.get('/api/match/:id', (req, res) => {
  const matchId = req.params.id;
  const match = matches.get(matchId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.json(match);
});

// 🔹 New: list all "running" matches
app.get('/api/matches', (req, res) => {
  const list = Array.from(matches.values())
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  res.json(list);
});

// 🔹 New: set player names for a given match
// POST /api/match/:id/players
// {
//   "team1": { "p1": "Alice", "p2": "Bob" },
//   "team2": { "p1": "Carlos", "p2": "Diego" }
// }
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
