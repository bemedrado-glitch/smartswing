// api/tennis-feed.js
// Vercel serverless function — fetches live tennis events from ESPN API
// Primary: ESPN public API (no auth, reliable, CORS-friendly)
// Cache: 1 hour at edge, 24 hour stale-while-revalidate
// Never 500s for the blog — always returns 200 with fallback shape

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CACHE_HEADERS = {
  'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
};

// ESPN public API endpoints — no auth required
const ESPN_ATP = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard';
const ESPN_WTA = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard';

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Convert ESPN competitor to player name: "Carlos Alcaraz" → "C. Alcaraz"
function shortName(displayName) {
  if (!displayName) return null;
  const parts = displayName.split(' ');
  if (parts.length >= 2) return parts[0][0] + '. ' + parts.slice(1).join(' ');
  return displayName;
}

// Format set scores from linescores: [{value:6},{value:3}] → "6-3"
function formatSetScores(home, away) {
  if (!home?.linescores?.length || !away?.linescores?.length) return null;
  return home.linescores.map((s, i) => {
    const a = away.linescores[i];
    return s.value != null && a?.value != null ? `${Math.round(s.value)}-${Math.round(a.value)}` : null;
  }).filter(Boolean).join(', ');
}

function normaliseESPNEvent(ev) {
  const home = ev.competitors?.[0] || {};
  const away = ev.competitors?.[1] || {};
  const status = ev.status?.type || {};
  // tournamentName and season are injected during flattening
  const tourName = ev.tournamentName || '';

  // Count sets won for score display
  const homeSetsWon = (home.linescores || []).filter(s => s.winner).length;
  const awaySetsWon = (away.linescores || []).filter(s => s.winner).length;

  return {
    id: ev.id || null,
    name: ev.notes?.[0]?.text || `${home.displayName || '?'} vs ${away.displayName || '?'}`,
    tournament: tourName || null,
    date: ev.date ? ev.date.slice(0, 10) : null,
    time: ev.date ? ev.date.slice(11, 16) : null,
    homeTeam: shortName(home.displayName),
    awayTeam: shortName(away.displayName),
    homeScore: status.completed ? String(homeSetsWon) : null,
    awayScore: status.completed ? String(awaySetsWon) : null,
    setScores: formatSetScores(home, away),
    venue: ev.venue?.fullName || tourName || null,
    city: null,
    country: null,
    thumbnail: null,
    status: status.completed ? 'Match Finished' : (status.state === 'in' ? 'In Progress' : 'Not Started'),
    round: ev.round?.displayName || null,
    season: ev.season?.year ? String(ev.season.year) : null,
    sport: 'Tennis',
  };
}

function setHeaders(res, headers) {
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

// ──────────────────────────────────────────────────────────────
// IMPORTANT: Fallbacks must ONLY contain verified real results.
// Never invent scores or results for tournaments that haven't happened.
// When no real data is available, show an empty state instead of fake data.
// Last verified: 2026-04-12
// ──────────────────────────────────────────────────────────────

const FALLBACK_UPCOMING = [
  {
    id: 'fallback-u1', name: 'ATP 500 — Barcelona Open',
    tournament: 'Barcelona Open Banc Sabadell', date: '2026-04-13',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Real Club de Tenis Barcelona', city: 'Barcelona', country: 'Spain',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-u2', name: 'WTA 500 — Porsche Tennis Grand Prix',
    tournament: 'Porsche Tennis Grand Prix', date: '2026-04-13',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Porsche Arena', city: 'Stuttgart', country: 'Germany',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-u3', name: 'ATP/WTA 1000 — Mutua Madrid Open',
    tournament: 'Mutua Madrid Open', date: '2026-04-27',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Caja Magica', city: 'Madrid', country: 'Spain',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
  }
];

// Only verified real results — source: atptour.com/en/news/monte-carlo-2026-results
const FALLBACK_RECENT = [
  {
    id: 'fallback-r1', name: 'Monte-Carlo Masters — Final',
    tournament: 'Monte-Carlo Rolex Masters', date: '2026-04-12',
    homeTeam: 'J. Sinner', awayTeam: 'C. Alcaraz', homeScore: '2', awayScore: '0',
    venue: 'Monte-Carlo Country Club', city: 'Monaco', country: 'France',
    thumbnail: null, status: 'Match Finished', round: 'Final', season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-r2', name: 'Monte-Carlo Masters — Semifinal',
    tournament: 'Monte-Carlo Rolex Masters', date: '2026-04-11',
    homeTeam: 'J. Sinner', awayTeam: 'A. Zverev', homeScore: '2', awayScore: '0',
    venue: 'Monte-Carlo Country Club', city: 'Monaco', country: 'France',
    thumbnail: null, status: 'Match Finished', round: 'SF', season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-r3', name: 'Monte-Carlo Masters — Semifinal',
    tournament: 'Monte-Carlo Rolex Masters', date: '2026-04-11',
    homeTeam: 'C. Alcaraz', awayTeam: 'V. Vacherot', homeScore: '2', awayScore: '0',
    venue: 'Monte-Carlo Country Club', city: 'Monaco', country: 'France',
    thumbnail: null, status: 'Match Finished', round: 'SF', season: '2026', sport: 'Tennis'
  }
];

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    setHeaders(res, { ...CORS_HEADERS, 'Content-Length': '0' });
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    setHeaders(res, CORS_HEADERS);
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  setHeaders(res, { ...CORS_HEADERS, ...CACHE_HEADERS, 'Content-Type': 'application/json' });

  const fetchedAt = new Date().toISOString();

  try {
    // Fetch ATP + WTA scoreboard in parallel from ESPN
    const [atpData, wtaData] = await Promise.all([
      fetchWithTimeout(ESPN_ATP).catch(() => null),
      fetchWithTimeout(ESPN_WTA).catch(() => null),
    ]);

    const atpEvents = atpData?.events || [];
    const wtaEvents = wtaData?.events || [];
    const allEvents = [...atpEvents, ...wtaEvents];

    if (allEvents.length === 0) {
      return res.status(200).json({
        upcoming: FALLBACK_UPCOMING,
        recent: FALLBACK_RECENT,
        live: false,
        source: 'fallback',
        error: 'no events from ESPN — showing cached results',
        fetchedAt,
      });
    }

    // Flatten: ESPN nests competitions under events[].groupings[].competitions[]
    // Some responses also have events[].competitions[] directly
    const competitions = [];
    for (const event of allEvents) {
      const tourName = event.name || '';
      const season = event.season || {};
      const league = event.leagues?.[0] || {};

      // Try groupings first (main structure)
      for (const group of (event.groupings || [])) {
        for (const comp of (group.competitions || [])) {
          competitions.push({ ...comp, season, league, tournamentName: tourName });
        }
      }
      // Also check direct competitions array (some responses use this)
      for (const comp of (event.competitions || [])) {
        competitions.push({ ...comp, season, league, tournamentName: tourName });
      }
    }

    const normalised = competitions.map(normaliseESPNEvent);

    const finished = normalised
      .filter(ev => ev.status === 'Match Finished')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 25);

    const live = normalised
      .filter(ev => ev.status === 'In Progress');

    const upcoming = normalised
      .filter(ev => ev.status === 'Not Started')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 25);

    const hasRecent = finished.length > 0 || live.length > 0;
    const hasUpcoming = upcoming.length > 0;

    return res.status(200).json({
      upcoming: hasUpcoming ? upcoming : FALLBACK_UPCOMING,
      recent: hasRecent ? [...live, ...finished] : FALLBACK_RECENT,
      live: live.length > 0,
      source: 'espn',
      error: null,
      fetchedAt,
    });
  } catch (err) {
    // Always 200 for the blog — caller shows hardcoded fallback
    console.error('[tennis-feed] fetch error:', err.message || err);
    return res.status(200).json({
      upcoming: FALLBACK_UPCOMING,
      recent: FALLBACK_RECENT,
      live: false,
      source: 'fallback',
      error: 'live data unavailable — showing cached results',
      fetchedAt,
    });
  }
};
