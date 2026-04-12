// api/tennis-brackets.js
// Vercel serverless function — fetches real tournament bracket data
// Primary: ESPN public API (no auth, reliable)
// Fallback: SofaScore (server-side, richer data but less stable)
// Cache: 30 minutes at edge (brackets update as matches finish)
//
// IMPORTANT: This endpoint NEVER fabricates results. If data is unavailable,
// it returns empty brackets with TBD placeholders. Only real, verified match
// results are returned.
//
// Usage: GET /api/tennis-brackets?slug=monte-carlo-2026
// Or:    GET /api/tennis-brackets  (returns list of tracked tournaments)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CACHE_HEADERS = {
  'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
};

// ESPN public API
const ESPN_ATP = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard';
const ESPN_WTA = 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard';

// SofaScore (server-side only)
const SOFASCORE_BASE = 'https://api.sofascore.com/api/v1';

// ── Tournament registry ─────────────────────────────────────
// Maps blog slug → ESPN tournament ID + tour (atp/wta)
// ESPN tournament IDs can be found in scoreboard response
const TOURNAMENT_REGISTRY = {
  'monte-carlo-2026': { espnId: 42, tour: 'atp', name: 'Monte-Carlo Rolex Masters', sofaId: 2555 },
  'barcelona-2026':   { espnId: 45, tour: 'atp', name: 'Barcelona Open Banc Sabadell', sofaId: 2557 },
  'stuttgart-wta-2026':{ espnId: null, tour: 'wta', name: 'Porsche Tennis Grand Prix', sofaId: 2604 },
  'madrid-2026':      { espnId: 31, tour: 'atp', name: 'Mutua Madrid Open', sofaId: 2556 },
  'rome-2026':        { espnId: 44, tour: 'atp', name: 'Internazionali BNL d\'Italia', sofaId: 2558 },
  'roland-garros-2026':{ espnId: 36, tour: 'atp', name: 'Roland Garros', sofaId: 2480 },
  'queens-2026':      { espnId: 47, tour: 'atp', name: 'cinch Championships', sofaId: 2586 },
  'wimbledon-2026':   { espnId: 38, tour: 'atp', name: 'The Championships, Wimbledon', sofaId: 2481 },
  'us-open-2026':     { espnId: 39, tour: 'atp', name: 'US Open', sofaId: 2482 },
};

async function fetchWithTimeout(url, timeoutMs = 8000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function setHeaders(res, headers) {
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

// ── ESPN bracket extraction ──────────────────────────────────

function shortName(displayName) {
  if (!displayName) return 'TBD';
  const parts = displayName.split(' ');
  if (parts.length >= 2) return parts[0][0] + '. ' + parts.slice(1).join(' ');
  return displayName;
}

function classifyESPNRound(roundName) {
  if (!roundName) return null;
  const r = roundName.toLowerCase();
  if (r === 'final' || r === 'finals' || r === 'championship') return 'f';
  if (r.includes('semifinal') || r.includes('semi-final') || r === 'semifinals') return 'sf';
  if (r.includes('quarterfinal') || r.includes('quarter-final') || r === 'quarterfinals') return 'qf';
  return null;
}

function formatESPNScore(comp) {
  const home = comp.competitors?.[0];
  const away = comp.competitors?.[1];
  if (!home?.linescores?.length || !away?.linescores?.length) return null;

  return home.linescores.map((s, i) => {
    const a = away.linescores[i];
    if (s.value == null || a?.value == null) return null;
    let score = `${Math.round(s.value)}-${Math.round(a.value)}`;
    // Check for tiebreak
    if (s.tiebreak != null || a?.tiebreak != null) {
      const loserTb = Math.min(s.tiebreak || 0, a?.tiebreak || 0);
      score += `(${loserTb})`;
    }
    return score;
  }).filter(Boolean).join(', ');
}

function espnCompToMatch(comp) {
  const home = comp.competitors?.[0] || {};
  const away = comp.competitors?.[1] || {};
  const isFinished = comp.status?.type?.completed === true;
  const winner = home.winner ? 1 : (away.winner ? 2 : 0);

  return {
    p1: shortName(home.displayName),
    s1: home.curatedRank?.current ? `[${home.curatedRank.current}]` : '',
    p2: shortName(away.displayName),
    s2: away.curatedRank?.current ? `[${away.curatedRank.current}]` : '',
    score: isFinished ? formatESPNScore(comp) : null,
    w: isFinished ? winner : 0,
  };
}

async function fetchESPNBracket(tournamentId, tour) {
  const url = tour === 'wta' ? ESPN_WTA : ESPN_ATP;
  const data = await fetchWithTimeout(url);
  if (!data?.events) return null;

  // Find the matching tournament event by tournamentId
  const event = data.events.find(ev => {
    if (tournamentId && ev.tournamentId == tournamentId) return true;
    // Also try matching event.id which may be "42-2026" format
    if (tournamentId && String(ev.id || '').startsWith(String(tournamentId))) return true;
    return false;
  });

  if (!event) return null;

  // Flatten competitions from groupings[] and direct competitions[]
  const allComps = [];
  for (const group of (event.groupings || [])) {
    for (const comp of (group.competitions || [])) {
      allComps.push(comp);
    }
  }
  for (const comp of (event.competitions || [])) {
    allComps.push(comp);
  }

  if (!allComps.length) return null;

  const brackets = { qf: [], sf: [], f: [] };
  let hasAnyData = false;

  for (const comp of allComps) {
    const roundType = classifyESPNRound(comp.round?.displayName);
    if (roundType && brackets[roundType]) {
      brackets[roundType].push(espnCompToMatch(comp));
      hasAnyData = true;
    }
  }

  if (!hasAnyData) return null;
  return brackets;
}

// ── SofaScore bracket extraction (fallback) ──────────────────

async function fetchSofaScoreBracket(utId) {
  // Get latest season
  const seasonsUrl = `${SOFASCORE_BASE}/unique-tournament/${utId}/seasons`;
  const seasonsData = await fetchWithTimeout(seasonsUrl, 8000, {
    'User-Agent': 'SmartSwingAI/1.0',
  });
  if (!seasonsData?.seasons?.length) return null;
  const seasonId = seasonsData.seasons[0].id;

  // Fetch events
  const eventsUrl = `${SOFASCORE_BASE}/unique-tournament/${utId}/season/${seasonId}/events/last/0`;
  const eventsData = await fetchWithTimeout(eventsUrl, 8000, {
    'User-Agent': 'SmartSwingAI/1.0',
  });
  const events = eventsData?.events || [];
  if (!events.length) return null;

  const brackets = { qf: [], sf: [], f: [] };
  let hasAnyData = false;

  for (const ev of events) {
    const ri = ev.roundInfo || {};
    const rName = (ri.name || '').toLowerCase();
    let roundType = null;
    if (rName.includes('final') && !rName.includes('semi') && !rName.includes('quarter')) roundType = 'f';
    else if (rName.includes('semi')) roundType = 'sf';
    else if (rName.includes('quarter')) roundType = 'qf';

    if (roundType && brackets[roundType]) {
      const home = ev.homeTeam || {};
      const away = ev.awayTeam || {};
      const winner = ev.winnerCode === 1 ? 1 : (ev.winnerCode === 2 ? 2 : 0);

      // Build set scores
      let score = null;
      if (ev.homeScore && ev.status?.type === 'finished') {
        const sets = [];
        for (let i = 1; i <= 5; i++) {
          const h = ev.homeScore[`period${i}`];
          const a = ev.awayScore?.[`period${i}`];
          if (h != null && a != null) {
            let s = `${h}-${a}`;
            const tbH = ev.homeScore[`period${i}TieBreak`];
            const tbA = ev.awayScore?.[`period${i}TieBreak`];
            if (tbH != null || tbA != null) s += `(${Math.min(tbH || 0, tbA || 0)})`;
            sets.push(s);
          }
        }
        if (sets.length) score = sets.join(', ');
      }

      brackets[roundType].push({
        p1: shortName(home.name),
        s1: '',
        p2: shortName(away.name),
        s2: '',
        score,
        w: winner,
      });
      hasAnyData = true;
    }
  }

  if (!hasAnyData) return null;
  return brackets;
}

// ── Empty bracket helper ─────────────────────────────────────

function emptyBracket() {
  return {
    qf: [
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
    ],
    sf: [
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
    ],
    f: [
      { p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 },
    ],
    champion: null,
  };
}

function padBracket(brackets) {
  while (brackets.qf.length < 4) brackets.qf.push({ p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 });
  while (brackets.sf.length < 2) brackets.sf.push({ p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 });
  while (brackets.f.length < 1) brackets.f.push({ p1: 'TBD', s1: '', p2: 'TBD', s2: '', score: null, w: 0 });

  // Determine champion and status
  let champion = null;
  let status = 'upcoming';
  const finalMatch = brackets.f[0];
  if (finalMatch && finalMatch.score) {
    champion = finalMatch.w === 1 ? finalMatch.p1 : (finalMatch.w === 2 ? finalMatch.p2 : null);
    status = 'completed';
  } else if (brackets.qf.some(m => m.score) || brackets.sf.some(m => m.score)) {
    status = 'in-progress';
  }

  return {
    qf: brackets.qf.slice(0, 4),
    sf: brackets.sf.slice(0, 2),
    f: brackets.f.slice(0, 1),
    champion,
    _status: status,
  };
}

// ── Main handler ─────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setHeaders(res, { ...CORS_HEADERS, 'Content-Length': '0' });
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    setHeaders(res, CORS_HEADERS);
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  setHeaders(res, { ...CORS_HEADERS, ...CACHE_HEADERS, 'Content-Type': 'application/json' });

  const { slug } = req.query || {};

  if (!slug) {
    // Return registry of available tournaments
    const registry = Object.entries(TOURNAMENT_REGISTRY).map(([s, info]) => ({
      slug: s,
      name: info.name,
    }));
    return res.status(200).json({ tournaments: registry });
  }

  const reg = TOURNAMENT_REGISTRY[slug];
  if (!reg) {
    return res.status(404).json({ error: 'Unknown tournament slug. Use GET /api/tennis-brackets for available tournaments.' });
  }

  try {
    let brackets = null;
    let source = 'empty';

    // Try ESPN first (more reliable)
    if (reg.espnId) {
      try {
        brackets = await fetchESPNBracket(reg.espnId, reg.tour);
        if (brackets) source = 'espn';
      } catch (e) {
        console.warn('[tennis-brackets] ESPN failed for', slug, e.message);
      }
    }

    // Fallback to SofaScore
    if (!brackets && reg.sofaId) {
      try {
        brackets = await fetchSofaScoreBracket(reg.sofaId);
        if (brackets) source = 'sofascore';
      } catch (e) {
        console.warn('[tennis-brackets] SofaScore failed for', slug, e.message);
      }
    }

    if (!brackets) {
      return res.status(200).json({
        slug,
        name: reg.name,
        source: 'empty',
        bracket: emptyBracket(),
        status: 'upcoming',
        error: 'No bracket data available — tournament may not have started yet',
        fetchedAt: new Date().toISOString(),
      });
    }

    const padded = padBracket(brackets);
    const status = padded._status;
    delete padded._status;

    return res.status(200).json({
      slug,
      name: reg.name,
      source,
      bracket: padded,
      status,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[tennis-brackets] error:', err.message || err);
    return res.status(200).json({
      slug,
      name: reg.name,
      source: 'error',
      bracket: emptyBracket(),
      status: 'unknown',
      error: 'Unable to fetch bracket — ' + (err.message || 'unknown error'),
      fetchedAt: new Date().toISOString(),
    });
  }
};
