/**
 * SmartSwing AI — Brand Style Guide
 *
 * Single source of truth for how every AI-generated asset should sound and look.
 * Imported by copywriter agents, image-prompt builders, and the content engine.
 *
 * Positioning: Nike × Apple × Tennis — premium, precise, craft-obsessed.
 */

const BRAND_STYLE = {
  name: 'SmartSwing AI',
  tagline: 'Biomechanics intelligence for every swing.',
  positioning: 'Nike × Apple for tennis. Premium, precise, craft-obsessed.',

  voice: {
    tone: 'Confident, quietly obsessive about craft. Short sentences. ' +
          'Verbs do the work. No hype, no motivational fluff. One idea per post.',
    do: [
      'Name the result — numbers, reps, outcomes',
      'Show, don\'t tell — demo over description',
      'Respect the player — never condescending',
      'Use specifics: racket head speed, contact point, timing in ms',
      'Let whitespace breathe'
    ],
    dont: [
      'No superlatives ("amazing", "incredible", "game-changing")',
      'No corporate jargon ("unlock your potential", "elevate your game")',
      'No emoji salad — at most one, and only in hooks',
      'No stock-photo language',
      'No fake urgency'
    ],
    example_good: 'Your forehand lands late by 43 milliseconds. Here\'s why.',
    example_bad:  '🎾🔥 UNLOCK YOUR FOREHAND POTENTIAL with INCREDIBLE AI TECH! 💪'
  },

  visual: {
    palette: {
      primary:  '#0B1220',  // Near-black — hero backgrounds, type
      accent:   '#D8FF00',  // Signal yellow — used sparingly, one accent per image
      surface:  '#F5F5F7',  // Apple-grade warm white — cards, negative space
      ink:      '#111111',  // Body type on light
      court:    '#1E7B4F'   // Tennis-court green, when we want heritage
    },
    typography: 'Sans-serif, high contrast, generous tracking. Think SF Pro Display / Inter weight 600+.',
    composition: [
      'Hero subject off-center (rule of thirds)',
      'Generous negative space — 40%+ of frame',
      'One hero movement per frame',
      'Cinematic side-light, not flat fill',
      'No stock photos ever — editorial or studio'
    ],
    motion: 'Slow-motion contact moments, clean cuts, no spinning text, no zoom-bounces.'
  },

  // Prepended to every DALL-E / image-model prompt
  image_prompt_prefix:
    'PREMIUM SPORTS EDITORIAL PHOTOGRAPHY — SmartSwing AI brand. ' +
    'Apple-grade minimalism meets Nike athletic precision for tennis/pickleball. ' +
    'Background: either near-black matte (#0B1220) or clean warm-white (#F5F5F7). ' +
    'Cinematic single-source side-light, deep controlled shadow on one side. ' +
    'Single accent: signal yellow (#D8FF00) used as ONE subtle visual note only ' +
    '(ball, string, sideline, or court marking) — never as overlay or text. ' +
    'Subject off-center, rule of thirds, 40%+ negative space, high contrast. ' +
    'Shot on Phase One 150mm or equivalent medium-format, shallow depth of field. ' +
    '1:1 square or 3:4 vertical composition. Sharp focus on contact moment, ' +
    'racket, or hand. Aspirational, quiet, craft-obsessed. ' +
    'STRICT NO-LIST: no text, no logos, no watermarks, no emojis, no stock-photo ' +
    'smiles, no multiple subjects posing, no fake lens flare, no gradient blur ' +
    'filters, no AI-slop uncanny faces, no neon purple, no generic fitness poses. ' +
    'Treat the frame like a magazine cover, not a stock library thumbnail. --- ',

  // Prepended to every copywriter / social-media agent prompt
  copy_prompt_prefix:
    'You write for SmartSwing AI — the Nike × Apple of tennis biomechanics ' +
    'intelligence. Voice: confident, precise, quietly obsessive about craft. ' +
    'Short sentences. Verbs lead. One idea per post. No hype, no emoji salad, ' +
    'no corporate jargon. Specifics over slogans (name the number, the drill, ' +
    'the millisecond). Audience: serious recreational players, coaches, and clubs. ' +
    'Never motivational fluff. If you can\'t name a result, don\'t write the post. ' +
    'Close posts with a concrete next step or a single-line SmartSwing AI mention, ' +
    'not a generic CTA. --- '
};

/**
 * Wraps a raw image prompt with the brand prefix.
 */
function brandImagePrompt(rawPrompt) {
  const raw = String(rawPrompt || '').trim();
  return BRAND_STYLE.image_prompt_prefix + raw;
}

/**
 * Wraps a raw copywriter prompt with the brand prefix.
 */
function brandCopyPrompt(rawPrompt) {
  const raw = String(rawPrompt || '').trim();
  return BRAND_STYLE.copy_prompt_prefix + raw;
}

module.exports = { BRAND_STYLE, brandImagePrompt, brandCopyPrompt };
