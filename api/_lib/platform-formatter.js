/**
 * SmartSwing AI — Platform Formatter
 *
 * Adapts a single content_calendar row into platform-native payload before
 * publishing. Each platform has its own rules:
 *   - character limits, hashtag conventions, link placement, media aspect
 *
 * The adapter is conservative — it never *adds* content not in the source, only
 * trims, rewraps, and re-orders. AI copywriters should still produce most of
 * the adaptation; this is the safety net right before publish.
 *
 * Usage:
 *   const { formatForPlatform, PLATFORM_WINDOWS } = require('./platform-formatter');
 *   const payload = formatForPlatform('instagram', item);
 *   //  → { caption, hashtags, mediaHint, truncated, warnings[] }
 */
'use strict';

// Optimal posting windows (local time HH:MM) by platform — used for auto-schedule.
// Platforms: facebook, instagram, x/twitter, tiktok, youtube, reddit.
const PLATFORM_WINDOWS = {
  facebook:  { weekday: '13:00', weekend: '11:00'  },
  instagram: { weekday: '11:30', weekend: '10:00'  },
  twitter:   { weekday: '09:00', weekend: '10:30'  },
  x:         { weekday: '09:00', weekend: '10:30'  },
  tiktok:    { weekday: '19:30', weekend: '11:00'  },
  youtube:   { weekday: '16:00', weekend: '10:00'  },
  reddit:    { weekday: '14:00', weekend: '10:00'  },  // r/tennis & r/pickleball peak
  email:     { weekday: '08:30', weekend: null     },
  sms:       { weekday: '12:00', weekend: null     }
};

// Platform limits and behaviors.
const PLATFORM_RULES = {
  facebook:  { maxChars: 2200,  hashtags: 'few',   linkInBody: false, aspect: '1:1 or 4:5' },
  instagram: { maxChars: 2200,  hashtags: 'many',  linkInBody: false, aspect: '1:1 or 4:5 or 9:16' },
  twitter:   { maxChars: 280,   hashtags: 'none',  linkInBody: true,  aspect: '16:9 or 1:1' },
  x:         { maxChars: 280,   hashtags: 'none',  linkInBody: true,  aspect: '16:9 or 1:1' },
  tiktok:    { maxChars: 2200,  hashtags: 'few',   linkInBody: false, aspect: '9:16' },
  youtube:   { maxChars: 5000,  hashtags: 'few',   linkInBody: true,  aspect: '16:9 (1:1 for Shorts)' },
  reddit:    { maxChars: 10000, hashtags: 'none',  linkInBody: true,  aspect: '16:9 or 1:1' },
  email:     { maxChars: 10000, hashtags: 'none',  linkInBody: true,  aspect: null },
  sms:       { maxChars: 160,   hashtags: 'none',  linkInBody: true,  aspect: null }
};

// Default tennis/pickleball hashtag bank by persona.
const HASHTAG_BANK = {
  player_tennis:  ['#tennis', '#tennistraining', '#tennistips', '#ntrp', '#forehand', '#ballstriker'],
  player_pball:   ['#pickleball', '#picklebalsapp', '#pickleballtips', '#dinkshot', '#pickleballlife'],
  coach:          ['#tenniscoach', '#coachlife', '#tennisdevelopment', '#tennistraining', '#playerdevelopment'],
  club:           ['#tennisclub', '#tennisacademy', '#tennisprogramming', '#membership'],
  parent:         ['#juniortennis', '#tennisparents', '#juniordev', '#tennisfamily'],
  default:        ['#tennis', '#smartswing', '#swinganalysis', '#aicoaching']
};

function pickHashtags(persona, platformKey, title, bodyText) {
  const key = persona || 'default';
  const bank = HASHTAG_BANK[key] || HASHTAG_BANK.default;
  const rules = PLATFORM_RULES[platformKey] || {};
  if (rules.hashtags === 'none') return [];
  if (rules.hashtags === 'few')  return bank.slice(0, 3);
  // 'many' → up to 8, biased toward content keywords
  const fromText = extractKeywordTags((title || '') + ' ' + (bodyText || '')).slice(0, 3);
  return Array.from(new Set([...bank.slice(0, 5), ...fromText])).slice(0, 8);
}

function extractKeywordTags(text) {
  const words = String(text || '').toLowerCase().match(/\b(forehand|backhand|serve|volley|dink|drill|footwork|timing|spin|topspin|slice)\b/g) || [];
  return [...new Set(words)].map(w => '#' + w);
}

/**
 * Safely trims prose to maxChars, breaking on sentence boundary where possible.
 */
function smartTrim(text, maxChars) {
  const s = String(text || '').trim();
  if (s.length <= maxChars) return s;
  const slice = s.slice(0, maxChars - 1);
  const lastPeriod = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastPeriod > maxChars * 0.6) return slice.slice(0, lastPeriod + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice) + '…';
}

/**
 * Strip bare URLs from the body for platforms where links in body hurt reach
 * (Facebook, Instagram). Returns {stripped, firstUrl}.
 */
function extractUrls(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s)]+/g) || [];
  return { urls, first: urls[0] || null };
}

function stripUrls(text) {
  return String(text || '').replace(/https?:\/\/[^\s)]+/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Build the payload sent to each platform publisher.
 *
 * @param {string} platform - 'instagram' | 'facebook' | 'twitter' | 'x' | 'tiktok' | 'youtube' | 'reddit' | 'email' | 'sms'
 * @param {object} item    - content_calendar row
 * @returns {{caption:string, hashtags:string[], link:string|null, warnings:string[], aspect:string|null}}
 */
function formatForPlatform(platform, item) {
  const key = String(platform || '').toLowerCase();
  const rules = PLATFORM_RULES[key] || PLATFORM_RULES.facebook;
  const warnings = [];

  const rawBody = item.copy_text || item.content_text || item.body || '';
  const title   = item.title || item.hook || '';
  const persona = item.target_persona || item.persona || 'default';

  // 1) Extract links from the body
  const { first: linkInBody } = extractUrls(rawBody);
  let body = rules.linkInBody ? rawBody : stripUrls(rawBody);

  // 2) Compose hook + body per platform
  let caption;
  if (key === 'twitter' || key === 'x') {
    // Prefer the hook/title if body is too long
    const candidate = (title && title.length <= rules.maxChars) ? title : body;
    caption = smartTrim(candidate, rules.maxChars);
    if (body.length > rules.maxChars) warnings.push('Body exceeds 280 chars — consider a thread.');
  } else if (key === 'instagram' || key === 'facebook') {
    // Caption = hook line + body, no URL
    caption = (title ? title.trim() + '\n\n' : '') + body;
    if (key === 'facebook' && linkInBody) warnings.push('External URL in body — Facebook suppresses reach on link posts.');
  } else if (key === 'tiktok') {
    // TikTok caption is supplementary — the video does the work
    caption = smartTrim(title || body, 150);
  } else if (key === 'youtube') {
    // YouTube description — keep link, keep full body
    caption = (title ? title.trim() + '\n\n' : '') + body;
  } else if (key === 'reddit') {
    // Reddit post body — conversational, no hashtags, link is fine, hook as title
    caption = body;
    // Reddit "title" is separate (handled by publisher); body is self-post text
  } else {
    caption = body;
  }

  caption = smartTrim(caption, rules.maxChars);

  // 3) Hashtags
  const hashtags = pickHashtags(persona, key, title, body);

  // 4) Aspect hint
  const aspect = rules.aspect || null;

  // 5) Final warnings
  if (!item.image_url && !item.video_url && (key === 'instagram' || key === 'tiktok' || key === 'youtube')) {
    warnings.push(`${key} requires media; item has no image_url/video_url.`);
  }
  if (item.image_persisted === false) {
    warnings.push('Image URL is ephemeral (DALL-E) — mirror via backfill before publishing.');
  }

  return { caption, hashtags, link: rules.linkInBody ? linkInBody : null, warnings, aspect };
}

/**
 * Resolve an optimal posting slot for a platform. Returns {date, time} in local server time.
 * - Skips weekends for platforms that perform poorly on weekends (LI, email, sms).
 * - Finds the earliest upcoming slot >= now.
 *
 * @param {string} platform
 * @param {Date} [reference=new Date()]  — usually now
 * @returns {{date:string, time:string}}
 */
function resolveOptimalSlot(platform, reference) {
  const key = String(platform || '').toLowerCase();
  const cfg = PLATFORM_WINDOWS[key] || PLATFORM_WINDOWS.facebook;
  const ref = reference || new Date();

  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(ref.getTime() + offset * 86400000);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const slot = isWeekend ? cfg.weekend : cfg.weekday;
    if (!slot) continue; // platform skips this day

    // Skip if the slot has already passed today
    if (offset === 0) {
      const nowHHMM = ref.toTimeString().slice(0, 5);
      if (slot <= nowHHMM) continue;
    }
    return {
      date: d.toISOString().slice(0, 10),
      time: slot
    };
  }
  // Fallback — tomorrow 10:00
  const fb = new Date(ref.getTime() + 86400000);
  return { date: fb.toISOString().slice(0, 10), time: '10:00' };
}

module.exports = {
  formatForPlatform,
  resolveOptimalSlot,
  PLATFORM_WINDOWS,
  PLATFORM_RULES,
  HASHTAG_BANK
};
