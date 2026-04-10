// api/tennis-feed.js
// Vercel serverless function — fetches ATP + WTA tournament events from TheSportsDB
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

// TheSportsDB free API — ATP = 4424, WTA = 4429
const ATP_UPCOMING = 'https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4424';
const ATP_PAST = 'https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4424';
const WTA_UPCOMING = 'https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4429';
const WTA_PAST = 'https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4429';

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

function normaliseEvent(ev) {
  return {
    id: ev.idEvent || null,
    name: ev.strEvent || null,
    tournament: ev.strLeague || null,
    date: ev.dateEvent || null,
    time: ev.strTime || null,
    homeTeam: ev.strHomeTeam || null,
    awayTeam: ev.strAwayTeam || null,
    homeScore: ev.intHomeScore ?? null,
    awayScore: ev.intAwayScore ?? null,
    venue: ev.strVenue || null,
    city: ev.strCity || null,
    country: ev.strCountry || null,
    thumbnail: ev.strThumb || null,
    status: ev.strStatus || null,
    round: ev.intRound || null,
    season: ev.strSeason || null,
    sport: ev.strSport || null,
  };
}

function isTennisEvent(ev) {
  if (ev.sport && ev.sport.toLowerCase() !== 'tennis') return false;
  const name = (ev.name || '').toLowerCase();
  if (name.includes('soccer') || name.includes('football') || name.includes('basketball')) return false;
  return true;
}

function safeEventList(response) {
  return Array.isArray(response?.events) ? response.events : [];
}

function setHeaders(res, headers) {
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

const FALLBACK_RESULTS = [
  {
    id: 'fallback-1', name: 'ATP Masters 1000 — Monte-Carlo',
    tournament: 'Monte-Carlo Rolex Masters', date: '2026-04-12',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Monte-Carlo Country Club', city: 'Roquebrune-Cap-Martin', country: 'France',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-2', name: 'WTA 500 — Stuttgart Open',
    tournament: 'Porsche Tennis Grand Prix', date: '2026-04-14',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Porsche Arena', city: 'Stuttgart', country: 'Germany',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
  },
  {
    id: 'fallback-3', name: 'ATP 500 — Barcelona Open',
    tournament: 'Barcelona Open Banc Sabadell', date: '2026-04-20',
    homeTeam: null, awayTeam: null, homeScore: null, awayScore: null,
    venue: 'Real Club de Tenis Barcelona', city: 'Barcelona', country: 'Spain',
    thumbnail: null, status: 'Upcoming', round: null, season: '2026', sport: 'Tennis'
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
    // Fetch ATP + WTA in parallel
    const [atpUp, atpPast, wtaUp, wtaPast] = await Promise.all([
      fetchWithTimeout(ATP_UPCOMING).catch(() => ({ events: null })),
      fetchWithTimeout(ATP_PAST).catch(() => ({ events: null })),
      fetchWithTimeout(WTA_UPCOMING).catch(() => ({ events: null })),
      fetchWithTimeout(WTA_PAST).catch(() => ({ events: null })),
    ]);

    const upcoming = [...safeEventList(atpUp), ...safeEventList(wtaUp)]
      .sort((a, b) => (a.dateEvent || '').localeCompare(b.dateEvent || ''))
      .slice(0, 25)
      .map(normaliseEvent)
      .filter(isTennisEvent);

    const recent = [...safeEventList(atpPast), ...safeEventList(wtaPast)]
      .sort((a, b) => (b.dateEvent || '').localeCompare(a.dateEvent || ''))
      .slice(0, 25)
      .map(normaliseEvent)
      .filter(isTennisEvent);

    if (upcoming.length === 0 && recent.length === 0) {
      return res.status(200).json({
        upcoming: FALLBACK_RESULTS,
        recent: [],
        error: 'no events returned — showing scheduled events',
        fetchedAt,
      });
    }

    return res.status(200).json({ upcoming, recent, fetchedAt });
  } catch (err) {
    // Always 200 for the blog — caller shows hardcoded fallback
    console.error('[tennis-feed] fetch error:', err.message || err);
    return res.status(200).json({
      upcoming: FALLBACK_RESULTS,
      recent: [],
      error: 'live data unavailable — showing scheduled events',
      fetchedAt,
    });
  }
};
