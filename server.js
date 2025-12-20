const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

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

// In-memory matches: matchId -> match object (for live view, not persistence)
const matches = new Map();

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function slugifyText(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\s+/g, ' ').toLowerCase() : null;
}

function slugifyPlayerName(value) {
  return slugifyText(value);
}

function parseNullableId(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatMatchTypeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.icon_url || null,
  };
}

function formatMatchLocationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url || null,
  };
}

async function fetchMatchTypeOptions() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('match_types')
      .select('id, name, icon_url')
      .order('name', { ascending: true });
    if (error) {
      console.error('Supabase match_types select error:', error);
      return [];
    }
    return (data || []).map(formatMatchTypeRow);
  } catch (e) {
    console.error('Supabase fetchMatchTypeOptions exception:', e);
    return [];
  }
}

async function fetchMatchLocationOptions() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('match_locations')
      .select('id, name, logo_url')
      .order('name', { ascending: true });
    if (error) {
      console.error('Supabase match_locations select error:', error);
      return [];
    }
    return (data || []).map(formatMatchLocationRow);
  } catch (e) {
    console.error('Supabase fetchMatchLocationOptions exception:', e);
    return [];
  }
}

async function ensureMatchTypeByName(name) {
  if (!supabase) return null;
  const normalized = normalizeText(name);
  const slug = slugifyText(name);
  if (!normalized || !slug) return null;
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from('match_types')
      .upsert(
        { name: normalized, slug, updated_at: now },
        { onConflict: 'slug' }
      )
      .select('id, name, icon_url')
      .single();
    if (error) {
      console.error('Supabase match_types upsert error:', error);
      return null;
    }
    return formatMatchTypeRow(data);
  } catch (e) {
    console.error('Supabase ensureMatchTypeByName exception:', e);
    return null;
  }
}

async function ensureMatchLocationByName(name) {
  if (!supabase) return null;
  const normalized = normalizeText(name);
  const slug = slugifyText(name);
  if (!normalized || !slug) return null;
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from('match_locations')
      .upsert(
        { name: normalized, slug, updated_at: now },
        { onConflict: 'slug' }
      )
      .select('id, name, logo_url')
      .single();
    if (error) {
      console.error('Supabase match_locations upsert error:', error);
      return null;
    }
    return formatMatchLocationRow(data);
  } catch (e) {
    console.error('Supabase ensureMatchLocationByName exception:', e);
    return null;
  }
}

function determineWinnerTeam(match) {
  if (!match) return null;
  const sets = match.sets || {};
  const games = match.games || {};
  const points = match.points || {};

  const t1Sets = Number.isFinite(sets.team1) ? sets.team1 : null;
  const t2Sets = Number.isFinite(sets.team2) ? sets.team2 : null;
  if (t1Sets != null && t2Sets != null && t1Sets !== t2Sets) {
    return t1Sets > t2Sets ? 1 : 2;
  }

  const t1Games = Number.isFinite(games.team1) ? games.team1 : null;
  const t2Games = Number.isFinite(games.team2) ? games.team2 : null;
  if (t1Games != null && t2Games != null && t1Games !== t2Games) {
    return t1Games > t2Games ? 1 : 2;
  }

  const t1Points = Number(points.team1);
  const t2Points = Number(points.team2);
  if (Number.isFinite(t1Points) && Number.isFinite(t2Points) && t1Points !== t2Points) {
    return t1Points > t2Points ? 1 : 2;
  }

  return null;
}

async function persistMatchStatus(matchId, { status, winnerTeam, finishedAt } = {}) {
  if (!supabase || !status) return;

  const payload = {
    match_id: matchId,
    status,
    updated_at: new Date().toISOString(),
  };

  if (winnerTeam !== undefined) {
    payload.winner_team = winnerTeam ?? null;
  }
  if (finishedAt !== undefined) {
    payload.finished_at = finishedAt ?? null;
  } else if (status === 'finished') {
    payload.finished_at = new Date().toISOString();
  }

  try {
    const { error } = await supabase
      .from('matches')
      .upsert(payload, { onConflict: 'match_id' });
    if (error) {
      console.error('Supabase matches status upsert error:', error);
    }
  } catch (e) {
    console.error('Supabase persistMatchStatus exception:', e);
  }
}

async function persistMatchPlayers(matchId, entries) {
  if (!supabase || !Array.isArray(entries) || !entries.length) return;

  const prepared = entries
    .map((entry) => {
      const name = normalizeText(entry.name);
      const slug = slugifyPlayerName(entry.name);
      return {
        team: entry.team,
        slot: entry.slot,
        name,
        slug,
      };
    })
    .filter((entry) => entry.name && entry.slug);

  if (!prepared.length) return;

  const now = new Date().toISOString();
  const uniqueSlugMap = new Map();

  for (const entry of prepared) {
    if (!uniqueSlugMap.has(entry.slug)) {
      uniqueSlugMap.set(entry.slug, { name: entry.name, slug: entry.slug });
    }
  }

  const playerRows = Array.from(uniqueSlugMap.values()).map((row) => ({
    name: row.name,
    slug: row.slug,
    updated_at: now,
  }));

  try {
    const { error: playerError } = await supabase
      .from('players')
      .upsert(playerRows, { onConflict: 'slug' });

    if (playerError) {
      console.error('Supabase players upsert error:', playerError);
      return;
    }

    const { data: playersData, error: playersSelectError } = await supabase
      .from('players')
      .select('id, slug')
      .in('slug', Array.from(uniqueSlugMap.keys()));

    if (playersSelectError) {
      console.error('Supabase players select error:', playersSelectError);
      return;
    }

    const idBySlug = new Map(
      (playersData || []).map((p) => [p.slug, p.id])
    );

    const rows = prepared
      .map((entry) => {
        const playerId = idBySlug.get(entry.slug);
        if (!playerId) return null;
        return {
          match_id: matchId,
          team: entry.team,
          slot: entry.slot,
          player_id: playerId,
          updated_at: now,
        };
      })
      .filter(Boolean);

    if (!rows.length) return;

    const { error: linkError } = await supabase
      .from('match_players')
      .upsert(rows, { onConflict: 'match_id,team,slot' });

    if (linkError) {
      console.error('Supabase match_players upsert error:', linkError);
    }
  } catch (e) {
    console.error('Supabase persistMatchPlayers exception:', e);
  }
}

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
      sets: { team1: 0, team2: 0 },
      setsString: '0-0',
      games: { team1: 0, team2: 0 },
      points: { team1: '0', team2: '0' },
      server: null,       // team-level server
      serverPlayer: null, // player index 1..4
      players: defaultPlayers(),
      playerStats: [],
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

// helper: summary from DB raw payload
function summaryFromRaw(raw) {
  if (!raw || typeof raw !== 'object') {
    return { score: '', setsString: '' };
  }

  let setsString = '';
  let sets = { team1: 0, team2: 0 };

  if (typeof raw.sets === 'string') {
    setsString = raw.sets.trim();
    sets = deriveSetCountsFromString(setsString);
  } else if (raw.sets && typeof raw.sets === 'object') {
    sets = {
      team1: raw.sets.team1 ?? 0,
      team2: raw.sets.team2 ?? 0,
    };
    setsString = `${sets.team1}-${sets.team2}`;
  }

  const games = raw.games || {};
  const points = raw.points || {};

  const matchLike = {
    setsString,
    sets,
    games,
    points,
  };

  return {
    score: formatScoreSummary(matchLike),
    setsString,
  };
}

// Called by the watch (live + DB logging)
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
  const normalizedStatus =
    typeof body.status === 'string' ? body.status.toLowerCase() : null;

  if (!rawMatchId) {
    return res.status(400).json({ error: 'matchId is required in payload' });
  }

  const hasPoints = points !== undefined && points !== null;
  if (!hasPoints && normalizedStatus !== 'finished') {
    return res.status(400).json({
      error: 'points are required unless status is finished',
    });
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

  if (normalizedStatus === 'finished') {
    match.status = 'finished';
    const winnerTeam = determineWinnerTeam(match);
    const finishedAt =
      body.timestamp != null
        ? new Date(Number(body.timestamp) * 1000).toISOString()
        : new Date().toISOString();
    await persistMatchStatus(matchId, {
      status: 'finished',
      winnerTeam,
      finishedAt,
    });
  }

  return res.json({ ok: true });
});

// Get single match data (current live snapshot in memory)
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
    const [
      eventsRes,
      playersRes,
      matchMetaRes,
      typeOptions,
      locationOptions,
    ] = await Promise.all([
      supabase
        .from('watch_events')
        .select('id, raw, watch_timestamp, received_at')
        .eq('match_id', matchId)
        .order('watch_timestamp', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true }),
      supabase
        .from('match_players')
        .select('team, slot, player:players(id, name)')
        .eq('match_id', matchId)
        .order('team', { ascending: true })
        .order('slot', { ascending: true }),
      supabase
        .from('matches')
        .select('note, match_type_id, match_location_id, status, winner_team, finished_at')
        .eq('match_id', matchId)
        .maybeSingle(),
      fetchMatchTypeOptions(),
      fetchMatchLocationOptions(),
    ]);

    const { data: events, error } = eventsRes;
    if (error) {
      console.error('Supabase watch_events select error:', error);
      return res.status(500).json({ error: 'Failed to load history' });
    }

    const snapshots = (events || []).map((e) => e.raw);

    const { data: playerRows, error: pErr } = playersRes;
    if (pErr) {
      console.error('Supabase match_players select error:', pErr);
    }

    const { data: matchMeta, error: mErr } = matchMetaRes;
    if (mErr && mErr.code !== 'PGRST116') {
      // ignore "no rows" error
      console.error('Supabase matches select error:', mErr);
    }

    const matchType =
      typeOptions.find((opt) => opt.id === matchMeta?.match_type_id) || null;
    const matchLocation =
      locationOptions.find(
        (opt) => opt.id === matchMeta?.match_location_id
      ) || null;

    return res.json({
      matchId,
      snapshots,
      players:
        (playerRows || []).map((row) => ({
          team: row.team,
          slot: row.slot,
          name: row.player?.name || '',
          playerId: row.player?.id || null,
        })) || [],
      note: matchMeta?.note || null,
      matchType,
      matchLocation,
      status: matchMeta?.status || null,
      winnerTeam: matchMeta?.winner_team ?? null,
      finishedAt: matchMeta?.finished_at || null,
      matchTypeOptions: typeOptions,
      matchLocationOptions: locationOptions,
    });
  } catch (e) {
    console.error('Supabase /api/match/:id/history exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Set / update note for a match
app.post('/api/match/:id/note', async (req, res) => {
  const matchId = String(req.params.id);
  const body = req.body || {};
  const { note } = body;

  const matchTypeIdRaw = Object.prototype.hasOwnProperty.call(
    body,
    'matchTypeId'
  )
    ? body.matchTypeId
    : Object.prototype.hasOwnProperty.call(body, 'match_type_id')
    ? body.match_type_id
    : undefined;

  const matchTypeNameRaw = Object.prototype.hasOwnProperty.call(
    body,
    'matchTypeName'
  )
    ? body.matchTypeName
    : Object.prototype.hasOwnProperty.call(body, 'match_type_name')
    ? body.match_type_name
    : undefined;

  const matchLocationIdRaw = Object.prototype.hasOwnProperty.call(
    body,
    'matchLocationId'
  )
    ? body.matchLocationId
    : Object.prototype.hasOwnProperty.call(body, 'match_location_id')
    ? body.match_location_id
    : undefined;

  const matchLocationNameRaw = Object.prototype.hasOwnProperty.call(
    body,
    'matchLocationName'
  )
    ? body.matchLocationName
    : Object.prototype.hasOwnProperty.call(body, 'match_location_name')
    ? body.match_location_name
    : undefined;

  const matchTypeId =
    matchTypeIdRaw !== undefined ? parseNullableId(matchTypeIdRaw) : undefined;
  const matchTypeName =
    matchTypeNameRaw !== undefined ? normalizeText(matchTypeNameRaw) : undefined;

  const matchLocationId =
    matchLocationIdRaw !== undefined
      ? parseNullableId(matchLocationIdRaw)
      : undefined;
  const matchLocationName =
    matchLocationNameRaw !== undefined
      ? normalizeText(matchLocationNameRaw)
      : undefined;

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const now = new Date().toISOString();
    const payload = {
      match_id: matchId,
      updated_at: now,
    };
    let updatedFields = 0;
    let matchTypeRow = null;
    let matchLocationRow = null;

    if (Object.prototype.hasOwnProperty.call(body, 'note')) {
      payload.note = typeof note === 'string' ? note : null;
      updatedFields++;
    }

    if (matchTypeName !== undefined) {
      updatedFields++;
      if (matchTypeName) {
        matchTypeRow = await ensureMatchTypeByName(matchTypeName);
        payload.match_type_id = matchTypeRow?.id || null;
      } else {
        payload.match_type_id = null;
      }
    } else if (matchTypeId !== undefined) {
      updatedFields++;
      payload.match_type_id = matchTypeId ?? null;
    }

    if (matchLocationName !== undefined) {
      updatedFields++;
      if (matchLocationName) {
        matchLocationRow = await ensureMatchLocationByName(matchLocationName);
        payload.match_location_id = matchLocationRow?.id || null;
      } else {
        payload.match_location_id = null;
      }
    } else if (matchLocationId !== undefined) {
      updatedFields++;
      payload.match_location_id = matchLocationId ?? null;
    }

    if (updatedFields === 0) {
      return res.status(400).json({ error: 'No metadata fields to update' });
    }

    const { data, error } = await supabase
      .from('matches')
      .upsert(payload, { onConflict: 'match_id' })
      .select('note, match_type_id, match_location_id, status, winner_team, finished_at')
      .single();

    if (error) {
      console.error('Supabase matches upsert error:', error);
      return res.status(500).json({ error: 'Failed to save match metadata' });
    }

    const [typeOptions, locationOptions] = await Promise.all([
      fetchMatchTypeOptions(),
      fetchMatchLocationOptions(),
    ]);

    const resolvedType =
      matchTypeRow ||
      typeOptions.find((opt) => opt.id === data.match_type_id) ||
      null;
    const resolvedLocation =
      matchLocationRow ||
      locationOptions.find((opt) => opt.id === data.match_location_id) ||
      null;

    return res.json({
      ok: true,
      note: data.note,
      matchType: resolvedType,
      matchLocation: resolvedLocation,
      status: data.status || null,
      winnerTeam: data.winner_team ?? null,
      finishedAt: data.finished_at || null,
      matchTypeOptions: typeOptions,
      matchLocationOptions: locationOptions,
    });
  } catch (e) {
    console.error('Supabase /api/match/:id/note exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// List matches from DB (paginated, newest first)
app.get('/api/db-matches', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  try {
    // 1 row per match (latest event)
    const { data: latest, error } = await supabase
      .from('latest_watch_event_per_match')
      .select('match_id, raw, watch_timestamp, received_at')
      .order('watch_timestamp', { ascending: false, nullsLast: true })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase latest view select error:', error);
      return res.status(500).json({ error: 'Failed to load matches' });
    }

    let list = (latest || []).map((e) => {
      const raw = e.raw || {};
      const matchId = String(e.match_id);
      const ts = e.watch_timestamp || e.received_at || null;
      const { score, setsString } = summaryFromRaw(raw);

      return {
        matchId,
        score,
        setsString,
        lastTimestamp: ts,
        lastSnapshot: raw,
      };
    });

    const matchIds = list.map((m) => m.matchId);

    // names
    const { data: players, error: pErr } = await supabase
      .from('match_players')
      .select('match_id, team, slot, player:players(id, name)')
      .in('match_id', matchIds);

    if (pErr) console.error('Supabase match_players select error:', pErr);

    const playersByMatch = new Map();
    for (const p of players || []) {
      const mid = p.match_id;
      if (!playersByMatch.has(mid)) playersByMatch.set(mid, []);
      playersByMatch.get(mid).push(p);
    }

    // notes
    const { data: matchesMeta, error: mErr } = await supabase
      .from('matches')
      .select('match_id, note, match_type_id, match_location_id, status, winner_team')
      .in('match_id', matchIds);

    if (mErr) console.error('Supabase matches select error:', mErr);

    const metaByMatch = new Map();
    const typeIds = new Set();
    const locationIds = new Set();
    for (const m of matchesMeta || []) {
      if (m.match_type_id) typeIds.add(m.match_type_id);
      if (m.match_location_id) locationIds.add(m.match_location_id);
      metaByMatch.set(m.match_id, {
        note: m.note || null,
        matchTypeId: m.match_type_id || null,
        matchLocationId: m.match_location_id || null,
        status: m.status || null,
        winnerTeam: m.winner_team ?? null,
      });
    }

    let typeById = new Map();
    if (typeIds.size) {
      const { data: typeRows, error: typeErr } = await supabase
        .from('match_types')
        .select('id, name, icon_url')
        .in('id', Array.from(typeIds));
      if (typeErr) {
        console.error('Supabase match_types select error:', typeErr);
      } else {
        typeById = new Map(
          (typeRows || []).map((row) => [row.id, formatMatchTypeRow(row)])
        );
      }
    }

    let locationById = new Map();
    if (locationIds.size) {
      const { data: locationRows, error: locationErr } = await supabase
        .from('match_locations')
        .select('id, name, logo_url')
        .in('id', Array.from(locationIds));
      if (locationErr) {
        console.error('Supabase match_locations select error:', locationErr);
      } else {
        locationById = new Map(
          (locationRows || []).map((row) => [row.id, formatMatchLocationRow(row)])
        );
      }
    }

    list = list.map((m) => {
      const ps = playersByMatch.get(m.matchId) || [];
      const t1 = ps
        .filter((p) => p.team === 1)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.player?.name);
      const t2 = ps
        .filter((p) => p.team === 2)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.player?.name);

      const meta = metaByMatch.get(m.matchId) || {};
      const typeRow = meta.matchTypeId ? typeById.get(meta.matchTypeId) : null;
      const locationRow = meta.matchLocationId
        ? locationById.get(meta.matchLocationId)
        : null;

      return {
        ...m,
        team1Name: t1.length ? t1.join(' / ') : 'Team 1',
        team2Name: t2.length ? t2.join(' / ') : 'Team 2',
        note: meta.note || null,
        matchType: typeRow?.name || null,
        matchTypeIconUrl: typeRow?.iconUrl || null,
        matchLocation: locationRow?.name || null,
        matchLocationLogoUrl: locationRow?.logoUrl || null,
        status: meta.status || null,
        winnerTeam: meta.winnerTeam ?? null,
      };
    });

    // If we got fewer than limit, there are no more pages.
    const hasMore = (latest || []).length === limit;

    return res.json({ items: list, limit, offset, hasMore });
  } catch (e) {
    console.error('Supabase /api/db-matches exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});


// Set player NAMES for a given match (from viewer)
app.post('/api/match/:id/players', async (req, res) => {
  const matchId = String(req.params.id);
  const { team1, team2 } = req.body || {};

  const match = getOrCreateMatch(matchId);

  const resolveName = (input, fallback) => normalizeText(input) || fallback;

  const t1p1 = resolveName(team1?.p1, match.players[0].name);
  const t1p2 = resolveName(team1?.p2, match.players[1].name);
  const t2p1 = resolveName(team2?.p1, match.players[2].name);
  const t2p2 = resolveName(team2?.p2, match.players[3].name);

  match.players = [
    { id: 't1p1', team: 1, name: t1p1 },
    { id: 't1p2', team: 1, name: t1p2 },
    { id: 't2p1', team: 2, name: t2p1 },
    { id: 't2p2', team: 2, name: t2p2 },
  ];

  const dbEntries = [
    { team: 1, slot: 1, name: t1p1 },
    { team: 1, slot: 2, name: t1p2 },
    { team: 2, slot: 1, name: t2p1 },
    { team: 2, slot: 2, name: t2p2 },
  ];

  try {
    await persistMatchPlayers(matchId, dbEntries);
  } catch (e) {
    console.error('Supabase match_players persist exception:', e);
  }

  return res.json({ ok: true, players: match.players });
});

// Index page: list matches
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Match viewer page: /match/6813
app.get('/match/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'match.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});





