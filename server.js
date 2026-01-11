const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const console = require('console');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BASIC_USER = process.env.BASIC_AUTH_USER;
const BASIC_PASS = process.env.BASIC_AUTH_PASS;
const BASIC_REALM = process.env.BASIC_AUTH_REALM || 'Padel Live';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function shouldEnforceAuth(req) {
  // allow health checks and watch ingest without auth
  if (req.path === '/health' || req.path === '/favicon.ico') return false;
  if (req.path === '/api/update') return false;
  return true;
}

function parseBasicAuth(header) {
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return {
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  };
}

app.use((req, res, next) => {
  if (!BASIC_USER || !BASIC_PASS || !shouldEnforceAuth(req)) {
    return next();
  }
  const credentials = parseBasicAuth(req.headers.authorization);
  if (
    credentials &&
    credentials.username === BASIC_USER &&
    credentials.password === BASIC_PASS
  ) {
    return next();
  }
  res.set('WWW-Authenticate', `Basic realm="${BASIC_REALM}"`);
  return res.status(401).send('Authentication required');
});

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

function sanitizeSetsString(raw) {
  if (typeof raw !== 'string') return '';
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  while (parts.length && /^0\s*-\s*0$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(' / ');
}

function parseNullableId(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseNullableNumber(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseNullableDate(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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

const matchTypesCache = { data: new Map(), fetchedAt: 0 };
const matchLocationsCache = { data: new Map(), fetchedAt: 0 };

async function getCachedMatchTypes(ids) {
  if (!supabase) return new Map();
  const now = Date.now();
  const expired = now - matchTypesCache.fetchedAt > CACHE_TTL_MS;
  const needed = expired ? ids : ids.filter((id) => !matchTypesCache.data.has(id));
  if (expired) {
    matchTypesCache.data = new Map();
  }
  if (needed.length) {
    try {
      const { data, error } = await supabase
        .from('match_types')
        .select('id, name, icon_url')
        .in('id', Array.from(new Set(needed)));
      if (error) {
        console.error('Supabase match_types select error (cached):', error);
      } else {
        for (const row of data || []) {
          matchTypesCache.data.set(row.id, formatMatchTypeRow(row));
        }
        matchTypesCache.fetchedAt = now;
      }
    } catch (e) {
      console.error('Supabase match_types cached fetch exception:', e);
    }
  }
  return new Map(ids.map((id) => [id, matchTypesCache.data.get(id)]));
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

async function getCachedMatchLocations(ids) {
  if (!supabase) return new Map();
  const now = Date.now();
  const expired = now - matchLocationsCache.fetchedAt > CACHE_TTL_MS;
  const needed = expired ? ids : ids.filter((id) => !matchLocationsCache.data.has(id));
  if (expired) {
    matchLocationsCache.data = new Map();
  }
  if (needed.length) {
    try {
      const { data, error } = await supabase
        .from('match_locations')
        .select('id, name, logo_url')
        .in('id', Array.from(new Set(needed)));
      if (error) {
        console.error('Supabase match_locations select error (cached):', error);
      } else {
        for (const row of data || []) {
          matchLocationsCache.data.set(row.id, formatMatchLocationRow(row));
        }
        matchLocationsCache.fetchedAt = now;
      }
    } catch (e) {
      console.error('Supabase match_locations cached fetch exception:', e);
    }
  }
  return new Map(ids.map((id) => [id, matchLocationsCache.data.get(id)]));
}

async function countMatchesMissingMeta() {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from('matches')
      .select('match_id', { count: 'exact', head: true })
      .is('match_type_id', null)
      .is('match_location_id', null)
      .is('note', null)
      .is('scheduled_at', null)
      .is('match_level', null)
      .is('match_cost', null);
    if (error) {
      console.error('Supabase missing-meta count error:', error);
      return 0;
    }
    return typeof count === 'number' ? count : 0;
  } catch (e) {
    console.error('Supabase missing-meta count exception:', e);
    return 0;
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

function isStatusOnlyEvent(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const normalizedStatus =
    typeof raw.status === 'string' ? raw.status.toLowerCase() : null;
  if (normalizedStatus !== 'finished') return false;

  const hasPoints = raw.points && typeof raw.points === 'object';
  const hasSets =
    (typeof raw.sets === 'string' && raw.sets.trim().length > 0) ||
    (raw.sets && typeof raw.sets === 'object' && Object.keys(raw.sets).length);
  const hasGames =
    raw.games && typeof raw.games === 'object' && Object.keys(raw.games).length;
  const hasPlayers = Array.isArray(raw.players) && raw.players.length > 0;
  const hasServer =
    typeof raw.server === 'number' || typeof raw.serverPlayer === 'number';

  return !hasPoints && !hasSets && !hasGames && !hasPlayers && !hasServer;
}

function teamSlotToIndex(team, slot) {
  if (team === 1) {
    return slot === 2 ? 1 : 0;
  }
  return slot === 2 ? 3 : 2;
}

const DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function getDayLabel(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return DAY_LABELS[date.getDay()];
}

const WINNER_DETAIL_KEYS = ['normal', 'home', 'x3', 'x4', 'door', 'barbaridad'];
const ERROR_DETAIL_KEYS = ['unforced', 'forced', 'beer'];

function normalizeWinnerDetail(detailRaw) {
  const detail = typeof detailRaw === 'string' ? detailRaw.trim().toLowerCase() : '';
  if (!detail) return 'normal';
  return WINNER_DETAIL_KEYS.includes(detail) ? detail : 'normal';
}

function normalizeErrorDetail(detailRaw) {
  const detail = typeof detailRaw === 'string' ? detailRaw.trim().toLowerCase() : '';
  if (!detail) return 'unforced';
  return ERROR_DETAIL_KEYS.includes(detail) ? detail : 'unforced';
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

function getExtraInfoFromSnapshotServer(snap) {
  if (!snap || typeof snap !== 'object') return null;
  return snap.extraInfo ?? snap.extra_info ?? null;
}

function accumulateDetailTotalsForPlayer(snapshots, playerIndex, totals) {
  if (!totals || !totals.winners || !totals.errors) return;
  if (!Array.isArray(snapshots) || snapshots.length < 2) return;
  if (playerIndex == null) return;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1] || {};
    const curr = snapshots[i] || {};
    const extraInfo = getExtraInfoFromSnapshotServer(curr);
    const prevPlayers = Array.isArray(prev.players) ? prev.players : [];
    const currPlayers = Array.isArray(curr.players) ? curr.players : [];
    const prevStats = prevPlayers[playerIndex] || {};
    const currStats = currPlayers[playerIndex] || {};
    const winnerDiff = Number(currStats.winners || 0) - Number(prevStats.winners || 0);
    const errorDiff = Number(currStats.errors || 0) - Number(prevStats.errors || 0);
    if (winnerDiff > 0) {
      const key = normalizeWinnerDetail(extraInfo);
      totals.winners[key] = (totals.winners[key] || 0) + winnerDiff;
      totals.totalEvents += winnerDiff;
    }
    if (errorDiff > 0) {
      const key = normalizeErrorDetail(extraInfo);
      totals.errors[key] = (totals.errors[key] || 0) + errorDiff;
      totals.totalEvents += errorDiff;
    }
  }
}

async function fetchMatchDurations(matchIds) {
  const result = new Map();
  if (!supabase || !Array.isArray(matchIds) || !matchIds.length) return result;

  try {
    const secondsFromRow = (row) => {
      const rawTs = Number(row.raw?.timestamp);
      if (Number.isFinite(rawTs)) return rawTs;
      const watchTs = row.watch_timestamp ? new Date(row.watch_timestamp).getTime() / 1000 : null;
      if (Number.isFinite(watchTs)) return watchTs;
      const recvTs = row.received_at ? new Date(row.received_at).getTime() / 1000 : null;
      if (Number.isFinite(recvTs)) return recvTs;
      return null;
    };

    const [latestRes, firstRes] = await Promise.all([
      supabase
        .from('latest_watch_event_per_match')
        .select('match_id, raw, watch_timestamp, received_at')
        .in('match_id', matchIds),
      supabase
        .from('first_watch_event_per_match')
        .select('match_id, raw, watch_timestamp, received_at')
        .in('match_id', matchIds),
    ]);

    const latestMap = new Map();
    if (latestRes.data) {
      for (const row of latestRes.data) {
        const ts = secondsFromRow(row);
        if (!Number.isFinite(ts)) continue;
        latestMap.set(String(row.match_id), ts);
      }
    } else if (latestRes.error) {
      console.error('Supabase latest view select error (duration):', latestRes.error);
    }

    const firstMap = new Map();
    if (firstRes.data) {
      for (const row of firstRes.data) {
        const ts = secondsFromRow(row);
        if (!Number.isFinite(ts)) continue;
        firstMap.set(String(row.match_id), ts);
      }
    } else if (firstRes.error) {
      console.error('Supabase first view select error (duration):', firstRes.error);
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('watch_events')
        .select('match_id, raw, watch_timestamp, received_at')
        .in('match_id', matchIds)
        .order('match_id', { ascending: true })
        .order('watch_timestamp', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true });
      if (fallbackErr) {
        console.error('Supabase earliest fallback select error (duration):', fallbackErr);
      } else {
        for (const row of fallbackData || []) {
          const key = String(row.match_id);
          if (firstMap.has(key)) continue;
          const ts = secondsFromRow(row);
          if (!Number.isFinite(ts)) continue;
          firstMap.set(key, ts);
        }
      }
    }

    const formatDurationHuman = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return 'n/a';
      const total = Math.round(seconds);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };

    let totalDurationSec = 0;
    for (const matchId of matchIds) {
      const key = String(matchId);
      const start = firstMap.get(key);
      const end = latestMap.get(key);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const durationSec = Math.max(0, end - start);
      result.set(key, durationSec);
      totalDurationSec += durationSec;
    }
  } catch (e) {
    console.error('Supabase fetchMatchDurations exception:', e);
  }
  return result;
}

async function fetchLatestSnapshotsForMatches(matchIds) {
  const result = new Map();
  if (!supabase || !Array.isArray(matchIds) || !matchIds.length) {
    return result;
  }

  try {
    const { data, error } = await supabase
      .from('latest_watch_event_per_match')
      .select('match_id, raw, watch_timestamp, received_at')
      .in('match_id', matchIds);
    if (error) {
      console.error('Supabase latest view (by match) select error:', error);
      return result;
    }

    const needsFallback = new Set();
    for (const row of data || []) {
      const matchKey = String(row.match_id);
      const raw = row.raw || {};
      if (isStatusOnlyEvent(raw)) {
        needsFallback.add(matchKey);
      } else {
        result.set(matchKey, row);
      }
    }

    if (needsFallback.size) {
      const { data: fallbackRows, error: fallbackErr } = await supabase
        .from('watch_events')
        .select('match_id, raw, watch_timestamp, received_at')
        .in('match_id', Array.from(needsFallback))
        .order('watch_timestamp', { ascending: false, nullsLast: true })
        .order('id', { ascending: false });
      if (fallbackErr) {
        console.error('Supabase watch_events fallback (by match) error:', fallbackErr);
      } else {
        for (const row of fallbackRows || []) {
          const matchKey = String(row.match_id);
          if (result.has(matchKey)) continue;
          if (isStatusOnlyEvent(row.raw)) continue;
          result.set(matchKey, row);
        }
      }
    }
  } catch (e) {
    console.error('Supabase fetchLatestSnapshotsForMatches exception:', e);
  }

  return result;
}

async function fetchSnapshotsHistoryForMatches(matchIds) {
  const result = new Map();
  if (!supabase || !Array.isArray(matchIds) || !matchIds.length) {
    return result;
  }

  try {
    const PAGE_SIZE = 1000;
    for (const matchId of matchIds) {
      let offset = 0;
      let keepGoing = true;
      while (keepGoing) {
        const { data, error } = await supabase
          .from('watch_events')
          .select('match_id, raw, watch_timestamp, received_at')
          .eq('match_id', matchId)
          .order('watch_timestamp', { ascending: true, nullsLast: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error('Supabase watch_events history select error:', { matchId, error });
          break;
        }

        if (!data || !data.length) {
          keepGoing = false;
          break;
        }

        const key = String(matchId);
        if (!result.has(key)) result.set(key, []);
        for (const row of data) {
          result.get(key).push(row.raw || {});
        }

        keepGoing = data.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }
    }
  } catch (e) {
    console.error('Supabase fetchSnapshotsHistoryForMatches exception:', e);
  }

  return result;
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

function computeMvpIndicesFromSnap(snap) {
  const players = Array.isArray(snap?.players) ? snap.players : [];
  if (!players.length) return [];
  const impacts = [];
  for (let i = 0; i < 4; i++) {
    const pl = players[i] || { winners: 0, errors: 0 };
    impacts.push(Number(pl.winners || 0) - Number(pl.errors || 0));
  }
  const maxImpact = Math.max(...impacts);
  if (!Number.isFinite(maxImpact)) return [];
  return impacts.reduce((acc, val, idx) => {
    if (val === maxImpact) acc.push(idx);
    return acc;
  }, []);
}

function countSetsPlayed(rawSets) {
  if (typeof rawSets === 'string') {
    const parts = sanitizeSetsString(rawSets)
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length || 1;
  }
  if (rawSets && typeof rawSets === 'object') {
    const t1 = Number(rawSets.team1) || 0;
    const t2 = Number(rawSets.team2) || 0;
    const total = t1 + t2;
    return total > 0 ? total : 1;
  }
  return 1;
}

// lightweight version of parseSetsArray used on the client
function parseSetsArrayServer(setsString, setsObj, gamesObj) {
  const arr = [];

  if (typeof setsString === 'string' && setsString.trim()) {
    const parts = sanitizeSetsString(setsString)
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      const match = part.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        arr.push({
          team1: Number.parseInt(match[1], 10) || 0,
          team2: Number.parseInt(match[2], 10) || 0,
        });
      }
    }
  }

  if (!arr.length && setsObj && (setsObj.team1 != null || setsObj.team2 != null)) {
    arr.push({
      team1: Number.parseInt(setsObj.team1, 10) || 0,
      team2: Number.parseInt(setsObj.team2, 10) || 0,
    });
  }

  if (!arr.length && gamesObj && (gamesObj.team1 != null || gamesObj.team2 != null)) {
    arr.push({
      team1: Number.parseInt(gamesObj.team1, 10) || 0,
      team2: Number.parseInt(gamesObj.team2, 10) || 0,
    });
  } else if (arr.length && gamesObj) {
    const g1 = Number.parseInt(gamesObj.team1, 10);
    const g2 = Number.parseInt(gamesObj.team2, 10);
    const idx = arr.length - 1;
    if (Number.isFinite(g1)) arr[idx].team1 = g1;
    if (Number.isFinite(g2)) arr[idx].team2 = g2;
  }

  return arr;
}

function currentSetIndexFromSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return 1;
  const setsString = typeof raw.sets === 'string' ? raw.sets : '';
  const setsObj = raw.sets && typeof raw.sets === 'object' ? raw.sets : null;
  const gamesObj = raw.games && typeof raw.games === 'object' ? raw.games : null;
  const arr = parseSetsArrayServer(setsString, setsObj, gamesObj);
  return arr.length ? arr.length : 1;
}

// helper: summary from DB raw payload
function summaryFromRaw(raw) {
  if (!raw || typeof raw !== 'object') {
    return { score: '', setsString: '' };
  }

  let setsString = '';
  let sets = { team1: 0, team2: 0 };

  if (typeof raw.sets === 'string') {
    setsString = sanitizeSetsString(raw.sets);
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

  const hasPoints = points && typeof points === 'object';
  const statusOnly = isStatusOnlyEvent(body);

  if (!hasPoints && !statusOnly) {
    return res.status(400).json({
      error: 'points are required unless status-only finished payload',
    });
  }

  const matchId = String(rawMatchId);
  const existingMatch = matches.get(matchId);
  const match = statusOnly ? existingMatch : getOrCreateMatch(matchId);

  if (!statusOnly && match) {
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
  }

  if (match) {
    match.updatedAt = new Date().toISOString();
  }

  // --- Supabase logging ---
  if (supabase && !statusOnly) {
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
    if (match) {
      match.status = 'finished';
    }
    const winnerTeam = match ? determineWinnerTeam(match) : null;
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
      missingMetaCount,
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
        .select('note, match_type_id, match_location_id, status, winner_team, finished_at, scheduled_at, match_level, match_cost')
        .eq('match_id', matchId)
        .maybeSingle(),
      fetchMatchTypeOptions(),
      fetchMatchLocationOptions(),
      countMatchesMissingMeta(),
    ]);

    const { data: events, error } = eventsRes;
    if (error) {
      console.error('Supabase watch_events select error:', error);
      return res.status(500).json({ error: 'Failed to load history' });
    }

    const filteredEvents = (events || []).filter(
      (event) => !isStatusOnlyEvent(event.raw)
    );
    const eventsWithMeta = filteredEvents.map((e) => ({
      id: e.id,
      raw: e.raw,
      watchTimestamp: e.watch_timestamp,
      receivedAt: e.received_at,
    }));
    const snapshots = eventsWithMeta.map((e) => e.raw);

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
      events: eventsWithMeta,
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
      scheduledAt: matchMeta?.scheduled_at || null,
      matchLevel: matchMeta?.match_level || null,
      matchCost: matchMeta?.match_cost ?? null,
      matchTypeOptions: typeOptions,
      matchLocationOptions: locationOptions,
      missingMetaCount,
    });
  } catch (e) {
    console.error('Supabase /api/match/:id/history exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Delete a single watch event
app.delete('/api/match/:id/events/:eventId', async (req, res) => {
  const matchId = String(req.params.id);
  const eventId = Number(req.params.eventId);

  if (!Number.isFinite(eventId)) {
    return res.status(400).json({ error: 'Invalid event id' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { data: existing, error: selectErr } = await supabase
      .from('watch_events')
      .select('id')
      .eq('id', eventId)
      .eq('match_id', matchId)
      .maybeSingle();

    if (selectErr && selectErr.code !== 'PGRST116') {
      console.error('Supabase watch_events select (delete) error:', selectErr);
      return res.status(500).json({ error: 'Failed to verify event' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Event not found for match' });
    }

    const { error: deleteErr } = await supabase
      .from('watch_events')
      .delete()
      .eq('id', eventId)
      .eq('match_id', matchId);

    if (deleteErr) {
      console.error('Supabase watch_events delete error:', deleteErr);
      return res.status(500).json({ error: 'Failed to delete event' });
    }

    return res.json({ ok: true, deletedEventId: eventId });
  } catch (e) {
    console.error('Supabase delete watch_event exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Delete a match and its watch events
app.delete('/api/match/:id', async (req, res) => {
  const matchId = String(req.params.id);

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { error: eventsErr } = await supabase
      .from('watch_events')
      .delete()
      .eq('match_id', matchId);

    if (eventsErr) {
      console.error('Supabase watch_events delete (match) error:', eventsErr);
      return res.status(500).json({ error: 'Failed to delete watch events' });
    }

    const { error: matchErr } = await supabase
      .from('matches')
      .delete()
      .eq('match_id', matchId);

    if (matchErr) {
      console.error('Supabase matches delete error:', matchErr);
      return res.status(500).json({ error: 'Failed to delete match' });
    }

    matches.delete(matchId);

    return res.json({ ok: true, deletedMatchId: matchId });
  } catch (e) {
    console.error('Supabase delete match exception:', e);
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

  const scheduledAtRaw = Object.prototype.hasOwnProperty.call(body, 'scheduledAt')
    ? body.scheduledAt
    : Object.prototype.hasOwnProperty.call(body, 'scheduled_at')
    ? body.scheduled_at
    : undefined;

  const matchLevelRaw = Object.prototype.hasOwnProperty.call(body, 'matchLevel')
    ? body.matchLevel
    : Object.prototype.hasOwnProperty.call(body, 'match_level')
    ? body.match_level
    : undefined;

  const matchCostRaw = Object.prototype.hasOwnProperty.call(body, 'matchCost')
    ? body.matchCost
    : Object.prototype.hasOwnProperty.call(body, 'match_cost')
    ? body.match_cost
    : undefined;

  const applyToAllMissingRaw = Object.prototype.hasOwnProperty.call(
    body,
    'applyToAllMissing',
  )
    ? body.applyToAllMissing
    : Object.prototype.hasOwnProperty.call(body, 'apply_to_all_missing')
    ? body.apply_to_all_missing
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
  const scheduledAt = parseNullableDate(scheduledAtRaw);
  const matchLevel =
    matchLevelRaw !== undefined ? normalizeText(matchLevelRaw) : undefined;
  const matchCost = parseNullableNumber(matchCostRaw);
  const applyToAllMissing =
    applyToAllMissingRaw === true ||
    applyToAllMissingRaw === 'true' ||
    applyToAllMissingRaw === 1 ||
    applyToAllMissingRaw === '1';

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

    if (scheduledAt !== undefined) {
      updatedFields++;
      payload.scheduled_at = scheduledAt;
    }

    if (matchLevel !== undefined) {
      updatedFields++;
      payload.match_level = matchLevel;
    }

    if (matchCost !== undefined) {
      updatedFields++;
      payload.match_cost = matchCost;
    }

    if (updatedFields === 0) {
      return res.status(400).json({ error: 'No metadata fields to update' });
    }

    const { data, error } = await supabase
      .from('matches')
      .upsert(payload, { onConflict: 'match_id' })
      .select('note, match_type_id, match_location_id, status, winner_team, finished_at, match_level, match_cost, scheduled_at')
      .single();

    if (error) {
      console.error('Supabase matches upsert error:', error);
      return res.status(500).json({ error: 'Failed to save match metadata' });
    }

    let appliedToMissingCount = 0;
    if (applyToAllMissing) {
      const applyPayload = {};
      ['note', 'match_type_id', 'match_location_id', 'scheduled_at', 'match_level', 'match_cost'].forEach(
        (key) => {
          if (Object.prototype.hasOwnProperty.call(payload, key)) {
            applyPayload[key] = payload[key];
          }
        },
      );
      if (Object.keys(applyPayload).length) {
        applyPayload.updated_at = now;
        const { data: appliedRows, error: applyErr } = await supabase
          .from('matches')
          .update(applyPayload)
          .is('note', null)
          .is('match_type_id', null)
          .is('match_location_id', null)
          .is('scheduled_at', null)
          .is('match_level', null)
          .is('match_cost', null)
          .neq('match_id', matchId)
          .select('match_id');
        if (applyErr) {
          console.error('Supabase matches bulk apply error:', applyErr);
        } else {
          appliedToMissingCount = (appliedRows || []).length;
        }
      }
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

    const missingMetaCount = await countMatchesMissingMeta();

    return res.json({
      ok: true,
      note: data.note,
      matchType: resolvedType,
      matchLocation: resolvedLocation,
      status: data.status || null,
      winnerTeam: data.winner_team ?? null,
      finishedAt: data.finished_at || null,
      matchLevel: data.match_level || null,
      matchCost: data.match_cost ?? null,
      scheduledAt: data.scheduled_at || null,
      matchTypeOptions: typeOptions,
      matchLocationOptions: locationOptions,
      appliedToMissingCount,
      missingMetaCount,
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

    const latestRows = latest || [];
    const needsFallback = new Set();

    let list = latestRows.map((e) => {
      const raw = e.raw || {};
      const matchId = String(e.match_id);
      if (isStatusOnlyEvent(raw)) {
        needsFallback.add(matchId);
      }
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

    if (needsFallback.size) {
      const fallbackSnapshots = await fetchLatestSnapshotsForMatches(
        Array.from(needsFallback),
      );
      list = list.map((item) => {
        if (!needsFallback.has(item.matchId)) return item;
        const replacement = fallbackSnapshots.get(item.matchId);
        if (!replacement) {
          return {
            ...item,
            lastSnapshot: {},
            score: '',
            setsString: '',
          };
        }
        const fallbackRaw = replacement.raw || {};
        const ts =
          replacement.watch_timestamp ||
          replacement.received_at ||
          item.lastTimestamp;
        const { score, setsString } = summaryFromRaw(fallbackRaw);
        return {
          ...item,
          lastSnapshot: fallbackRaw,
          lastTimestamp: ts,
          score,
          setsString,
        };
      });
    }

    const matchIds = list.map((m) => m.matchId);

    // For matches that only exist in metadata (no watch events) and still lack
    // a type/location, surface them on the first page so they can be edited.
    let extraMetaRows = [];
    if (offset === 0) {
      try {
        const { data: missingMetaRows, error: missingMetaErr } = await supabase
          .from('matches')
          .select(
            'match_id, note, match_type_id, match_location_id, status, winner_team, finished_at, scheduled_at, created_at',
          )
          .or('match_type_id.is.null,match_location_id.is.null')
          .order('created_at', { ascending: false })
          .limit(50);

        if (missingMetaErr) {
          console.error('Supabase matches select error (missing meta):', missingMetaErr);
        } else {
          const existingIds = new Set(matchIds);
          const candidates = (missingMetaRows || []).filter(
            (row) => !existingIds.has(String(row.match_id)),
          );
          const candidateIds = candidates.map((row) => String(row.match_id));
          const candidateSnapshots = await fetchLatestSnapshotsForMatches(candidateIds);
          extraMetaRows = candidates.filter(
            (row) => !candidateSnapshots.has(String(row.match_id)),
          );
        }
      } catch (e) {
        console.error('Supabase missing-meta fetch exception:', e);
      }
    }

    const extraIds = extraMetaRows.map((row) => String(row.match_id));
    const allMatchIds = Array.from(new Set([...matchIds, ...extraIds]));

    // names
    let players = [];
    if (allMatchIds.length) {
      const { data: playersData, error: pErr } = await supabase
        .from('match_players')
        .select('match_id, team, slot, player:players(id, name)')
        .in('match_id', allMatchIds);

      if (pErr) {
        console.error('Supabase match_players select error:', pErr);
      } else {
        players = playersData || [];
      }
    }

    const playersByMatch = new Map();
    for (const p of players || []) {
      const mid = p.match_id;
      if (!playersByMatch.has(mid)) playersByMatch.set(mid, []);
      playersByMatch.get(mid).push(p);
    }

    // notes
    let matchesMeta = [];
    if (allMatchIds.length) {
      const { data: matchesMetaData, error: mErr } = await supabase
        .from('matches')
        .select(
          'match_id, note, match_type_id, match_location_id, status, winner_team, finished_at, scheduled_at',
        )
        .in('match_id', allMatchIds);

      if (mErr) {
        console.error('Supabase matches select error:', mErr);
      } else {
        matchesMeta = matchesMetaData || [];
      }
    }

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
        finishedAt: m.finished_at || null,
        scheduledAt: m.scheduled_at || null,
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
        scheduledAt: meta.scheduledAt || null,
      };
    });

    const extras = extraMetaRows.map((row) => {
      const matchId = String(row.match_id);
      const ps = playersByMatch.get(matchId) || [];
      const t1 = ps
        .filter((p) => p.team === 1)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.player?.name);
      const t2 = ps
        .filter((p) => p.team === 2)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.player?.name);

      const meta = metaByMatch.get(matchId) || {};
      const typeRow = meta.matchTypeId ? typeById.get(meta.matchTypeId) : null;
      const locationRow = meta.matchLocationId
        ? locationById.get(meta.matchLocationId)
        : null;

      return {
        matchId,
        team1Name: t1.length ? t1.join(' / ') : 'Team 1',
        team2Name: t2.length ? t2.join(' / ') : 'Team 2',
        note: meta.note || null,
        matchType: typeRow?.name || null,
        matchTypeIconUrl: typeRow?.iconUrl || null,
        matchLocation: locationRow?.name || null,
        matchLocationLogoUrl: locationRow?.logoUrl || null,
        status: meta.status || null,
        winnerTeam: meta.winnerTeam ?? null,
        scheduledAt: meta.scheduledAt || null,
        lastTimestamp: meta.finishedAt || meta.scheduledAt || row.created_at || null,
        lastSnapshot: {},
        score: '',
        setsString: '',
      };
    });

    // If we got fewer than limit, there are no more pages.
    const hasMore = (latest || []).length === limit;

    return res.json({ items: list, extras, limit, offset, hasMore });
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

// Player profile page data
app.get('/api/player/:id/profile', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const playerId = Number(req.params.id);
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return res.status(400).json({ error: 'Invalid player id' });
  }

  const payload = {
    player: null,
    summary: {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      winPct: null,
      totalSets: 0,
      totalWinners: 0,
      totalErrors: 0,
      totalMvp: 0,
      avgWinners: 0,
      avgErrors: 0,
      totalDurationSec: 0,
      mvpRate: 0,
    },
    breakdowns: {
      byType: [],
      byLocation: [],
      byPartner: [],
      byOpponent: [],
      byDayOfWeek: [],
    },
    impactTimeline: [],
    impactLines: [],
    recentMatches: [],
    detailTotals: {
      winners: createWinnerDetailBuckets(),
      errors: createErrorDetailBuckets(),
      totalEvents: 0,
    },
  };

  try {
    const { data: playerRow, error: playerErr } = await supabase
      .from('players')
      .select('id, name, slug, created_at')
      .eq('id', playerId)
      .maybeSingle();
    if (playerErr) {
      console.error('Supabase players select error:', playerErr);
      return res.status(500).json({ error: 'Failed to load player' });
    }
    if (!playerRow) {
      return res.status(404).json({ error: 'Player not found' });
    }

    payload.player = {
      id: playerRow.id,
      name: playerRow.name,
      slug: playerRow.slug,
      joinedAt: playerRow.created_at,
    };

    const { data: memberships, error: membershipErr } = await supabase
      .from('match_players')
      .select('match_id, team, slot')
      .eq('player_id', playerId);
    if (membershipErr) {
      console.error('Supabase match_players select error:', membershipErr);
      return res.status(500).json({ error: 'Failed to load player matches' });
    }

    if (!memberships || !memberships.length) {
      return res.json(payload);
    }

    const membershipByMatch = new Map();
    for (const entry of memberships) {
      membershipByMatch.set(String(entry.match_id), entry);
    }
    const matchIds = Array.from(membershipByMatch.keys());

    const [
      { data: matchesMeta, error: matchesErr },
      { data: matchPlayersRows, error: matchPlayersErr },
      { data: rollupRows, error: rollupErr },
    ] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'match_id, status, winner_team, match_type_id, match_location_id, finished_at, scheduled_at, created_at, match_level, match_cost',
        )
        .in('match_id', matchIds),
      supabase
        .from('match_players')
        .select('match_id, team, slot, player:players(id, name)')
        .in('match_id', matchIds),
      supabase.rpc('player_profile_rollup', { p_player_id: playerId }),
    ]);

    if (matchesErr) {
      console.error('Supabase matches select error (player profile):', matchesErr);
      return res.status(500).json({ error: 'Failed to load matches metadata' });
    }
    if (matchPlayersErr) {
      console.error('Supabase match_players select error (player profile roster):', matchPlayersErr);
      return res.status(500).json({ error: 'Failed to load match rosters' });
    }
    if (rollupErr) {
      console.error('Supabase player_profile_rollup rpc error:', rollupErr);
    }

    const matchesById = new Map();
    const typeIds = new Set();
    const locationIds = new Set();
    for (const row of matchesMeta || []) {
      const matchKey = String(row.match_id);
      matchesById.set(matchKey, row);
      if (row.match_type_id) typeIds.add(row.match_type_id);
      if (row.match_location_id) locationIds.add(row.match_location_id);
    }
    // Populate matches map from rollup rows if not already present (covers RPC-only paths)
    for (const row of rollupRows || []) {
      const matchKey = String(row.match_id);
      if (!matchesById.has(matchKey)) {
        matchesById.set(matchKey, {
          match_id: row.match_id,
          status: row.status,
          winner_team: row.winner_team,
          match_type_id: row.match_type_id,
          match_location_id: row.match_location_id,
          finished_at: row.finished_at,
          scheduled_at: row.scheduled_at,
          created_at: row.created_at,
          match_level: row.match_level,
          match_cost: row.match_cost,
        });
      }
      if (row.match_type_id) typeIds.add(row.match_type_id);
      if (row.match_location_id) locationIds.add(row.match_location_id);
    }

    const typeById =
      typeIds.size && supabase ? await getCachedMatchTypes(Array.from(typeIds)) : new Map();
    const locationById =
      locationIds.size && supabase
        ? await getCachedMatchLocations(Array.from(locationIds))
        : new Map();

    const playersByMatch = new Map();
    for (const row of matchPlayersRows || []) {
      const matchKey = String(row.match_id);
      if (!playersByMatch.has(matchKey)) {
        playersByMatch.set(matchKey, []);
      }
      playersByMatch.get(matchKey).push({
        team: row.team,
        slot: row.slot,
        id: row.player?.id || null,
        name: row.player?.name || `Team ${row.team} Player ${row.slot}`,
      });
    }
    for (const roster of playersByMatch.values()) {
      roster.sort((a, b) => {
        if (a.team !== b.team) return a.team - b.team;
        return a.slot - b.slot;
      });
    }

    const snapshotsMap = await fetchLatestSnapshotsForMatches(matchIds);
    const durationsByMatch = await fetchMatchDurations(matchIds);

    const rollupByKey = new Map();
    for (const row of rollupRows || []) {
      const key = `${row.match_id}|${row.team}|${row.slot}`;
      rollupByKey.set(key, row);
    }

    const summary = { ...payload.summary };
    const typeBuckets = new Map();
    const locationBuckets = new Map();
    const partnerBuckets = new Map();
    const opponentBuckets = new Map();
    const dayBuckets = new Map();
    const levelBuckets = new Map();
    const timeBuckets = new Map();
    const financeByLocation = new Map();
    const financeByMonth = new Map();
    const calendarCounts = new Map();
    let totalSpent = 0;
    const recentMatches = [];
    const impactTimeline = [];
    const impactLines = [];
    const matchTimestampMap = new Map();
    const detailTotals = {
      winners: createWinnerDetailBuckets(),
      errors: createErrorDetailBuckets(),
      totalEvents: 0,
    };

    const updateBucket = (
      map,
      key,
      label,
      isWin,
      isLoss,
      winners = 0,
      errors = 0,
      sets = 1,
      isMvp = false,
    ) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          matches: 0,
          wins: 0,
          losses: 0,
          winners: 0,
          errors: 0,
          sets: 0,
          mvp: 0,
        });
      }
      const bucket = map.get(key);
      bucket.matches += 1;
      if (isWin) bucket.wins += 1;
      if (isLoss) bucket.losses += 1;
      bucket.winners += winners;
      bucket.errors += errors;
      bucket.sets += sets;
      if (isMvp) bucket.mvp += 1;
    };

    const finalizeBuckets = (map) => {
      const rows = Array.from(map.values()).map((bucket) => ({
        label: bucket.label,
        matches: bucket.matches,
        wins: bucket.wins,
        losses: bucket.losses,
        winPct: bucket.matches ? bucket.wins / bucket.matches : null,
        avgWinners: bucket.sets ? bucket.winners / bucket.sets : bucket.matches ? bucket.winners / bucket.matches : 0,
        avgErrors: bucket.sets ? bucket.errors / bucket.sets : bucket.matches ? bucket.errors / bucket.matches : 0,
        mvpRate: bucket.matches ? bucket.mvp / bucket.matches : 0,
        relatedPlayerId:
          typeof bucket.key === 'string' && bucket.key.startsWith('player:')
            ? Number(bucket.key.split(':')[1]) || null
            : null,
      }));

      const bestWinPct = rows.length
        ? Math.max(...rows.map((r) => (Number.isFinite(r.winPct) ? r.winPct : -1)))
        : -1;

      return rows
        .map((row) => ({
          ...row,
          isBest: Number.isFinite(row.winPct) && row.winPct === bestWinPct && bestWinPct >= 0,
        }))
        .sort((a, b) => {
          if (b.matches !== a.matches) return b.matches - a.matches;
          const aPct = a.winPct ?? -1;
          const bPct = b.winPct ?? -1;
          if (bPct !== aPct) return bPct - aPct;
          return a.label.localeCompare(b.label);
        });
    };

    const timeBucketForTimestamp = (ts) => {
      if (!ts) return 'Unknown';
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return 'Unknown';
      const h = d.getHours();
      if (h < 6) return 'Late night';
      if (h < 12) return 'Morning';
      if (h < 18) return 'Afternoon';
      return 'Evening';
    };

    for (const [matchId, membership] of membershipByMatch.entries()) {
      const meta =
        matchesById.get(matchId) ||
        rollupByKey.get(`${matchId}|${membership.team}|${membership.slot}`) ||
        {};
      const snapshot = snapshotsMap.get(matchId);
      const raw = snapshot?.raw || {};
      const statIndex = teamSlotToIndex(membership.team, membership.slot);
      const rollupKey = `${matchId}|${membership.team}|${membership.slot}`;
      const rollup = rollupByKey.get(rollupKey) || {};
      const playersSnapshot = Array.isArray(raw.players) ? raw.players : [];
      const playerStats = playersSnapshot[statIndex] || {};
      const winners = Number(
        rollup.winners != null ? rollup.winners : playerStats.winners || 0,
      );
      const errors = Number(
        rollup.errors != null ? rollup.errors : playerStats.errors || 0,
      );
      const mvpIndices = computeMvpIndicesFromSnap(raw);
      const isMvp =
        rollup.is_mvp != null
          ? Boolean(rollup.is_mvp)
          : Array.isArray(mvpIndices) && mvpIndices.includes(statIndex);
      const rollupSets = Number(rollup.sets_played);
      const setsPlayed =
        Number.isFinite(rollupSets) && rollupSets > 0
          ? rollupSets
          : countSetsPlayed(raw.sets);
      const winnerTeam = Number(meta.winner_team);
      const isWin = Number.isInteger(winnerTeam) && winnerTeam === membership.team;
      const isLoss =
        Number.isInteger(winnerTeam) &&
        winnerTeam !== membership.team &&
        (winnerTeam === 1 || winnerTeam === 2);

      summary.totalMatches += 1;
      summary.totalSets += setsPlayed;
      if (isWin) summary.wins += 1;
      if (isLoss) summary.losses += 1;
      summary.totalWinners += winners;
      summary.totalErrors += errors;
      if (isMvp) summary.totalMvp += 1;
      const isFinishedMatch =
        (meta.status && String(meta.status).toLowerCase() === 'finished') ||
        Boolean(meta.finished_at);
      const durationSec = durationsByMatch.get(matchId);
      if (isFinishedMatch && Number.isFinite(durationSec)) {
        summary.totalDurationSec = (summary.totalDurationSec || 0) + durationSec;
      }

      const typeRow = meta.match_type_id
        ? typeById.get(meta.match_type_id)
        : null;
      const locationRow = meta.match_location_id
        ? locationById.get(meta.match_location_id)
        : null;

      updateBucket(
        typeBuckets,
        typeRow?.id ? `type:${typeRow.id}` : 'type:unknown',
        typeRow?.name || 'Unknown type',
        isWin,
        isLoss,
        winners,
        errors,
        setsPlayed,
        isMvp,
      );
      updateBucket(
        locationBuckets,
        locationRow?.id ? `location:${locationRow.id}` : 'location:unknown',
        locationRow?.name || 'Unknown location',
        isWin,
        isLoss,
        winners,
        errors,
        setsPlayed,
        isMvp,
      );

      const roster = playersByMatch.get(matchId) || [];
      const partner = roster.find(
        (p) => p.team === membership.team && p.slot !== membership.slot,
      );
      if (partner) {
        const partnerKey = partner.id
          ? `player:${partner.id}`
          : `partner:${partner.name.toLowerCase()}`;
        updateBucket(
          partnerBuckets,
          partnerKey,
          partner.name,
          isWin,
          isLoss,
          winners,
          errors,
          setsPlayed,
          isMvp,
        );
      }

      const opponents = roster.filter((p) => p.team !== membership.team);
      for (const opponent of opponents) {
        const opponentKey = opponent.id
          ? `player:${opponent.id}`
          : `opponent:${opponent.name.toLowerCase()}`;
        updateBucket(
          opponentBuckets,
          opponentKey,
          opponent.name,
          isWin,
          isLoss,
          winners,
          errors,
          setsPlayed,
          isMvp,
        );
      }

      const matchTimestamp =
        meta.finished_at ||
        meta.scheduled_at ||
        snapshot?.watch_timestamp ||
        snapshot?.received_at ||
        null;
      matchTimestampMap.set(matchId, matchTimestamp);
      const dayLabel = getDayLabel(matchTimestamp);
      updateBucket(
        dayBuckets,
        `dow:${dayLabel}`,
        dayLabel,
        isWin,
        isLoss,
        winners,
        errors,
        setsPlayed,
        isMvp,
      );
      const timeLabel = timeBucketForTimestamp(matchTimestamp);
      updateBucket(
        timeBuckets,
        `time:${timeLabel}`,
        timeLabel,
        isWin,
        isLoss,
        winners,
        errors,
        setsPlayed,
        isMvp,
      );

      if (meta.match_level) {
        const levelLabel = String(meta.match_level).toUpperCase();
        updateBucket(
          levelBuckets,
          `level:${levelLabel}`,
          levelLabel,
          isWin,
          isLoss,
          winners,
          errors,
          setsPlayed,
          isMvp,
        );
      }

      const matchCost = meta.match_cost != null ? Number(meta.match_cost) : null;
      if (Number.isFinite(matchCost)) {
        totalSpent += matchCost;
        const locKey = locationRow?.name || 'Unknown location';
        financeByLocation.set(locKey, (financeByLocation.get(locKey) || 0) + matchCost);

        const refDate = matchTimestamp ? new Date(matchTimestamp) : null;
        const monthKey =
          refDate && !Number.isNaN(refDate.getTime())
            ? `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}`
            : 'Unknown';
        const monthLabel =
          refDate && !Number.isNaN(refDate.getTime())
            ? refDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
            : 'Unknown';
        if (!financeByMonth.has(monthKey)) {
          financeByMonth.set(monthKey, { label: monthLabel, cost: 0, key: monthKey });
        }
        financeByMonth.get(monthKey).cost += matchCost;
      }

      if (matchTimestamp) {
        const d = new Date(matchTimestamp);
        if (!Number.isNaN(d.getTime())) {
          const dateKey = d.toISOString().slice(0, 10);
          calendarCounts.set(dateKey, (calendarCounts.get(dateKey) || 0) + 1);
        }
      }

      const team1Players = roster
        .filter((p) => p.team === 1)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.name);
      const team2Players = roster
        .filter((p) => p.team === 2)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.name);

      const { score } = summaryFromRaw(raw);
      const impact = winners - errors;
      impactTimeline.push({
        matchId,
        finishedAt: matchTimestamp,
        impact,
        winners,
        errors,
        result: isWin ? 'W' : isLoss ? 'L' : null,
        matchType: typeRow?.name || null,
        matchLocation: locationRow?.name || null,
        partner: partner ? { id: partner.id, name: partner.name } : null,
        opponents: opponents.map((op) => ({ id: op.id, name: op.name })),
      });
      recentMatches.push({
        matchId,
        partner: partner ? { id: partner.id, name: partner.name } : null,
        opponents: opponents.map((op) => ({ id: op.id, name: op.name })),
        result: isWin ? 'W' : isLoss ? 'L' : '—',
        finishedAt: matchTimestamp,
        matchType: typeRow?.name || null,
        matchLocation: locationRow?.name || null,
        score: score || null,
        team1Name: team1Players.length ? team1Players.join(' / ') : 'Team 1',
        team2Name: team2Players.length ? team2Players.join(' / ') : 'Team 2',
        team1Players,
        team2Players,
        lastSnapshot: raw,
        status: meta.status || null,
        winnerTeam: Number.isInteger(winnerTeam) ? winnerTeam : null,
      });
    }

    if (summary.totalMatches) {
      summary.winPct = summary.wins / summary.totalMatches;
      const setDenominator = summary.totalSets || summary.totalMatches || 1;
      summary.avgWinners = summary.totalWinners / setDenominator;
      summary.avgErrors = summary.totalErrors / setDenominator;
      summary.mvpRate = summary.totalMvp / summary.totalMatches;
    } else {
      summary.winPct = null;
      summary.avgWinners = 0;
      summary.avgErrors = 0;
      summary.totalDurationSec = summary.totalDurationSec || 0;
      summary.mvpRate = 0;
    }
    summary.totalSpent = totalSpent;

    recentMatches.sort((a, b) => {
      const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
      const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
      return bTime - aTime;
    });

    impactTimeline.sort((a, b) => {
      const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
      const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.matchId || '').localeCompare(String(b.matchId || ''));
    });

    payload.summary = summary;
    payload.breakdowns = {
      byType: finalizeBuckets(typeBuckets),
      byLocation: finalizeBuckets(locationBuckets),
      byPartner: finalizeBuckets(partnerBuckets),
      byOpponent: finalizeBuckets(opponentBuckets),
      byDayOfWeek: finalizeBuckets(dayBuckets),
      byLevel: finalizeBuckets(levelBuckets),
      byTimeOfDay: finalizeBuckets(timeBuckets),
    };
    payload.finance = {
      totalSpent,
      byLocation: Array.from(financeByLocation.entries())
        .map(([label, cost]) => ({ label, cost }))
        .sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label)),
      byMonth: Array.from(financeByMonth.entries())
        .map(([, row]) => row)
        .sort((a, b) => {
          if (a.key === 'Unknown') return 1;
          if (b.key === 'Unknown') return -1;
          return b.key.localeCompare(a.key);
        }),
    };
    payload.calendarDates = Array.from(calendarCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const impactMatchIds = Array.from(matchTimestampMap.entries())
      .sort((a, b) => {
        const aTime = a[1] ? new Date(a[1]).getTime() : 0;
        const bTime = b[1] ? new Date(b[1]).getTime() : 0;
        return bTime - aTime;
      })
      .map(([id]) => id);

    const impactHistory = await fetchSnapshotsHistoryForMatches(impactMatchIds);

    for (const matchId of impactMatchIds) {
      const membership = membershipByMatch.get(matchId);
      if (!membership) continue;
      const roster = playersByMatch.get(matchId) || [];
      const partner = roster.find(
        (p) => p.team === membership?.team && p.slot !== membership?.slot,
      );
      const opponents = roster.filter((p) => p.team !== membership?.team);
      const meta = matchesById.get(matchId) || {};
      const winnerTeam = Number(meta.winner_team);
      const isWin = Number.isInteger(winnerTeam) && winnerTeam === membership?.team;
      const isLoss =
        Number.isInteger(winnerTeam) &&
        winnerTeam !== membership?.team &&
        (winnerTeam === 1 || winnerTeam === 2);
      const statIndex = teamSlotToIndex(membership?.team, membership?.slot);
      const snapshots = impactHistory.get(matchId) || [];
      accumulateDetailTotalsForPlayer(snapshots, statIndex, detailTotals);
      const setBuckets = new Map();
      const rawSetRecords = [];
      for (const raw of snapshots) {
        const players = Array.isArray(raw.players) ? raw.players : [];
        if (!players.length || statIndex == null || statIndex >= players.length) continue;
        const pl = players[statIndex] || { winners: 0, errors: 0 };
        const val = Number(pl.winners || 0) - Number(pl.errors || 0);
        const winnersVal = Number(pl.winners || 0);
        const errorsVal = Number(pl.errors || 0);
        const setsString = typeof raw.sets === 'string' ? raw.sets : '';
        const setsObj = raw.sets && typeof raw.sets === 'object' ? raw.sets : null;
        const gamesObj = raw.games && typeof raw.games === 'object' ? raw.games : null;
        const setArr = parseSetsArrayServer(setsString, setsObj, gamesObj);
        const setIndex = setArr.length ? setArr.length : 1;
        const setScore = setArr[setIndex - 1] || {};
        const team1Games = Number(setScore.team1) || 0;
        const team2Games = Number(setScore.team2) || 0;
        const hasGames = team1Games > 0 || team2Games > 0;
        rawSetRecords.push({
          setIndex,
          score: {
            team1: team1Games,
            team2: team2Games,
          },
          hasGames,
        });
        if (!setBuckets.has(setIndex)) {
          setBuckets.set(setIndex, { points: [], hasScore: false });
        }
        const bucket = setBuckets.get(setIndex);
        bucket.points.push({
          x: bucket.points.length + 1,
          y: val,
          winners: winnersVal,
          errors: errorsVal,
        });
        if (hasGames) bucket.hasScore = true;
      }
      if (!setBuckets.size) continue;
      const finishedAt = matchTimestampMap.get(matchId) || null;
      const baseLabel = finishedAt
        ? (() => {
            const d = new Date(finishedAt);
            return Number.isNaN(d.getTime()) ? `Match ${matchId}` : d.toLocaleDateString('en-GB');
          })()
        : `Match ${matchId}`;
      const sortedSets = Array.from(setBuckets.entries()).sort((a, b) => a[0] - b[0]);
      for (const [setIndex, bucket] of sortedSets) {
        if (!bucket.points.length) continue;
        const hasScore = bucket.hasScore;
        if (!hasScore) continue; // skip empty sets like 0-0
        impactLines.push({
          lineId: `${matchId}-set-${setIndex}`,
          matchId,
          setNumber: setIndex,
          finishedAt,
          result: isWin ? 'W' : isLoss ? 'L' : '',
          matchType: meta.match_type_id ? typeById.get(meta.match_type_id)?.name || null : null,
          matchLocation: meta.match_location_id
            ? locationById.get(meta.match_location_id)?.name || null
            : null,
          partner: partner ? { id: partner.id, name: partner.name } : null,
          opponents: opponents.map((op) => ({ id: op.id, name: op.name })),
          label: `${baseLabel} - Set ${setIndex}`,
          points: bucket.points,
        });
      }
    }

    payload.impactTimeline = impactTimeline;
    const IMPACT_SET_LIMIT = 20;
    payload.impactLines = impactLines.slice(0, IMPACT_SET_LIMIT);
    payload.recentMatches = recentMatches.slice(0, 10);
    payload.detailTotals = detailTotals;

    return res.json(payload);
  } catch (e) {
    console.error('/api/player/:id/profile exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Player rankings/comparison
app.get('/api/players/rankings', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const minMatches = Math.max(parseInt(req.query.minMatches, 10) || 1, 1);

  try {
    const { data: memberships, error: membershipsErr } = await supabase
      .from('match_players')
      .select('match_id, player_id, team, slot');

    if (membershipsErr) {
      console.error('Supabase match_players select error (rankings):', membershipsErr);
      return res.status(500).json({ error: 'Failed to load memberships' });
    }

    if (!memberships || !memberships.length) {
      return res.json({ items: [] });
    }

    const playerIds = Array.from(new Set((memberships || []).map((m) => m.player_id)));
    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, name')
      .in('id', playerIds);

    if (playersErr) {
      console.error('Supabase players select error (rankings):', playersErr);
      return res.status(500).json({ error: 'Failed to load players' });
    }

    const playerMap = new Map((players || []).map((p) => [String(p.id), p]));
    if (!playerMap.size) {
      return res.json({ items: [] });
    }

    const matchIds = Array.from(new Set((memberships || []).map((m) => String(m.match_id))));
    const membershipByMatch = new Map();
    for (const row of memberships || []) {
      const key = String(row.match_id);
      if (!membershipByMatch.has(key)) {
        membershipByMatch.set(key, []);
      }
      membershipByMatch.get(key).push(row);
    }

    const [{ data: matchesMeta, error: matchesErr }, snapshotsMap] = await Promise.all([
      supabase
        .from('matches')
        .select('match_id, winner_team, status, finished_at')
        .in('match_id', matchIds),
      fetchLatestSnapshotsForMatches(matchIds),
    ]);

    if (matchesErr) {
      console.error('Supabase matches select error (rankings):', matchesErr);
      return res.status(500).json({ error: 'Failed to load matches' });
    }

    const matchesById = new Map();
    for (const row of matchesMeta || []) {
      matchesById.set(String(row.match_id), row);
    }

    const aggregates = new Map();

    for (const [matchId, roster] of membershipByMatch.entries()) {
      const meta = matchesById.get(matchId) || {};
      const snapshot = snapshotsMap.get(matchId);
      const raw = snapshot?.raw || {};
      const playersSnapshot = Array.isArray(raw.players) ? raw.players : [];
      const setsPlayed = countSetsPlayed(raw.sets);
      const winnerTeam = Number(meta.winner_team);
      const isFinishedMatch =
        (meta.status && String(meta.status).toLowerCase() === 'finished') ||
        Boolean(meta.finished_at);
      const mvpIndices = computeMvpIndicesFromSnap(raw);

      for (const entry of roster) {
        const playerId = String(entry.player_id);
        const base = playerMap.get(playerId);
        if (!base) continue;
        const statIndex = teamSlotToIndex(entry.team, entry.slot);
        const playerStats = playersSnapshot[statIndex] || {};
        const winners = Number(playerStats.winners || 0);
        const errors = Number(playerStats.errors || 0);
        const isMvp = Array.isArray(mvpIndices) && mvpIndices.includes(statIndex);
        const isWin = Number.isInteger(winnerTeam) && winnerTeam === entry.team;
        const isLoss =
          Number.isInteger(winnerTeam) &&
          winnerTeam !== entry.team &&
          (winnerTeam === 1 || winnerTeam === 2);

        if (!aggregates.has(playerId)) {
          aggregates.set(playerId, {
            id: base.id,
            name: base.name || `Player #${base.id}`,
            matches: 0,
            wins: 0,
            losses: 0,
            totalWinners: 0,
            totalErrors: 0,
            totalSets: 0,
            finishedMatches: 0,
            mvpCount: 0,
          });
        }

        const agg = aggregates.get(playerId);
        agg.matches += 1;
        if (isWin) agg.wins += 1;
        if (isLoss) agg.losses += 1;
        agg.totalWinners += winners;
        agg.totalErrors += errors;
        agg.totalSets += setsPlayed;
        if (isFinishedMatch) agg.finishedMatches += 1;
        if (isMvp) agg.mvpCount += 1;
      }
    }

    const items = Array.from(aggregates.values())
      .filter((row) => row.matches >= minMatches)
      .map((row) => {
        const winPct = row.matches ? row.wins / row.matches : null;
        const denom = row.totalSets || row.matches || 1;
        const mvpRate = row.matches ? row.mvpCount / row.matches : 0;
        const avgWinners = denom > 0 ? row.totalWinners / denom : 0;
        const avgErrors = denom > 0 ? row.totalErrors / denom : 0;
        const avgImpact = avgWinners - avgErrors;
        return {
          id: row.id,
          name: row.name,
          matches: row.matches,
          finishedMatches: row.finishedMatches,
          wins: row.wins,
          losses: row.losses,
          winPct,
          avgWinners,
          avgErrors,
          totalWinners: row.totalWinners,
          totalErrors: row.totalErrors,
          totalSets: row.totalSets,
          mvpCount: row.mvpCount,
          mvpRate,
          avgImpact,
        };
      })
      .sort((a, b) => {
        const aPct = a.winPct ?? -1;
        const bPct = b.winPct ?? -1;
        if (bPct !== aPct) return bPct - aPct;
        if (b.mvpRate !== a.mvpRate) return b.mvpRate - a.mvpRate;
        if (b.matches !== a.matches) return b.matches - a.matches;
        const aWinners = a.avgWinners ?? -1;
        const bWinners = b.avgWinners ?? -1;
        if (bWinners !== aWinners) return bWinners - aWinners;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    const bestMvpRate =
      items.length && items.some((it) => Number.isFinite(it.mvpRate))
        ? Math.max(...items.map((it) => it.mvpRate || 0))
        : 0;

    const flagged = items.map((item) => ({
      ...item,
      isMvpLeader: bestMvpRate > 0 && item.mvpRate === bestMvpRate,
    }));

    return res.json({ items: flagged, limit, minMatches, bestMvpRate });
  } catch (e) {
    console.error('/api/players/rankings exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Match neighbors for navigation
app.get('/api/match/:id/neighbors', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const matchId = String(req.params.id);

  try {
    const { data: current, error: currentErr } = await supabase
      .from('matches')
      .select('match_id, created_at')
      .eq('match_id', matchId)
      .maybeSingle();
    if (currentErr) {
      console.error('Supabase match select error (neighbors):', currentErr);
      return res.status(500).json({ error: 'Failed to load match' });
    }
    if (!current) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const anchor = current.created_at;
    if (!anchor) {
      return res.json({ previous: null, next: null });
    }

    const [prevRes, nextRes] = await Promise.all([
      supabase
        .from('matches')
        .select('match_id, created_at')
        .lt('created_at', anchor)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('matches')
        .select('match_id, created_at')
        .gt('created_at', anchor)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const toPayload = (row) =>
      row
        ? {
            matchId: row.match_id,
            createdAt: row.created_at,
          }
        : null;

    return res.json({
      previous: toPayload(prevRes.data || null),
      next: toPayload(nextRes.data || null),
    });
  } catch (e) {
    console.error('/api/match/:id/neighbors exception:', e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Index page: list matches
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Match viewer page: /match/6813
app.get('/match/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'match.html'));
});

// Match animation page
app.get('/match/:id/animation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'match-animation.html'));
});

// Player profile page
app.get('/player/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Player rankings page
app.get('/players', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'players.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});

