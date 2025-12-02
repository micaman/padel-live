const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// simple in-memory store
const matches = new Map();

app.post('/api/update', (req, res) => {
  const { matchId, score, stats } = req.body;
  if (!matchId || !score) {
    return res.status(400).json({ error: 'matchId and score are required' });
  }

  matches.set(matchId, {
    matchId,
    score,
    stats: stats || {},
    updatedAt: new Date().toISOString(),
  });

  res.json({ ok: true });
});

app.get('/api/match/:id', (req, res) => {
  const match = matches.get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

// static frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
