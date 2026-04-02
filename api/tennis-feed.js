// api/tennis-feed.js
// Vercel serverless function — fetches ATP/WTA tournament events from TheSportsDB
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

// TheSportsDB free API — ATP league id 4424
const UPCOMING_URL = 'https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4424';
const PAST_URL = 'https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4424';

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

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries({ ...CORS_HEADERS, 'Content-Length': '0' }).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  Object.entries({ ...CORS_HEADERS, ...CACHE_HEADERS, 'Content-Type': 'application/json' }).forEach(([k, v]) =>
    res.setHeader(k, v)
  );

  const fetchedAt = new Date().toISOString();

  try {
    const [upcomingData, pastData] = await Promise.all([
      fetchWithTimeout(UPCOMING_URL),
      fetchWithTimeout(PAST_URL),
    ]);

    const normaliseEvent = (ev) => ({
      id: ev.idEvent || null,
      name: ev.strEvent || null,
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
    });

    const upcoming = Array.isArray(upcomingData?.events)
      ? upcomingData.events.slice(0, 20).map(normaliseEvent)
      : [];

    const recent = Array.isArray(pastData?.events)
      ? pastData.events.slice(0, 20).map(normaliseEvent)
      : [];

    return res.status(200).json({ upcoming, recent, fetchedAt });
  } catch (err) {
    // Always 200 for the blog — caller shows hardcoded fallback
    console.error('[tennis-feed] fetch error:', err.message || err);
    return res.status(200).json({
      upcoming: [],
      recent: [],
      error: 'live data unavailable',
      fetchedAt,
    });
  }
};
