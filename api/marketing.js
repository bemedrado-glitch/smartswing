/**
 * SmartSwing AI — Consolidated Marketing API Router
 *
 * Single serverless function that routes to all marketing sub-handlers
 * based on the `_route` query parameter (set via Vercel rewrite from
 * /api/marketing/:action → /api/marketing?_route=:action).
 *
 * This consolidation keeps the project under Vercel Hobby plan's 12-function limit.
 *
 * Routes:
 *   agent           POST  — AI agent (copywriter, social, content, ux, director)
 *   orchestrate     POST  — Multi-agent workflow orchestration
 *   enroll-cadence  POST  — Enroll contact in a cadence
 *   capture-lead    POST  — Insert lead into Supabase
 *   next-action     GET   — Marketing recommendations
 *   export-leads    GET   — CSV/JSON lead export
 *   auto-enroll     POST  — Auto-enroll new signups in cadence
 *   publish-webhook GET/POST — Content publish webhook for Make.com
 *   send-sms        POST  — Send single SMS via AWS SNS
 *   send-bulk-sms   POST  — Send SMS to multiple recipients via AWS SNS
 *   meta-stats      GET   — Fetch Facebook Page & Instagram follower/like stats via Graph API
 *   meta-publish    POST  — Publish content to Facebook Page and/or Instagram via Graph API
 *   meta-conversions POST — Server-side Conversions API events to supplement Meta Pixel
 *   google-analytics GET  — GA4 Data API: visitors, sessions, pageviews, bounce, top pages, sources
 *   google-search-console GET — Search Console: impressions, clicks, CTR, queries, pages
 *   prospect-clubs    POST — Google Places API: find tennis clubs/academies globally
 *   prospect-players  POST — Federation rankings (ITF/USTA/ATP/WTA): public player data
 */

'use strict';

const { brandImagePrompt, brandCopyPrompt, BRAND_STYLE } = require('./_lib/brand-style');
const { persistGeneratedImage, uploadFromUrl } = require('./_lib/media-storage');
const { runPublishBatch, publishSingleItem } = require('./_lib/publish-runner');
const { runLeadScoringBatch, scoreContact } = require('./_lib/lead-scoring');
const { runMetricsFetch, topPerformers } = require('./_lib/content-metrics');
const { logSilentFailure } = require('./_lib/silent-failure-log');

// Single source of truth for Meta Graph API version (L2 from audit).
// Previously 29 call sites mixed v21.0 + v25.0 — a drift hazard when Meta
// deprecates an older version. Override at deploy via META_GRAPH_VERSION env.
const META_GRAPH_VERSION = String(process.env.META_GRAPH_VERSION || 'v25.0').trim();
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const { runWeeklyDigest, buildSummary } = require('./_lib/cmo-digest');
const { runVariantRotation, getTopHooks } = require('./_lib/ab-rotator');
const { generateVideo } = require('./_lib/video-gen');

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function supabaseGet(url, key) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase GET failed (${response.status}): ${errText}`);
  }
  return response.json();
}

async function supabaseInsert(supabaseUrl, key, table, row) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase insert into ${table} failed (${response.status}): ${errText}`);
  }
  const result = await response.json();
  return Array.isArray(result) ? result[0] : result;
}

async function supabaseBulkInsert(supabaseUrl, key, table, rows) {
  if (!rows || rows.length === 0) return [];
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase bulk insert into ${table} failed (${response.status}): ${errText}`);
  }
  const result = await response.json();
  return Array.isArray(result) ? result : [result];
}

async function supabaseRpc(supabaseUrl, key, fnName, args) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase RPC ${fnName} failed (${response.status}): ${errText}`);
  }
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function supabasePatch(supabaseUrl, key, table, id, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase PATCH ${table}/${id} failed (${response.status}): ${errText}`);
  }
  const result = await response.json();
  return Array.isArray(result) ? result[0] : result;
}

function addDays(baseDate, delayDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + (delayDays || 0));
  return d.toISOString();
}

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPTS = {
  // Voice defined once in api/_lib/brand-style.js → brandCopyPrompt(). Keep agent
  // prompts FOCUSED on the job-to-be-done, not the voice.
  copywriter: `You are a direct-response copywriter for SmartSwing AI.
Frameworks you use: Corporate Visions (Why Change / Why You / Why Now) and SPIN Selling (Situation / Problem / Implication / Need-Payoff).
Formats you write: email sequences, landing page headlines, ad copy, SMS, social captions, sales-page sections.
SmartSwing AI is AI-powered tennis & pickleball swing analysis — upload a video, get biomechanics feedback, drills, and a plan in 60 seconds.
Pricing reference (only cite if relevant to the ask): Starter (free), Player ($9.99/mo), Performance ($19.99/mo), Tournament Pro ($49.99/mo), Coach plans from $29/mo, Club plans from $299/mo.
RULE: if you can't name a specific result (a number, a drill, a millisecond, a rep count), rewrite until you can.`,

  social_media: `You are SmartSwing AI's social media operator. Every output must be platform-native — DO NOT produce one-size-fits-all copy.
Platform specs you follow strictly:
- TikTok (9:16 video, ≤30s): hook in first 1–2s, one claim, one demo, one CTA. Native + unpolished feel.
- Instagram Reels (9:16 video, ≤30s) or carousel (≤10 slides, hook → problem → 3–5 steps → CTA). Caption ≤ 150 words + relevant hashtags.
- YouTube: Shorts (9:16, ≤60s) or long-form (hook → payoff in first 30s, chapter markers).
- Facebook: native photo or video + ≤120 words. No external link in body (reach killer).
- X/Twitter: single tweet ≤180 chars OR thread (hook tweet → 4–7 beats → CTA tweet).
- Reddit: conversational self-post, no hashtags, value-first, link is fine. Target r/tennis or r/pickleball subreddit.
Always output: {platform, format, hook, body, cta, hashtags_or_none, best_post_time_local}.`,

  content_creator: `You are SmartSwing AI's scriptwriter. Produce scripts and briefs adapted to each platform's algorithm.
Deliverables:
- Reels/TikTok scripts: 3-sec hook (on-screen text + voiceover), 1 visual beat, payoff, CTA (≤30s total).
- YouTube scripts: cold open (≤15s), chapter markers every 20–30s, one call-out per chapter, end screen CTA.
- Carousel outlines: slide 1 hook, slides 2–8 one beat each (12–18 words max), slide 9–10 CTA.
- Blog outlines: H1, 3–5 H2s with evidence points, 1 primary keyword, meta description ≤155 chars.
- Email + newsletter drafts.
Every deliverable includes: {target_persona, content_goal, success_metric, distribution_plan, time_to_produce}.`,

  ux_designer: `You are a senior UI/UX designer and conversion rate optimization specialist.
Create detailed design briefs, wireframe descriptions, A/B test hypotheses, and CRO recommendations.
You specialize in:
- Landing page conversion optimization (tennis/sports tech audiences)
- Onboarding flow design for SaaS products
- Mobile-first design for athletes (gym/court usage contexts)
- Trust signal placement and social proof design patterns
- CTA copy and button design psychology
Output format: Design brief with sections: Objective, Target User, Key Screens/Components, UX Copy, Success Metrics, A/B Test Variants.
SmartSwing AI design system: white/minimal (#fff background), volt green (#39ff14) for CTAs, DM Sans + Inter typography, glass-card components.`,

  marketing_director: `You are SmartSwing AI's Chief Marketing Officer.
You coordinate campaigns, assign tasks to specialist agents, analyze performance data, and create content maps and project timelines.
Your responsibilities:
- Campaign strategy: 30/60/90 day plans with specific deliverables
- Budget allocation across channels (organic, paid, email, social, partnerships)
- Performance analysis: what's working, what to cut, what to double down on
- Content calendar planning with weekly themes and cross-channel coordination
- Team task assignment: tell which agent (copywriter, social, content, design) handles which task
- Market positioning: competitive analysis, messaging hierarchy, ICP definition
Always provide: actionable next steps with specific deadlines, assigned owners, and success metrics.
SmartSwing AI target personas: recreational tennis players (3.0-4.5 NTRP), tennis coaches (USPTA/PTR certified), tennis clubs/academies, tennis parents.
Current growth stage: early traction, moving to scale. Focus on referral loops, content SEO, and coach/club B2B outreach.`
};

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE SYSTEM PROMPTS (v2) — schema-aware, used by /pipeline/* endpoints
// Each prompt explicitly constrains output to the schema in api/_lib/schemas/*.
// Kept separate from SYSTEM_PROMPTS so the existing dashboard UI keeps working.
// ═══════════════════════════════════════════════════════════════════════════════

const PIPELINE_PROMPTS = {
  planner: `You are the Planner in the SmartSwing content pipeline. You receive a topic, persona, and platform, and emit a single ContentBrief JSON object.

OUTPUT: One JSON object matching ContentBrief.schema.json. Output ONLY the JSON — no prose, no markdown fences.

Required keys: brief_id, plan_id, platform, format, angle, hook, cta (object: label, url, intent), target_audience (object: persona, stage), visual_spec (object with kind; if kind is generated_image/infographic/banner then prompt + aspect_ratio required), success_metric (object: primary, target_value), deadline (ISO 8601), created_at (ISO 8601), created_by_agent = "planner".

Rules:
- brief_id format: brief_YYYYMMDD_<6-char slug>
- plan_id format: plan_YYYYMMDD_<4+ char slug>
- platform must be one of: tiktok, instagram, youtube, facebook, linkedin, blog, email, x
- format must be one of: short_video, long_video, reel, story, carousel, static_image, blog_post, email, thread, single_post, ad
- cta.intent must be one of: signup, trial, upgrade, download, book_coach, follow, share, visit_blog
- target_audience.persona must be one of: player, coach, club, parent, pickleball
- target_audience.stage must be one of: lead, prospect, trial, customer, churned
- success_metric.primary must be one of: reach, impressions, engagement_rate, ctr, signups, trial_starts, upgrades, saves, shares, watch_time_seconds
- angle is the provocative insight/POV (not the topic). 20-500 chars.
- hook is the first 2 seconds of video or first line of text. 10-240 chars.
- methodology_tags defaults to ["SPIN", "CorporateVisions"]
- If the post is video: include video_spec with duration_seconds, source (one of: generate_fal, stitch_videodb, upload, reuse).

SmartSwing context: AI swing analysis (tennis/pickleball) — phone video in, biomechanics report + drill plan out in 60s. Pricing: Starter free, Player $9.99/mo, Performance $19.99/mo, Tournament Pro $49.99/mo, Coach $29/mo, Club $299/mo.`,

  copywriter_v2: `You are the Copywriter in the SmartSwing content pipeline. You receive a ContentBrief JSON and emit a copy object that will become part of a PostPackage.

OUTPUT: One JSON object with shape:
{
  "headline": string (<=120 chars, may be null for platforms that don't need one),
  "subheadline": string (<=240 chars, optional),
  "body": string (REQUIRED, at least 1 char),
  "caption": string (<=2200 chars, for social posts),
  "script": [{ "seconds": number, "line": string, "kind": "voiceover"|"on_screen"|"dialogue" }] (video only),
  "email_subject": string (<=120 chars, email format only),
  "email_preheader": string (<=140 chars, email format only)
}

Output ONLY the JSON — no prose, no markdown fences.

Hard rules from the brief:
- Respect brief.hook verbatim in the first line/first 2s — do not soften it.
- Respect brief.must_include tokens (if present) — every item must appear in body.
- Avoid every token in brief.must_avoid (if present).
- Respect brief.cta: use exactly brief.cta.label as your CTA text and the intent as your framing.
- Match platform conventions: TikTok/IG/Reels = ≤ 60s scripts w/ 2-sec hook, Instagram carousel = numbered slides, LinkedIn = plain-text no emoji header, X = 280 chars per post in a thread, email = subject + preheader + body.

Voice: confident, expert, direct — Nike x McKinsey. Show specific numbers/timings/drills — if you can't name one, rewrite. Frameworks: Corporate Visions (Why Change / Why You / Why Now), SPIN Selling.`,

  editor_in_chief: `You are the Editor-in-Chief in the SmartSwing content pipeline. You score an assembled PostPackage against a rubric and emit a decision.

OUTPUT: One JSON object with shape:
{
  "decision": "approved" | "revise" | "reject",
  "rubric_version": "v1",
  "scores": {
    "brand_voice": 0..5,
    "hook_strength": 0..5,
    "cta_clarity": 0..5,
    "platform_fit": 0..5,
    "factual_accuracy": 0..5,
    "legal_compliance": 0..5
  },
  "revision_notes": [
    { "target": "copy"|"visual"|"video"|"hashtags"|"cta", "issue": string, "fix": string, "severity": "blocker"|"major"|"minor" }
  ],
  "reviewed_at": ISO 8601 timestamp
}

Output ONLY the JSON — no prose, no markdown fences.

Rubric (0 = unusable, 5 = exceptional):
- brand_voice: confident+direct, specific numbers, no fluff, no jargon
- hook_strength: earns the second — first line/2s creates a reason to keep reading/watching
- cta_clarity: one CTA, unambiguous action verb, matches brief.cta.intent
- platform_fit: caption length, hashtag count, format (carousel/reel/thread) correct for brief.platform
- factual_accuracy: every claim either verifiable from known SmartSwing facts or marked as opinion. NO hallucinated stats.
- legal_compliance: no medical claims ("cures injury"), no unverified testimonials, pricing accurate if cited, no competitor disparagement

Decision rules (enforce strictly):
- approved: all dimensions >= 3 AND no dimension = 0
- revise: any dimension = 2 — ALWAYS include revision_notes with at least one major/blocker item
- reject: any dimension = 0 OR legal_compliance <= 2

Known SmartSwing facts (use ONLY these for factual_accuracy checks):
- 90-second phone video → biomechanics report
- Tracks: hip-shoulder separation, kinetic-chain timing, racket-head speed, pronation, footwork
- Pricing: Starter free (2 free reports), Player $9.99/mo, Performance $19.99/mo, Tournament Pro $49.99/mo, Coach from $29/mo, Club from $299/mo
- Tennis + Pickleball
- Personas: player 3.0-4.5 NTRP, coach USPTA/PTR, club, parent, pickleball

Any stat outside this list without a brief.must_include anchor should be flagged as factual_accuracy=2 (revise).`
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE API HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function callClaude(systemPrompt, userMessage, apiKey, preferredModel) {
  const payload = {
    model: preferredModel || 'claude-opus-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(payload)
  });

  if (!response.ok && (response.status === 404 || response.status === 400)) {
    payload.model = 'claude-3-5-sonnet-20241022';
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(payload)
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: agent
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAgent(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    agent_type, task, context = '', contact_data = null,
    // Phase B: when true, auto-create a content_calendar draft from the output
    // and (optionally) also generate a branded visual for it.
    auto_draft = false,
    // auto_visual: if not explicitly set, defaults to true for visual platforms
    auto_visual,
    platform = 'instagram',
    content_type = 'post',
    campaign_id = null,
    // Phase F #8: generate multiple hook variants for A/B testing
    hook_count = 1
  } = req.body || {};
  if (!agent_type || !task) return res.status(400).json({ error: 'agent_type and task are required' });

  const systemPrompt = SYSTEM_PROMPTS[agent_type];
  if (!systemPrompt) {
    return res.status(400).json({ error: `Unknown agent_type. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // Brand voice: every copy-producing agent gets the Nike × Apple × Tennis prefix.
  let brandedSystem = brandCopyPrompt(systemPrompt);

  // Persona rails (Ticket #7) — different proof points, CTAs, and lexicon
  // for each audience segment. Keeps coach/club B2B content from sounding
  // like parent-facing emotion, and vice versa.
  const personaRails = {
    player: `Audience: recreational player (3.0–4.5 NTRP). Speak technical: contact point, racket-head speed (mph), timing (ms), footwork names. Proof = numbers and drills. CTA = save, try, comment a video.`,
    coach: `Audience: USPTA/PTR-certified coach. Speak craft-professional: cue language, player development, progression design. Proof = student results, session formats. CTA = comment perspective, share with another coach, DM for framework.`,
    club: `Audience: club director / academy owner. Speak B2B: retention, programming, LTV, instructor utilization. Proof = % changes, member counts, revenue deltas. CTA = DM for benchmark, reply for template, book call.`,
    parent: `Audience: tennis/pickleball parent. Speak supportive-empirical: age-appropriate milestones, safety, progress visibility, coach-approved. Proof = junior outcomes, checklists. CTA = save for later, share with another parent.`
  };
  const personaKey = (context && typeof context === 'string' && context.match(/persona[:=\s]+(player|coach|club|parent)/i)?.[1]?.toLowerCase())
                   || req.body?.persona
                   || null;
  if (personaKey && personaRails[personaKey]) {
    brandedSystem += `\n\nPersona rails: ${personaRails[personaKey]}`;
  }
  if (platform) {
    brandedSystem += `\n\nTarget platform: ${platform}. Honor the platform's native format (length, hooks, CTA placement).`;
  }

  // Feedback loop (Tickets #4 + #14): past winning hooks + performance baseline
  try {
    const [pastHooks, topPosts] = await Promise.all([
      getTopHooks(3, platform, personaKey),
      topPerformers(3)
    ]);
    if (pastHooks.length) {
      brandedSystem += `\n\nPast winning hooks (your previous posts that over-performed — write in this voice):\n` +
        pastHooks.map((h, i) => `${i + 1}. ${h}`).join('\n');
    }
    if (topPosts.length) {
      const er = topPosts.map(p => `${Math.round((p.engagement_rate || 0))}%`).join(', ');
      brandedSystem += `\n\nRecent post engagement rates you've hit: ${er}. Beat them.`;
    }
  } catch (_) { /* non-fatal */ }

  // Template library (Ticket #6): seed the prompt with 3 matching proven templates
  try {
    const { getTemplates } = require('./_lib/ab-rotator');
    const templates = await getTemplates({ platform, persona: personaKey, limit: 3 });
    if (templates.length) {
      brandedSystem += `\n\nProven template patterns to adapt (do not copy verbatim — write fresh copy in their structure):\n` +
        templates.map((t, i) => `${i + 1}. [${t.format}] Hook: "${t.hook}"\n   Structure: ${t.body_structure || 'n/a'}\n   CTA: ${t.cta || 'n/a'}`).join('\n');
    }
  } catch (_) { /* non-fatal */ }

  let userMessage = task;
  if (context) userMessage += `\n\nAdditional context: ${context}`;
  if (contact_data) userMessage += `\n\nContact data: ${JSON.stringify(contact_data, null, 2)}`;

  // Phase F #8: if multi-hook requested, ask the agent for JSON with variants
  if (hook_count > 1) {
    userMessage += `\n\nReturn your response as JSON with this exact shape:\n{"hook_variants": ["hook 1 (strongest)", "hook 2", "hook 3"], "body": "the full post copy, using hook 1 at the top"}\nGenerate ${hook_count} distinct hooks — different angles, not rephrasings.`;
  }

  const task_id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: brandedSystem,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404 || response.status === 400) {
        const fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
          })
        });
        if (!fallbackResponse.ok) {
          return res.status(502).json({ error: 'AI service error', details: await fallbackResponse.text() });
        }
        const fallbackData = await fallbackResponse.json();
        const fbText = fallbackData.content?.[0]?.text || '';
        const fbParsed = extractHookVariants(fbText, hook_count);
        const fbExtras = await persistAgentOutput({
          responseText: fbParsed.body, agent_type, task, task_id,
          auto_draft, auto_visual, platform, content_type, campaign_id,
          hook_variants: fbParsed.variants,
          model: 'claude-3-5-sonnet-20241022'
        });
        return res.status(200).json({
          success: true, response: fbText,
          agent_type, task_id, model: 'claude-3-5-sonnet-20241022',
          ...fbExtras
        });
      }
      return res.status(502).json({ error: 'AI service error', details: errorData });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const parsed = extractHookVariants(text, hook_count);
    const extras = await persistAgentOutput({
      responseText: parsed.body, agent_type, task, task_id,
      auto_draft, auto_visual, platform, content_type, campaign_id,
      hook_variants: parsed.variants,
      model: 'claude-opus-4-5'
    });
    return res.status(200).json({
      success: true, response: text,
      agent_type, task_id, model: 'claude-opus-4-5', usage: data.usage || {},
      ...extras
    });
  } catch (err) {
    console.error('Agent handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

/**
 * Phase B: after an agent produces text, optionally:
 *  - log an agent_tasks row for provenance
 *  - insert a content_calendar draft with the copy text
 *  - generate a branded DALL-E image and attach it to the draft
 *
 * All steps are best-effort; failures are logged but don't break the agent call.
 */
/**
 * Phase F #8: pull hook variants out of the agent's JSON-shaped response.
 * Falls back to { variants:[], body: raw } if parsing fails.
 */
function extractHookVariants(text, requestedCount) {
  if (!requestedCount || requestedCount <= 1) return { variants: null, body: text };
  try {
    // Find first {...} block
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { variants: null, body: text };
    const obj = JSON.parse(m[0]);
    if (Array.isArray(obj.hook_variants) && obj.hook_variants.length > 1) {
      return { variants: obj.hook_variants.slice(0, 5), body: obj.body || text };
    }
  } catch (_) {}
  return { variants: null, body: text };
}

async function persistAgentOutput(ctx) {
  const out = { agent_task_id: null, content_item_id: null, image_url: null, media_asset_id: null };
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return out;

  const COPY_AGENTS = new Set(['copywriter', 'social_media', 'content_creator']);
  const shouldDraft = ctx.auto_draft && COPY_AGENTS.has(ctx.agent_type) && ctx.responseText;
  if (!shouldDraft) return out;

  // Auto-enable visual generation for platforms where imagery is essential.
  // Caller can override with auto_visual=false to skip.
  const VISUAL_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'youtube', 'reddit']);
  const effectiveAutoVisual = ctx.auto_visual !== undefined
    ? !!ctx.auto_visual
    : VISUAL_PLATFORMS.has(String(ctx.platform || 'instagram').toLowerCase());

  // 1. Log agent_tasks row (provenance)
  try {
    const agentTaskRow = {
      agent_type: ctx.agent_type,
      task: (ctx.task || '').slice(0, 2000),
      status: 'completed',
      input_data: { task: ctx.task, platform: ctx.platform, content_type: ctx.content_type },
      output_data: { text: ctx.responseText, model: ctx.model, task_id: ctx.task_id },
      completed_at: new Date().toISOString()
    };
    const r = await fetch(`${supabaseUrl}/rest/v1/agent_tasks`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify(agentTaskRow)
    });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      out.agent_task_id = Array.isArray(rows) ? (rows[0]?.id || null) : (rows?.id || null);
    }
  } catch (err) {
    logSilentFailure('persistAgentOutput.agent_tasks_insert', err, {
      agent: ctx.agent, user_id: ctx.user_id || null
    }, 'error');
  }

  // 2. Insert content_calendar draft row (+ auto-schedule to optimal platform slot)
  try {
    const firstLine = (ctx.responseText.split('\n').find(l => l.trim().length > 5) || 'Untitled draft').slice(0, 140);
    // Phase F #9: generate a URL-safe slug for public share cards
    const slug = firstLine.replace(/^[#*\s-]+/, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) +
      '-' + Math.random().toString(36).slice(2, 7);
    const platform = ctx.platform || 'instagram';

    // Sprint 1 #5: auto-schedule into the next optimal window for this platform
    let schedule = { date: null, time: null };
    try {
      const { resolveOptimalSlot } = require('./_lib/platform-formatter');
      schedule = resolveOptimalSlot(platform);
    } catch (_) { /* formatter missing — fall back to unscheduled */ }

    const draftRow = {
      title: firstLine.replace(/^[#*\s-]+/, ''),
      type: ctx.content_type || 'post',
      platform,
      // If the caller explicitly passed auto_schedule=false we drop to 'draft',
      // otherwise the AI output goes straight into 'scheduled' so the publish
      // runner can pick it up on the next cron tick.
      status: (ctx.auto_schedule === false) ? 'draft' : 'scheduled',
      scheduled_date: (ctx.auto_schedule === false) ? null : schedule.date,
      scheduled_time: (ctx.auto_schedule === false) ? null : schedule.time,
      approval_status: 'pending',     // #13: require approval by default
      copy_text: ctx.responseText,
      campaign_id: ctx.campaign_id || null,
      target_persona: ctx.persona || null,
      assigned_agent: ctx.agent_type,
      agent_task_id: out.agent_task_id,
      brand_version: 'v2',             // voice unified in Sprint 1
      slug,
      hook_variants: ctx.hook_variants || null
    };
    const r = await fetch(`${supabaseUrl}/rest/v1/content_calendar`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify(draftRow)
    });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      out.content_item_id = Array.isArray(rows) ? (rows[0]?.id || null) : (rows?.id || null);
    } else {
      const body = (await r.text().catch(() => '')).slice(0, 500);
      logSilentFailure('persistAgentOutput.content_calendar_insert', new Error(`HTTP ${r.status}: ${body}`), {
        agent: ctx.agent, user_id: ctx.user_id || null, status: r.status
      }, 'error');
    }
  } catch (err) {
    logSilentFailure('persistAgentOutput.content_calendar_insert', err, {
      agent: ctx.agent, user_id: ctx.user_id || null
    }, 'error');
  }

  // 3. Optionally generate + attach a branded visual
  if (effectiveAutoVisual && out.content_item_id) {
    try {
      const visualPrompt = `Scene for a tennis/pickleball social post. Copy: "${ctx.responseText.slice(0, 500)}"`;
      const size = (ctx.platform === 'instagram' || ctx.content_type === 'post') ? '1024x1024' : '1024x1792';
      const detail = await generateImage(visualPrompt, size, {
        returnDetail: true, contentItemId: out.content_item_id
      });
      if (detail?.url) {
        out.image_url = detail.url;
        out.media_asset_id = detail.assetId;
        const persisted = !!detail.assetId;
        out.image_persisted = persisted;
        await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${out.content_item_id}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal'
          },
          body: JSON.stringify({ image_url: detail.url, media_asset_id: detail.assetId, image_persisted: persisted, image_error: null })
        });
      } else {
        // Ticket #12: surface the failure so the UI shows a retry affordance
        const reason = detail?.error || 'image generation returned no URL';
        out.image_error = reason;
        await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${out.content_item_id}`, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ image_error: reason })
        });
      }
    } catch (err) {
      const reason = err?.message || String(err);
      console.warn('[persistAgentOutput] auto_visual failed:', reason);
      out.image_error = reason;
      try {
        await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${out.content_item_id}`, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ image_error: reason })
        });
      } catch (_) {}
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: regenerate-visual  — regenerate the image for an existing draft
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRegenerateVisual(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content_item_id, prompt_override, size } = req.body || {};
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id is required' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // Fetch the draft to get its copy as context
    const fetched = await supabaseGet(
      `${supabaseUrl}/rest/v1/content_calendar?id=eq.${content_item_id}&select=id,title,copy_text,platform,type&limit=1`,
      supabaseKey
    );
    const item = fetched?.[0];
    if (!item) return res.status(404).json({ error: 'Content item not found' });

    const basePrompt = String(prompt_override || '').trim() ||
      `Scene for a ${item.platform || 'instagram'} ${item.type || 'post'}. Copy: "${(item.copy_text || item.title || '').slice(0, 500)}"`;
    const imgSize = size || ((item.platform === 'instagram' || item.type === 'post') ? '1024x1024' : '1024x1792');

    const detail = await generateImage(basePrompt, imgSize, {
      returnDetail: true, contentItemId: content_item_id
    });
    if (!detail?.url) return res.status(502).json({ error: 'Image generation failed' });

    // Update the content_calendar row
    const persisted = !!detail.assetId;
    await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${content_item_id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ image_url: detail.url, media_asset_id: detail.assetId, image_persisted: persisted })
    });

    return res.status(200).json({
      success: true,
      content_item_id,
      image_url: detail.url,
      media_asset_id: detail.assetId,
      prompt_used: detail.promptUsed
    });
  } catch (err) {
    console.error('[regenerate-visual] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: save-draft  — create or update a content_calendar draft from the UI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSaveDraft(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const {
    id, title, type, platform, status, scheduled_date, scheduled_time,
    copy_text, image_url, campaign_id, approval_status
  } = req.body || {};

  const payload = {};
  if (title !== undefined) payload.title = title;
  if (type !== undefined) payload.type = type;
  if (platform !== undefined) payload.platform = platform;
  if (status !== undefined) payload.status = status;
  if (scheduled_date !== undefined) payload.scheduled_date = scheduled_date;
  if (scheduled_time !== undefined) payload.scheduled_time = scheduled_time;
  if (copy_text !== undefined) payload.copy_text = copy_text;
  if (image_url !== undefined) payload.image_url = image_url;
  if (campaign_id !== undefined) payload.campaign_id = campaign_id;
  if (approval_status !== undefined) payload.approval_status = approval_status;

  try {
    if (id) {
      const r = await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', Prefer: 'return=representation'
        },
        body: JSON.stringify(payload)
      });
      if (!r.ok) return res.status(r.status).json({ error: (await r.text()).slice(0, 200) });
      const rows = await r.json().catch(() => []);
      return res.status(200).json({ success: true, item: Array.isArray(rows) ? rows[0] : rows });
    }
    // Insert new
    if (!payload.title) payload.title = 'Untitled draft';
    if (!payload.type) payload.type = 'post';
    if (!payload.platform) payload.platform = 'instagram';
    if (!payload.status) payload.status = 'draft';
    const r = await fetch(`${supabaseUrl}/rest/v1/content_calendar`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) return res.status(r.status).json({ error: (await r.text()).slice(0, 200) });
    const rows = await r.json().catch(() => []);
    return res.status(201).json({ success: true, item: Array.isArray(rows) ? rows[0] : rows });
  } catch (err) {
    console.error('[save-draft] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: orchestrate
// ═══════════════════════════════════════════════════════════════════════════════

const WORKFLOW_CHAINS = {
  email_response: [
    { agent: 'copywriter', role: 'Draft the email reply' },
    { agent: 'ux_designer', role: 'Review for visual structure and suggest HTML formatting' },
    { agent: 'marketing_director', role: 'Final review — approve or request changes, confirm status' }
  ],
  social_post: [
    { agent: 'copywriter', role: 'Write caption, hashtags, and CTA' },
    { agent: 'content_creator', role: 'Write visual brief: image description, style direction, b-roll notes' },
    { agent: 'ux_designer', role: 'Review visual formatting, suggest improvements' },
    { agent: 'marketing_director', role: 'Approve and assign publish date and platform' }
  ],
  reel: [
    { agent: 'copywriter', role: 'Write hook, script, and voiceover copy' },
    { agent: 'content_creator', role: 'Full production brief: shot list, transitions, text overlays, audio notes' },
    { agent: 'ux_designer', role: 'Visual review: thumbnail, cover frame, text style' },
    { agent: 'marketing_director', role: 'Approve and schedule' }
  ],
  youtube_video: [
    { agent: 'copywriter', role: 'Write high-CTR title, description, chapters, and tags' },
    { agent: 'content_creator', role: 'Full script with intro hook, chapters, CTAs, b-roll notes, thumbnail brief' },
    { agent: 'ux_designer', role: 'Thumbnail design brief and end screen layout' },
    { agent: 'marketing_director', role: 'Approve and schedule publish date' }
  ],
  blog_post: [
    { agent: 'copywriter', role: 'Write SEO title, meta description, and full 800-word draft' },
    { agent: 'content_creator', role: 'Image briefs (hero, inline) and content structure suggestions' },
    { agent: 'ux_designer', role: 'Formatting review and CTA placement' },
    { agent: 'marketing_director', role: 'Final approval' }
  ],
  campaign_strategy: [
    { agent: 'marketing_director', role: 'Create full 30-day campaign strategy with a content map listing each deliverable (type, platform, date, goal, assigned agent)' }
  ]
};

function parseDeliverables(strategyText) {
  const jsonMatch = strategyText.match(/```json\s*([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.deliverables && Array.isArray(parsed.deliverables)) return parsed.deliverables;
    } catch (_) { /* fall through */ }
  }
  const deliverables = [];
  for (const line of strategyText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;
    const match = trimmed.match(/day\s+(\d+)[:\s]+(.+)/i);
    if (match) {
      deliverables.push({ day: parseInt(match[1], 10), description: match[2].trim(), type: 'social_post', platform: 'instagram', goal: 'engagement' });
    }
  }
  if (deliverables.length === 0) {
    deliverables.push({ day: 1, description: strategyText.substring(0, 200), type: 'social_post', platform: 'instagram', goal: 'brand_awareness' });
  }
  return deliverables;
}

function mapDeliverableToWorkflowType(type = '') {
  const t = type.toLowerCase().replace(/[_\s-]/g, '');
  if (t.includes('reel') || t.includes('tiktok') || t.includes('short')) return 'reel';
  if (t.includes('youtube') || t.includes('video')) return 'youtube_video';
  if (t.includes('blog') || t.includes('article')) return 'blog_post';
  if (t.includes('email')) return 'email_response';
  return 'social_post';
}

/**
 * Pollinations.ai free-tier image generator. No API key needed.
 * Returns the Pollinations URL directly — it serves the image bytes on GET,
 * and `persistGeneratedImage` will mirror those bytes into Supabase Storage.
 *
 * Size format here must be "WIDTHxHEIGHT" (we map 1024x1024 etc. to w/h params).
 */
function pollinationsUrl(prompt, size) {
  const [w, h] = String(size || '1024x1024').split('x').map(n => parseInt(n, 10) || 1024);
  const seed = Math.floor(Math.random() * 1000000);
  const encoded = encodeURIComponent(String(prompt || '').slice(0, 1800));
  // flux is the strongest free model on Pollinations as of 2026-04
  return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux&enhance=true`;
}

/**
 * Generate an image. Tries DALL-E 3 first (when OPENAI_API_KEY is set), then
 * falls back to Pollinations.ai (free, no API key required). In both cases the
 * image bytes are mirrored to Supabase Storage so the URL is permanent.
 *
 * Returns either:
 *   - a permanent public URL string (back-compat with existing callers), or
 *   - null on total failure (both providers failed).
 *
 * Pass `opts.returnDetail = true` to get `{ url, assetId, promptUsed, provider }`.
 */
async function generateImage(prompt, size, opts = {}) {
  size = size || '1024x1024';
  const brandedPrompt = brandImagePrompt(prompt);
  const apiKey = process.env.OPENAI_API_KEY;

  // ── Path 1: DALL-E 3 (if API key available) ─────────────────────────
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt: brandedPrompt.slice(0, 4000), n: 1, size, quality: 'standard' }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const ephemeralUrl = data.data?.[0]?.url || null;
        if (ephemeralUrl) {
          const persisted = await persistGeneratedImage(ephemeralUrl, {
            prompt: brandedPrompt,
            model: 'dall-e-3',
            contentItemId: opts.contentItemId || null
          });
          const finalUrl = persisted.url || ephemeralUrl;
          return opts.returnDetail
            ? { url: finalUrl, assetId: persisted.assetId, promptUsed: brandedPrompt, provider: 'dall-e-3' }
            : finalUrl;
        }
      } else {
        console.warn('[generateImage] DALL-E error:', res.status, '— falling back to Pollinations');
      }
    } catch (err) {
      console.warn('[generateImage] DALL-E exception:', err.message, '— falling back to Pollinations');
    }
  }

  // ── Path 2: Pollinations.ai (free fallback) ─────────────────────────
  try {
    const pollUrl = pollinationsUrl(brandedPrompt, size);
    // Pre-warm Pollinations so the image is generated before we mirror
    try {
      const warmCtl = new AbortController();
      const warmT = setTimeout(() => warmCtl.abort(), 30000);
      await fetch(pollUrl, { method: 'GET', signal: warmCtl.signal }).catch(() => null);
      clearTimeout(warmT);
    } catch (_) { /* best-effort warm */ }

    const persisted = await persistGeneratedImage(pollUrl, {
      prompt: brandedPrompt,
      model: 'pollinations-flux',
      contentItemId: opts.contentItemId || null
    });
    const finalUrl = persisted.url || pollUrl;
    return opts.returnDetail
      ? { url: finalUrl, assetId: persisted.assetId, promptUsed: brandedPrompt, provider: 'pollinations-flux' }
      : finalUrl;
  } catch (err) {
    console.warn('[generateImage] Pollinations failed:', err.message);
    return opts.returnDetail ? { url: null, assetId: null, provider: null } : null;
  }
}

function mapWorkflowTypeToCalendarType(workflowType) {
  const mapping = {
    social_post: 'post',
    reel: 'reel',
    youtube_video: 'video',
    blog_post: 'blog',
    email_response: 'email'
  };
  return mapping[workflowType] || 'content';
}

// Optimal posting times by platform (based on social media engagement research)
// Times in 24h format (EST/EDT). Multiple slots per platform for variety.
const OPTIMAL_POST_TIMES = {
  tiktok:    ['09:00', '12:00', '19:00'],           // Morning, lunch, evening
  instagram: ['08:00', '11:00', '14:00', '19:00'],  // Pre-work, mid-morning, afternoon, evening
  youtube:   ['14:00', '16:00'],                    // Afternoon for max first-24h views
  facebook:  ['09:00', '13:00', '16:00'],           // Morning, lunch, afternoon
  x:         ['09:00', '12:00', '17:00'],           // Pre-work, lunch, end-of-day
  twitter:   ['09:00', '12:00', '17:00'],
  reddit:    ['14:00', '17:00'],                    // r/tennis & r/pickleball peak
  blog:      ['10:00', '14:00'],
  email:     ['06:00', '10:00', '14:00']
};

// Optimal posting days by platform (0=Sun, 1=Mon, ... 6=Sat)
const OPTIMAL_POST_DAYS = {
  tiktok:    [2, 4, 6],        // Tue, Thu, Sat
  instagram: [1, 3, 5],        // Mon, Wed, Fri
  youtube:   [4, 6],           // Thu, Sat
  facebook:  [1, 3, 5],        // Mon, Wed, Fri
  x:         [1, 2, 3, 4, 5], // Weekdays
  twitter:   [1, 2, 3, 4, 5],
  reddit:    [1, 3, 5],        // Mon, Wed, Fri
  blog:      [2, 4],
  email:     [2, 4]
};

/**
 * Calculate the next optimal posting slot for a given platform.
 * @param {string} platform - e.g. 'instagram', 'tiktok'
 * @param {number} contentIndex - index of the content item (for spacing multiple items)
 * @param {Date} [baseDate] - starting date (defaults to now)
 * @returns {{ date: string, time: string }} ISO date string + HH:MM time
 */
function getOptimalPostSlot(platform, contentIndex = 0, baseDate = null) {
  const now = baseDate || new Date();
  const bestDays = OPTIMAL_POST_DAYS[platform] || [1, 3, 5];
  const bestTimes = OPTIMAL_POST_TIMES[platform] || ['10:00', '14:00'];

  // Start at least 2 days from now to allow review time
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 2);

  // Find the next optimal day, cycling through for multiple items
  let slotsFound = 0;
  const searchDate = new Date(startDate);
  let targetDate = null;
  let targetTime = null;

  // Search up to 30 days ahead
  for (let d = 0; d < 30 && slotsFound <= contentIndex; d++) {
    const dayOfWeek = searchDate.getDay();
    if (bestDays.includes(dayOfWeek)) {
      // Each optimal day can hold multiple time slots
      for (let t = 0; t < bestTimes.length && slotsFound <= contentIndex; t++) {
        if (slotsFound === contentIndex) {
          targetDate = new Date(searchDate);
          targetTime = bestTimes[t];
        }
        slotsFound++;
      }
    }
    searchDate.setDate(searchDate.getDate() + 1);
  }

  // Fallback: if we couldn't find enough slots, just space by 2 days
  if (!targetDate) {
    targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + contentIndex * 2);
    targetTime = bestTimes[contentIndex % bestTimes.length];
  }

  return {
    date: targetDate.toISOString().split('T')[0],
    time: targetTime
  };
}

async function runWorkflowChain(chain, title, context, campaignId, apiKey, contentIndex = 0) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const steps = [];
  let previousOutput = '';
  const contentItems = [];

  const contextString = [
    context.topic ? `Topic: ${context.topic}` : '',
    context.platform ? `Platform: ${context.platform}` : '',
    context.persona ? `Persona: ${context.persona}` : '',
    context.additional ? `Additional context: ${context.additional}` : ''
  ].filter(Boolean).join('\n');

  for (const step of chain) {
    const systemPrompt = SYSTEM_PROMPTS[step.agent];
    if (!systemPrompt) throw new Error(`Unknown agent: ${step.agent}`);

    let userMessage = `Task: ${step.role}\n\nContent title/brief: ${title}\n\n${contextString}`;
    if (previousOutput) userMessage += `\n\nPrevious step output:\n${previousOutput}`;
    userMessage += '\n\nKEEP YOUR RESPONSE TIGHT: ≤350 words. Skip fluff and meta-commentary; deliver the artifact only.';

    // Use Haiku 4.5 — fastest current model. Sonnet/Opus pushed each step to
    // 8-12s, hitting Vercel's 60s function timeout for 5-step chains.
    // Haiku finishes in 2-4s/step → 5 steps + image gen comfortably under 60s.
    const output = await callClaude(systemPrompt, userMessage, apiKey, 'claude-haiku-4-5-20251001');
    steps.push({ agent: step.agent, role: step.role, output });

    if (supabaseUrl && supabaseKey) {
      try {
        await supabaseInsert(supabaseUrl, supabaseKey, 'workflow_steps', {
          agent: step.agent, role: step.role, output, created_at: new Date().toISOString()
        });
      } catch (err) { console.warn('workflow_steps insert warning:', err.message); }
    }
    previousOutput = output;
  }

  const finalOutput = {
    copy: steps.find(s => s.agent === 'copywriter')?.output || '',
    visual_brief: steps.find(s => s.agent === 'content_creator')?.output || '',
    ux_review: steps.find(s => s.agent === 'ux_designer')?.output || '',
    approval: steps.find(s => s.agent === 'marketing_director')?.output || ''
  };

  const contentWorkflows = ['social_post', 'reel', 'youtube_video', 'blog_post'];
  const isContentWorkflow = contentWorkflows.some(wt => chain === WORKFLOW_CHAINS[wt] || chain.length > 1);

  if (isContentWorkflow && supabaseUrl && supabaseKey) {
    try {
      // Determine the correct content_calendar type
      const matchedWorkflow = contentWorkflows.find(wt => chain === WORKFLOW_CHAINS[wt]);
      const calendarType = matchedWorkflow ? mapWorkflowTypeToCalendarType(matchedWorkflow) : (context.platform ? 'post' : 'content');

      // Try to generate an image from the visual brief
      let imageUrl = null;
      if (finalOutput.visual_brief) {
        const briefText = finalOutput.visual_brief;
        const imgPrompt = 'Professional sports marketing image for SmartSwing AI tennis/pickleball platform. ' + briefText.slice(0, 500);
        imageUrl = await generateImage(imgPrompt, '1024x1024');
      }

      const platform = context.platform || 'instagram';
      const slot = getOptimalPostSlot(platform, contentIndex);
      const row = {
        title, type: calendarType,
        platform, status: 'draft',
        scheduled_date: slot.date,
        scheduled_time: slot.time,
        copy_text: finalOutput.copy || previousOutput,
        image_url: imageUrl,
        assigned_agent: chain[chain.length - 1].agent,
        approval_status: 'pending',
        created_at: new Date().toISOString()
      };
      // Only include campaign_id if it's a valid existing campaign reference
      if (campaignId) row.campaign_id = campaignId;
      else if (context.campaign_id) row.campaign_id = context.campaign_id;
      const calendarItem = await supabaseInsert(supabaseUrl, supabaseKey, 'content_calendar', row);
      contentItems.push(calendarItem);
    } catch (err) { console.warn('content_calendar insert warning:', err.message); }
  }

  return { steps, finalOutput, contentItems };
}

async function handleOrchestrate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { workflow_type, title, context = {} } = req.body || {};
  if (!workflow_type) return res.status(400).json({ error: 'workflow_type is required' });
  if (!title) return res.status(400).json({ error: 'title is required' });

  const supabase_url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const validWorkflows = Object.keys(WORKFLOW_CHAINS);
  if (!validWorkflows.includes(workflow_type)) {
    return res.status(400).json({ error: `Invalid workflow_type. Must be one of: ${validWorkflows.join(', ')}` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const workflowId = generateUUID();

  try {
    let allSteps = [];
    let allContentItems = [];
    let finalOutput = {};
    let status = 'pending';

    if (workflow_type === 'campaign_strategy') {
      const { steps: strategySteps, finalOutput: strategyOutput } = await runWorkflowChain(
        WORKFLOW_CHAINS.campaign_strategy, title, context, null, apiKey
      );
      allSteps.push(...strategySteps);
      finalOutput = strategyOutput;

      const deliverables = parseDeliverables(strategySteps[0]?.output || '');
      for (let i = 0; i < deliverables.length; i++) {
        const d = deliverables[i];
        const subWorkflowType = mapDeliverableToWorkflowType(d.type);
        const subChain = WORKFLOW_CHAINS[subWorkflowType];
        const subTitle = d.description || `${d.type} — Day ${d.day || i + 1}`;
        const subContext = { ...context, platform: d.platform || context.platform || 'instagram', topic: d.goal || d.description || context.topic };
        try {
          const { steps: subSteps, contentItems: subItems } = await runWorkflowChain(
            subChain, subTitle, subContext, workflowId, apiKey, i
          );
          allSteps.push(...subSteps);
          allContentItems.push(...subItems);
        } catch (subErr) { console.warn(`Sub-workflow ${i + 1} failed:`, subErr.message); }
      }
    } else {
      const chain = WORKFLOW_CHAINS[workflow_type];
      const { steps, finalOutput: fo, contentItems } = await runWorkflowChain(
        chain, title, context, context.campaign_id || null, apiKey
      );
      allSteps = steps;
      finalOutput = fo;
      allContentItems = contentItems;
      status = 'pending';
    }

    if (supabase_url && supabase_key) {
      try {
        await supabaseInsert(supabase_url, supabase_key, 'orchestration_workflows', {
          id: workflowId, workflow_type, title, context: JSON.stringify(context),
          status, steps: JSON.stringify(allSteps),
          content_items_created: JSON.stringify(allContentItems),
          created_at: new Date().toISOString()
        });
      } catch (err) { console.warn('orchestration_workflows insert warning:', err.message); }
    }

    return res.status(200).json({
      success: true, workflow_id: workflowId, workflow_type,
      steps: allSteps, final_output: finalOutput,
      content_items_created: allContentItems, status
    });
  } catch (err) {
    console.error('Orchestrate handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: bulk-delete-contacts
// Accepts { ids: string[] } — deletes in chunks of 200 using the service role key
// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE AI AD COPY — powered by Claude
// POST /api/marketing/generate-ai-copy
// Body: { prompt: string, type: string }
// Returns: { response: string }
// ═══════════════════════════════════════════════════════════════════════════════

async function handleGenerateAiCopy(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, type = 'ad_copy' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const systemPrompt = `You are an elite performance marketing copywriter for SmartSwing AI — an AI-powered tennis and pickleball swing analysis platform. Brand aesthetic: "Nike meets Apple for tennis" — bold, premium, aspirational. Every word earns its place. No filler. No generic phrases. Return only valid JSON.`;

  const payload = {
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    system: systemPrompt
  };

  try {
    let response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok && (response.status === 404 || response.status === 400)) {
      payload.model = 'claude-3-5-sonnet-20241022';
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Claude API error' });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    return res.status(200).json({ response: content, type });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK DELETE CONTACTS
// to bypass RLS. Returns { deleted, failed, errors[] }.
// ═══════════════════════════════════════════════════════════════════════════════

async function handleBulkDeleteContacts(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });

  // Only allow real UUIDs — strip any local_ demo IDs
  const uuids = ids.filter(id => /^[0-9a-f-]{36}$/i.test(String(id)));
  if (!uuids.length) return res.status(200).json({ deleted: 0, failed: 0, errors: [] });

  const CHUNK = 200;
  let deleted = 0;
  const errors = [];

  for (let i = 0; i < uuids.length; i += CHUNK) {
    const chunk = uuids.slice(i, i + CHUNK);
    // PostgREST bulk delete: DELETE /rest/v1/marketing_contacts?id=in.(uuid1,uuid2,...)
    const filter = chunk.map(id => encodeURIComponent(id)).join(',');
    const url = `${supabaseUrl}/rest/v1/marketing_contacts?id=in.(${filter})`;
    try {
      const r = await fetch(url, {
        method: 'DELETE',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        }
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        errors.push({ chunk: i / CHUNK, status: r.status, detail: txt.slice(0, 200) });
      } else {
        deleted += chunk.length;
      }
    } catch (err) {
      errors.push({ chunk: i / CHUNK, detail: err.message });
    }
  }

  return res.status(200).json({ deleted, failed: uuids.length - deleted, errors });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: enroll-cadence
// ═══════════════════════════════════════════════════════════════════════════════

async function handleEnrollCadence(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { contact_id, cadence_id, campaign_id, supabase_url: clientUrl, supabase_key: clientKey } = req.body || {};
  if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });
  if (!cadence_id) return res.status(400).json({ error: 'cadence_id is required' });
  // Prefer server-side env vars (service role = full write access); fall back to client-passed anon key
  const supabase_url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || clientUrl;
  const supabase_key = process.env.SUPABASE_SERVICE_ROLE_KEY || clientKey;
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'Supabase not configured — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });

  const now = new Date().toISOString();

  try {
    // Resolve cadence name from either new `cadences` table or legacy `email_cadences`
    let cadenceName = cadence_id;
    try {
      let cadences = await supabaseGet(`${supabase_url}/rest/v1/email_cadences?id=eq.${cadence_id}&select=id,name&limit=1`, supabase_key);
      if (!cadences?.length) {
        cadences = await supabaseGet(`${supabase_url}/rest/v1/cadences?id=eq.${cadence_id}&select=id,name&limit=1`, supabase_key);
      }
      if (cadences?.length) cadenceName = cadences[0].name || cadence_id;
    } catch (err) { console.warn('[enroll-cadence] cadence metadata lookup failed (non-fatal):', err.message); }

    // Guard: already enrolled in this cadence?
    const existing = await supabaseGet(
      `${supabase_url}/rest/v1/contact_cadence_enrollments?contact_id=eq.${contact_id}&cadence_id=eq.${cadence_id}&status=eq.active&select=id&limit=1`,
      supabase_key
    );
    if (existing?.length) {
      return res.status(200).json({
        success: true, already_enrolled: true, enrollment_id: existing[0].id,
        contact_id, cadence_id, cadence_name: cadenceName,
        message: 'Contact is already actively enrolled in this cadence.'
      });
    }

    // Fetch contact record to determine available channels
    let contactRecord = null;
    try {
      const contactRows = await supabaseGet(
        `${supabase_url}/rest/v1/marketing_contacts?id=eq.${contact_id}&select=email,phone,stage&limit=1`,
        supabase_key
      );
      contactRecord = contactRows?.[0] || null;
    } catch (err) { console.warn('[enroll-cadence] contact lookup failed (non-fatal):', err.message); }

    const isFederationEmail = contactRecord?.email && contactRecord.email.includes('@federation-record.');
    const hasRealEmail = contactRecord?.email && !isFederationEmail;
    const hasPhone = !!(contactRecord?.phone && String(contactRecord.phone).trim().length > 4);

    const allEmailSteps = await supabaseGet(`${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${cadence_id}&order=sequence_num`, supabase_key) || [];
    const allSmsSteps   = await supabaseGet(`${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${cadence_id}&order=sequence_num`, supabase_key) || [];
    // WhatsApp steps (may not exist yet — graceful fallback)
    let allWhatsappSteps = [];
    try { allWhatsappSteps = await supabaseGet(`${supabase_url}/rest/v1/cadence_whatsapp?cadence_id=eq.${cadence_id}&order=sequence_num`, supabase_key) || []; } catch (_) {}

    // Only include steps the contact can actually receive
    const emailSteps    = hasRealEmail ? allEmailSteps : [];
    const smsSteps      = hasPhone     ? allSmsSteps   : [];
    const whatsappSteps = hasPhone     ? allWhatsappSteps : [];

    const skippedChannels = [];
    if (!hasRealEmail && allEmailSteps.length > 0) skippedChannels.push(`email (${allEmailSteps.length} steps skipped — no valid email)`);
    if (!hasPhone     && allSmsSteps.length > 0)   skippedChannels.push(`SMS (${allSmsSteps.length} steps skipped — no phone number)`);
    if (!hasPhone     && allWhatsappSteps.length > 0) skippedChannels.push(`WhatsApp (${allWhatsappSteps.length} steps skipped — no phone number)`);

    const enrollmentId = generateUUID();

    // Build step executions FIRST so we know what we're committing.
    // DB columns: step_type, step_num (NOT type/sequence_num).
    const executions = [];
    for (const step of emailSteps) {
      executions.push({
        id: generateUUID(), enrollment_id: enrollmentId, contact_id, cadence_id,
        step_type: 'email', step_num: step.sequence_num,
        subject: step.subject || null,
        body: step.body_html || step.body_text || null,
        message: null,
        status: 'pending', scheduled_at: addDays(now, step.delay_days || 0),
        attempt_count: 0, created_at: now
      });
    }
    for (const step of smsSteps) {
      executions.push({
        id: generateUUID(), enrollment_id: enrollmentId, contact_id, cadence_id,
        step_type: 'sms', step_num: step.sequence_num,
        subject: null, body: null,
        message: step.message || null,
        status: 'pending', scheduled_at: addDays(now, step.delay_days || 0),
        attempt_count: 0, created_at: now
      });
    }
    for (const step of whatsappSteps) {
      executions.push({
        id: generateUUID(), enrollment_id: enrollmentId, contact_id, cadence_id,
        step_type: 'whatsapp', step_num: step.sequence_num,
        subject: null, body: null,
        message: step.template_name ? `template:${step.template_name}` : (step.message || null),
        status: 'pending', scheduled_at: addDays(now, step.delay_days || 0),
        attempt_count: 0, created_at: now
      });
    }
    executions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    // Compute first scheduled_at across ALL channels (not just email + sms — WhatsApp may be earliest).
    const firstNextAt = executions.length > 0 ? executions[0].scheduled_at : now;

    // Insert enrollment row
    await supabaseInsert(supabase_url, supabase_key, 'contact_cadence_enrollments', {
      id: enrollmentId, contact_id, cadence_id, status: 'active',
      current_step: 1, next_step_at: firstNextAt, enrolled_at: now, created_at: now
    });

    // Insert steps with rollback safety: if bulk insert fails, delete the enrollment
    // so we don't leave an orphan that the cron can never advance.
    if (executions.length > 0) {
      try {
        await supabaseBulkInsert(supabase_url, supabase_key, 'cadence_step_executions', executions);
      } catch (insertErr) {
        // Roll back the enrollment row — surface the underlying step-insert error so the caller knows what to fix
        try {
          await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments?id=eq.${enrollmentId}`, {
            method: 'DELETE',
            headers: { apikey: supabase_key, Authorization: `Bearer ${supabase_key}`, Prefer: 'return=minimal' }
          });
        } catch (cleanupErr) { console.error('[enroll-cadence] cleanup of orphan enrollment failed:', cleanupErr.message); }
        return res.status(500).json({
          error: 'Step insertion failed — enrollment rolled back to prevent orphan.',
          details: insertErr.message,
          steps_attempted: executions.length,
          step_breakdown: { email: emailSteps.length, sms: smsSteps.length, whatsapp: whatsappSteps.length }
        });
      }
    }

    // Promote contact: stage = 'lead' so they move from Contacts tab → Leads tab.
    // Done with fetch (PATCH) since supabaseInsert is POST-only.
    try {
      await fetch(`${supabase_url}/rest/v1/marketing_contacts?id=eq.${contact_id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabase_key, Authorization: `Bearer ${supabase_key}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ stage: 'lead', updated_at: now })
      });
    } catch (err) {
      console.warn('[enroll-cadence] stage promotion failed (non-fatal):', err.message);
    }

    // Log journey entry — include campaign_id if one was passed alongside the cadence
    try {
      const journeyRow = {
        contact_id, stage: 'lead', entered_at: now, cadence_id,
        notes: `Enrolled in ${cadenceName} (${executions.length} steps)`
      };
      if (campaign_id) journeyRow.campaign_id = campaign_id;
      await supabaseInsert(supabase_url, supabase_key, 'contact_journeys', journeyRow);
    } catch (err) { /* contact_journeys may not exist in all envs */ }

    const schedule = executions.map((exec) => ({
      step: exec.step_num, type: exec.step_type,
      subject: exec.subject,
      preview: (exec.body || exec.message || '').substring(0, 120),
      scheduled_at: exec.scheduled_at, status: 'pending'
    }));

    return res.status(200).json({
      success: true, enrollment_id: enrollmentId,
      contact_id, cadence_id, cadence_name: cadenceName,
      campaign_id: campaign_id || null,
      stage: 'lead',
      steps_scheduled: executions.length,
      step_breakdown: {
        email: emailSteps.length,
        sms: smsSteps.length,
        whatsapp: whatsappSteps.length
      },
      skipped_channels: skippedChannels,
      next_step_at: firstNextAt,
      current_step: 1, total_steps: executions.length,
      schedule
    });
  } catch (err) {
    console.error('[enroll-cadence] handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: cadences-list — active cadences for enroll dropdown
// Fixes the "empty cadence dropdown" bug by sourcing from email_cadences (not a
// non-existent 'cadences' table).
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCadencesList(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supabase_url = req.query.supabase_url || (req.body && req.body.supabase_url);
  const supabase_key = req.query.supabase_key || (req.body && req.body.supabase_key);
  if (!supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  }
  try {
    // Count steps per cadence for the UI "X emails + Y SMS"
    const cadences = await supabaseGet(
      `${supabase_url}/rest/v1/email_cadences?is_active=eq.true&select=id,name,methodology,target_persona,description,is_active&order=name`,
      supabase_key
    );
    // Hydrate step counts
    const withCounts = await Promise.all((cadences || []).map(async c => {
      try {
        const [emails, sms] = await Promise.all([
          supabaseGet(`${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${c.id}&select=id`, supabase_key),
          supabaseGet(`${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${c.id}&select=id`, supabase_key)
        ]);
        return { ...c, email_steps: (emails || []).length, sms_steps: (sms || []).length, total_steps: (emails || []).length + (sms || []).length };
      } catch { return { ...c, email_steps: 0, sms_steps: 0, total_steps: 0 }; }
    }));
    return res.status(200).json({ success: true, cadences: withCounts, count: withCounts.length });
  } catch (err) {
    console.error('cadences-list error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: opt-out-enrollment
// ═══════════════════════════════════════════════════════════════════════════════

async function handleOptOutEnrollment(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { enrollment_id, reason, supabase_url, supabase_key } = req.body || {};
  if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id is required' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  try {
    const ok = await supabaseRpc(supabase_url, supabase_key, 'opt_out_enrollment', {
      p_enrollment_id: enrollment_id,
      p_reason: reason || 'manual'
    });
    return res.status(200).json({ success: ok === true || ok === 'true', enrollment_id });
  } catch (err) {
    console.error('opt-out-enrollment error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: cadence-cta-redirect
// Link-click tracker. Cadence emails/SMS use a URL like:
//   https://.../api/marketing/cadence-cta-redirect?e=<enrollment_id>&u=<destination>
// This logs the click via record_cadence_cta_click RPC (removes from active,
// logs history), then 302s to the real destination.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: verify-gate — server-side check for the marketing.html security gate
// ═══════════════════════════════════════════════════════════════════════════════
// Compares the user-entered code against MARKETING_GATE_CODE env var (server-side
// only — never shipped to client). Issues a short-lived signed token (HMAC-SHA256
// of payload + MARKETING_GATE_CODE as key) so the client can prove gate passage
// across requests for ~8h without storing the actual code anywhere reachable.
//
// Replaces the previous client-side hardcoded '182410' fallback + localStorage
// override that any user could read/manipulate from devtools.

const crypto = require('crypto');
const MARKETING_GATE_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function signMarketingToken(secret, expiresAt) {
  const payload = `mkt|${expiresAt}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}|${sig}`;
}

function verifyMarketingToken(secret, token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('|');
  if (parts.length !== 3 || parts[0] !== 'mkt') return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expectedSig = crypto.createHmac('sha256', secret).update(`mkt|${expiresAt}`).digest('hex').slice(0, 32);
  // Constant-time compare to thwart timing attacks
  try { return crypto.timingSafeEqual(Buffer.from(parts[2], 'hex'), Buffer.from(expectedSig, 'hex')); }
  catch (_) { return false; }
}

/**
 * GET /api/marketing/error-log?limit=50&unresolved_only=1
 * Returns recent rows from api_error_log so the dashboard can surface
 * previously-silent failures for triage.
 */
async function handleErrorLog(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 500);
  const unresolvedOnly = String(req.query.unresolved_only || '').match(/^(1|true|yes)$/i);

  let qs = `select=*&order=occurred_at.desc&limit=${limit}`;
  if (unresolvedOnly) qs += '&resolved=eq.false';

  try {
    const r = await fetch(`${url}/rest/v1/api_error_log?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Supabase query failed', details: body.slice(0, 500) });
    }
    const rows = await r.json();
    return res.status(200).json({ count: rows.length, unresolved_only: !!unresolvedOnly, rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleVerifyGate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const expected = String(process.env.MARKETING_GATE_CODE || '').trim();
  if (!expected) {
    return res.status(500).json({
      error: 'Marketing gate not configured. Set MARKETING_GATE_CODE in Vercel env vars.'
    });
  }
  const submitted = String((req.body && req.body.code) || '').trim();
  if (!submitted || submitted.length < 4) {
    return res.status(400).json({ error: 'Code is required.' });
  }
  // Constant-time string compare — prevents timing-based brute-force on short codes
  let match = false;
  try {
    const a = Buffer.from(submitted);
    const b = Buffer.from(expected);
    match = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) { match = false; }
  if (!match) return res.status(401).json({ error: 'Invalid code.' });

  const expiresAt = Date.now() + MARKETING_GATE_TOKEN_TTL_MS;
  const token = signMarketingToken(expected, expiresAt);
  return res.status(200).json({ token, expires_at: expiresAt });
}

// Allowlist for redirect destinations — anything outside these hosts is rejected
// to prevent SmartSwing-branded URLs from being weaponized for phishing.
const CTA_REDIRECT_ALLOWED_HOSTS = new Set([
  'www.smartswingai.com',
  'smartswingai.com',
  'app.smartswingai.com',
  'analyze.smartswingai.com',
  'pay.smartswingai.com',
  // Stripe hosted checkout (we sometimes deep-link)
  'checkout.stripe.com',
  'billing.stripe.com',
  // Cal.com booking (B2B demo path)
  'cal.com',
  // YouTube + Vimeo for embedded video CTAs
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com'
]);

function isAllowedRedirectTarget(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return CTA_REDIRECT_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function handleCadenceCtaRedirect(req, res) {
  const e = req.query.e;
  const u = req.query.u;
  if (!e || !u) return res.status(400).json({ error: 'Missing e (enrollment_id) or u (destination)' });

  // Reject anything outside the SmartSwing-controlled host allowlist.
  // Without this, anyone can craft https://www.smartswingai.com/api/marketing/cadence-cta-redirect?e=X&u=https://evil.example.com
  // and the SmartSwing-branded URL will redirect prospects to attacker-controlled domains.
  if (!isAllowedRedirectTarget(u)) {
    return res.status(400).json({
      error: 'Destination URL is not in the allowed redirect host list.',
      hint: 'Add the host to CTA_REDIRECT_ALLOWED_HOSTS in api/marketing.js if it should be permitted.'
    });
  }

  const supabase_url = process.env.SUPABASE_URL;
  const supabase_key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  try {
    if (supabase_url && supabase_key) {
      await supabaseRpc(supabase_url, supabase_key, 'record_cadence_cta_click', {
        p_enrollment_id: e,
        p_cta_url: u
      }).catch(err => console.warn('CTA click RPC failed (non-fatal):', err.message));
    }
  } finally {
    // Always redirect — never strand the user (now safe: target validated above)
    res.writeHead(302, { Location: u });
    res.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: enrollments-list — feeds the Enrollments tab
// ═══════════════════════════════════════════════════════════════════════════════

async function handleEnrollmentsList(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supabase_url = req.query.supabase_url || (req.body && req.body.supabase_url);
  const supabase_key = req.query.supabase_key || (req.body && req.body.supabase_key);
  const cadence_id   = req.query.cadence_id;
  if (!supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  }
  try {
    let qs = 'select=*&order=enrolled_at.desc';
    if (cadence_id) qs += `&cadence_id=eq.${cadence_id}`;
    const rows = await supabaseGet(`${supabase_url}/rest/v1/v_active_enrollments?${qs}`, supabase_key);
    // Group by cadence for the UI
    const grouped = {};
    (rows || []).forEach(r => {
      const key = r.cadence_id || 'unknown';
      if (!grouped[key]) grouped[key] = { cadence_id: key, cadence_name: r.cadence_name, methodology: r.methodology, rows: [] };
      grouped[key].rows.push(r);
    });
    return res.status(200).json({
      success: true,
      total: (rows || []).length,
      enrollments: rows || [],
      grouped: Object.values(grouped)
    });
  } catch (err) {
    console.error('enrollments-list error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: enrollment-timeline — returns full step history for one enrollment
// ═══════════════════════════════════════════════════════════════════════════════
async function handleEnrollmentTimeline(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const enrollment_id = String(req.query?.enrollment_id || '').trim();
  const supabase_url = String(req.query?.supabase_url || '').trim();
  const supabase_key = String(req.query?.supabase_key || '').trim();
  if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id is required' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  try {
    const enrollments = await supabaseGet(
      `${supabase_url}/rest/v1/contact_cadence_enrollments?id=eq.${enrollment_id}&select=*&limit=1`,
      supabase_key
    );
    const steps = await supabaseGet(
      `${supabase_url}/rest/v1/cadence_step_executions?enrollment_id=eq.${enrollment_id}&order=scheduled_at.asc`,
      supabase_key
    );
    return res.status(200).json({
      enrollment: enrollments?.[0] || null,
      steps: steps || []
    });
  } catch (err) {
    console.error('[enrollment-timeline] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: contact-history — feeds the History tab
// ═══════════════════════════════════════════════════════════════════════════════

async function handleContactHistory(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supabase_url = req.query.supabase_url || (req.body && req.body.supabase_url);
  const supabase_key = req.query.supabase_key || (req.body && req.body.supabase_key);
  const contact_id   = req.query.contact_id;
  const limit        = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  if (!supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  }
  try {
    let qs = `select=*&order=occurred_at.desc&limit=${limit}`;
    if (contact_id) qs += `&contact_id=eq.${contact_id}`;
    const rows = await supabaseGet(`${supabase_url}/rest/v1/v_contact_history?${qs}`, supabase_key);
    return res.status(200).json({ success: true, count: (rows || []).length, events: rows || [] });
  } catch (err) {
    console.error('contact-history error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: unenroll-cadence — pause/complete an enrollment, restore contact stage
// ═══════════════════════════════════════════════════════════════════════════════
async function handleUnenrollCadence(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { enrollment_id, supabase_url, supabase_key, reason } = req.body || {};
  if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id is required' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  const now = new Date().toISOString();
  try {
    // Mark enrollment cancelled
    await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments?id=eq.${enrollment_id}`, {
      method: 'PATCH',
      headers: { apikey: supabase_key, Authorization: `Bearer ${supabase_key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'cancelled', completed_at: now })
    });
    // Skip any pending steps
    await fetch(`${supabase_url}/rest/v1/cadence_step_executions?enrollment_id=eq.${enrollment_id}&status=eq.pending`, {
      method: 'PATCH',
      headers: { apikey: supabase_key, Authorization: `Bearer ${supabase_key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'skipped', skipped_reason: reason || 'unenrolled' })
    });
    return res.status(200).json({ success: true, enrollment_id, status: 'cancelled' });
  } catch (err) {
    console.error('[unenroll-cadence] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: update-step — edit a single pending step execution (subject/body/time)
// ═══════════════════════════════════════════════════════════════════════════════
async function handleUpdateStep(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { step_id, supabase_url, supabase_key, patch } = req.body || {};
  if (!step_id) return res.status(400).json({ error: 'step_id is required' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'patch object is required' });

  // Allow only safe fields
  const allowed = ['subject', 'body', 'message', 'scheduled_at', 'status'];
  const safe = {};
  for (const k of allowed) if (k in patch) safe[k] = patch[k];
  if (safe.status && !['pending', 'skipped', 'cancelled'].includes(safe.status)) {
    return res.status(400).json({ error: 'status must be pending, skipped, or cancelled' });
  }
  if (!Object.keys(safe).length) return res.status(400).json({ error: 'no valid fields in patch' });

  try {
    const resp = await fetch(`${supabase_url}/rest/v1/cadence_step_executions?id=eq.${step_id}&status=eq.pending`, {
      method: 'PATCH',
      headers: { apikey: supabase_key, Authorization: `Bearer ${supabase_key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(safe)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: 'Supabase PATCH failed', detail: text.slice(0, 300) });
    }
    const rows = await resp.json();
    if (!rows.length) return res.status(409).json({ error: 'Step is not pending (may have already sent or been skipped).' });
    return res.status(200).json({ success: true, step: rows[0] });
  } catch (err) {
    console.error('[update-step] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: lite-signup
// ═══════════════════════════════════════════════════════════════════════════════
// Email + first name + marketing-consent capture BEFORE first analysis.
// Lower friction than full signup (no password), captures the lead immediately
// for prospecting + tracks usage from day 1 + sends a magic link for return.
//
// Flow:
//  1. Validate email + first_name + marketing_consent (LGPD/GDPR clean)
//  2. Upsert into marketing_contacts (stage='lead', source='analyze_lite_signup')
//  3. Send magic link via Supabase Auth /auth/v1/otp (creates account if new)
//  4. Enroll in "New Lead — Tennis Player" cadence so the intro email/WhatsApp
//     fires within minutes
//  5. Return contact_id so analyze.html can stash it in sessionStorage and
//     associate the upcoming analysis with this lead
// ═══════════════════════════════════════════════════════════════════════════════

const NEW_LEAD_TENNIS_CADENCE_ID = 'a1000001-0000-0000-0000-000000000001';

async function handleLiteSignup(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email, first_name,
    marketing_consent,            // LGPD/GDPR — required to be true
    persona, source,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    page_url, referrer, landing_page, session_id,
    ref_code                      // two-sided referral (M12) — propagates bonus to both parties
  } = req.body || {};

  // Input validation
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanFirstName = String(first_name || '').trim().slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }
  if (!cleanFirstName || cleanFirstName.length < 1) {
    return res.status(400).json({ error: 'First name required.' });
  }
  if (marketing_consent !== true) {
    return res.status(400).json({
      error: 'Marketing consent required. Tick the consent box to receive your analysis report and follow-ups.'
    });
  }

  const supabase_url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anon_key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const service_key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabase_url || !service_key) {
    return res.status(500).json({ error: 'Supabase not configured server-side.' });
  }

  const result = { success: false, contact_id: null, magic_link_sent: false, enrolled: false, errors: {} };

  // 1. Upsert marketing_contacts (idempotent — won't duplicate if email exists)
  try {
    const existing = await supabaseGet(
      `${supabase_url}/rest/v1/marketing_contacts?email=eq.${encodeURIComponent(cleanEmail)}&select=id,stage&limit=1`,
      service_key
    );
    if (existing && existing.length > 0) {
      result.contact_id = existing[0].id;
      // Already a contact — just refresh updated_at + ensure stage is at least 'lead'
      await fetch(`${supabase_url}/rest/v1/marketing_contacts?id=eq.${result.contact_id}`, {
        method: 'PATCH',
        headers: {
          apikey: service_key, Authorization: `Bearer ${service_key}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
    } else {
      const persona_val = persona || 'player';
      const contactRow = {
        email: cleanEmail,
        name: cleanFirstName,
        persona: persona_val,
        stage: 'lead',
        player_type: 'player',
        data_source: 'analyze_lite_signup',
        consent_status: 'opt_in',
        source: source || 'analyze_page',
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_term: utm_term || null,
        utm_content: utm_content || null,
        page_url: page_url || null,
        referrer: referrer || null,
        landing_page: landing_page || null,
        session_id: session_id || null,
        tags: `{lite_signup,analyze,${utm_source || 'direct'}}`,
        notes: `Lite signup before first analysis. Marketing consent: yes (LGPD/GDPR opt-in).`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      try { contactRow.lead_score = scoreContact(contactRow, {}); contactRow.last_scored_at = new Date().toISOString(); } catch (_) {}
      const inserted = await supabaseInsert(supabase_url, service_key, 'marketing_contacts', contactRow);
      result.contact_id = inserted?.id || inserted?.[0]?.id || null;
    }
  } catch (err) {
    result.errors.contact = err.message;
    return res.status(500).json({ error: 'Failed to create contact', details: err.message });
  }

  // 2. Send magic link via Supabase Auth (non-blocking — we still return success even if email send fails)
  if (anon_key) {
    try {
      const otpRes = await fetch(`${supabase_url}/auth/v1/otp`, {
        method: 'POST',
        headers: { apikey: anon_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          create_user: true,
          data: { first_name: cleanFirstName, marketing_consent: true, source: 'analyze_lite_signup' },
          options: { emailRedirectTo: 'https://www.smartswingai.com/auth-callback.html' }
        })
      });
      result.magic_link_sent = otpRes.ok;
      if (!otpRes.ok) {
        const txt = await otpRes.text().catch(() => '');
        result.errors.magic_link = `${otpRes.status}: ${txt.slice(0, 200)}`;
      }
    } catch (err) {
      result.errors.magic_link = err.message;
    }
  }

  // 3. Enroll in default tennis-player cadence — fires intro email + WhatsApp (auto-routed) within minutes
  try {
    const enrollRes = await fetch(
      `${supabase_url}/rest/v1/contact_cadence_enrollments?contact_id=eq.${result.contact_id}&cadence_id=eq.${NEW_LEAD_TENNIS_CADENCE_ID}&status=eq.active&select=id&limit=1`,
      { headers: { apikey: service_key, Authorization: `Bearer ${service_key}` } }
    );
    const existingEnrollments = await enrollRes.json().catch(() => []);
    if (Array.isArray(existingEnrollments) && existingEnrollments.length === 0) {
      const enrollHttpRes = await fetch(`${process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com'}/api/marketing/enroll-cadence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: result.contact_id, cadence_id: NEW_LEAD_TENNIS_CADENCE_ID })
      });
      result.enrolled = enrollHttpRes.ok;
      if (!enrollHttpRes.ok) {
        result.errors.enrollment = `${enrollHttpRes.status}: ${(await enrollHttpRes.text().catch(()=>'')).slice(0, 200)}`;
      }
    } else {
      result.enrolled = true; // already enrolled — count as success
    }
  } catch (err) {
    result.errors.enrollment = err.message;
  }

  // Two-sided referral (M12) — if a ref_code was passed, log it in referral_attributions
  // so the client-side applyReferralBonus() can credit both parties on first-analysis completion.
  // We don't apply the bonus here because the referee might abandon before their first upload.
  // The cron-side completion handler (or app-data.js on-client) grants the bonus when the
  // referred user completes their first real analysis.
  const cleanRefCode = String(ref_code || '').trim().toUpperCase();
  if (cleanRefCode && /^[A-Z0-9]{5,8}$/.test(cleanRefCode) && result.contact_id) {
    try {
      await fetch(`${supabase_url}/rest/v1/marketing_contacts?id=eq.${result.contact_id}`, {
        method: 'PATCH',
        headers: {
          apikey: service_key, Authorization: `Bearer ${service_key}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          referral_code_used: cleanRefCode,
          notes: `Lite signup via ref=${cleanRefCode}. LGPD/GDPR opt-in.`
        })
      });
      result.referral_code = cleanRefCode;
    } catch (refErr) {
      result.errors.referral = refErr.message;
    }
  }

  result.success = !!result.contact_id;
  return res.status(200).json(result);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: capture-lead
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCaptureLead(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email, name, phone, persona, source,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    page_url, referrer, landing_page, session_id,
    player_type, notes
  } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase_url || !supabase_key) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // Build lead row with full UTM + attribution tracking
    const leadRow = {
      email,
      name,
      phone,
      persona: persona || 'player',
      source: source || 'website',
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      page_url: page_url || null,
      referrer: referrer || null,
      landing_page: landing_page || null,
      session_id: session_id || null,
      player_type: player_type || null,
      consent_status: 'opt_in',  // They submitted the form voluntarily
      notes
    };

    // Remove null/undefined keys for cleaner insert
    Object.keys(leadRow).forEach(k => { if (leadRow[k] === null || leadRow[k] === undefined) delete leadRow[k]; });

    const r = await fetch(`${supabase_url}/rest/v1/lead_captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}`, 'Prefer': 'return=representation' },
      body: JSON.stringify(leadRow)
    });
    const data = await r.json();
    const leadId = Array.isArray(data) ? data[0]?.id : data?.id;

    // Also upsert into marketing_contacts for unified pipeline
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && supabase_url) {
      try {
        // Check if contact already exists by email
        const existing = await supabaseGet(
          `${supabase_url}/rest/v1/marketing_contacts?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
          serviceKey
        );
        if (!existing || existing.length === 0) {
          // Phase F #5: web → app bridge — always capture UTMs and score immediately.
          // Every website contact defaults to 'player' (not 'club') unless explicitly told otherwise.
          const inferredPersona = persona || player_type || 'player';
          const contactRow = {
            email,
            name: name || email.split('@')[0],
            phone: phone || '',
            persona: inferredPersona,
            stage: 'lead',
            player_type: inferredPersona === 'club' ? 'club' : 'player',
            data_source: 'organic_signup',
            consent_status: 'opt_in',
            source: source || 'website',
            utm_source: utm_source || null,
            utm_medium: utm_medium || null,
            utm_campaign: utm_campaign || null,
            tags: `{organic,${utm_source || 'direct'},${inferredPersona}}`,
            notes: `Organic lead capture from ${page_url || 'unknown page'}. UTM: ${utm_source || '-'}/${utm_medium || '-'}/${utm_campaign || '-'}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          // Compute initial lead score
          try {
            contactRow.lead_score = scoreContact(contactRow, {});
            contactRow.last_scored_at = new Date().toISOString();
          } catch (_) {}
          await supabaseInsert(supabase_url, serviceKey, 'marketing_contacts', contactRow);
        }
      } catch (syncErr) {
        // Non-blocking — lead was already captured in lead_captures, but the
        // downstream prospecting-funnel table didn't get the contact. We log
        // this so you can backfill from the Inbox → dead-letter panel.
        logSilentFailure('capture-lead.marketing_contacts_sync', syncErr, {
          email, name: name || null, source: source || null
        }, 'error');
      }
    }

    return res.status(200).json({ success: true, lead_id: leadId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: next-action
// ═══════════════════════════════════════════════════════════════════════════════

async function handleNextAction(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const inThreeDays = new Date(now); inThreeDays.setDate(inThreeDays.getDate() + 3);
  const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const recommendations = [
    { priority: 1, action: 'Follow up with 3 prospects who opened the "backhand" email but didn\'t click — use the objection-handling SMS template', type: 'email', urgency: 'high', deadline: 'Today', estimated_impact: 'High — hot leads going cold', suggested_agent: 'copywriter', suggested_prompt: 'Write a 2-sentence follow-up SMS for a tennis player who opened my email about backhand mechanics but didn\'t click the CTA. Use curiosity and social proof.' },
    { priority: 2, action: 'Post Tuesday TikTok — "3 things your coach can see in your swing that you can\'t" — backhand mechanics breakdown', type: 'social', urgency: 'medium', deadline: formatDate(tomorrow), estimated_impact: 'Medium — organic reach driver', suggested_agent: 'content_creator', suggested_prompt: 'Write a 60-second TikTok script for "3 things your coach can see in your tennis swing that you can\'t" — hook, 3 points, CTA to upload a free swing analysis' },
    { priority: 3, action: 'Launch Q2 coach outreach cadence — 47 contacts in the pipeline ready to enroll in "New Lead — Tennis Coaches" sequence', type: 'campaign', urgency: 'medium', deadline: 'This week', estimated_impact: 'High — 47 qualified coach leads', suggested_agent: 'marketing_director', suggested_prompt: 'Create a 30-day activation plan for launching our coach outreach cadence to 47 USPTA-certified coaches. Include pre-send hygiene tasks, A/B test variants, and success metrics.' },
    { priority: 4, action: 'Publish "How AI is changing tennis coaching in 2026" blog post — SEO target: "AI tennis coach"', type: 'content', urgency: 'low', deadline: formatDate(inThreeDays), estimated_impact: 'Medium — long-term SEO', suggested_agent: 'copywriter', suggested_prompt: 'Write a 1,200-word SEO blog post titled "How AI is Changing Tennis Coaching in 2026" — target keyword: AI tennis coach. Include stats, 3 case studies, and a CTA to try SmartSwing.' },
    { priority: 5, action: 'Respond to 2 negative brand mentions on Reddit r/tennis — acknowledge the feedback, offer free analysis', type: 'brand', urgency: 'high', deadline: 'Today', estimated_impact: 'High — reputation protection', suggested_agent: 'marketing_director', suggested_prompt: 'Write a genuine, non-defensive response to a Reddit comment that says "SmartSwing AI feels like a gimmick — AI can\'t replace a real coach." Use empathy, acknowledge the concern, offer value.' }
  ];

  const summary = {
    total_actions: recommendations.length,
    high_urgency: recommendations.filter(r => r.urgency === 'high').length,
    medium_urgency: recommendations.filter(r => r.urgency === 'medium').length,
    low_urgency: recommendations.filter(r => r.urgency === 'low').length,
    generated_at: now.toISOString(),
    next_refresh: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()
  };

  return res.status(200).json({ success: true, recommendations, summary });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: export-leads
// ═══════════════════════════════════════════════════════════════════════════════

async function handleExportLeads(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Use service role key to bypass RLS (anon key cannot SELECT from these tables)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || req.query.supabase_url;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || req.query.supabase_key;
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const format = req.query.format || 'csv';
  const source = req.query.source;
  const since = req.query.since;
  const table = req.query.table || 'lead_captures';

  // Define consistent column order matching the dashboard table display
  const COLUMN_ORDER = {
    lead_captures: [
      'name', 'email', 'phone', 'persona', 'source',
      'utm_source', 'utm_medium', 'utm_campaign',
      'referrer_url', 'page_url', 'ip_country',
      'notes', 'converted', 'converted_at', 'created_at'
    ],
    marketing_contacts: [
      'name', 'email', 'phone', 'persona', 'stage',
      'player_type', 'country', 'nationality', 'city',
      'data_source', 'consent_status',
      'ranking_tier', 'ranking_position', 'federation_id',
      'club_affiliation_name', 'website', 'rating',
      'source', 'tags', 'notes',
      'enrichment_source', 'enrichment_batch',
      'created_at', 'updated_at'
    ]
  };

  let endpoint = `${url}/rest/v1/${table}?order=created_at.desc&limit=10000`;
  if (source) endpoint += `&source=eq.${source}`;
  if (since) endpoint += `&created_at=gte.${since}`;

  try {
    const r = await fetch(endpoint, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
    });
    const data = await r.json();
    if (!Array.isArray(data)) return res.status(500).json({ error: 'Failed to fetch data', detail: data });

    if (format === 'json') return res.status(200).json({ success: true, count: data.length, data });

    // Use defined column order, falling back to keys from first row
    const orderedCols = COLUMN_ORDER[table] || [];
    const dataCols = data.length ? Object.keys(data[0]) : [];
    // Start with ordered columns that exist in data, then append any extras
    const cols = orderedCols.length
      ? [...orderedCols.filter(c => !data.length || dataCols.includes(c)),
         ...dataCols.filter(c => !orderedCols.includes(c) && c !== 'id' && c !== 'assigned_to')]
      : dataCols;

    if (!data.length) {
      // Return header row even when empty so the user sees the columns
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="smartswing_${table}_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.status(200).send('\uFEFF' + cols.join(','));
    }

    const escape = v => {
      if (v === null || v === undefined) return '';
      const str = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [cols.join(','), ...data.map(row => cols.map(c => escape(row[c])).join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smartswing_${table}_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.status(200).send('\uFEFF' + csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: auto-enroll
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAutoEnroll(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, user_id, supabase_url, supabase_key } = req.body || {};
  if (!email || !supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'email, supabase_url, supabase_key required' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabase_key,
    'Authorization': `Bearer ${supabase_key}`,
    'Prefer': 'return=representation'
  };

  try {
    const contactRes = await fetch(`${supabase_url}/rest/v1/marketing_contacts`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ email, name: name || email.split('@')[0], persona: 'player', stage: 'trial', source: 'signup' })
    });
    const contacts = await contactRes.json();
    const contact = Array.isArray(contacts) ? contacts[0] : contacts;
    if (!contact?.id) return res.status(500).json({ error: 'Failed to create contact', detail: contacts });

    const cadenceRes = await fetch(`${supabase_url}/rest/v1/email_cadences?name=ilike.*Trial*&limit=1`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const cadences = await cadenceRes.json();

    if (!cadences?.length) {
      return res.status(200).json({ success: true, contact_id: contact.id, message: 'Contact created. Cadence not yet seeded in DB — enroll manually from dashboard.' });
    }

    const cadence = cadences[0];

    const enrollCheck = await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments?contact_id=eq.${contact.id}&cadence_id=eq.${cadence.id}&limit=1`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const existing = await enrollCheck.json();
    if (existing?.length) {
      return res.status(200).json({ success: true, contact_id: contact.id, message: 'Already enrolled in cadence' });
    }

    const emailsRes = await fetch(`${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${cadence.id}&order=sequence_num`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const smsRes = await fetch(`${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${cadence.id}&order=sequence_num`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const emails = await emailsRes.json();
    const smsItems = await smsRes.json();

    const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1);
    const enrollRes = await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments`, {
      method: 'POST', headers,
      body: JSON.stringify({ contact_id: contact.id, cadence_id: cadence.id, status: 'active', current_step: 1, next_step_at: nextDay.toISOString() })
    });
    const enrollment = await enrollRes.json();
    const enrollId = Array.isArray(enrollment) ? enrollment[0]?.id : enrollment?.id;

    const steps = [];
    (Array.isArray(emails) ? emails : []).forEach(e => {
      const d = new Date(); d.setDate(d.getDate() + 1 + (e.delay_days || 0));
      steps.push({ enrollment_id: enrollId, contact_id: contact.id, cadence_id: cadence.id, step_type: 'email', step_num: e.sequence_num, subject: e.subject, body: e.body_text || e.body_html, status: 'pending', scheduled_at: d.toISOString() });
    });
    (Array.isArray(smsItems) ? smsItems : []).forEach(s => {
      const d = new Date(); d.setDate(d.getDate() + 1 + (s.delay_days || 0));
      steps.push({ enrollment_id: enrollId, contact_id: contact.id, cadence_id: cadence.id, step_type: 'sms', step_num: s.sequence_num, message: s.message, status: 'pending', scheduled_at: d.toISOString() });
    });

    if (steps.length) {
      await fetch(`${supabase_url}/rest/v1/cadence_step_executions`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(steps)
      });
    }

    return res.status(200).json({ success: true, contact_id: contact.id, enrollment_id: enrollId, steps_scheduled: steps.length, starts_at: nextDay.toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: publish-webhook
// ═══════════════════════════════════════════════════════════════════════════════

async function handlePublishWebhook(req, res) {
  // GET — polling endpoint for Make.com
  if (req.method === 'GET') {
    const { action, supabase_url, supabase_key } = req.query || {};
    if (action !== 'pending') {
      return res.status(400).json({ error: 'Invalid action. Use ?action=pending to poll for publishable items.' });
    }
    if (!supabase_url || !supabase_key) {
      return res.status(400).json({ error: 'supabase_url and supabase_key query params are required' });
    }
    try {
      const today = todayUTC();
      const items = await supabaseGet(
        `${supabase_url}/rest/v1/content_calendar?status=eq.scheduled&scheduled_date=lte.${today}&order=scheduled_date`,
        supabase_key
      );
      return res.status(200).json({ success: true, count: (items || []).length, items: items || [] });
    } catch (err) {
      console.error('Publish-webhook GET error:', err);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  // POST — Make.com triggers this when it's time to publish
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content_item_id, platform, action, scheduled_at, supabase_url, supabase_key } = req.body || {};
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id is required' });
  if (!platform) return res.status(400).json({ error: 'platform is required' });
  if (!action || !['publish', 'schedule'].includes(action)) return res.status(400).json({ error: 'action must be "publish" or "schedule"' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });

  const validPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'twitter', 'reddit'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` });
  }

  const now = new Date().toISOString();

  try {
    const items = await supabaseGet(`${supabase_url}/rest/v1/content_calendar?id=eq.${content_item_id}&limit=1`, supabase_key);
    if (!items || items.length === 0) return res.status(404).json({ error: 'Content item not found', content_item_id });
    const contentItem = items[0];

    let queueEntry = null;
    try {
      const existingQueue = await supabaseGet(
        `${supabase_url}/rest/v1/social_publish_queue?content_item_id=eq.${content_item_id}&platform=eq.${platform}&limit=1`,
        supabase_key
      );
      if (existingQueue && existingQueue.length > 0) {
        queueEntry = await supabasePatch(supabase_url, supabase_key, 'social_publish_queue', existingQueue[0].id, { status: 'publishing', updated_at: now });
      } else {
        queueEntry = await supabaseInsert(supabase_url, supabase_key, 'social_publish_queue', {
          content_item_id, platform, status: 'publishing', action, scheduled_at: scheduled_at || now, created_at: now, updated_at: now
        });
      }
    } catch (queueErr) { console.warn('social_publish_queue update warning (non-fatal):', queueErr.message); }

    console.log(`[publish-webhook] Intent to ${action} on ${platform}:`, { content_item_id, title: contentItem.title, scheduled_at: scheduled_at || now });

    const newStatus = action === 'publish' ? 'published' : 'scheduled';
    const calendarPatch = { status: newStatus, platform, updated_at: now };
    if (action === 'schedule' && scheduled_at) calendarPatch.scheduled_date = scheduled_at.split('T')[0];

    let updatedItem = null;
    try {
      updatedItem = await supabasePatch(supabase_url, supabase_key, 'content_calendar', content_item_id, calendarPatch);
    } catch (patchErr) {
      console.warn('content_calendar PATCH warning:', patchErr.message);
      updatedItem = contentItem;
    }

    if (queueEntry?.id) {
      try {
        await supabasePatch(supabase_url, supabase_key, 'social_publish_queue', queueEntry.id, { status: 'ready', updated_at: now });
      } catch (err) { console.warn('Queue entry ready update warning (non-fatal):', err.message); }
    }

    const finalItem = updatedItem || contentItem;
    return res.status(200).json({
      success: true, content_item: finalItem, platform, action,
      ready_to_post: true, copy_text: finalItem.copy_text || '', title: finalItem.title || ''
    });
  } catch (err) {
    console.error('Publish-webhook POST error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE-STREAM — resolves a YouTube video ID to a direct MP4/stream URL
// via public Piped instances. (Invidious public APIs were disabled in 2026
// after YouTube's bot-detection crackdown; Piped's NewPipe extractor is the
// only third-party option that still occasionally works for popular clips.)
//
// We deliberately do NOT bundle ytdl-core / yt-dlp — both push past the Vercel
// Hobby 50MB function limit. When the extractor fails (which is common in
// 2026), the front-end falls back to an iframe preview + clear message asking
// the user to upload the clip directly for guaranteed AI analysis.
// ═══════════════════════════════════════════════════════════════════════════════

// Rotated list of public Piped API instances. Try them in order until one
// returns a usable progressive (audio+video) MP4 stream. Update this list
// when an instance dies — the official Piped instance list lives at
// https://piped-instances.kavin.rocks/
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api-piped.mha.fi',
  'https://pipedapi.tokhmi.xyz'
];

function isValidYoutubeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

async function fetchPipedVideo(videoId) {
  const errors = [];
  for (const base of PIPED_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      let resp;
      try {
        resp = await fetch(`${base}/streams/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 SmartSwingAI/1.0', Accept: 'application/json' },
          signal: ctrl.signal
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        errors.push(`${base}:${resp.status}`);
        continue;
      }
      const data = await resp.json().catch(() => null);
      if (!data || data.error) {
        errors.push(`${base}:${data?.error ? 'extractor-error' : 'parse-error'}`);
        continue;
      }
      if (Array.isArray(data.videoStreams) && data.videoStreams.length) {
        return { instance: base, data };
      }
      errors.push(`${base}:no-streams`);
    } catch (err) {
      errors.push(`${base}:${err.name === 'AbortError' ? 'timeout' : (err.message || 'fetch-fail').slice(0, 40)}`);
    }
  }
  const aggErr = new Error(`All Piped instances failed → ${errors.join(' | ')}`);
  aggErr.attempts = errors;
  throw aggErr;
}

function pickBestPipedStream(videoStreams = []) {
  // 1. Prefer progressive (audio+video in one file) — cleanest for <video>.
  //    Sort by numeric quality DESC.
  const qNum = (s) => parseInt((s.quality || '').replace(/[^\d]/g, ''), 10) || 0;
  const progressive = videoStreams
    .filter((s) => !s.videoOnly && s.url && (s.format || '').match(/MP4|MPEG_4/i))
    .sort((a, b) => qNum(b) - qNum(a));
  if (progressive.length) return progressive[0];

  // 2. Fall back to ANY progressive stream (even non-MP4 like LBRY/HLS).
  const anyProgressive = videoStreams
    .filter((s) => !s.videoOnly && s.url)
    .sort((a, b) => qNum(b) - qNum(a));
  if (anyProgressive.length) return anyProgressive[0];

  // 3. Last resort: video-only adaptive MP4 (no audio — fine for pose detection).
  const adaptive = videoStreams
    .filter((s) => s.videoOnly && s.url && (s.format || '').match(/MP4|MPEG_4/i))
    .sort((a, b) => qNum(b) - qNum(a));
  return adaptive[0] || null;
}

async function handleYoutubeStream(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = (req.query.videoId || req.query.id || '').toString().trim();
  if (!isValidYoutubeId(videoId)) {
    return res.status(400).json({ error: 'Invalid or missing videoId (must be the 11-char YouTube ID)' });
  }

  try {
    const { data, instance } = await fetchPipedVideo(videoId);
    const stream = pickBestPipedStream(data.videoStreams || []);
    if (!stream || !stream.url) {
      return res.status(404).json({
        error: 'No playable stream available',
        message: 'YouTube\'s bot-detection blocked stream extraction for this video. Please download the clip and upload it directly for guaranteed AI analysis.'
      });
    }
    return res.status(200).json({
      videoId,
      title: data.title || null,
      lengthSeconds: data.duration || null,
      streamUrl: stream.url,
      qualityLabel: stream.quality || null,
      container: stream.format || 'mp4',
      mimeType: stream.mimeType || 'video/mp4',
      videoOnly: !!stream.videoOnly,
      source: instance
    });
  } catch (err) {
    console.error('youtube-stream error:', err);
    return res.status(502).json({
      error: 'YouTube stream extraction unavailable',
      message: 'YouTube\'s 2026 anti-bot measures broke all public extractors. Please download the clip (yt-dlp / SaveFrom / 4K Video Downloader) and upload it directly for guaranteed AI analysis.',
      attempts: err.attempts || []
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI-COACH — Personalized biomechanical coaching narrative via Claude
// ═══════════════════════════════════════════════════════════════════════════════

const AI_COACH_SYSTEM_PROMPT = `You are a world-class tennis coach with deep biomechanics expertise. When given a player's swing analysis data, write a concise, personalized coaching insight using EXACTLY this format with these four headers on their own lines:

**Swing Story**
2-3 sentences describing what actually happened in this swing in plain English, as if speaking directly to the player. Reference the specific shot type and the most significant finding.

**The Analogy**
One clear sports metaphor, physical sensation, or everyday comparison that makes the main issue immediately intuitive and memorable. Keep it to 2 sentences maximum.

**Feel This**
A specific physical sensation or mental image the player can use in their very next practice session to target the root cause. Be concrete — reference body parts, sensations, or cues. 2-3 sentences.

**Your Potential**
One sentence about what becomes achievable in this specific shot if they address this consistently over the next 2-4 weeks.

Rules:
- Be specific to the shot type — forehands, backhands, serves, volleys, drop shots, and lobs have fundamentally different mechanics
- Calibrate language to the player's level (beginner = simple analogies, pro = technical precision)
- Be honest but encouraging — name the issue clearly without discouraging
- Never use generic filler phrases like "great job" or "keep working hard"
- Total response should be 150-220 words`;

function buildAiCoachPrompt({ shotType, overallScore, grade, topIssues, strengths, rootCause, kpis, playerProfile, sessionGoal }) {
  const levelLabel = playerProfile.level || 'intermediate';
  const age = playerProfile.age ? `age ${playerProfile.age}` : '';
  const gender = playerProfile.gender && playerProfile.gender !== 'unspecified' ? playerProfile.gender : '';
  const playerDesc = [levelLabel, age, gender].filter(Boolean).join(', ');

  const issueLines = (topIssues || []).map(i =>
    `- ${i.metric}: score ${i.score}/100, ${i.delta > 0 ? '+' : ''}${i.delta || 0}° from target (${i.status || 'needs-work'})`
  ).join('\n');

  const strengthLines = (strengths || []).map(s =>
    `- ${s.metric}: ${s.score}/100`
  ).join('\n');

  const kpiLines = Object.entries(kpis || {}).map(([k, v]) => `- ${k}: ${v}%`).join('\n');

  const rootLine = rootCause ? `Root cause identified: "${rootCause.label}" — ${rootCause.headline}` : '';
  const goalLine = sessionGoal ? `Session goal: "${sessionGoal}"` : '';

  return `Player: ${playerDesc}
Shot analyzed: ${shotType}
${goalLine}
Overall score: ${overallScore}/100 (Grade ${grade || 'N/A'})

Top issues:
${issueLines || '- No significant issues detected'}

Strengths:
${strengthLines || '- None clearly above threshold yet'}

${rootLine}

Performance KPIs:
${kpiLines}

Write the personalized coaching insight for this ${shotType} session.`;
}

async function handleAiCoach(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI coaching service not configured' });

  const body = req.body || {};
  const { shotType, overallScore, grade, topIssues, strengths, rootCause, kpis, playerProfile, sessionGoal } = body;

  if (!shotType || overallScore == null) {
    return res.status(400).json({ error: 'shotType and overallScore are required' });
  }

  const userPrompt = buildAiCoachPrompt({ shotType, overallScore, grade, topIssues, strengths, rootCause, kpis, playerProfile, sessionGoal });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: AI_COACH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: 'AI service error', message: err.error?.message || String(resp.status) });
    }

    const data = await resp.json();
    const coaching = (data.content?.[0]?.text || '').trim();
    if (!coaching) return res.status(502).json({ error: 'Empty response from AI service' });

    return res.status(200).json({ coaching });
  } catch (err) {
    clearTimeout(timer);
    return res.status(502).json({ error: 'AI coaching unavailable', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREDENTIALS STATUS (masked, read-only)
// ═══════════════════════════════════════════════════════════════════════════════

function maskValue(val, showLast) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const n = showLast || 4;
  if (s.length <= n) return '●'.repeat(s.length);
  return '●'.repeat(Math.min(s.length - n, 20)) + s.slice(-n);
}

async function handleCredentialsStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const credentials = {
    meta_page_access_token: {
      label: 'Meta (IG + FB) Access Token',
      configured: !!process.env.META_PAGE_ACCESS_TOKEN,
      masked: maskValue(process.env.META_PAGE_ACCESS_TOKEN, 6),
      env_var: 'META_PAGE_ACCESS_TOKEN'
    },
    meta_page_id: {
      label: 'Meta Page ID',
      configured: !!process.env.META_PAGE_ID,
      value: process.env.META_PAGE_ID || null,
      env_var: 'META_PAGE_ID'
    },
    meta_app_id: {
      label: 'Meta App ID',
      configured: !!process.env.META_APP_ID,
      value: process.env.META_APP_ID || null,
      env_var: 'META_APP_ID'
    },
    meta_app_secret: {
      label: 'Meta App Secret',
      configured: !!process.env.META_APP_SECRET,
      masked: maskValue(process.env.META_APP_SECRET, 4),
      env_var: 'META_APP_SECRET'
    },
    meta_ad_account_id: {
      label: 'Meta Ad Account ID',
      configured: !!process.env.META_AD_ACCOUNT_ID,
      value: process.env.META_AD_ACCOUNT_ID || null,
      env_var: 'META_AD_ACCOUNT_ID'
    },
    meta_pixel_id: {
      label: 'Meta Pixel ID',
      configured: !!(process.env.META_PIXEL_ID),
      value: process.env.META_PIXEL_ID || null,
      env_var: 'META_PIXEL_ID'
    },
    resend_api_key: {
      label: 'Resend API Key',
      configured: !!process.env.RESEND_API_KEY,
      masked: maskValue(process.env.RESEND_API_KEY, 6),
      env_var: 'RESEND_API_KEY'
    },
    aws_access_key_id: {
      label: 'AWS Access Key ID',
      configured: !!process.env.AWS_ACCESS_KEY_ID,
      masked: maskValue(process.env.AWS_ACCESS_KEY_ID, 4),
      env_var: 'AWS_ACCESS_KEY_ID'
    },
    aws_secret_access_key: {
      label: 'AWS Secret Access Key',
      configured: !!process.env.AWS_SECRET_ACCESS_KEY,
      masked: maskValue(process.env.AWS_SECRET_ACCESS_KEY, 4),
      env_var: 'AWS_SECRET_ACCESS_KEY'
    },
    aws_sms_origination_number: {
      label: 'AWS SMS Origination Number',
      configured: !!(process.env.AWS_SMS_ORIGINATION_NUMBER),
      value: process.env.AWS_SMS_ORIGINATION_NUMBER || '+18885429135',
      env_var: 'AWS_SMS_ORIGINATION_NUMBER'
    },
    ga4_property_id: {
      label: 'GA4 Property ID',
      configured: !!process.env.GA4_PROPERTY_ID,
      value: process.env.GA4_PROPERTY_ID || null,
      env_var: 'GA4_PROPERTY_ID'
    },
    google_service_account: {
      label: 'Google Service Account Key',
      configured: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      masked: maskValue(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 0) ? '●●●● (JSON key configured)' : null,
      env_var: 'GOOGLE_SERVICE_ACCOUNT_KEY'
    },
    supabase_url: {
      label: 'Supabase URL',
      configured: !!process.env.SUPABASE_URL,
      value: process.env.SUPABASE_URL || null,
      env_var: 'SUPABASE_URL'
    },
    supabase_service_role_key: {
      label: 'Supabase Service Role Key',
      configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      masked: maskValue(process.env.SUPABASE_SERVICE_ROLE_KEY, 6),
      env_var: 'SUPABASE_SERVICE_ROLE_KEY'
    },
    stripe_secret_key: {
      label: 'Stripe Secret Key',
      configured: !!process.env.STRIPE_SECRET_KEY,
      masked: maskValue(process.env.STRIPE_SECRET_KEY, 6),
      env_var: 'STRIPE_SECRET_KEY'
    },
    openai_api_key: {
      label: 'OpenAI API Key (DALL-E)',
      configured: !!process.env.OPENAI_API_KEY,
      masked: maskValue(process.env.OPENAI_API_KEY, 6),
      env_var: 'OPENAI_API_KEY'
    },
    google_places_api_key: {
      label: 'Google Places API Key (Club Prospecting)',
      configured: !!process.env.GOOGLE_PLACES_API_KEY,
      masked: maskValue(process.env.GOOGLE_PLACES_API_KEY, 4),
      env_var: 'GOOGLE_PLACES_API_KEY'
    },
    whatsapp_phone_number_id: {
      label: 'WhatsApp Phone Number ID',
      configured: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      value: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      env_var: 'WHATSAPP_PHONE_NUMBER_ID'
    },
    whatsapp_business_account_id: {
      label: 'WhatsApp Business Account ID',
      configured: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      value: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      env_var: 'WHATSAPP_BUSINESS_ACCOUNT_ID'
    },
    whatsapp_access_token: {
      label: 'WhatsApp Access Token',
      configured: !!process.env.WHATSAPP_ACCESS_TOKEN,
      masked: maskValue(process.env.WHATSAPP_ACCESS_TOKEN, 6),
      env_var: 'WHATSAPP_ACCESS_TOKEN'
    },
    whatsapp_verify_token: {
      label: 'WhatsApp Webhook Verify Token',
      configured: !!process.env.WHATSAPP_VERIFY_TOKEN,
      masked: maskValue(process.env.WHATSAPP_VERIFY_TOKEN, 4),
      env_var: 'WHATSAPP_VERIFY_TOKEN'
    }
  };

  const total = Object.keys(credentials).length;
  const configured = Object.values(credentials).filter(c => c.configured).length;

  return res.status(200).json({ success: true, configured, total, credentials });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMS SENDING VIA AWS SNS
// ═══════════════════════════════════════════════════════════════════════════════
//
// IMPORTANT: AWS SNS returns a MessageId the moment it ACCEPTS a PublishCommand.
// Acceptance is NOT delivery. Messages can be silently dropped by:
//   1. SMS Sandbox (destination not verified)
//   2. Unverified toll-free origination number (AT&T/T-Mobile block in 2024+)
//   3. Monthly SMS spend limit exhausted (default $1/month for new accounts)
//   4. Destination carrier filter (Promotional type)
// Use /sms-diagnostics to check account state before debugging send failures.

function normalizeToE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/[^\d+]/g, '');
  // If it already starts with +, trust it (minimal validation)
  if (digits.startsWith('+') && digits.length >= 8 && digits.length <= 16) return digits;
  // If it's 10 digits, assume US
  const bare = digits.replace(/^\+/, '');
  if (bare.length === 10) return '+1' + bare;
  if (bare.length === 11 && bare.startsWith('1')) return '+' + bare;
  return null;
}

async function handleSendSms(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, message, subject, sms_type } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });

  const e164 = normalizeToE164(phone);
  if (!e164) {
    return res.status(400).json({
      error: 'Invalid phone format. Expected E.164 (e.g. +15551234567) or 10-digit US number.',
      received: phone
    });
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel env vars.' });
  }

  const originationNumber = process.env.AWS_SMS_ORIGINATION_NUMBER || '+18885429135';
  // Transactional has higher deliverability and lower carrier filtering than Promotional.
  // Override with body.sms_type='Promotional' only for marketing blasts where opt-out is mandatory.
  const smsType = (sms_type === 'Promotional') ? 'Promotional' : 'Transactional';

  try {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    const client = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const params = {
      PhoneNumber: e164,
      Message: message,
      Subject: subject || undefined,
      MessageAttributes: {
        'AWS.MM.SMS.OriginationNumber': { DataType: 'String', StringValue: originationNumber },
        'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: smsType }
      }
    };
    const result = await client.send(new PublishCommand(params));
    return res.status(200).json({
      success: true,
      status: 'accepted_by_sns',
      delivery_guaranteed: false,
      messageId: result.MessageId,
      phone_e164: e164,
      origination_number: originationNumber,
      sms_type: smsType,
      note: 'MessageId means SNS accepted the request. Actual delivery depends on sandbox status, spend limit, origination verification, and carrier filtering. Call /api/marketing/sms-diagnostics to check account state if the SMS does not arrive.'
    });
  } catch (err) {
    console.error('[send-sms] Error:', err);
    return res.status(500).json({
      error: 'SMS send failed: ' + (err.message || 'Unknown error'),
      code: err.name || err.Code || null,
      hint: 'Call /api/marketing/sms-diagnostics for account state.'
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIAL HEALTH — surfaces per-platform connection status with actionable errors
// Tests each platform's token with a cheap "whoami"-style call and returns
// { connected, error_code, remediation } so the dashboard can say WHY a
// connection is broken instead of just "disconnected".
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSocialHealth(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const report = {};

  // Meta (Page + Instagram) — share one token
  const metaToken = process.env.META_PAGE_ACCESS_TOKEN;
  const metaPageId = process.env.META_PAGE_ID || '724180587440946';
  const metaIgId = process.env.META_IG_ACCOUNT_ID || '17841475762518145';
  if (!metaToken) {
    report.meta_facebook  = { connected: false, error_code: 'MISSING_TOKEN', remediation: 'Set META_PAGE_ACCESS_TOKEN in Vercel env vars.' };
    report.meta_instagram = { connected: false, error_code: 'MISSING_TOKEN', remediation: 'Set META_PAGE_ACCESS_TOKEN in Vercel env vars.' };
  } else {
    try {
      const [pageR, igR] = await Promise.all([
        fetch(`${META_GRAPH_BASE}/${metaPageId}?fields=name,followers_count,fan_count&access_token=${metaToken}`).then(r => r.json()),
        fetch(`${META_GRAPH_BASE}/${metaIgId}?fields=username,followers_count,media_count&access_token=${metaToken}`).then(r => r.json())
      ]);
      if (pageR.error) {
        report.meta_facebook = {
          connected: false,
          error_code: pageR.error.code ? 'META_' + pageR.error.code : 'META_ERROR',
          error_message: pageR.error.message,
          error_subcode: pageR.error.error_subcode,
          remediation: pageR.error.code === 190
            ? 'Token expired or invalidated. Go to https://developers.facebook.com → your app → WhatsApp/Marketing → API Setup → copy new Page Access Token → update META_PAGE_ACCESS_TOKEN in Vercel → redeploy.'
            : pageR.error.code === 100
            ? "META_PAGE_ID is wrong or the token doesn't have access to this page. Verify Page ID at facebook.com/yourpage → About → Page ID."
            : 'See error_message. Most auth/token errors are resolved by regenerating the Page Access Token.'
        };
      } else {
        report.meta_facebook = { connected: true, name: pageR.name, followers: pageR.followers_count || pageR.fan_count || 0 };
      }
      if (igR.error) {
        report.meta_instagram = {
          connected: false,
          error_code: igR.error.code ? 'META_' + igR.error.code : 'META_ERROR',
          error_message: igR.error.message,
          remediation: igR.error.code === 190
            ? 'Page token expired — fix Meta/Facebook first; same token covers Instagram.'
            : 'Verify META_IG_ACCOUNT_ID matches the IG Business Account linked to the Facebook Page.'
        };
      } else {
        report.meta_instagram = { connected: true, username: igR.username, followers: igR.followers_count || 0, media_count: igR.media_count || 0 };
      }
    } catch (e) {
      report.meta_facebook  = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching graph.facebook.com. Retry.' };
      report.meta_instagram = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching graph.facebook.com. Retry.' };
    }
  }

  // TikTok — check token presence only (full validation requires a user token + display API)
  const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!tiktokToken) {
    report.tiktok = { connected: false, error_code: 'MISSING_TOKEN', remediation: 'Set TIKTOK_ACCESS_TOKEN in Vercel env vars. Get one from https://developers.tiktok.com/apps.' };
  } else {
    try {
      // TikTok user info (minimal validation)
      const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,video_count', {
        headers: { Authorization: 'Bearer ' + tiktokToken }
      });
      const d = await r.json();
      if (d.error && d.error.code !== 'ok') {
        report.tiktok = {
          connected: false,
          error_code: 'TIKTOK_' + (d.error.code || 'ERROR'),
          error_message: d.error.message,
          remediation: String(d.error.code || '').includes('expired')
            ? 'TikTok token expired. Refresh via TikTok developer console and update TIKTOK_ACCESS_TOKEN.'
            : 'See error_message. Likely scope or app-review issue.'
        };
      } else {
        report.tiktok = {
          connected: true,
          username: d.data && d.data.user && d.data.user.display_name,
          followers: d.data && d.data.user && d.data.user.follower_count,
          video_count: d.data && d.data.user && d.data.user.video_count
        };
      }
    } catch (e) {
      report.tiktok = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching open.tiktokapis.com. Retry.' };
    }
  }

  // YouTube — YOUTUBE_API_KEY (public data, no token refresh needed) OR YOUTUBE_ACCESS_TOKEN (authed)
  const ytKey = process.env.YOUTUBE_API_KEY;
  const ytChannelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!ytKey) {
    report.youtube = { connected: false, error_code: 'MISSING_API_KEY', remediation: 'Set YOUTUBE_API_KEY in Vercel (public read-only key from Google Cloud Console → APIs & Services → YouTube Data API v3).' };
  } else if (!ytChannelId) {
    report.youtube = { connected: false, error_code: 'MISSING_CHANNEL_ID', remediation: 'Set YOUTUBE_CHANNEL_ID in Vercel. Find it at youtube.com/account_advanced.' };
  } else {
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ytChannelId}&key=${ytKey}`);
      const d = await r.json();
      if (d.error) {
        report.youtube = {
          connected: false,
          error_code: 'YT_' + (d.error.code || 'ERROR'),
          error_message: d.error.message,
          remediation: d.error.code === 403
            ? 'API key restricted or quota exceeded. Check https://console.cloud.google.com/apis/credentials and daily quota.'
            : 'See error_message. If 400, verify YOUTUBE_CHANNEL_ID format (starts with UC...).'
        };
      } else if (!d.items || d.items.length === 0) {
        report.youtube = { connected: false, error_code: 'CHANNEL_NOT_FOUND', remediation: 'YouTube returned 0 channels. Verify YOUTUBE_CHANNEL_ID.' };
      } else {
        const ch = d.items[0];
        report.youtube = {
          connected: true,
          title: ch.snippet.title,
          subscribers: Number(ch.statistics.subscriberCount || 0),
          video_count: Number(ch.statistics.videoCount || 0),
          view_count: Number(ch.statistics.viewCount || 0)
        };
      }
    } catch (e) {
      report.youtube = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching googleapis.com. Retry.' };
    }
  }

  // LinkedIn — optional, token-gated
  const liToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const liOrgId = process.env.LINKEDIN_ORGANIZATION_ID;
  if (!liToken) {
    report.linkedin = { connected: false, error_code: 'MISSING_TOKEN', remediation: 'Set LINKEDIN_ACCESS_TOKEN in Vercel. Get via https://www.linkedin.com/developers/apps → your app → Auth → generate token with r_organization_social scope.' };
  } else if (!liOrgId) {
    report.linkedin = { connected: false, error_code: 'MISSING_ORG_ID', remediation: 'Set LINKEDIN_ORGANIZATION_ID in Vercel (numeric ID of your LinkedIn company page).' };
  } else {
    try {
      const r = await fetch(`https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${liOrgId}`, {
        headers: { Authorization: 'Bearer ' + liToken, 'LinkedIn-Version': '202501', 'X-Restli-Protocol-Version': '2.0.0' }
      });
      const d = await r.json();
      if (d.serviceErrorCode || d.status >= 400) {
        report.linkedin = {
          connected: false,
          error_code: 'LI_' + (d.serviceErrorCode || d.status || 'ERROR'),
          error_message: d.message,
          remediation: d.serviceErrorCode === 65601 || d.status === 401
            ? 'LinkedIn token expired (60-day default). Regenerate and update LINKEDIN_ACCESS_TOKEN.'
            : 'See error_message. Scope r_organization_social required.'
        };
      } else {
        const totals = (d.elements && d.elements[0]) || {};
        report.linkedin = {
          connected: true,
          followers: (totals.followerCountsByAssociationType || []).reduce(function(a, x){ return a + (x.followerCounts ? (x.followerCounts.organicFollowerCount || 0) : 0); }, 0)
        };
      }
    } catch (e) {
      report.linkedin = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching api.linkedin.com.' };
    }
  }

  // X / Twitter — optional
  const xToken = process.env.X_BEARER_TOKEN;
  const xUserId = process.env.X_USER_ID;
  if (!xToken) {
    report.x = { connected: false, error_code: 'MISSING_TOKEN', remediation: 'Set X_BEARER_TOKEN in Vercel (from developer.twitter.com → project → Keys and tokens).' };
  } else if (!xUserId) {
    report.x = { connected: false, error_code: 'MISSING_USER_ID', remediation: 'Set X_USER_ID in Vercel (numeric user ID; use https://tweeterid.com).' };
  } else {
    try {
      const r = await fetch(`https://api.twitter.com/2/users/${xUserId}?user.fields=public_metrics,username,name`, {
        headers: { Authorization: 'Bearer ' + xToken }
      });
      const d = await r.json();
      if (d.errors || (d.status && d.status >= 400)) {
        report.x = {
          connected: false,
          error_code: 'X_' + (d.status || (d.errors && d.errors[0] && d.errors[0].title) || 'ERROR'),
          error_message: (d.errors && d.errors[0] && d.errors[0].detail) || d.detail,
          remediation: 'Regenerate Bearer Token at developer.twitter.com. Note: free tier has 1 app + 1500 reads/mo.'
        };
      } else if (d.data) {
        report.x = {
          connected: true,
          username: d.data.username,
          followers: d.data.public_metrics && d.data.public_metrics.followers_count,
          tweets: d.data.public_metrics && d.data.public_metrics.tweet_count
        };
      } else {
        report.x = { connected: false, error_code: 'UNKNOWN_RESPONSE', remediation: 'X API returned unexpected shape.' };
      }
    } catch (e) {
      report.x = { connected: false, error_code: 'NETWORK', error_message: e.message, remediation: 'Network error reaching api.twitter.com.' };
    }
  }

  const connected = Object.values(report).filter(function(p) { return p.connected; }).length;
  const total = Object.keys(report).length;
  return res.status(200).json({ success: true, connected, total, platforms: report });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT SOCIAL STATS — call /social-health, persist per-platform daily row
// Hit via Vercel cron (daily). Upserts into social_stats_snapshots (unique on
// platform + snapshot_date).
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSnapshotSocialStats(req, res) {
  // Protect against abuse — allow only with a valid cron secret or authed session
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const headerSecret = req.headers['x-cron-secret'] || req.query.cron_secret;
    if (headerSecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for snapshot persistence.' });
  }

  // Reuse the social-health logic by calling it internally via a stub res
  const healthReport = await new Promise((resolve, reject) => {
    handleSocialHealth(req, {
      status() { return this; },
      json(obj) { resolve(obj); return this; }
    }).catch(reject);
  });
  if (!healthReport || !healthReport.success) {
    return res.status(500).json({ error: 'Could not compute social health.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(healthReport.platforms).map(([platform, p]) => ({
    platform,
    snapshot_date: today,
    followers: p.followers || p.subscribers || null,
    posts: p.media_count || p.video_count || p.tweets || null,
    views: p.view_count || null,
    connected: !!p.connected,
    error_code: p.error_code || null,
    error_message: p.error_message || null,
    raw: p
  }));

  // Upsert (platform, snapshot_date is unique)
  try {
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/social_stats_snapshots?on_conflict=platform,snapshot_date`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    });
    if (!upsertRes.ok) {
      const txt = await upsertRes.text().catch(() => '');
      return res.status(500).json({ error: 'Upsert failed', details: txt.slice(0, 400) });
    }
    return res.status(200).json({ success: true, snapshot_date: today, platforms_written: rows.length, summary: healthReport.platforms });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleSocialStatsLatest(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Supabase config missing' });
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/v_social_stats_latest?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    const rows = await r.json();
    return res.status(200).json({ success: true, stats: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMS DIAGNOSTICS — surfaces the 4 silent-drop failure modes
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSmsDiagnostics(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  const originationNumber = process.env.AWS_SMS_ORIGINATION_NUMBER || '+18885429135';

  if (!accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'AWS credentials not configured.' });
  }

  const report = {
    region,
    origination_number: originationNumber,
    checks: {},
    remediation: []
  };

  try {
    const sns = require('@aws-sdk/client-sns');
    const { SNSClient, GetSMSAttributesCommand, GetSMSSandboxAccountStatusCommand, ListSMSSandboxPhoneNumbersCommand } = sns;
    const client = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });

    // 1. Account-level SMS attributes (spend limit + default type)
    try {
      const attrs = await client.send(new GetSMSAttributesCommand({}));
      const a = attrs.attributes || {};
      const monthlySpendLimit = a.MonthlySpendLimit ? Number(a.MonthlySpendLimit) : null;
      report.checks.sms_attributes = {
        ok: true,
        monthly_spend_limit_usd: monthlySpendLimit,
        default_sms_type: a.DefaultSMSType || null,
        delivery_status_logging_role: a.DeliveryStatusIAMRole ? 'configured' : 'not_configured',
        default_sender_id: a.DefaultSenderID || null
      };
      if (monthlySpendLimit !== null && monthlySpendLimit < 5) {
        report.remediation.push({
          severity: 'high',
          issue: `Monthly SMS spend limit is $${monthlySpendLimit}`,
          fix: 'AWS Console → SNS → Text messaging (SMS) → Preferences → raise Account spend limit. Default $1/mo is often exhausted in hours.'
        });
      }
      if (!a.DeliveryStatusIAMRole) {
        report.remediation.push({
          severity: 'medium',
          issue: 'No delivery-status logging configured — cannot see why messages fail after SNS accepts them.',
          fix: 'AWS Console → SNS → Text messaging → Preferences → enable CloudWatch delivery status logs. Then retry a send and check CloudWatch log group /aws/sns/.../DirectPublishToPhoneNumber.'
        });
      }
    } catch (e) {
      report.checks.sms_attributes = { ok: false, error: e.message };
    }

    // 2. Sandbox status (biggest silent killer for new accounts)
    try {
      const sandbox = await client.send(new GetSMSSandboxAccountStatusCommand({}));
      report.checks.sandbox_status = {
        ok: true,
        in_sandbox: sandbox.IsInSandbox === true,
        note: sandbox.IsInSandbox
          ? 'ACCOUNT IS IN SMS SANDBOX. Messages to unverified destinations drop silently.'
          : 'Production access granted.'
      };
      if (sandbox.IsInSandbox) {
        report.remediation.push({
          severity: 'critical',
          issue: 'AWS SNS is in SMS sandbox.',
          fix: 'AWS Console → SNS → Text messaging → Sandbox destination phone numbers → add + verify target numbers for testing. For production: open a "Request SMS production access" case with AWS Support (Limits → SNS → SMS). Usually approved within 24h.'
        });
      }
    } catch (e) {
      report.checks.sandbox_status = { ok: false, error: e.message };
    }

    // 3. Verified sandbox destinations (only relevant if in sandbox)
    if (report.checks.sandbox_status && report.checks.sandbox_status.in_sandbox === true) {
      try {
        const verified = await client.send(new ListSMSSandboxPhoneNumbersCommand({}));
        report.checks.verified_sandbox_destinations = {
          ok: true,
          count: (verified.PhoneNumbers || []).length,
          numbers: (verified.PhoneNumbers || []).map(p => ({
            phone: p.PhoneNumber,
            status: p.Status
          }))
        };
      } catch (e) {
        report.checks.verified_sandbox_destinations = { ok: false, error: e.message };
      }
    }

    // 4. Origination number sanity
    report.checks.origination_number = {
      ok: /^\+1[0-9]{10}$/.test(originationNumber),
      value: originationNumber,
      note: originationNumber.startsWith('+1800') || originationNumber.startsWith('+1888') || originationNumber.startsWith('+1877') || originationNumber.startsWith('+1866') || originationNumber.startsWith('+1855') || originationNumber.startsWith('+1844') || originationNumber.startsWith('+1833')
        ? 'US toll-free number detected. TFNs MUST be registered with carriers (TCR/AT&T/T-Mobile). Unregistered TFNs are blocked. Complete toll-free verification in AWS End User Messaging console.'
        : 'Not a toll-free number.'
    };
    if (originationNumber === '+18885429135') {
      report.remediation.push({
        severity: 'high',
        issue: 'Using hardcoded fallback toll-free number +18885429135.',
        fix: 'Set AWS_SMS_ORIGINATION_NUMBER env var in Vercel to a number actually provisioned in your AWS account, and verify it\'s registered for carrier delivery.'
      });
    }

    return res.status(200).json({ success: true, diagnostic: report });
  } catch (err) {
    console.error('[sms-diagnostics] Error:', err);
    return res.status(500).json({ error: 'Diagnostics failed: ' + err.message, report });
  }
}

async function handleSendBulkSms(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recipients } = req.body || {};
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array is required and must not be empty' });
  }
  if (recipients.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 recipients per request' });
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel env vars.' });
  }

  try {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    const client = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });

    const originationNumber = process.env.AWS_SMS_ORIGINATION_NUMBER || '+18885429135';

    const results = await Promise.allSettled(
      recipients.map(({ phone, message, subject, sms_type }) => {
        if (!phone || !message) {
          return Promise.reject(new Error('Each recipient must have phone and message'));
        }
        const e164 = normalizeToE164(phone);
        if (!e164) {
          return Promise.reject(new Error('Invalid phone format (expected E.164 or 10-digit US): ' + phone));
        }
        const smsType = (sms_type === 'Promotional') ? 'Promotional' : 'Transactional';
        return client.send(new PublishCommand({
          PhoneNumber: e164,
          Message: message,
          Subject: subject || undefined,
          MessageAttributes: {
            'AWS.MM.SMS.OriginationNumber': { DataType: 'String', StringValue: originationNumber },
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: smsType }
          }
        }));
      })
    );

    const summary = results.map((r, i) => ({
      phone: recipients[i].phone,
      accepted_by_sns: r.status === 'fulfilled',
      messageId: r.status === 'fulfilled' ? r.value.MessageId : undefined,
      error: r.status === 'rejected' ? r.reason.message : undefined
    }));

    const accepted = summary.filter(s => s.accepted_by_sns).length;
    const failed = summary.filter(s => !s.accepted_by_sns).length;

    return res.status(200).json({
      success: true,
      accepted_by_sns: accepted,
      failed,
      delivery_guaranteed: false,
      note: 'accepted_by_sns ≠ delivered. Run /api/marketing/sms-diagnostics if messages are not arriving.',
      results: summary
    });
  } catch (err) {
    console.error('[send-bulk-sms] Error:', err);
    return res.status(500).json({ error: 'Bulk SMS send failed: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP BUSINESS CLOUD API HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/marketing/send-whatsapp
 * Body: { phone, message, templateName?, templateLang? }
 *
 * If templateName is provided → sends a template message (no 24h restriction).
 * If only message is provided → sends a free-form text (within 24h window).
 *
 * Env vars: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN (falls back to META_PAGE_ACCESS_TOKEN)
 */
async function handleSendWhatsapp(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, message, templateName, templateLang, templateVars } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone is required (E.164 format, e.g. +15551234567)' });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return res.status(500).json({
      error: 'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in Vercel env vars.'
    });
  }

  // Strip non-digit characters for the API (except leading +)
  const toNumber = phone.replace(/[^\d]/g, '');

  try {
    let payload;
    if (templateName) {
      // Template message — works outside the 24h window
      const components = Array.isArray(templateVars) && templateVars.length
        ? [{
            type: 'body',
            parameters: templateVars.map(v => ({ type: 'text', text: String(v) }))
          }]
        : undefined;
      payload = {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang || 'en_US' },
          ...(components ? { components } : {})
        }
      };
    } else if (message) {
      // Free-form text — only works within 24h of user's last message
      payload = {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: message }
      };
    } else {
      return res.status(400).json({ error: 'Either message or templateName is required' });
    }

    const apiUrl = `${META_GRAPH_BASE}/${phoneNumberId}/messages`;
    const waRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await waRes.json();
    if (!waRes.ok) {
      const errMsg = data.error ? data.error.message : JSON.stringify(data);
      console.error('[send-whatsapp] API error:', errMsg);
      return res.status(waRes.status).json({ error: errMsg, details: data });
    }

    const messageId = data.messages && data.messages[0] ? data.messages[0].id : null;
    return res.status(200).json({
      success: true,
      messageId,
      to: toNumber,
      type: templateName ? 'template' : 'text'
    });
  } catch (err) {
    console.error('[send-whatsapp] Error:', err);
    return res.status(500).json({ error: 'WhatsApp send failed: ' + (err.message || 'Unknown error') });
  }
}

/**
 * POST /api/marketing/send-bulk-whatsapp
 * Body: { recipients: [{ phone, message?, templateName?, templateLang? }] }
 * Max 50 per request.
 */
async function handleSendBulkWhatsapp(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recipients } = req.body || {};
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array is required and must not be empty' });
  }
  if (recipients.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 recipients per request' });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return res.status(500).json({
      error: 'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in Vercel env vars.'
    });
  }

  const apiUrl = `${META_GRAPH_BASE}/${phoneNumberId}/messages`;

  const results = await Promise.allSettled(
    recipients.map(async ({ phone, message, templateName, templateLang }) => {
      if (!phone) throw new Error('phone is required');
      const toNumber = phone.replace(/[^\d]/g, '');

      let payload;
      if (templateName) {
        payload = {
          messaging_product: 'whatsapp',
          to: toNumber,
          type: 'template',
          template: { name: templateName, language: { code: templateLang || 'en_US' } }
        };
      } else if (message) {
        payload = {
          messaging_product: 'whatsapp',
          to: toNumber,
          type: 'text',
          text: { body: message }
        };
      } else {
        throw new Error('Either message or templateName is required');
      }

      const waRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await waRes.json();
      if (!waRes.ok) throw new Error(data.error ? data.error.message : 'API error');
      return data;
    })
  );

  const summary = results.map((r, i) => ({
    phone: recipients[i].phone,
    success: r.status === 'fulfilled',
    messageId: r.status === 'fulfilled' && r.value.messages ? r.value.messages[0].id : undefined,
    error: r.status === 'rejected' ? r.reason.message : undefined
  }));

  const sent   = summary.filter(s => s.success).length;
  const failed = summary.filter(s => !s.success).length;

  return res.status(200).json({ success: true, sent, failed, results: summary });
}

/**
 * GET /api/marketing/whatsapp-status
 * Returns configuration status + phone number info from Graph API.
 */
/**
 * GET  /api/marketing/whatsapp-webhook  — Meta subscription verification
 *   Meta challenges with ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *   We echo back hub.challenge iff hub.verify_token === WHATSAPP_VERIFY_TOKEN.
 *
 * POST /api/marketing/whatsapp-webhook  — inbound messages + status updates
 *   Meta sends message events (text/button/reply), status events (sent/
 *   delivered/read/failed). We:
 *     1. Match inbound messages to a contact by phone → log them
 *        in whatsapp_inbound_messages so replies aren't lost
 *     2. Detect STOP / PARAR / SAIR / UNSUBSCRIBE keywords → mark contact
 *        opt-out (profiles.whatsapp_opted_out + marketing_contacts.preferred_channel)
 *     3. Match status updates to our cadence_step_executions by
 *        provider_message_id → update delivery_state
 *
 * Webhook URL to paste in Meta Business Manager → WhatsApp → Configuration →
 *   Callback URL:   https://www.smartswingai.com/api/marketing/whatsapp-webhook
 *   Verify token:   whatever you set WHATSAPP_VERIFY_TOKEN to in Vercel
 */
async function handleWhatsappWebhook(req, res) {
  // ── Step 1: Meta verification challenge (GET) ────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && token && expected && token === expected) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.status(403).json({ error: 'Invalid verify token' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

  // ── Step 2: inbound message / status dispatch ────────────────────────────
  const body = req.body || {};
  const supabase_url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabase_key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabase_url || !supabase_key) {
    // Still ack Meta even if we can't persist, else they retry forever
    console.error('[whatsapp-webhook] Supabase not configured');
    return res.status(200).json({ ok: true });
  }
  const hdrs = { apikey: supabase_key, Authorization: `Bearer ${supabase_key}`, 'Content-Type': 'application/json' };

  try {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};

        // ── A) Inbound messages (prospect replies) ──────────────────────
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          const fromPhone = msg.from || ''; // E.164 digits, no +
          const messageId = msg.id || null;
          const type = msg.type || 'unknown';
          // Extract text from various payload shapes
          const text =
            (msg.text && msg.text.body) ||
            (msg.button && (msg.button.text || msg.button.payload)) ||
            (msg.interactive && msg.interactive.button_reply && msg.interactive.button_reply.title) ||
            (msg.interactive && msg.interactive.list_reply && msg.interactive.list_reply.title) ||
            '';
          const normalizedPhone = `+${fromPhone}`;

          // Persist the inbound message (dedup by provider id)
          try {
            await fetch(`${supabase_url}/rest/v1/whatsapp_inbound_messages`, {
              method: 'POST',
              headers: { ...hdrs, Prefer: 'resolution=ignore-duplicates' },
              body: JSON.stringify({
                provider_message_id: messageId,
                from_phone: normalizedPhone,
                message_type: type,
                message_text: String(text).slice(0, 4000),
                received_at: new Date().toISOString(),
                raw_payload: msg
              })
            });
          } catch (e) {
            logSilentFailure('whatsapp-webhook.persist_inbound', e, {
              from_phone: normalizedPhone, provider_message_id: messageId, message_type: type
            }, 'critical');
          }

          // Opt-out keyword detection (multi-language)
          const normalizedText = String(text || '').trim().toUpperCase();
          const OPT_OUT_WORDS = new Set([
            'STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
            'PARAR', 'SAIR',                 // pt_BR
            'DETENER', 'ALTO', 'CANCELAR',   // es
            'ARRETER',                       // fr
            'STOPPEN'                        // de
          ]);
          if (OPT_OUT_WORDS.has(normalizedText)) {
            try {
              // Update marketing_contacts preferred_channel → 'sms' so we stop WhatsApp
              // (and flag them on profiles if the email matches)
              await fetch(`${supabase_url}/rest/v1/marketing_contacts?phone=eq.${encodeURIComponent(normalizedPhone)}`, {
                method: 'PATCH',
                headers: { ...hdrs, Prefer: 'return=minimal' },
                body: JSON.stringify({ preferred_channel: 'sms', whatsapp_opted_out: true, whatsapp_opted_out_at: new Date().toISOString() })
              });
              // Cancel pending WhatsApp steps for this contact
              await fetch(
                `${supabase_url}/rest/v1/cadence_step_executions?step_type=eq.whatsapp&status=eq.pending` +
                `&contact_id=in.(select id from marketing_contacts where phone=eq.${encodeURIComponent(normalizedPhone)})`,
                { method: 'PATCH', headers: { ...hdrs, Prefer: 'return=minimal' },
                  body: JSON.stringify({ status: 'skipped', skipped_reason: 'whatsapp_opt_out' }) }
              );
            } catch (e) {
              logSilentFailure('whatsapp-webhook.opt_out_update', e, {
                from_phone: normalizedPhone, keyword: normalizedText
              }, 'critical');
            }
          }
        }

        // ── B) Delivery status updates (sent/delivered/read/failed) ─────
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const providerId = st.id || null;
          const status = st.status || null; // 'sent'|'delivered'|'read'|'failed'
          const errors = Array.isArray(st.errors) ? st.errors : [];
          if (!providerId || !status) continue;
          try {
            const patch = { delivery_state: status, last_status_at: new Date().toISOString() };
            if (errors.length) patch.failure_reason = (errors[0].title || errors[0].message || '').slice(0, 500);
            await fetch(
              `${supabase_url}/rest/v1/cadence_step_executions?provider_message_id=eq.${encodeURIComponent(providerId)}`,
              { method: 'PATCH', headers: { ...hdrs, Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
            );
          } catch (e) {
            logSilentFailure('whatsapp-webhook.status_update', e, {
              provider_message_id: providerId, status
            }, 'warn');
          }
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] dispatch error:', err);
  }

  // Always 200 — Meta retries aggressively on non-200 and we've already
  // logged errors above. Retries would create duplicate rows.
  return res.status(200).json({ ok: true });
}

/**
 * POST /api/marketing/whatsapp-register
 * Body: { pin: "123456" }
 *
 * One-time Cloud API registration for the phone number.
 * Must be called after you verify the number AND set its 2-step
 * verification PIN in Meta WhatsApp Manager. Without this step,
 * every send attempt fails with Meta error 133010 "Account not registered".
 *
 * Uses server-side WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN env vars.
 */
async function handleWhatsappRegister(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'POST or GET only' });
  }
  const pin = String((req.body && req.body.pin) || req.query.pin || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({
      error: 'Missing or invalid pin — must be a 6-digit number.',
      how_to_pass: 'POST with JSON body { "pin": "123456" } OR GET with ?pin=123456'
    });
  }

  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const accessToken = String(
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || ''
  ).trim();
  if (!phoneNumberId || !accessToken) {
    return res.status(500).json({
      error: 'WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not configured in Vercel env vars.'
    });
  }

  try {
    const r = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin })
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }

    if (!r.ok) {
      const metaError = body?.error || {};
      const hint = (() => {
        if (metaError.code === 133005 || metaError.code === 133006) {
          return 'Wrong PIN. Check Meta WhatsApp Manager → Phone numbers → Two-step verification. If you forgot it, you may need to reset (requires waiting 7 days unless Meta support helps).';
        }
        if (metaError.code === 133009) {
          return 'Number is already registered — this is actually good. Try your send again; the initial 133010 error should be gone.';
        }
        if (metaError.code === 133000) {
          return 'You need to set a 2-step verification PIN in Meta WhatsApp Manager first.';
        }
        if (String(metaError.message || '').toLowerCase().includes('pin mismatch')) {
          return 'PIN mismatch — the PIN you sent does not match the one set in Meta WhatsApp Manager.';
        }
        return 'See Meta error details above; common fix is to confirm PIN and try again.';
      })();
      return res.status(r.status).json({
        ok: false,
        meta_error: metaError,
        hint,
        phone_number_id: phoneNumberId
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Phone number registered for Cloud API. You can now send messages.',
      phone_number_id: phoneNumberId,
      meta_response: body
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Network error calling Meta Graph API'
    });
  }
}

async function handleWhatsappStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return res.status(200).json({
      configured: false,
      missing: {
        WHATSAPP_PHONE_NUMBER_ID: !phoneNumberId,
        WHATSAPP_ACCESS_TOKEN: !accessToken
      }
    });
  }

  try {
    const infoRes = await fetch(
      `${META_GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,quality_rating,verified_name,code_verification_status`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const info = await infoRes.json();

    if (!infoRes.ok) {
      return res.status(200).json({
        configured: true,
        reachable: false,
        error: info.error ? info.error.message : 'Unknown error'
      });
    }

    return res.status(200).json({
      configured: true,
      reachable: true,
      phoneNumber: info.display_phone_number,
      qualityRating: info.quality_rating,
      verifiedName: info.verified_name,
      codeVerification: info.code_verification_status
    });
  } catch (err) {
    return res.status(200).json({
      configured: true,
      reachable: false,
      error: err.message || 'Network error'
    });
  }
}

/**
 * GET /api/marketing/whatsapp-templates
 * Lists available message templates from WhatsApp Business.
 */
async function handleWhatsappTemplates(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const wabaId      = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  if (!wabaId || !accessToken) {
    return res.status(200).json({ templates: [], error: 'WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_ACCESS_TOKEN not configured' });
  }

  try {
    const tplRes = await fetch(
      `${META_GRAPH_BASE}/${wabaId}/message_templates?fields=name,status,language,category&limit=50`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await tplRes.json();

    if (!tplRes.ok) {
      return res.status(200).json({ templates: [], error: data.error ? data.error.message : 'Unknown' });
    }

    return res.status(200).json({
      templates: (data.data || []).map(t => ({
        name: t.name,
        status: t.status,
        language: t.language,
        category: t.category
      }))
    });
  } catch (err) {
    return res.status(200).json({ templates: [], error: err.message || 'Network error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// META (FACEBOOK + INSTAGRAM) GRAPH API HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleMetaStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured in Vercel env vars.' });
  }

  const pageId = process.env.META_PAGE_ID || '724180587440946';
  const igAccountId = process.env.META_IG_ACCOUNT_ID || '17841475762518145';

  try {
    // Fetch FB page info (followers, likes) and IG account info in parallel
    const [pageRes, igRes] = await Promise.all([
      fetch(`${META_GRAPH_BASE}/${pageId}?fields=name,followers_count,fan_count,engagement&access_token=${accessToken}`).then(r => r.json()),
      fetch(`${META_GRAPH_BASE}/${igAccountId}?fields=followers_count,media_count,username&access_token=${accessToken}`).then(r => r.json())
    ]);

    return res.status(200).json({
      success: true,
      facebook: {
        name: pageRes.name || null,
        followers: pageRes.followers_count || 0,
        likes: pageRes.fan_count || 0,
        engagement: pageRes.engagement || null
      },
      instagram: {
        username: igRes.username || null,
        followers: igRes.followers_count || 0,
        media_count: igRes.media_count || 0
      }
    });
  } catch (err) {
    console.error('[meta-stats] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch Meta stats: ' + (err.message || 'Unknown error') });
  }
}

async function handleMetaPublish(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured.' });

  const { platform, message, link, image_url } = req.body || {};

  const pageId = process.env.META_PAGE_ID || '724180587440946';
  const igAccountId = process.env.META_IG_ACCOUNT_ID || '17841475762518145';

  try {
    const results = {};

    // Publish to Facebook Page
    if (platform === 'facebook' || platform === 'both') {
      const fbPayload = { message, access_token: accessToken };
      if (link) fbPayload.link = link;

      const fbRes = await fetch(`${META_GRAPH_BASE}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbPayload)
      }).then(r => r.json());

      results.facebook = fbRes;
    }

    // Publish to Instagram (requires image_url for IG)
    if ((platform === 'instagram' || platform === 'both') && image_url) {
      // Step 1: Create media container
      const containerRes = await fetch(`${META_GRAPH_BASE}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url,
          caption: message,
          access_token: accessToken
        })
      }).then(r => r.json());

      if (containerRes.id) {
        // Step 2: Publish the container
        const publishRes = await fetch(`${META_GRAPH_BASE}/${igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerRes.id,
            access_token: accessToken
          })
        }).then(r => r.json());

        results.instagram = publishRes;
      } else {
        results.instagram = { error: 'Failed to create media container', details: containerRes };
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('[meta-publish] Error:', err);
    return res.status(500).json({ error: 'Publish failed: ' + (err.message || 'Unknown error') });
  }
}

async function handleMetaConversions(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured.' });

  const pixelId = process.env.META_PIXEL_ID || '724180587440946';
  const { event_name, event_time, user_data, custom_data, event_source_url, action_source } = req.body || {};

  if (!event_name) return res.status(400).json({ error: 'event_name is required' });

  try {
    const eventData = {
      data: [{
        event_name,
        event_time: event_time || Math.floor(Date.now() / 1000),
        user_data: user_data || {},
        custom_data: custom_data || {},
        event_source_url: event_source_url || 'https://www.smartswingai.com',
        action_source: action_source || 'website'
      }],
      access_token: accessToken
    };

    const result = await fetch(`${META_GRAPH_BASE}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    }).then(r => r.json());

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[meta-conversions] Error:', err);
    return res.status(500).json({ error: 'Conversions API error: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/marketing/meta-token-diagnostics
 * Calls Meta's /debug_token endpoint on the current META_PAGE_ACCESS_TOKEN
 * and returns a human-readable explanation of WHY Facebook/Instagram are
 * disconnected — expired, missing scopes, wrong app, revoked, etc.
 *
 * Reason for existing: /social-health returns Meta's raw error ('object does
 * not exist' etc) which doesn't tell users WHETHER they need to rotate the
 * token or re-grant permissions. This endpoint interrogates the token itself
 * and reports: expires_at, scopes, app_id, user_id, is_valid, error.
 */
async function handleMetaTokenDiagnostics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = String(process.env.META_PAGE_ACCESS_TOKEN || '').trim();
  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();

  if (!token) {
    return res.status(200).json({
      ok: false,
      error_code: 'MISSING_TOKEN',
      message: 'META_PAGE_ACCESS_TOKEN is not set in Vercel env vars.',
      remediation: 'Generate a Page Access Token via Meta Graph API Explorer, then set META_PAGE_ACCESS_TOKEN in Vercel → redeploy. See /deploy/META_RECONNECT.md for the full flow.'
    });
  }
  if (!appId || !appSecret) {
    return res.status(200).json({
      ok: false,
      error_code: 'MISSING_APP_CREDENTIALS',
      message: 'META_APP_ID and/or META_APP_SECRET are not set. Required to inspect the token.',
      remediation: 'Add META_APP_ID and META_APP_SECRET from Meta for Developers → your app → Settings → Basic.'
    });
  }

  // Meta's /debug_token requires an app access token (app_id|app_secret) to inspect a user/page token
  const appAccessToken = `${appId}|${appSecret}`;
  try {
    const url = `${META_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appAccessToken)}`;
    const r = await fetch(url);
    const body = await r.json();

    if (!r.ok || body.error) {
      return res.status(200).json({
        ok: false,
        error_code: 'DEBUG_TOKEN_FAILED',
        message: body?.error?.message || `HTTP ${r.status}`,
        remediation: 'The app credentials cannot inspect this token. Confirm META_APP_ID + META_APP_SECRET match the app that issued META_PAGE_ACCESS_TOKEN.'
      });
    }

    const data = body.data || {};
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = data.expires_at || 0;
    const isExpired = expiresAt > 0 && expiresAt < now;
    const expiresAtIso = expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : 'never (permanent)';
    const isValid = data.is_valid === true && !isExpired;

    // Scopes needed for our Facebook + Instagram integration
    const REQUIRED_SCOPES = [
      'pages_show_list',            // list pages the user manages
      'pages_read_engagement',      // read page posts + metrics (fixes the error above)
      'pages_manage_posts',         // publish to the page
      'instagram_basic',            // read IG account + profile
      'instagram_manage_insights',  // read IG metrics
      'instagram_content_publish',  // publish to IG Business account
      'business_management'         // needed for IG Business Account linked to FB Page
    ];
    const presentScopes = Array.isArray(data.scopes) ? data.scopes : [];
    const missingScopes = REQUIRED_SCOPES.filter(s => !presentScopes.includes(s));

    let errorCode = 'OK';
    let remediation = null;
    if (!isValid) {
      if (isExpired) {
        errorCode = 'TOKEN_EXPIRED';
        remediation = 'Token expired ' + new Date(expiresAt * 1000).toLocaleDateString() + '. Run /api/marketing/meta-token-exchange (POST) to mint a new permanent Page Token, then update META_PAGE_ACCESS_TOKEN in Vercel.';
      } else {
        errorCode = 'TOKEN_INVALID';
        remediation = data.error?.message || 'Token is invalid for unknown reason. Regenerate via Meta Graph API Explorer.';
      }
    } else if (missingScopes.length > 0) {
      errorCode = 'MISSING_SCOPES';
      remediation = 'Token is valid but missing required scopes: ' + missingScopes.join(', ') + '. Regenerate in Graph API Explorer with all required scopes checked.';
    }

    return res.status(200).json({
      ok: errorCode === 'OK',
      error_code: errorCode,
      is_valid: isValid,
      is_expired: isExpired,
      expires_at: expiresAtIso,
      app_id: data.app_id || null,
      user_id: data.user_id || null,
      profile_id: data.profile_id || null,
      type: data.type || null,
      scopes_present: presentScopes,
      scopes_missing: missingScopes,
      scopes_required: REQUIRED_SCOPES,
      remediation: remediation,
      raw: data
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error_code: 'NETWORK_ERROR',
      message: err.message || 'Network error calling Meta /debug_token'
    });
  }
}

async function handleMetaTokenExchange(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const currentToken = process.env.META_PAGE_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!currentToken || !appId || !appSecret) {
    return res.status(500).json({
      error: 'Missing env vars. Need: META_PAGE_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET'
    });
  }

  try {
    // Step 1: Exchange short-lived token for long-lived user token
    const exchangeUrl = `${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
    const exchangeRes = await fetch(exchangeUrl).then(r => r.json());

    if (exchangeRes.error) {
      return res.status(400).json({
        error: 'Token exchange failed',
        details: exchangeRes.error.message || exchangeRes.error
      });
    }

    const longLivedUserToken = exchangeRes.access_token;

    // Step 2: Get permanent page token from long-lived user token
    const pageId = process.env.META_PAGE_ID || '724180587440946';
    const pagesUrl = `${META_GRAPH_BASE}/${pageId}?fields=access_token&access_token=${longLivedUserToken}`;
    const pageRes = await fetch(pagesUrl).then(r => r.json());

    if (pageRes.error) {
      // If page-specific query fails, try listing all pages
      const allPagesUrl = `${META_GRAPH_BASE}/me/accounts?access_token=${longLivedUserToken}`;
      const allPagesRes = await fetch(allPagesUrl).then(r => r.json());

      return res.status(200).json({
        success: true,
        long_lived_user_token: longLivedUserToken,
        expires_in: exchangeRes.expires_in || 'never (page tokens are permanent)',
        pages: allPagesRes.data || [],
        instructions: 'Copy the access_token for your page and update META_PAGE_ACCESS_TOKEN in Vercel.'
      });
    }

    return res.status(200).json({
      success: true,
      permanent_page_token: pageRes.access_token,
      page_id: pageRes.id,
      instructions: 'Copy permanent_page_token and update META_PAGE_ACCESS_TOKEN in Vercel. This token never expires.'
    });
  } catch (err) {
    console.error('[meta-token-exchange] Error:', err);
    return res.status(500).json({ error: 'Token exchange failed: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// META ADS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function getAdAccountId() {
  const id = process.env.META_AD_ACCOUNT_ID || '851747333065647';
  return id.startsWith('act_') ? id : `act_${id}`;
}

async function handleMetaAds(req, res) {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured.' });

  const adAccountId = getAdAccountId();

  if (req.method === 'GET') {
    // List campaigns with insights
    try {
      const campaignsUrl = `${META_GRAPH_BASE}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time&limit=50&access_token=${accessToken}`;
      const campaignsRes = await fetch(campaignsUrl).then(r => r.json());

      if (campaignsRes.error) {
        return res.status(400).json({ error: 'Failed to fetch campaigns', details: campaignsRes.error.message });
      }

      // Fetch account-level insights (last 30 days)
      const insightsUrl = `${META_GRAPH_BASE}/${adAccountId}/insights?fields=impressions,clicks,spend,cpc,cpm,ctr,reach,actions&date_preset=last_30d&access_token=${accessToken}`;
      const insightsRes = await fetch(insightsUrl).then(r => r.json());

      return res.status(200).json({
        success: true,
        ad_account_id: adAccountId,
        campaigns: campaignsRes.data || [],
        insights: insightsRes.data?.[0] || null,
        paging: campaignsRes.paging || null
      });
    } catch (err) {
      console.error('[meta-ads] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch ads: ' + (err.message || 'Unknown error') });
    }
  }

  if (req.method === 'POST') {
    // Create a new ad campaign
    const { name, objective, daily_budget, status, targeting, creative } = req.body || {};

    if (!name) return res.status(400).json({ error: 'Campaign name is required' });

    try {
      const results = {};

      // Step 1: Create Campaign
      const campaignPayload = {
        name,
        objective: objective || 'OUTCOME_TRAFFIC',
        status: status || 'PAUSED',
        special_ad_categories: '[]',
        access_token: accessToken
      };

      const campaignRes = await fetch(`${META_GRAPH_BASE}/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignPayload)
      }).then(r => r.json());

      if (campaignRes.error) {
        return res.status(400).json({ error: 'Campaign creation failed', details: campaignRes.error.message });
      }
      results.campaign = campaignRes;

      // Step 2: Create Ad Set (if daily_budget provided)
      if (daily_budget && campaignRes.id) {
        const pageId = process.env.META_PAGE_ID || '724180587440946';
        const adSetPayload = {
          name: `${name} - Ad Set`,
          campaign_id: campaignRes.id,
          daily_budget: Math.round(daily_budget * 100), // convert dollars to cents
          billing_event: 'IMPRESSIONS',
          optimization_goal: objective === 'OUTCOME_ENGAGEMENT' ? 'POST_ENGAGEMENT' : 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: targeting || {
            geo_locations: { countries: ['US'] },
            age_min: 18,
            age_max: 65,
            interests: [
              { id: '6003384912200', name: 'Tennis' },
              { id: '6003626142574', name: 'Pickleball' }
            ]
          },
          promoted_object: { page_id: pageId },
          status: status || 'PAUSED',
          access_token: accessToken
        };

        const adSetRes = await fetch(`${META_GRAPH_BASE}/${adAccountId}/adsets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adSetPayload)
        }).then(r => r.json());

        results.ad_set = adSetRes;

        // Step 3: Create Ad Creative + Ad (if creative provided)
        if (creative && adSetRes.id && !adSetRes.error) {
          const creativePayload = {
            name: `${name} - Creative`,
            object_story_spec: {
              page_id: pageId,
              link_data: {
                link: creative.link || 'https://www.smartswingai.com',
                message: creative.message || name,
                name: creative.headline || 'SmartSwing AI',
                description: creative.description || 'AI-powered swing analysis',
                image_url: creative.image_url || null
              }
            },
            access_token: accessToken
          };

          // Remove null image_url
          if (!creativePayload.object_story_spec.link_data.image_url) {
            delete creativePayload.object_story_spec.link_data.image_url;
          }

          const creativeRes = await fetch(`${META_GRAPH_BASE}/${adAccountId}/adcreatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creativePayload)
          }).then(r => r.json());

          results.creative = creativeRes;

          if (creativeRes.id) {
            const adPayload = {
              name: `${name} - Ad`,
              adset_id: adSetRes.id,
              creative: { creative_id: creativeRes.id },
              status: status || 'PAUSED',
              access_token: accessToken
            };

            const adRes = await fetch(`${META_GRAPH_BASE}/${adAccountId}/ads`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(adPayload)
            }).then(r => r.json());

            results.ad = adRes;
          }
        }
      }

      return res.status(200).json({ success: true, results });
    } catch (err) {
      console.error('[meta-ads] Create error:', err);
      return res.status(500).json({ error: 'Ad creation failed: ' + (err.message || 'Unknown error') });
    }
  }

  // PATCH - update campaign status
  if (req.method === 'PATCH') {
    const { campaign_id, status: newStatus } = req.body || {};
    if (!campaign_id || !newStatus) return res.status(400).json({ error: 'campaign_id and status required' });

    try {
      const updateRes = await fetch(`${META_GRAPH_BASE}/${campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, access_token: accessToken })
      }).then(r => r.json());

      return res.status(200).json({ success: true, result: updateRes });
    } catch (err) {
      return res.status(500).json({ error: 'Update failed: ' + (err.message || 'Unknown error') });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleMetaAdInsights(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured.' });

  const adAccountId = getAdAccountId();
  const preset = req.query.preset || 'last_30d';

  try {
    // Account-level insights with breakdowns
    const [summaryRes, dailyRes] = await Promise.all([
      fetch(`${META_GRAPH_BASE}/${adAccountId}/insights?fields=impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type&date_preset=${preset}&access_token=${accessToken}`).then(r => r.json()),
      fetch(`${META_GRAPH_BASE}/${adAccountId}/insights?fields=impressions,clicks,spend,ctr,reach&date_preset=${preset}&time_increment=1&limit=90&access_token=${accessToken}`).then(r => r.json())
    ]);

    return res.status(200).json({
      success: true,
      summary: summaryRes.data?.[0] || null,
      daily: dailyRes.data || [],
      error: summaryRes.error || dailyRes.error || null
    });
  } catch (err) {
    console.error('[meta-ad-insights] Error:', err);
    return res.status(500).json({ error: 'Insights fetch failed: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE ANALYTICS & SEARCH CONSOLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a Google OAuth2 access token from a service account JSON key.
 * Works without any external library — pure Node.js crypto.
 */
async function getGoogleAccessToken(scopes) {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured.');

  const key = JSON.parse(keyJson);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + claim set
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  function base64url(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
  }

  const unsignedToken = base64url(header) + '.' + base64url(claim);

  // Sign with the service account private key
  const crypto = require('crypto');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  const signature = signer.sign(key.private_key, 'base64url');

  const jwt = unsignedToken + '.' + signature;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error('Google token exchange failed (' + tokenRes.status + '): ' + errText.slice(0, 300));
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

/**
 * GET /api/marketing/google-analytics
 *
 * Returns GA4 metrics for the last 30 days:
 *   - totalUsers, newUsers, sessions, pageViews, bounceRate, avgSessionDuration
 *   - Daily breakdown for charting
 *   - Top pages by views
 *   - Traffic sources (channels)
 */
async function handleGoogleAnalytics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return res.status(500).json({ error: 'GA4_PROPERTY_ID not configured.' });

  try {
    const accessToken = await getGoogleAccessToken([
      'https://www.googleapis.com/auth/analytics.readonly'
    ]);

    const apiBase = 'https://analyticsdata.googleapis.com/v1beta/properties/' + propertyId;
    const debug = req.query.debug === '1';

    // Helper: fetch and check for GA4 API errors
    async function ga4Fetch(url, body) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (data.error) {
        console.error('[GA4] API error:', JSON.stringify(data.error));
        if (debug) data._httpStatus = r.status;
      }
      return data;
    }

    // Run 4 reports in parallel: overview, daily breakdown, top pages, traffic sources
    const [overviewRes, dailyRes, pagesRes, sourcesRes] = await Promise.all([
      // 1) Overview metrics (last 30 days)
      ga4Fetch(apiBase + ':runReport', {
        dateRanges: [
          { startDate: '30daysAgo', endDate: 'today' },
          { startDate: '60daysAgo', endDate: '31daysAgo' }
        ],
        metrics: [
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagedSessions' }
        ]
      }),

      // 2) Daily breakdown for chart
      ga4Fetch(apiBase + ':runReport', {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' }
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }]
      }),

      // 3) Top pages
      ga4Fetch(apiBase + ':runReport', {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'bounceRate' }
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15
      }),

      // 4) Traffic sources / channels
      ga4Fetch(apiBase + ':runReport', {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'engagedSessions' }
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10
      })
    ]);

    // Debug mode: surface raw API responses
    if (debug) {
      return res.status(200).json({
        success: true,
        debug: true,
        propertyId,
        serviceAccountEmail: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || 'unknown',
        overviewRes,
        dailyRes,
        pagesRes,
        sourcesRes
      });
    }

    // Parse overview metrics
    function parseMetrics(row) {
      if (!row || !row.metricValues) return {};
      return {
        totalUsers: parseInt(row.metricValues[0]?.value || '0'),
        newUsers: parseInt(row.metricValues[1]?.value || '0'),
        sessions: parseInt(row.metricValues[2]?.value || '0'),
        pageViews: parseInt(row.metricValues[3]?.value || '0'),
        bounceRate: parseFloat(row.metricValues[4]?.value || '0'),
        avgSessionDuration: parseFloat(row.metricValues[5]?.value || '0'),
        engagedSessions: parseInt(row.metricValues[6]?.value || '0')
      };
    }

    const current = parseMetrics(overviewRes.rows?.[0]);
    const previous = overviewRes.rows?.[1] ? parseMetrics(overviewRes.rows[1]) : null;

    // Parse daily data
    const daily = (dailyRes.rows || []).map(row => ({
      date: row.dimensionValues[0].value,
      users: parseInt(row.metricValues[0]?.value || '0'),
      sessions: parseInt(row.metricValues[1]?.value || '0'),
      pageViews: parseInt(row.metricValues[2]?.value || '0')
    }));

    // Parse top pages
    const topPages = (pagesRes.rows || []).map(row => ({
      path: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0]?.value || '0'),
      users: parseInt(row.metricValues[1]?.value || '0'),
      bounceRate: parseFloat(row.metricValues[2]?.value || '0')
    }));

    // Parse traffic sources
    const sources = (sourcesRes.rows || []).map(row => ({
      channel: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0]?.value || '0'),
      users: parseInt(row.metricValues[1]?.value || '0'),
      engagedSessions: parseInt(row.metricValues[2]?.value || '0')
    }));

    return res.status(200).json({
      success: true,
      propertyId,
      current,
      previous,
      daily,
      topPages,
      sources
    });
  } catch (err) {
    console.error('[google-analytics] Error:', err);
    return res.status(500).json({ error: 'GA4 fetch failed: ' + (err.message || 'Unknown error') });
  }
}

/**
 * GET /api/marketing/google-search-console
 *
 * Returns Search Console data for the last 30 days:
 *   - Total impressions, clicks, CTR, average position
 *   - Top queries
 *   - Top pages
 *   - Daily breakdown
 */
async function handleGoogleSearchConsole(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });

  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL || 'https://www.smartswingai.com';

  try {
    const accessToken = await getGoogleAccessToken([
      'https://www.googleapis.com/auth/webmasters.readonly'
    ]);

    const apiBase = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl);

    const now = new Date();
    const endDate = new Date(now); endDate.setDate(now.getDate() - 2); // SC data has ~2 day lag
    const startDate = new Date(endDate); startDate.setDate(endDate.getDate() - 30);
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    // Run 3 queries in parallel: overall, top queries, top pages
    const [overallRes, queriesRes, pagesRes, dailyRes] = await Promise.all([
      // 1) Overall totals
      fetch(apiBase + '/searchAnalytics/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end })
      }).then(r => r.json()),

      // 2) Top search queries
      fetch(apiBase + '/searchAnalytics/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start, endDate: end,
          dimensions: ['query'],
          rowLimit: 20
        })
      }).then(r => r.json()),

      // 3) Top pages
      fetch(apiBase + '/searchAnalytics/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start, endDate: end,
          dimensions: ['page'],
          rowLimit: 15
        })
      }).then(r => r.json()),

      // 4) Daily breakdown
      fetch(apiBase + '/searchAnalytics/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start, endDate: end,
          dimensions: ['date']
        })
      }).then(r => r.json())
    ]);

    // Parse overall totals
    const totals = overallRes.rows?.[0] || {};
    const overview = {
      clicks: totals.clicks || 0,
      impressions: totals.impressions || 0,
      ctr: totals.ctr || 0,
      position: totals.position || 0
    };

    // Parse top queries
    const topQueries = (queriesRes.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: Math.round(row.position * 10) / 10
    }));

    // Parse top pages
    const topPages = (pagesRes.rows || []).map(row => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: Math.round(row.position * 10) / 10
    }));

    // Parse daily
    const daily = (dailyRes.rows || []).map(row => ({
      date: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: Math.round(row.position * 10) / 10
    }));

    return res.status(200).json({
      success: true,
      siteUrl,
      dateRange: { start, end },
      overview,
      topQueries,
      topPages,
      daily
    });
  } catch (err) {
    console.error('[google-search-console] Error:', err);
    return res.status(500).json({ error: 'Search Console fetch failed: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: generate-image
// ═══════════════════════════════════════════════════════════════════════════════

async function handleGenerateImage(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  const { prompt, content_item_id, size } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const detail = await generateImage(prompt, size, { returnDetail: true, contentItemId: content_item_id || null });
  if (!detail?.url) return res.status(500).json({ error: 'Image generation failed. Check OPENAI_API_KEY.' });

  // If content_item_id provided, update the calendar item with both URL + asset link
  if (content_item_id) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', content_item_id, {
          image_url: detail.url,
          media_asset_id: detail.assetId || null
        });
      } catch (err) { console.warn('[generate-image] Failed to update content_calendar:', err.message); }
    }
  }

  return res.status(200).json({
    success: true,
    image_url: detail.url,
    media_asset_id: detail.assetId,
    prompt_used: detail.promptUsed
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: auto-publish
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAutoPublish(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID || '724180587440946';
  const igAccountId = process.env.META_IG_ACCOUNT_ID || '17841475762518145';

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });
  if (!accessToken) return res.status(500).json({ error: 'META_PAGE_ACCESS_TOKEN not configured' });

  const today = new Date().toISOString().split('T')[0];

  try {
    // Get scheduled items due for publishing today or earlier (with approved status)
    const { item_id } = req.body || {};
    let queryUrl = supabaseUrl + '/rest/v1/content_calendar?status=eq.scheduled&approval_status=eq.approved&scheduled_date=lte.' + today + '&select=*';
    if (item_id) queryUrl = supabaseUrl + '/rest/v1/content_calendar?id=eq.' + item_id + '&status=eq.scheduled&select=*';
    const items = await supabaseGet(queryUrl, supabaseKey);

    if (!items || items.length === 0) {
      return res.status(200).json({ success: true, message: 'No items due for publishing', published: 0 });
    }

    const results = [];

    for (const item of items) {
      const platform = item.platform || 'facebook';
      const message = item.copy_text || item.title;

      try {
        let publishResult = {};

        let actuallyPublished = false;
        let publishedUrl = null;
        let failureReason = null;

        if (platform === 'facebook' || platform === 'both') {
          const fbPayload = { message, access_token: accessToken };
          const fbRes = await fetch(META_GRAPH_BASE + '/' + pageId + '/feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fbPayload)
          }).then(r => r.json());
          publishResult.facebook = fbRes;
          if (fbRes.id) {
            actuallyPublished = true;
            publishedUrl = 'https://facebook.com/' + fbRes.id;
          } else {
            failureReason = (fbRes.error && fbRes.error.message) ? fbRes.error.message : 'Facebook publish failed';
          }
        }

        if ((platform === 'instagram' || platform === 'both') && item.image_url) {
          const containerRes = await fetch(META_GRAPH_BASE + '/' + igAccountId + '/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: item.image_url, caption: message, access_token: accessToken })
          }).then(r => r.json());

          if (containerRes.id) {
            const pubRes = await fetch(META_GRAPH_BASE + '/' + igAccountId + '/media_publish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creation_id: containerRes.id, access_token: accessToken })
            }).then(r => r.json());
            publishResult.instagram = pubRes;
            if (pubRes.id) {
              actuallyPublished = true;
              publishedUrl = publishedUrl || ('https://instagram.com/p/' + pubRes.id);
            } else {
              failureReason = failureReason || ((pubRes.error && pubRes.error.message) ? pubRes.error.message : 'Instagram publish failed');
            }
          } else {
            publishResult.instagram = { error: 'Container creation failed', details: containerRes };
            failureReason = failureReason || 'Instagram container creation failed';
          }
        }

        // For non-Meta platforms (tiktok, youtube, x, reddit, etc.) — do NOT mark as published.
        // They are not yet implemented and should remain 'scheduled'.
        const isMetaPlatform = platform === 'facebook' || platform === 'instagram' || platform === 'both';
        if (!isMetaPlatform) {
          results.push({ id: item.id, title: item.title, platform, status: 'skipped', reason: 'Platform not yet configured for auto-publish' });
          continue;
        }

        // Only mark as published if the API call actually returned a valid post ID
        if (actuallyPublished) {
          await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', item.id, {
            status: 'published',
            published_date: today,
            published_at: new Date().toISOString(),
            posted_url: publishedUrl,
            published_url: publishedUrl,
            platform_response: publishResult
          });
          results.push({ id: item.id, title: item.title, platform, result: publishResult, status: 'published', url: publishedUrl });
        } else {
          // Keep status='scheduled' so it retries next run; record the failure reason
          // and raw platform response so the UI can surface the error.
          await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', item.id, {
            status: 'failed',
            failure_reason: (failureReason || 'Publish failed — no post ID returned').slice(0, 500),
            platform_response: publishResult
          });
          results.push({ id: item.id, title: item.title, platform, result: publishResult, status: 'failed', reason: failureReason });
        }
      } catch (pubErr) {
        console.error('[auto-publish] Failed to publish item ' + item.id + ':', pubErr.message);
        results.push({ id: item.id, title: item.title, platform, error: pubErr.message, status: 'failed' });
      }
    }

    return res.status(200).json({ success: true, published: results.filter(r => r.status === 'published').length, total: items.length, results });
  } catch (err) {
    console.error('[auto-publish] Error:', err);
    return res.status(500).json({ error: 'Auto-publish failed: ' + (err.message || 'Unknown error') });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: prospect-clubs — Google Places API prospecting for tennis clubs/academies
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Segmented prospecting regions. Each region has cities/areas to search.
 * This breaks the global search into manageable chunks.
 */
const PROSPECT_REGIONS = {
  'us-northeast': { country: 'US', cities: ['New York', 'Boston', 'Philadelphia', 'Washington DC', 'Hartford', 'Providence', 'Baltimore', 'Pittsburgh'] },
  'us-southeast': { country: 'US', cities: ['Miami', 'Atlanta', 'Charlotte', 'Orlando', 'Tampa', 'Jacksonville', 'Nashville', 'Raleigh'] },
  'us-midwest': { country: 'US', cities: ['Chicago', 'Detroit', 'Minneapolis', 'Cleveland', 'Cincinnati', 'Indianapolis', 'St Louis', 'Milwaukee'] },
  'us-southwest': { country: 'US', cities: ['Dallas', 'Houston', 'Phoenix', 'San Antonio', 'Austin', 'Denver', 'Las Vegas', 'Albuquerque'] },
  'us-west': { country: 'US', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'Seattle', 'Portland', 'Sacramento', 'Salt Lake City', 'Honolulu'] },
  'us-florida': { country: 'US', cities: ['Boca Raton', 'Naples', 'Sarasota', 'Fort Lauderdale', 'Palm Beach', 'Delray Beach', 'Key Biscayne', 'Bradenton'] },
  'canada': { country: 'CA', cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton'] },
  'uk': { country: 'GB', cities: ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Leeds', 'Bristol', 'Liverpool'] },
  'europe-west': { country: null, cities: ['Paris', 'Madrid', 'Barcelona', 'Rome', 'Milan', 'Lisbon', 'Amsterdam', 'Brussels', 'Munich', 'Berlin'] },
  'europe-east': { country: null, cities: ['Prague', 'Vienna', 'Warsaw', 'Budapest', 'Bucharest', 'Zagreb', 'Belgrade'] },
  'australia': { country: 'AU', cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast'] },
  'latin-america': { country: null, cities: ['Sao Paulo', 'Buenos Aires', 'Mexico City', 'Bogota', 'Santiago', 'Lima', 'Rio de Janeiro'] },
  'asia': { country: null, cities: ['Tokyo', 'Singapore', 'Dubai', 'Mumbai', 'Hong Kong', 'Seoul', 'Bangkok', 'Shanghai'] },
  'africa': { country: null, cities: ['Cape Town', 'Johannesburg', 'Nairobi', 'Lagos', 'Cairo', 'Casablanca'] }
};

async function handleProspectClubs(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) {
    return res.status(200).json({
      success: false,
      error: 'GOOGLE_PLACES_API_KEY not configured in Vercel environment variables',
      setup_instructions: {
        step1: 'Go to https://console.cloud.google.com/apis/credentials',
        step2: 'Create an API key with Places API (New) enabled',
        step3: 'Add GOOGLE_PLACES_API_KEY to your Vercel project environment variables',
        step4: 'Re-deploy or re-run this endpoint'
      },
      available_regions: Object.keys(PROSPECT_REGIONS),
      estimated_leads_per_region: '50-200 clubs/academies'
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { region, queries, dry_run } = req.body || {};

  if (!region) {
    return res.status(200).json({
      success: true,
      available_regions: Object.keys(PROSPECT_REGIONS),
      region_details: PROSPECT_REGIONS,
      usage: 'POST with { "region": "us-southeast" } to prospect that region. Add "dry_run": true to preview without saving.'
    });
  }

  const regionConfig = PROSPECT_REGIONS[region];
  if (!regionConfig) {
    return res.status(400).json({ error: `Unknown region: ${region}`, available_regions: Object.keys(PROSPECT_REGIONS) });
  }

  const searchQueries = queries || ['tennis club', 'tennis academy', 'tennis center', 'tennis school'];
  const batchId = `prospect_${region}_${new Date().toISOString().split('T')[0]}`;
  const allPlaces = [];
  const seenPlaceIds = new Set();

  try {
    for (const city of regionConfig.cities) {
      for (const query of searchQueries) {
        const textQuery = `${query} in ${city}`;
        const searchUrl = `https://places.googleapis.com/v1/places:searchText`;

        try {
          const placesRes = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleApiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.location,places.addressComponents'
            },
            body: JSON.stringify({
              textQuery,
              maxResultCount: 20,
              languageCode: 'en'
            })
          });

          if (!placesRes.ok) {
            console.warn(`[prospect] Places API error for "${textQuery}": ${placesRes.status}`);
            continue;
          }

          const placesData = await placesRes.json();
          const places = placesData.places || [];

          for (const place of places) {
            if (seenPlaceIds.has(place.id)) continue;
            seenPlaceIds.add(place.id);

            // Extract country and city from address components
            const components = place.addressComponents || [];
            const countryComp = components.find(c => (c.types || []).includes('country'));
            const cityComp = components.find(c => (c.types || []).includes('locality'));
            const stateComp = components.find(c => (c.types || []).includes('administrative_area_level_1'));

            allPlaces.push({
              name: place.displayName?.text || '',
              email: '',  // Google Places doesn't provide email — needs enrichment
              phone: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
              website: place.websiteUri || '',
              address: place.formattedAddress || '',
              city: cityComp?.longText || city,
              state_region: stateComp?.shortText || '',
              country: countryComp?.longText || '',
              country_code: countryComp?.shortText || regionConfig.country || '',
              latitude: place.location?.latitude || null,
              longitude: place.location?.longitude || null,
              rating: place.rating || null,
              review_count: place.userRatingCount || 0,
              persona: 'club',
              // Only mark as 'lead' if contactable (has phone). Email is almost never
              // provided by Google Places — enrichment promotes 'prospect' → 'lead'.
              stage: (place.internationalPhoneNumber || place.nationalPhoneNumber) ? 'lead' : 'prospect',
              source: 'google_places',
              enrichment_source: 'google_places',
              enrichment_batch: batchId,
              tags: `{tennis,${query.replace('tennis ', '')}}`,
              notes: `Found via Google Places: "${textQuery}". Rating: ${place.rating || 'N/A'} (${place.userRatingCount || 0} reviews)`
            });
          }
        } catch (err) {
          console.warn(`[prospect] Error searching "${query} in ${city}":`, err.message);
        }
      }
    }

    if (dry_run) {
      return res.status(200).json({
        success: true,
        dry_run: true,
        region,
        batch_id: batchId,
        total_found: allPlaces.length,
        cities_searched: regionConfig.cities.length,
        queries_used: searchQueries,
        sample: allPlaces.slice(0, 5).map(p => ({ name: p.name, city: p.city, country: p.country, phone: p.phone, website: p.website, rating: p.rating })),
        note: 'Remove "dry_run": true to save these leads to the database'
      });
    }

    // Insert into marketing_contacts (upsert by name+city to avoid duplicates)
    let inserted = 0;
    let skipped = 0;

    for (const place of allPlaces) {
      try {
        // Check if already exists by name + city
        const checkUrl = `${supabaseUrl}/rest/v1/marketing_contacts?name=eq.${encodeURIComponent(place.name)}&city=eq.${encodeURIComponent(place.city)}&select=id&limit=1`;
        const existing = await supabaseGet(checkUrl, supabaseKey);
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // Insert with a generated placeholder email if none available
        const emailPlaceholder = place.email || `${place.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@pending-enrichment.smartswingai.com`;
        await supabaseInsert(supabaseUrl, supabaseKey, 'marketing_contacts', {
          ...place,
          email: emailPlaceholder,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        inserted++;
      } catch (err) {
        // Likely duplicate email constraint — skip
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      region,
      batch_id: batchId,
      total_found: allPlaces.length,
      inserted,
      skipped,
      cities_searched: regionConfig.cities.length,
      queries_used: searchQueries,
      next_steps: [
        'Enrich leads with email addresses (check websites, social profiles)',
        'Run cadence enrollment for outreach',
        'Assign to campaigns for targeted marketing'
      ]
    });
  } catch (err) {
    console.error('[prospect-clubs] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: prospect-players
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/marketing/prospect-players
 *
 * Fetches player data from public federation ranking pages (ITF, USTA, ATP, WTA).
 * These are publicly available rankings — no private data is collected.
 *
 * Body: { federation: 'itf'|'usta'|'atp'|'wta', category, ranking_range, dry_run }
 *
 * Data collected per player (all public record):
 *   - Name, nationality, ranking position, ranking tier
 *   - Federation profile URL (public page link)
 *   - Club affiliation (when listed on profile)
 *
 * NOT collected (not available / privacy):
 *   - Email, phone, home address
 *
 * GDPR basis: Legitimate interest — publicly published sports rankings
 */

const FEDERATION_CONFIGS = {
  itf: {
    name: 'International Tennis Federation',
    baseUrl: 'https://www.itftennis.com',
    categories: {
      'mens-singles':   { path: '/rankings/mens-rankings', label: "Men's Singles" },
      'womens-singles': { path: '/rankings/womens-rankings', label: "Women's Singles" },
      'juniors-boys':   { path: '/rankings/juniors-rankings', label: 'Juniors Boys' },
      'juniors-girls':  { path: '/rankings/juniors-rankings', label: 'Juniors Girls' },
      'seniors':        { path: '/rankings/seniors-rankings', label: 'Seniors' },
      'wheelchair':     { path: '/rankings/wheelchair-rankings', label: 'Wheelchair' }
    }
  },
  usta: {
    name: 'United States Tennis Association',
    baseUrl: 'https://www.usta.com',
    categories: {
      'ntrp-3.0':  { label: 'NTRP 3.0 (Beginner-Intermediate)' },
      'ntrp-3.5':  { label: 'NTRP 3.5 (Intermediate)' },
      'ntrp-4.0':  { label: 'NTRP 4.0 (Advanced-Intermediate)' },
      'ntrp-4.5':  { label: 'NTRP 4.5 (Advanced)' },
      'ntrp-5.0':  { label: 'NTRP 5.0 (Tournament)' },
      'open':      { label: 'Open / Ranked' },
      'junior':    { label: 'Junior Rankings' },
      'collegiate': { label: 'Collegiate' }
    }
  },
  atp: {
    name: 'Association of Tennis Professionals',
    baseUrl: 'https://www.atptour.com',
    categories: {
      'singles': { path: '/rankings/singles', label: 'Singles' },
      'doubles': { path: '/rankings/doubles', label: 'Doubles' },
      'race':    { path: '/rankings/pepperstone-atp-race-to-turin', label: 'Race to Turin' }
    }
  },
  wta: {
    name: "Women's Tennis Association",
    baseUrl: 'https://www.wtatennis.com',
    categories: {
      'singles': { path: '/rankings/singles', label: 'Singles' },
      'doubles': { path: '/rankings/doubles', label: 'Doubles' },
      'race':    { path: '/rankings/race-singles', label: 'Race to Finals' }
    }
  },
  sofascore: {
    name: 'Sofascore Rankings (Real-time)',
    categories: {
      'atp-singles':   { sofascoreType: 'ATP Singles',    label: "ATP Men's Singles" },
      'wta-singles':   { sofascoreType: 'WTA Singles',    label: "WTA Women's Singles" },
      'itf-men':       { sofascoreType: 'ITF Men',        label: 'ITF Men' },
      'itf-women':     { sofascoreType: 'ITF Women',      label: 'ITF Women' },
      'juniors-boys':  { sofascoreType: 'Juniors Boys',   label: 'ITF Juniors Boys' },
      'juniors-girls': { sofascoreType: 'Juniors Girls',  label: 'ITF Juniors Girls' },
      'atp-doubles':   { sofascoreType: 'ATP Doubles',    label: 'ATP Doubles' },
      'wta-doubles':   { sofascoreType: 'WTA Doubles',    label: 'WTA Doubles' }
    }
  },
  utr: {
    name: 'UTR Amateur Players (All Levels)',
    categories: {
      'all-players':    { label: 'All Players (by UTR)',   searchQuery: 'tennis' },
      'us-players':     { label: 'US Players',             searchQuery: 'tennis US' },
      'uk-players':     { label: 'UK Players',             searchQuery: 'tennis UK' },
      'eu-players':     { label: 'EU Players',             searchQuery: 'tennis Europe' },
      'latam-players':  { label: 'Latin America',          searchQuery: 'tennis Brazil Argentina' },
      'asia-players':   { label: 'Asia Pacific',           searchQuery: 'tennis Australia Japan' },
      'junior':         { label: 'Junior Players',         searchQuery: 'tennis junior' },
      'adult-amateur':  { label: 'Adult Amateur',          searchQuery: 'tennis adult amateur' },
      'collegiate':     { label: 'Collegiate (NCAA)',      searchQuery: 'tennis college NCAA' }
    }
  },
  pickleball: {
    name: 'Pickleball Players (PPA / APP / DUPR)',
    categories: {
      'ppa-men':        { sofascoreType: 'PPA Men',          label: "PPA Men's Pro" },
      'ppa-women':      { sofascoreType: 'PPA Women',        label: "PPA Women's Pro" },
      'app-men':        { sofascoreType: 'APP Men',          label: "APP Men's Pro" },
      'app-women':      { sofascoreType: 'APP Women',        label: "APP Women's Pro" },
      'dupr-all':       { duprQuery: 'pickleball',           label: 'DUPR All Levels (Amateur)' },
      'dupr-us':        { duprQuery: 'pickleball US',        label: 'DUPR US Players' },
      'dupr-junior':    { duprQuery: 'pickleball junior',    label: 'DUPR Junior Players' },
      'dupr-senior':    { duprQuery: 'pickleball senior',    label: 'DUPR Senior Players (50+)' }
    }
  },
  coaches: {
    name: 'Tennis & Pickleball Coaches',
    categories: {
      'tennis-us':       { label: 'Tennis Coaches — United States',   sport: 'tennis', country: 'US' },
      'tennis-uk':       { label: 'Tennis Coaches — United Kingdom',  sport: 'tennis', country: 'GB' },
      'tennis-eu':       { label: 'Tennis Coaches — Europe',          sport: 'tennis', country: 'EU' },
      'tennis-latam':    { label: 'Tennis Coaches — Latin America',   sport: 'tennis', country: 'LATAM' },
      'tennis-au':       { label: 'Tennis Coaches — Australia',       sport: 'tennis', country: 'AU' },
      'pickleball-us':   { label: 'Pickleball Coaches — United States', sport: 'pickleball', country: 'US' },
      'pickleball-all':  { label: 'Pickleball Coaches — Global',      sport: 'pickleball', country: 'GLOBAL' },
      'all-global':      { label: 'All Coaches — Global',             sport: 'both', country: 'GLOBAL' }
    }
  }
};

function classifyRankingTier(position) {
  if (position <= 100) return 'top100';
  if (position <= 500) return 'top500';
  if (position <= 1000) return 'top1000';
  if (position <= 5000) return 'national';
  return 'regional';
}

/**
 * Fetch real player rankings from Sofascore's public API.
 * Returns actual player names, nationalities, ranking positions.
 * On error: logs warning and returns empty array — never generates fake placeholders.
 */
async function fetchSofascoreRankings(sofascoreType, startRank, endRank) {
  const players = [];
  try {
    const encodedType = encodeURIComponent(sofascoreType);
    const url = `https://api.sofascore.com/api/v1/sport/tennis/ranking/${encodedType}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'SmartSwingAI/1.0',
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      console.warn(`[prospect-players] Sofascore API returned ${resp.status} for ${sofascoreType}`);
      return [];
    }

    const data = await resp.json();
    const rankings = data.rankings || [];

    for (const item of rankings) {
      const rank = parseInt(item.rowName, 10);
      if (isNaN(rank) || rank < startRank || rank > endRank) continue;

      const playerName = item.team?.name || '';
      const nationality = item.team?.country?.alpha2 || '';
      const sofascoreId = item.team?.id || '';
      const nameSlug = playerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      players.push({
        name: playerName,
        nationality: nationality,
        ranking_position: rank,
        ranking_tier: classifyRankingTier(rank),
        federation_id: `sofascore-${sofascoreType.replace(/\s+/g, '-').toLowerCase()}-${sofascoreId || rank}`,
        federation_profile_url: sofascoreId
          ? `https://www.sofascore.com/player/${nameSlug}/${sofascoreId}`
          : `https://www.sofascore.com`,
        category: sofascoreType,
        _needs_enrichment: false
      });
    }
  } catch (err) {
    console.warn(`[prospect-players] Sofascore fetch error for ${sofascoreType}:`, err.message);
  }
  return players;
}

/**
 * Convert UTR rating number to ranking tier label.
 */
function utrToTier(utr) {
  if (!utr || isNaN(utr)) return 'amateur';
  if (utr >= 12) return 'top100';
  if (utr >= 10) return 'top500';
  if (utr >= 8) return 'national';
  if (utr >= 5) return 'regional';
  return 'amateur';
}

/**
 * Fetch amateur player data from UTR (Universal Tennis Rating) public search API.
 * On error: returns empty array, never throws.
 */
async function fetchUTRPlayers(searchQuery, count) {
  const players = [];
  try {
    const url = `https://api.utrsports.net/v2/search/players?query=${encodeURIComponent(searchQuery)}&sportTypeId=2&count=${count}&pageNum=0`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SmartSwingAI/1.0'
      }
    });

    if (!resp.ok) {
      console.warn(`[prospect-players] UTR API returned ${resp.status} for query "${searchQuery}"`);
      return [];
    }

    const data = await resp.json();
    const rawPlayers = data.players || data.hits || [];

    for (const p of rawPlayers) {
      const source = p.source || p;
      const displayName = source.displayName || source.name || '';
      if (!displayName) continue;

      const utrId = source.utrId || source.id || '';
      const singlesUtr = parseFloat(source.singlesUtr || source.singlesUtrDisplay || 0) || 0;
      const location = source.location || {};
      const club = source.club || {};

      players.push({
        name: displayName,
        nationality: location.countryCode || '',
        ranking_position: null,
        ranking_tier: utrToTier(singlesUtr),
        federation_id: `utr-${utrId}`,
        federation_profile_url: utrId ? `https://myutr.com/profiles/${utrId}` : '',
        rating: singlesUtr,
        club_affiliation_name: club.name || '',
        city: location.cityName || '',
        country: location.countryName || '',
        _needs_enrichment: false
      });
    }
  } catch (err) {
    console.warn(`[prospect-players] UTR fetch error:`, err.message);
  }
  return players;
}

/**
 * Fetch pickleball players via DUPR public search API.
 * DUPR (Dynamic Universal Pickleball Rating) is the universal rating system for pickleball.
 * Falls back to UTR-style search with sportTypeId=1 (pickleball).
 */
async function fetchDUPRPlayers(searchQuery, count) {
  const players = [];
  try {
    // Try DUPR public API first
    const duprUrl = `https://api.dupr.gg/player/v1.0/search?query=${encodeURIComponent(searchQuery)}&limit=${Math.min(count, 100)}`;
    const resp = await fetch(duprUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SmartSwingAI/1.0' }
    });
    if (resp.ok) {
      const data = await resp.json();
      const rawPlayers = data.players || data.results || data.hits || [];
      for (const p of rawPlayers) {
        const src = p.source || p;
        const displayName = src.displayName || src.fullName || src.name || '';
        if (!displayName) continue;
        const duprId = src.duprId || src.id || '';
        const rating = parseFloat(src.doubles || src.singles || src.rating || 0) || 0;
        players.push({
          name: displayName,
          nationality: src.countryCode || src.country || '',
          ranking_position: null,
          ranking_tier: rating >= 5.5 ? 'pro' : rating >= 4.5 ? 'advanced' : rating >= 3.5 ? 'intermediate' : 'beginner',
          federation_id: `dupr-${duprId}`,
          federation_profile_url: duprId ? `https://mydupr.com/profile/${duprId}` : '',
          rating,
          player_type: 'pickleball',
          persona: 'player_pball',
          city: src.city || src.location?.cityName || '',
          country: src.countryName || src.location?.countryName || '',
          _needs_enrichment: true
        });
      }
      if (players.length > 0) return players;
    }
  } catch (err) {
    console.warn('[prospect-players] DUPR fetch error:', err.message);
  }

  // Fallback: UTR Sports API with pickleball sport type (sportTypeId=1)
  try {
    const fallbackUrl = `https://api.utrsports.net/v2/search/players?query=${encodeURIComponent(searchQuery)}&sportTypeId=1&count=${Math.min(count, 100)}&pageNum=0`;
    const resp2 = await fetch(fallbackUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SmartSwingAI/1.0' }
    });
    if (resp2.ok) {
      const data2 = await resp2.json();
      const raw = data2.players || data2.hits || [];
      for (const p of raw) {
        const src = p.source || p;
        const displayName = src.displayName || src.name || '';
        if (!displayName) continue;
        players.push({
          name: displayName,
          nationality: src.location?.countryCode || '',
          ranking_position: null,
          ranking_tier: 'amateur',
          federation_id: `utr-pb-${src.utrId || src.id || ''}`,
          federation_profile_url: src.utrId ? `https://myutr.com/profiles/${src.utrId}` : '',
          player_type: 'pickleball',
          persona: 'player_pball',
          city: src.location?.cityName || '',
          country: src.location?.countryName || '',
          _needs_enrichment: true
        });
      }
    }
  } catch (err2) {
    console.warn('[prospect-players] DUPR/UTR pickleball fallback error:', err2.message);
  }
  return players;
}

/**
 * Prospect coaches via Google Places API — searches for tennis/pickleball coaches
 * and coaching services in a given country/region.
 */
async function fetchCoachesByRegion(sport, country) {
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) {
    console.warn('[prospect-coaches] GOOGLE_PLACES_API_KEY not set');
    return [];
  }

  const sportLabel = sport === 'pickleball' ? 'pickleball coach' : sport === 'both' ? 'tennis pickleball coach' : 'tennis coach';
  const countryMap = {
    US: 'United States', GB: 'United Kingdom', EU: 'Europe',
    LATAM: 'Latin America', AU: 'Australia', GLOBAL: ''
  };
  const regionLabel = countryMap[country] || '';
  const query = regionLabel ? `${sportLabel} ${regionLabel}` : sportLabel;

  const coaches = [];
  try {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=gym&key=${googleApiKey}`;
    const resp = await fetch(searchUrl);
    if (!resp.ok) return [];
    const data = await resp.json();
    const results = data.results || [];

    for (const place of results.slice(0, 50)) {
      // Look for individual coach names (not just venues/clubs)
      const name = place.name || '';
      const isCoach = /coach|trainer|instructor|academy|lessons/i.test(name) ||
                      /coach|trainer|instructor/i.test(place.types?.join(' ') || '');
      if (!isCoach) continue;

      coaches.push({
        name,
        persona: 'coach',
        player_type: 'coach',
        data_source: 'google_places',
        phone: place.formatted_phone_number || '',
        city: place.formatted_address?.split(',')[1]?.trim() || '',
        country: country === 'GLOBAL' ? '' : (countryMap[country] || ''),
        google_place_id: place.place_id || '',
        federation_profile_url: place.website || '',
        rating: place.rating || null,
        _needs_enrichment: true,
        tags: [sport, 'coach', country.toLowerCase()]
      });
    }
  } catch (err) {
    console.warn('[prospect-coaches] Google Places error:', err.message);
  }
  return coaches;
}

/**
 * Parse ranking data from ITF ranking pages.
 * ITF rankings are publicly available at itftennis.com/rankings
 * The API returns structured JSON for ranking lists.
 */
async function fetchITFRankings(category, startRank, endRank) {
  const players = [];
  const catConfig = FEDERATION_CONFIGS.itf.categories[category];
  if (!catConfig) return players;

  // ITF provides a public JSON API for rankings
  const gender = category.includes('women') || category.includes('girls') ? 'W' : 'M';
  const circuitType = category.includes('junior') ? 'junior' : category.includes('senior') ? 'senior' : 'pro';

  // Fetch in pages of 100
  const pageSize = 100;
  const startPage = Math.floor((startRank - 1) / pageSize) + 1;
  const endPage = Math.floor((endRank - 1) / pageSize) + 1;

  for (let page = startPage; page <= endPage; page++) {
    try {
      // ITF public rankings endpoint
      const url = `https://www.itftennis.com/api/rankings?gender=${gender}&type=${circuitType}&page=${page}&pageSize=${pageSize}`;

      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SmartSwingAI/1.0 (Tennis Analytics Platform; contact@smartswingai.com)'
        }
      });

      if (!resp.ok) {
        console.warn(`[prospect-players] ITF API returned ${resp.status} for page ${page}`);
        // Fallback: generate structured placeholder from known ranking data
        for (let rank = (page - 1) * pageSize + 1; rank <= Math.min(page * pageSize, endRank); rank++) {
          if (rank < startRank) continue;
          players.push({
            name: `ITF Ranked Player #${rank}`,
            nationality: '',
            ranking_position: rank,
            ranking_tier: classifyRankingTier(rank),
            federation_id: `itf-${gender}-${circuitType}-${rank}`,
            federation_profile_url: `https://www.itftennis.com/en/players/player-profile/?playerId=`,
            category: catConfig.label,
            _needs_enrichment: true
          });
        }
        continue;
      }

      const data = await resp.json();
      const rows = data.items || data.rankings || data.results || [];

      for (const row of rows) {
        const rank = row.rank || row.ranking || row.position;
        if (rank < startRank || rank > endRank) continue;

        players.push({
          name: row.playerName || row.name || `${row.firstName || ''} ${row.lastName || ''}`.trim(),
          nationality: row.nationality || row.country || row.nationCode || '',
          ranking_position: rank,
          ranking_tier: classifyRankingTier(rank),
          federation_id: row.playerId || row.id || `itf-${rank}`,
          federation_profile_url: row.profileUrl || `https://www.itftennis.com/en/players/player-profile/?playerId=${row.playerId || ''}`,
          category: catConfig.label,
          club_affiliation_name: row.club || row.clubName || '',
          _needs_enrichment: false
        });
      }
    } catch (err) {
      console.warn(`[prospect-players] ITF fetch error page ${page}:`, err.message);
    }
  }

  return players;
}

/**
 * Parse ranking data from ATP/WTA public pages.
 * ATP and WTA publish rankings with player name, country, ranking, and profile links.
 */
async function fetchATPWTARankings(federation, category, startRank, endRank) {
  const players = [];
  const config = FEDERATION_CONFIGS[federation];
  const catConfig = config?.categories[category];
  if (!catConfig || !catConfig.path) return players;

  // ATP/WTA public rankings data
  const pageSize = 100;
  const startPage = Math.floor((startRank - 1) / pageSize);
  const endPage = Math.floor((endRank - 1) / pageSize);

  for (let page = startPage; page <= endPage; page++) {
    try {
      const offset = page * pageSize;
      const url = federation === 'atp'
        ? `https://www.atptour.com/en/-/ajax/RankingsController/Ranking?page=${page}&rankRange=${offset + 1}-${offset + pageSize}&region=all`
        : `https://api.wtatennis.com/tennis/v1/ranking/singles?page=${page}&pageSize=${pageSize}`;

      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SmartSwingAI/1.0 (Tennis Analytics Platform; contact@smartswingai.com)'
        }
      });

      if (!resp.ok) {
        console.warn(`[prospect-players] ${federation.toUpperCase()} API returned ${resp.status}`);
        // Generate structured placeholders
        for (let rank = offset + 1; rank <= Math.min(offset + pageSize, endRank); rank++) {
          if (rank < startRank) continue;
          players.push({
            name: `${federation.toUpperCase()} Ranked Player #${rank}`,
            nationality: '',
            ranking_position: rank,
            ranking_tier: classifyRankingTier(rank),
            federation_id: `${federation}-${category}-${rank}`,
            federation_profile_url: `${config.baseUrl}${catConfig.path}`,
            category: catConfig.label,
            _needs_enrichment: true
          });
        }
        continue;
      }

      const data = await resp.json();
      const rows = data.rankings || data.items || data.results || data.data || [];

      for (const row of rows) {
        const rank = row.rank || row.ranking || row.sglRank || row.position || (offset + rows.indexOf(row) + 1);
        if (rank < startRank || rank > endRank) continue;

        const playerName = row.playerName || row.name || row.fullName
          || `${row.firstName || row.givenName || ''} ${row.lastName || row.familyName || ''}`.trim();

        players.push({
          name: playerName,
          nationality: row.nationality || row.country || row.nationCode || row.countryCode || '',
          ranking_position: rank,
          ranking_tier: classifyRankingTier(rank),
          federation_id: row.playerId || row.id || `${federation}-${rank}`,
          federation_profile_url: row.profileUrl || row.playerUrl || `${config.baseUrl}/en/players/${(playerName || '').toLowerCase().replace(/\s+/g, '-')}/overview`,
          category: catConfig.label,
          club_affiliation_name: row.club || '',
          _needs_enrichment: !playerName || playerName.includes('#')
        });
      }
    } catch (err) {
      console.warn(`[prospect-players] ${federation.toUpperCase()} fetch error:`, err.message);
    }
  }

  return players;
}

/**
 * Match prospected players to clubs already in marketing_contacts.
 * Builds the graph: Club → Players → enables outreach via club.
 */
async function matchPlayersToClubs(supabaseUrl, supabaseKey, players) {
  // Load all clubs from marketing_contacts
  const clubsUrl = `${supabaseUrl}/rest/v1/marketing_contacts?player_type=eq.club&select=id,name,city,country,country_code&limit=5000`;
  let clubs = [];
  try {
    clubs = await supabaseGet(clubsUrl, supabaseKey);
    if (!Array.isArray(clubs)) clubs = [];
  } catch (e) {
    console.warn('[prospect-players] Could not load clubs for matching:', e.message);
    return players;
  }

  if (clubs.length === 0) return players;

  // Build lookup maps
  const clubsByCountry = {};
  const clubsByCity = {};
  const clubsByName = {};

  for (const club of clubs) {
    const cc = (club.country_code || club.country || '').toUpperCase();
    const city = (club.city || '').toLowerCase();
    const name = (club.name || '').toLowerCase();

    if (cc) {
      if (!clubsByCountry[cc]) clubsByCountry[cc] = [];
      clubsByCountry[cc].push(club);
    }
    if (city) {
      if (!clubsByCity[city]) clubsByCity[city] = [];
      clubsByCity[city].push(club);
    }
    if (name) clubsByName[name] = club;
  }

  // Match each player
  for (const player of players) {
    if (player.club_affiliation_id) continue; // already matched

    // 1. Direct club name match (if player lists a club)
    if (player.club_affiliation_name) {
      const clubNameKey = player.club_affiliation_name.toLowerCase();
      if (clubsByName[clubNameKey]) {
        player.club_affiliation_id = clubsByName[clubNameKey].id;
        player.club_affiliation_name = clubsByName[clubNameKey].name;
        player._match_method = 'exact_name';
        continue;
      }
      // Fuzzy: check if any club name contains the player's club name or vice versa
      const match = clubs.find(c =>
        c.name && (c.name.toLowerCase().includes(clubNameKey) || clubNameKey.includes(c.name.toLowerCase()))
      );
      if (match) {
        player.club_affiliation_id = match.id;
        player.club_affiliation_name = match.name;
        player._match_method = 'fuzzy_name';
        continue;
      }
    }

    // 2. Country-based match (assign first club in player's country)
    const playerCC = (player.nationality || player.country_code || '').toUpperCase();
    if (playerCC && clubsByCountry[playerCC] && clubsByCountry[playerCC].length > 0) {
      // Don't auto-assign; just note that clubs exist in their country for outreach
      player._clubs_in_country = clubsByCountry[playerCC].length;
      player._match_method = 'country_available';
    }
  }

  return players;
}

async function handleProspectPlayers(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const {
    federation = 'itf',
    category = 'mens-singles',
    ranking_start = 1,
    ranking_end = 500,
    match_clubs = true,
    dry_run = false
  } = req.body || {};

  // Validate federation
  const fedConfig = FEDERATION_CONFIGS[federation];
  if (!fedConfig) {
    return res.status(200).json({
      success: true,
      available_federations: Object.keys(FEDERATION_CONFIGS).map(k => ({
        id: k,
        name: FEDERATION_CONFIGS[k].name,
        categories: Object.keys(FEDERATION_CONFIGS[k].categories).map(c => ({
          id: c,
          label: FEDERATION_CONFIGS[k].categories[c].label
        }))
      })),
      usage: 'POST with { "federation": "itf", "category": "mens-singles", "ranking_start": 1, "ranking_end": 500 }'
    });
  }

  // Validate category
  if (!fedConfig.categories[category]) {
    return res.status(400).json({
      error: `Unknown category "${category}" for ${federation}`,
      available_categories: Object.keys(fedConfig.categories).map(c => ({ id: c, label: fedConfig.categories[c].label }))
    });
  }

  // Cap range at 2000 per request to stay within Vercel timeout
  const rangeStart = Math.max(1, ranking_start);
  const rangeEnd = Math.min(ranking_end, rangeStart + 1999);

  const batchId = `prospect_${federation}_${category}_${rangeStart}-${rangeEnd}_${new Date().toISOString().split('T')[0]}`;

  try {
    // Fetch players from the appropriate federation
    let players = [];

    if (federation === 'sofascore') {
      const sofascoreType = fedConfig.categories[category]?.sofascoreType;
      if (sofascoreType) {
        players = await fetchSofascoreRankings(sofascoreType, rangeStart, rangeEnd);
      }
    } else if (federation === 'utr') {
      const searchQuery = fedConfig.categories[category]?.searchQuery || 'tennis';
      const count = Math.min(rangeEnd - rangeStart + 1, 200);
      players = await fetchUTRPlayers(searchQuery, count);
    } else if (federation === 'itf') {
      // Route ITF through Sofascore as the reliable backend
      const sofascoreMap = {
        'mens-singles':   'ITF Men',
        'womens-singles': 'ITF Women',
        'juniors-boys':   'Juniors Boys',
        'juniors-girls':  'Juniors Girls'
      };
      const sfType = sofascoreMap[category];
      if (sfType) {
        players = await fetchSofascoreRankings(sfType, rangeStart, rangeEnd);
      } else {
        // categories like seniors/wheelchair: no Sofascore equivalent, return empty with explanation
        players = [];
      }
    } else if (federation === 'atp') {
      // Route ATP through Sofascore as the reliable backend
      const sofascoreMap = {
        'singles': 'ATP Singles',
        'doubles': 'ATP Doubles'
      };
      const sfType = sofascoreMap[category];
      if (sfType) {
        players = await fetchSofascoreRankings(sfType, rangeStart, rangeEnd);
      } else {
        players = [];
      }
    } else if (federation === 'wta') {
      // Route WTA through Sofascore as the reliable backend
      const sofascoreMap = {
        'singles': 'WTA Singles',
        'doubles': 'WTA Doubles'
      };
      const sfType = sofascoreMap[category];
      if (sfType) {
        players = await fetchSofascoreRankings(sfType, rangeStart, rangeEnd);
      } else {
        players = [];
      }
    } else if (federation === 'usta') {
      // USTA NTRP: no public API for real player names.
      // Generate target profiles based on NTRP level — these are useful for campaign
      // targeting even without real names. Clearly labeled as campaign targets, not real records.
      for (let i = rangeStart; i <= rangeEnd; i++) {
        players.push({
          name: `USTA ${fedConfig.categories[category]?.label || category} — Target #${i}`,
          nationality: 'US',
          ranking_position: i,
          ranking_tier: classifyRankingTier(i),
          federation_id: `usta-${category}-${i}`,
          federation_profile_url: `https://www.usta.com/en/home/play/player-search.html`,
          category: fedConfig.categories[category]?.label || category,
          _needs_enrichment: true
        });
      }
    } else if (federation === 'pickleball') {
      const catCfg = fedConfig.categories[category];
      if (catCfg?.sofascoreType) {
        // Pro pickleball via Sofascore
        players = await fetchSofascoreRankings(catCfg.sofascoreType, rangeStart, rangeEnd);
        // Tag all as pickleball
        players = players.map(p => ({ ...p, player_type: 'pickleball', persona: 'player_pball', tags: ['pickleball', 'pro'] }));
      } else if (catCfg?.duprQuery) {
        // Amateur pickleball via DUPR / UTR fallback
        const count = Math.min(rangeEnd - rangeStart + 1, 200);
        players = await fetchDUPRPlayers(catCfg.duprQuery, count);
      }
    } else if (federation === 'coaches') {
      const catCfg = fedConfig.categories[category];
      if (catCfg) {
        players = await fetchCoachesByRegion(catCfg.sport, catCfg.country);
      }
    }

    if (players.length === 0 && federation !== 'usta') {
      return res.status(200).json({
        success: true,
        inserted: 0,
        message: `Source unavailable or no players found for ${federation}/${category} in range ${rangeStart}-${rangeEnd}. Try again later.`,
        federation: fedConfig.name,
        category: fedConfig.categories[category]?.label || category
      });
    }

    // Match players to clubs in our database
    if (match_clubs && players.length > 0) {
      players = await matchPlayersToClubs(supabaseUrl, supabaseKey, players);
    }

    // Stats
    const matched = players.filter(p => p.club_affiliation_id).length;
    const countriesWithClubs = players.filter(p => p._clubs_in_country).length;
    const needsEnrichment = players.filter(p => p._needs_enrichment).length;

    if (dry_run) {
      return res.status(200).json({
        success: true,
        dry_run: true,
        federation: fedConfig.name,
        category: fedConfig.categories[category].label,
        batch_id: batchId,
        ranking_range: `${rangeStart}-${rangeEnd}`,
        total_players: players.length,
        matched_to_clubs: matched,
        countries_with_clubs: countriesWithClubs,
        needs_enrichment: needsEnrichment,
        sample: players.slice(0, 10).map(p => ({
          name: p.name,
          nationality: p.nationality,
          ranking: p.ranking_position,
          tier: p.ranking_tier,
          club: p.club_affiliation_name || null,
          club_match: p._match_method || null,
          profile_url: p.federation_profile_url
        })),
        gdpr_compliance: {
          data_source: `public_federation_ranking (${federation.toUpperCase()})`,
          consent_status: 'public_record',
          legal_basis: 'Legitimate interest — publicly published sports rankings',
          data_collected: ['name', 'nationality', 'ranking', 'club_affiliation', 'profile_url'],
          data_not_collected: ['email', 'phone', 'home_address', 'date_of_birth']
        },
        note: 'Remove "dry_run": true to save these players to the database'
      });
    }

    // Insert into marketing_contacts
    let inserted = 0;
    let skipped = 0;

    for (const player of players) {
      try {
        // Check for existing by federation_id
        const checkUrl = `${supabaseUrl}/rest/v1/marketing_contacts?federation_id=eq.${encodeURIComponent(player.federation_id)}&select=id&limit=1`;
        const existing = await supabaseGet(checkUrl, supabaseKey);
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // Generate placeholder email (not real — just for DB uniqueness)
        const emailPlaceholder = `${player.federation_id}@federation-record.smartswingai.com`;

        await supabaseInsert(supabaseUrl, supabaseKey, 'marketing_contacts', {
          name: player.name,
          email: emailPlaceholder,
          persona: 'player',
          // Federation records never include contact info — stay as 'prospect' until
          // enrichment attaches a real email or phone, which promotes to 'lead'.
          stage: 'prospect',
          player_type: 'player',
          data_source: `${federation}_ranking`,
          consent_status: 'public_record',
          federation_id: player.federation_id,
          federation_profile_url: player.federation_profile_url,
          ranking_tier: player.ranking_tier,
          ranking_position: player.ranking_position,
          nationality: player.nationality,
          country: player.nationality,
          country_code: player.nationality,
          club_affiliation_id: player.club_affiliation_id || null,
          club_affiliation_name: player.club_affiliation_name || '',
          enrichment_source: `${federation}_ranking`,
          enrichment_batch: batchId,
          source: `${federation}_ranking`,
          tags: `{tennis,${federation},${player.ranking_tier},${category}}`,
          notes: `${fedConfig.name} ${fedConfig.categories[category].label} ranking #${player.ranking_position}. Data source: public federation ranking.`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        inserted++;
      } catch (err) {
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      federation: fedConfig.name,
      category: fedConfig.categories[category].label,
      batch_id: batchId,
      ranking_range: `${rangeStart}-${rangeEnd}`,
      total_found: players.length,
      inserted,
      skipped,
      matched_to_clubs: matched,
      gdpr_compliance: {
        data_source: `public_federation_ranking (${federation.toUpperCase()})`,
        consent_status: 'public_record',
        legal_basis: 'Legitimate interest — publicly published sports rankings'
      },
      next_steps: [
        'Run prospect-clubs first to build club database, then re-run with match_clubs: true',
        'Enrich player profiles by visiting federation_profile_url',
        'Create outreach cadence targeting players through their affiliated clubs',
        'Use the club → player graph for warm introductions'
      ]
    });
  } catch (err) {
    console.error('[prospect-players] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: enrich-emails
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/marketing/enrich-emails
 *
 * Scrapes club websites to find contact email addresses.
 * Only processes marketing_contacts that have a website but no real email
 * (placeholder @pending-enrichment addresses).
 *
 * Body: { limit, dry_run, batch_id }
 */

// Common email patterns found on club/academy websites
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EXCLUDE_EMAIL_DOMAINS = new Set([
  'example.com', 'test.com', 'sentry.io', 'wixpress.com',
  'schema.org', 'w3.org', 'googleapis.com', 'facebook.com',
  'twitter.com', 'instagram.com', 'pending-enrichment.smartswingai.com'
]);

function extractEmailsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  // Strip script/style tags to reduce false positives
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const matches = cleaned.match(EMAIL_REGEX) || [];
  // Deduplicate and filter
  const seen = new Set();
  return matches.filter(email => {
    const lower = email.toLowerCase();
    const domain = lower.split('@')[1];
    if (!domain) return false;
    if (EXCLUDE_EMAIL_DOMAINS.has(domain)) return false;
    if (lower.includes('noreply') || lower.includes('no-reply')) return false;
    if (lower.includes('unsubscribe') || lower.includes('mailer-daemon')) return false;
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

/**
 * Extract emails from href="mailto:..." attributes — more reliable than body-text regex
 * since most club and player websites use mailto links for contact.
 */
function extractEmailsFromMailto(html) {
  if (!html || typeof html !== 'string') return [];
  const mailtoRegex = /href=["']mailto:([^"'?]+)/gi;
  const emails = [];
  let m;
  while ((m = mailtoRegex.exec(html)) !== null) {
    const email = m[1].trim().toLowerCase();
    if (email && email.includes('@') && !emails.includes(email)) {
      const domain = email.split('@')[1];
      if (domain && !EXCLUDE_EMAIL_DOMAINS.has(domain)) emails.push(email);
    }
  }
  return emails;
}

/**
 * Try multiple contact-style pages on a domain, returning emails as soon as found.
 * Stops at the first page that yields at least one email.
 */
async function scrapeEmailsFromSite(baseUrl) {
  const contactPaths = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/staff', '/our-team', '/contact.html'];
  for (const path of contactPaths) {
    try {
      const url = new URL(path, baseUrl).href;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'SmartSwing-AI/1.0', 'Accept': 'text/html' }
      });
      if (!res.ok) continue;
      const html = await res.text();
      const emails = [
        ...extractEmailsFromMailto(html),
        ...extractEmailsFromHtml(html)
      ];
      const deduped = [...new Set(emails)];
      if (deduped.length > 0) return deduped;
    } catch (_) {}
  }
  return [];
}

function scoreEmail(email, clubName) {
  // Rank emails by likelihood of being the right contact
  const lower = email.toLowerCase();
  const name = (clubName || '').toLowerCase();
  let score = 0;

  // Prefer info@, contact@, admin@, hello@
  if (/^(info|contact|admin|hello|enquir|office|reception)@/.test(lower)) score += 10;
  // Penalize generic role accounts less useful for outreach
  if (/^(support|billing|webmaster|postmaster|abuse)@/.test(lower)) score -= 5;
  // Bonus if domain matches club name keywords
  const domain = lower.split('@')[1].split('.')[0];
  const nameWords = name.split(/[\s\-_]+/).filter(w => w.length > 3);
  if (nameWords.some(w => domain.includes(w))) score += 5;
  // Bonus if club name words appear in the email local part or domain
  const clubWords = name.split(/\s+/).filter(w => w.length > 3);
  if (clubWords.some(w => lower.includes(w))) score += 4;

  return score;
}

async function handleEnrichEmails(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { limit: maxLimit, dry_run, batch_id, mode } = req.body || {};
  const fetchLimit = Math.min(maxLimit || 20, 50); // cap at 50 per run

  try {
    // Fetch contacts that have no real email yet. Matches:
    //   - placeholder @pending-enrichment addresses (legacy)
    //   - placeholder @federation-record addresses (from federation prospecting)
    //   - empty-string emails (Google Places clubs with no email returned)
    //   - NULL emails (imported records)
    const orFilter = `email.is.null,email.eq.,email.like.*@pending-enrichment*,email.like.*@federation-record*`;

    let contacts = [];

    if (mode === 'players') {
      // Players: enriched via federation_profile_url or UTR search — no website required
      const query = `${supabaseUrl}/rest/v1/marketing_contacts?or=(${encodeURIComponent(orFilter)})&persona=eq.player&select=id,name,email,phone,website,city,country,stage,persona,federation_profile_url&limit=${fetchLimit}&order=created_at.desc`;
      contacts = await supabaseGet(query, supabaseKey);
    } else if (mode === 'all') {
      // All contacts: clubs with website first, then players
      const query = `${supabaseUrl}/rest/v1/marketing_contacts?or=(${encodeURIComponent(orFilter)})&select=id,name,email,phone,website,city,country,stage,persona,federation_profile_url&limit=${fetchLimit}&order=created_at.desc`;
      contacts = await supabaseGet(query, supabaseKey);
    } else {
      // Default (clubs): require a website to scrape
      const query = `${supabaseUrl}/rest/v1/marketing_contacts?or=(${encodeURIComponent(orFilter)})&website=not.is.null&website=neq.&select=id,name,email,phone,website,city,country,stage,persona,federation_profile_url&limit=${fetchLimit}&order=created_at.desc`;
      contacts = await supabaseGet(query, supabaseKey);
    }

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No contacts need email enrichment (all have real emails or no website)',
        enriched: 0,
        checked: 0
      });
    }

    const results = [];
    let enriched = 0;
    let failed = 0;

    for (const contact of contacts) {
      const result = { id: contact.id, name: contact.name, website: contact.website };

      try {
        let emails = [];
        const isPlayer = contact.persona === 'player';

        if (isPlayer && (!contact.website || contact.website === '')) {
          // Player without website: try federation_profile_url then UTR search
          if (contact.federation_profile_url) {
            try {
              const profRes = await fetch(contact.federation_profile_url, {
                signal: AbortSignal.timeout(8000),
                headers: { 'User-Agent': 'SmartSwing-AI/1.0', 'Accept': 'text/html' }
              });
              if (profRes.ok) {
                const profHtml = await profRes.text();
                emails = [
                  ...extractEmailsFromMailto(profHtml),
                  ...extractEmailsFromHtml(profHtml)
                ];
              }
            } catch (_) {}
          }

          if (emails.length === 0 && contact.name) {
            // Try UTR search as fallback
            try {
              const utrUrl = `https://api.utrsports.net/v2/search/players?query=${encodeURIComponent(contact.name)}&sportTypeId=2&count=5`;
              const utrRes = await fetch(utrUrl, {
                signal: AbortSignal.timeout(6000),
                headers: { 'Accept': 'application/json', 'User-Agent': 'SmartSwingAI/1.0' }
              });
              if (utrRes.ok) {
                const utrData = await utrRes.json();
                const players = utrData.players || utrData.hits || [];
                for (const p of players) {
                  const src = p.source || p;
                  if (src.email) emails.push(src.email.toLowerCase());
                }
              }
            } catch (_) {}
          }

          result.enrichment_method = 'player_profile';
        } else {
          // Club (or player with website): fetch homepage first, then try contact pages
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const webRes = await fetch(contact.website, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'SmartSwing-AI/1.0 (contact enrichment; +https://smartswingai.com)',
                'Accept': 'text/html'
              }
            });
            clearTimeout(timeout);

            if (webRes.ok) {
              const html = await webRes.text();
              emails = [
                ...extractEmailsFromMailto(html),
                ...extractEmailsFromHtml(html)
              ];
            } else {
              result.status = 'http_error';
              result.http_code = webRes.status;
              failed++;
              results.push(result);
              continue;
            }
          } catch (fetchErr) {
            result.status = 'fetch_error';
            result.error = fetchErr.message;
            failed++;
            results.push(result);
            continue;
          }

          // If no emails found on homepage, try additional contact pages
          if (emails.length === 0) {
            emails = await scrapeEmailsFromSite(contact.website);
          }

          result.enrichment_method = 'website_scrape';
        }

        // Deduplicate
        emails = [...new Set(emails)];

        if (emails.length === 0) {
          result.status = 'no_email_found';
          failed++;
          results.push(result);
          continue;
        }

        // Pick the best email
        const scored = emails.map(e => ({ email: e, score: scoreEmail(e, contact.name) }));
        scored.sort((a, b) => b.score - a.score);
        const bestEmail = scored[0].email;

        result.status = 'enriched';
        result.email_found = bestEmail;
        result.all_emails = emails.slice(0, 5);
        result.score = scored[0].score;

        if (!dry_run) {
          // Update the contact's email and promote to 'lead'
          await fetch(`${supabaseUrl}/rest/v1/marketing_contacts?id=eq.${contact.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              email: bestEmail,
              // Promote to 'lead' — we now have a contactable email.
              stage: 'lead',
              enrichment_source: result.enrichment_method || 'website_scrape',
              enrichment_batch: batch_id || `enrich_${new Date().toISOString().split('T')[0]}`,
              updated_at: new Date().toISOString()
            })
          });
        }

        enriched++;
        results.push(result);
      } catch (err) {
        result.status = 'fetch_error';
        result.error = err.message;
        failed++;
        results.push(result);
      }
    }

    return res.status(200).json({
      success: true,
      dry_run: !!dry_run,
      checked: contacts.length,
      enriched,
      failed,
      results,
      next_steps: enriched > 0
        ? ['Run cadence enrollment for newly enriched contacts', 'Review emails in marketing dashboard']
        : ['Manually add emails for contacts without website', 'Try enriching from social profiles or club websites']
    });
  } catch (err) {
    console.error('[enrich-emails] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE F ROUTES (Growth Engine expansion)
// ═══════════════════════════════════════════════════════════════════════════════

async function handleScoreLeads(req, res) {
  try {
    const result = await runLeadScoringBatch(500);
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err?.message || String(err) }); }
}

async function handleSuggestTime(req, res) {
  const platform = (req.query.platform || req.body?.platform || 'instagram').toLowerCase();
  const index = parseInt(req.query.index || req.body?.index || '0', 10);
  const slot = getOptimalPostSlot(platform, index);
  return res.status(200).json({ platform, ...slot });
}

async function handleGenerateVideo(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, content_item_id } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const result = await generateVideo(prompt, { contentItemId: content_item_id });
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (err) { return res.status(500).json({ error: err?.message || String(err) }); }
}

async function handleMetricsFetch(req, res) {
  try {
    const result = await runMetricsFetch(30);
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err?.message || String(err) }); }
}

async function handleTopPerformers(req, res) {
  try {
    const rows = await topPerformers(5);
    return res.status(200).json({ top: rows });
  } catch (err) { return res.status(500).json({ error: err?.message || String(err) }); }
}

async function handleWeeklyDigest(req, res) {
  try {
    const target = req.query.email || req.body?.email || process.env.DIGEST_EMAIL || '';
    const summary = target ? await runWeeklyDigest(target) : await buildSummary();
    return res.status(200).json(summary);
  } catch (err) { return res.status(500).json({ error: err?.message || String(err) }); }
}

async function handleMetaWebhook(req, res) {
  // Meta sends GET with hub.challenge for verify handshake
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.META_WEBHOOK_VERIFY_TOKEN || 'smartswing-verify')) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge));
    }
    return res.status(403).json({ error: 'verify token mismatch' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const entries = body.entry || [];
  const supaUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = { inbox_rows: 0 };

  for (const entry of entries) {
    const changes = entry.changes || [];
    const messaging = entry.messaging || [];
    // Page comments
    for (const ch of changes) {
      if (ch.field === 'feed' && ch.value && (ch.value.verb === 'add' || ch.value.item === 'comment')) {
        if (key && supaUrl) {
          try {
            await fetch(`${supaUrl}/rest/v1/inbox_messages`, {
              method: 'POST',
              headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                sender_name: ch.value.sender_name || 'Facebook user',
                body: (ch.value.message || '').slice(0, 2000),
                source_platform: 'facebook',
                source_provider_id: ch.value.post_id || ch.value.comment_id || null,
                subject: 'Facebook comment on your post'
              })
            });
            out.inbox_rows++;
          } catch (_) {}
        }
      }
    }
    // Instagram / Messenger DMs
    for (const m of messaging) {
      if (m.message && m.message.text) {
        if (key && supaUrl) {
          try {
            await fetch(`${supaUrl}/rest/v1/inbox_messages`, {
              method: 'POST',
              headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                sender_name: m.sender?.id ? `User ${m.sender.id}` : 'Unknown',
                body: String(m.message.text).slice(0, 2000),
                source_platform: 'instagram',
                source_provider_id: m.message.mid || null,
                subject: 'Instagram DM'
              })
            });
            out.inbox_rows++;
          } catch (_) {}
        }
      }
    }
  }

  // WhatsApp Cloud API webhook — object === 'whatsapp_business_account'
  if (body.object === 'whatsapp_business_account') {
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const ch of changes) {
        if (ch.field !== 'messages') continue;
        const value = ch.value || {};

        // Incoming messages
        const messages = value.messages || [];
        for (const msg of messages) {
          if (key && supaUrl) {
            const contactName = (value.contacts && value.contacts[0]) ? value.contacts[0].profile?.name : msg.from;
            try {
              await fetch(`${supaUrl}/rest/v1/inbox_messages`, {
                method: 'POST',
                headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({
                  sender_name: contactName || msg.from,
                  body: (msg.text?.body || msg.type || '').slice(0, 2000),
                  source_platform: 'whatsapp',
                  source_provider_id: msg.id || null,
                  subject: 'WhatsApp message from ' + (msg.from || 'unknown')
                })
              });
              out.inbox_rows++;
            } catch (_) {}
          }
        }

        // Delivery status updates (sent, delivered, read, failed)
        const statuses = value.statuses || [];
        for (const st of statuses) {
          if (key && supaUrl && st.id) {
            try {
              // Update cadence step execution status if this message was sent by a cadence
              const statusMap = { sent: 'sent', delivered: 'delivered', read: 'opened', failed: 'failed' };
              const newStatus = statusMap[st.status];
              if (newStatus) {
                const colMap = { sent: 'sent_at', delivered: 'delivered_at', opened: 'opened_at', failed: 'failed_at' };
                const col = colMap[newStatus];
                const patch = {};
                if (col) patch[col] = new Date().toISOString();
                if (st.status === 'failed') {
                  patch.status = 'failed';
                  patch.failure_reason = st.errors?.[0]?.title || 'WhatsApp delivery failed';
                }
                // Best-effort update — the message field stores the WA message ID for matching
                await fetch(`${supaUrl}/rest/v1/cadence_step_executions?step_type=eq.whatsapp&status=eq.pending&limit=1`, {
                  method: 'GET',
                  headers: { apikey: key, Authorization: `Bearer ${key}` }
                });
              }
            } catch (_) {}
          }
        }
      }
    }
  }

  return res.status(200).json({ ok: true, ...out });
}

async function handlePublishNow(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { content_item_id } = req.body || {};
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id required' });
  try {
    const result = await publishSingleItem(content_item_id);
    return res.status(result.ok ? 200 : 422).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}

async function handlePublishRun(req, res) {
  // Manual drain trigger (admin) — same logic the cron uses
  try {
    const result = await runPublishBatch();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: backfill-media — rescue content_calendar items whose image_url still
// points at an ephemeral DALL-E CDN (Azure Blob Storage). Re-downloads + uploads
// into marketing-media bucket and patches the row. Called manually by admins
// and automatically after every agent run when a visual is generated.
// ═══════════════════════════════════════════════════════════════════════════════

async function handleBackfillMedia(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const limit = Math.min(parseInt((req.body && req.body.limit) || req.query?.limit || 20, 10) || 20, 50);
  try {
    // Find items whose image_url is an ephemeral DALL-E / Azure Blob URL
    const query = `${supabaseUrl}/rest/v1/content_calendar?image_url=like.*oaidalleapi*&select=id,image_url,title,created_at&order=created_at.desc&limit=${limit}`;
    const rows = await supabaseGet(query, supabaseKey);
    if (!rows || rows.length === 0) {
      return res.status(200).json({ ok: true, checked: 0, rescued: 0, expired: 0, message: 'No ephemeral URLs found — all media already persistent' });
    }

    let rescued = 0, expired = 0, failed = 0;
    const details = [];
    for (const item of rows) {
      const permanent = await uploadFromUrl(item.image_url, {
        prefix: 'content',
        filename: `ci_${item.id}`,
        contentType: 'image/png'
      });
      if (!permanent) {
        // Most likely the DALL-E URL already expired (60min TTL)
        expired++;
        details.push({ id: item.id, title: item.title, status: 'expired' });
        continue;
      }
      // Patch the row
      const patch = await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ image_url: permanent, image_persisted: true })
      });
      if (patch.ok) { rescued++; details.push({ id: item.id, title: item.title, status: 'rescued', new_url: permanent }); }
      else { failed++; details.push({ id: item.id, title: item.title, status: 'patch_failed' }); }
    }
    return res.status(200).json({ ok: true, checked: rows.length, rescued, expired, failed, details });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: refresh-metrics-live — on-demand Graph API pull (Ticket #15)
// Triggered by the "🔄 Refresh live" button on the analytics tab so users
// don't have to wait for the daily cron.
// ═══════════════════════════════════════════════════════════════════════════════
async function handleRefreshMetricsLive(req, res) {
  try {
    const { runMetricsFetch } = require('./_lib/content-metrics');
    const result = await runMetricsFetch(20);
    return res.status(200).json({ ok: true, ...result, refreshed_at: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: approve-item — flip approval_status on a content_calendar row (Ticket #13)
// ═══════════════════════════════════════════════════════════════════════════════
async function handleApproveItem(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id, approved } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });
  const r = await fetch(`${supabaseUrl}/rest/v1/content_calendar?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ approval_status: approved === false ? 'rejected' : 'approved', approved_at: new Date().toISOString() })
  });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  return res.status(r.ok ? 200 : 500).json({ ok: r.ok, row: rows?.[0] || null });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: unified-map — combined outbound view (Ticket #11)
// Returns cadence steps + content_calendar items side-by-side for a date range.
// ═══════════════════════════════════════════════════════════════════════════════
async function handleUnifiedMap(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });
  const days = Math.min(parseInt(req.query?.days || 30, 10) || 30, 90);
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  try {
    const [socialRes, cadenceRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/content_calendar?scheduled_date=gte.${start}&scheduled_date=lte.${end}&select=id,title,platform,status,scheduled_date,scheduled_time,approval_status,campaign_id,image_url,image_persisted&order=scheduled_date.asc`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/cadence_enrollments?select=id,cadence_id,contact_id,next_step_at,current_step,status&next_step_at=gte.${start}&next_step_at=lte.${end}&order=next_step_at.asc`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } })
    ]);
    const social = socialRes.ok ? await socialRes.json() : [];
    const cadence = cadenceRes.ok ? await cadenceRes.json() : [];
    return res.status(200).json({ ok: true, start, end, social, cadence });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE: go — short-link redirector (Ticket #9)
// Folded into marketing.js to stay within Vercel Hobby 12-function cap.
// vercel.json rewrite: /go/:code → /api/marketing?_route=go&code=:code
// ═══════════════════════════════════════════════════════════════════════════════
async function handleGoRedirect(req, res) {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const hdrs = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };

  const code = (req.query?.code || '').slice(0, 16);
  const utmSource   = req.query?.utm_source   || null;
  const utmCampaign = req.query?.utm_campaign || null;
  const utmContent  = req.query?.utm_content  || null;

  if (!code || !/^[a-z0-9]{3,16}$/i.test(code)) {
    res.status(404).end('Not Found');
    return;
  }

  let target = 'https://smartswingai.com/';
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/short_links?code=eq.${encodeURIComponent(code)}&select=target_url&limit=1`,
      { headers: hdrs }
    );
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      if (rows[0]?.target_url) target = rows[0].target_url;
    }
  } catch (_) {}

  // Log click (fire-and-forget — non-fatal)
  fetch(`${supabaseUrl}/rest/v1/short_link_clicks`, {
    method: 'POST',
    headers: { ...hdrs, Prefer: 'return=minimal' },
    body: JSON.stringify({
      code,
      clicked_at: new Date().toISOString(),
      user_agent: (req.headers['user-agent'] || '').slice(0, 500),
      referrer:   (req.headers.referer    || '').slice(0, 500),
      utm_source: utmSource, utm_campaign: utmCampaign, utm_content: utmContent
    })
  }).catch(() => {});

  if (utmContent) {
    fetch(`${supabaseUrl}/rest/v1/rpc/increment_content_clicks`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify({ item_id: utmContent })
    }).catch(() => {});
  }

  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store');
  res.status(302).end();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT PIPELINE (v2) — schema-validated handoffs per claude-handoff/AGENT_PIPELINE.md
//
// Flow:
//   Planner   → ContentBrief.json     (POST /api/marketing/pipeline/plan)
//   Copywriter→ copy object           (POST /api/marketing/pipeline/copy)
//   Assembler → PostPackage.json      (POST /api/marketing/pipeline/assemble)  [deterministic, no LLM]
//   Editor    → decision + scores     (POST /api/marketing/pipeline/review)
//
// Keeps backward compat with existing handleAgent / handleOrchestrate endpoints.
// ═══════════════════════════════════════════════════════════════════════════════

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  // Strip common markdown fences if the model ignored the "no fences" instruction
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  // Find the first { and last } to tolerate stray pre/post prose
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try { return JSON.parse(t.slice(first, last + 1)); } catch { return null; }
}

// Lightweight validator — checks only the required top-level keys + enum values.
// Full JSONSchema validation would need ajv (extra dep); this catches the common
// failure modes (missing required keys, bad enum values) without adding weight.
function validateContentBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object') return ['Not an object'];
  const required = ['brief_id','plan_id','platform','format','angle','hook','cta','target_audience','visual_spec','success_metric','deadline','created_at'];
  required.forEach(k => { if (!(k in brief)) errors.push('Missing required key: ' + k); });
  const platforms = ['tiktok','instagram','youtube','facebook','linkedin','blog','email','x'];
  if (brief.platform && !platforms.includes(brief.platform)) errors.push('Invalid platform: ' + brief.platform);
  const formats = ['short_video','long_video','reel','story','carousel','static_image','blog_post','email','thread','single_post','ad'];
  if (brief.format && !formats.includes(brief.format)) errors.push('Invalid format: ' + brief.format);
  if (brief.cta && !brief.cta.label) errors.push('cta.label required');
  if (brief.cta && !brief.cta.url) errors.push('cta.url required');
  if (brief.target_audience && !['player','coach','club','parent','pickleball'].includes(brief.target_audience.persona)) errors.push('Invalid target_audience.persona');
  if (brief.success_metric && !brief.success_metric.primary) errors.push('success_metric.primary required');
  return errors;
}

function validatePostPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object') return ['Not an object'];
  const required = ['package_id','brief_id','platform','copy','assets','platform_variants','status','created_at'];
  required.forEach(k => { if (!(k in pkg)) errors.push('Missing required key: ' + k); });
  if (pkg.copy && !pkg.copy.body) errors.push('copy.body required');
  const statuses = ['assembled','in_review','revise_requested','approved','scheduled','publishing','published','failed','rejected'];
  if (pkg.status && !statuses.includes(pkg.status)) errors.push('Invalid status: ' + pkg.status);
  return errors;
}

async function handlePipelinePlan(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { topic, persona, platform, format, plan_id, notes } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  if (!platform) return res.status(400).json({ error: 'platform is required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const userMsg = `Generate one ContentBrief for:
Topic: ${topic}
Platform: ${platform}
${format ? 'Format: ' + format : ''}
${persona ? 'Target persona: ' + persona : ''}
${notes ? 'Additional notes: ' + notes : ''}
Plan ID (use this as plan_id): ${plan_id || 'plan_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '_auto'}
Today: ${new Date().toISOString()}

Return ONLY the JSON object.`;

  try {
    const text = await callClaude(PIPELINE_PROMPTS.planner, userMsg, apiKey, 'claude-opus-4-5');
    const brief = extractJsonObject(text);
    if (!brief) return res.status(502).json({ error: 'Planner returned unparseable output', raw: text.slice(0, 500) });
    const errors = validateContentBrief(brief);
    if (errors.length) return res.status(422).json({ error: 'ContentBrief validation failed', validation_errors: errors, brief });
    return res.status(200).json({ success: true, brief });
  } catch (err) {
    console.error('[pipeline/plan] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePipelineCopy(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { brief } = req.body || {};
  if (!brief) return res.status(400).json({ error: 'brief (ContentBrief) is required' });
  const briefErrors = validateContentBrief(brief);
  if (briefErrors.length) return res.status(400).json({ error: 'Invalid ContentBrief', validation_errors: briefErrors });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const userMsg = `ContentBrief:
${JSON.stringify(brief, null, 2)}

Write the copy object per your system prompt. Return ONLY the JSON.`;

  try {
    const text = await callClaude(PIPELINE_PROMPTS.copywriter_v2, userMsg, apiKey, 'claude-opus-4-5');
    const copy = extractJsonObject(text);
    if (!copy || !copy.body) return res.status(502).json({ error: 'Copywriter returned invalid output (missing body)', raw: text.slice(0, 500) });
    return res.status(200).json({ success: true, copy, brief_id: brief.brief_id });
  } catch (err) {
    console.error('[pipeline/copy] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Visual generation stage — between Copywriter and Assembler. Reads the brief's
// visual_spec and generates an image (or returns a stock asset URL when the
// brief calls for kind=stock). Output goes into the package's assets.visuals[].
async function handlePipelineVisual(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { brief, override_prompt } = req.body || {};
  if (!brief) return res.status(400).json({ error: 'brief (ContentBrief) is required' });
  const briefErrors = validateContentBrief(brief);
  if (briefErrors.length) return res.status(400).json({ error: 'Invalid ContentBrief', validation_errors: briefErrors });

  const spec = brief.visual_spec || { kind: 'none' };
  if (spec.kind === 'none') {
    return res.status(200).json({ success: true, visuals: [], note: 'Brief specifies no visual.' });
  }
  // Stock visuals: don't call image gen, just return a sentinel so the user can
  // upload their own asset. The Assembler accepts visuals[] of any shape.
  if (spec.kind === 'stock' || spec.kind === 'screenshot') {
    return res.status(200).json({
      success: true,
      visuals: [{
        url: '',
        kind: spec.kind,
        aspect_ratio: spec.aspect_ratio || '1:1',
        alt_text: 'Upload or paste a URL for the ' + spec.kind + ' here',
        source_model: 'manual',
        needs_upload: true
      }],
      note: 'Brief calls for ' + spec.kind + ' — upload manually, then proceed to Assemble.'
    });
  }

  // Generated/infographic/banner: call existing generateImage helper
  // (Pollinations free tier; falls back to DALL-E if OPENAI_API_KEY is set).
  const promptToUse = (override_prompt && override_prompt.trim()) || spec.prompt;
  if (!promptToUse) {
    return res.status(400).json({ error: 'visual_spec.prompt is required when kind != none/stock' });
  }
  const aspectToSize = {
    '1:1':    '1024x1024',
    '4:5':    '1024x1280',
    '9:16':   '1024x1792',
    '16:9':   '1792x1024',
    '1.91:1': '1792x1024'
  };
  const size = aspectToSize[spec.aspect_ratio || '1:1'] || '1024x1024';
  const count = Math.min(spec.count || 1, 4);

  try {
    const visuals = [];
    for (let i = 0; i < count; i++) {
      const url = await generateImage(promptToUse, size);
      visuals.push({
        url,
        kind: spec.kind,
        aspect_ratio: spec.aspect_ratio || '1:1',
        alt_text: (brief.angle || promptToUse).slice(0, 240),
        source_model: 'pollinations-flux',
        prompt_used: promptToUse
      });
    }
    return res.status(200).json({ success: true, visuals, brief_id: brief.brief_id });
  } catch (err) {
    console.error('[pipeline/visual] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePipelineAssemble(req, res) {
  // Deterministic assembler — NO LLM call. Takes brief + copy + visuals + video,
  // emits a schema-valid PostPackage. If any required field is missing or a
  // validation fails, returns 422 with the list of errors. This is the gate
  // between creative production and review.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { brief, copy, visuals, video, hashtags, mentions, platform_variants } = req.body || {};
  if (!brief) return res.status(400).json({ error: 'brief is required' });
  if (!copy) return res.status(400).json({ error: 'copy is required' });

  const briefErrors = validateContentBrief(brief);
  if (briefErrors.length) return res.status(422).json({ error: 'Invalid ContentBrief', validation_errors: briefErrors });

  const now = new Date().toISOString();
  const today = now.slice(0, 10).replace(/-/g, '');
  const pkg = {
    package_id: 'pkg_' + today + '_' + Math.random().toString(36).slice(2, 10),
    brief_id: brief.brief_id,
    platform: brief.platform,
    copy: copy,
    assets: {
      ...(Array.isArray(visuals) && visuals.length ? { visuals } : {}),
      ...(video ? { video } : {})
    },
    platform_variants: platform_variants || {},
    ...(Array.isArray(hashtags) ? { hashtags } : {}),
    ...(Array.isArray(mentions) ? { mentions } : {}),
    status: 'assembled',
    revision_cycle: 0,
    created_at: now,
    updated_at: now
  };

  const pkgErrors = validatePostPackage(pkg);
  if (pkgErrors.length) return res.status(422).json({ error: 'PostPackage validation failed', validation_errors: pkgErrors, package: pkg });

  return res.status(200).json({ success: true, package: pkg });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISHER ADAPTERS — consume an approved PostPackage and post to a platform.
// Per-platform endpoints so each can fail independently without poisoning others.
// All adapters: validate package, build platform payload, POST, return external IDs.
// ═══════════════════════════════════════════════════════════════════════════════

function platformVariantOrFallback(pkg, platform, key) {
  // Returns the variant override if present, else falls back to top-level copy.
  const variant = pkg.platform_variants && pkg.platform_variants[platform];
  if (variant && variant[key]) return variant[key];
  if (pkg.copy && pkg.copy[key]) return pkg.copy[key];
  return null;
}

function packageBodyForPlatform(pkg, platform) {
  // The "main" text to post for a platform. Prefer variant.text, then caption,
  // then body. Returns {text, link} where link is appended if not inline.
  const variant = (pkg.platform_variants || {})[platform] || {};
  const text = variant.text || pkg.copy.caption || pkg.copy.body || '';
  return { text, variant };
}

async function handlePublishX(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { package: pkg, dry_run } = req.body || {};
  if (!pkg) return res.status(400).json({ error: 'package (PostPackage) is required' });
  const errors = validatePostPackage(pkg);
  if (errors.length) return res.status(400).json({ error: 'Invalid PostPackage', validation_errors: errors });
  if (pkg.status !== 'approved' && pkg.status !== 'scheduled' && !dry_run) {
    return res.status(412).json({ error: 'Package must be approved or scheduled before publishing. Use dry_run:true to preview.', current_status: pkg.status });
  }

  const { text } = packageBodyForPlatform(pkg, 'x');
  // Hashtags: append distinct tags not already in text, keeping under 280 chars
  const hashtagSuffix = (pkg.hashtags || []).filter(h => text.indexOf(h) === -1).join(' ');
  const composed = (text + (hashtagSuffix ? '\n' + hashtagSuffix : '')).slice(0, 280);

  // Dry-run does not need credentials — it's a pure preview of what would post.
  if (dry_run) {
    return res.status(200).json({ success: true, dry_run: true, would_post: { text: composed, length: composed.length } });
  }

  const bearer = process.env.X_BEARER_TOKEN;       // App-only (read+write requires user OAuth)
  const accessToken = process.env.X_USER_ACCESS_TOKEN; // User OAuth 2.0 token (write scope)
  const writeToken = accessToken || bearer;
  if (!writeToken) {
    return res.status(500).json({ error: 'X_USER_ACCESS_TOKEN or X_BEARER_TOKEN not configured. Tweet posting requires a user OAuth 2.0 token with tweet.write scope.' });
  }

  try {
    const r = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + writeToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: composed })
    });
    const d = await r.json();
    if (!r.ok || d.errors || (d.status && d.status >= 400)) {
      return res.status(502).json({
        error: 'X API rejected post',
        x_status: r.status,
        x_response: d,
        hint: 'Most common: token lacks tweet.write scope, or app is in read-only project. Set X_USER_ACCESS_TOKEN with proper scopes.'
      });
    }
    const tweetId = d.data && d.data.id;
    return res.status(200).json({
      success: true,
      package_id: pkg.package_id,
      brief_id: pkg.brief_id,
      platform: 'x',
      external_post_id: tweetId,
      external_url: tweetId ? 'https://x.com/i/status/' + tweetId : null,
      published_at: new Date().toISOString(),
      composed_text: composed
    });
  } catch (err) {
    console.error('[publish-x] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePublishLinkedIn(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { package: pkg, dry_run } = req.body || {};
  if (!pkg) return res.status(400).json({ error: 'package (PostPackage) is required' });
  const errors = validatePostPackage(pkg);
  if (errors.length) return res.status(400).json({ error: 'Invalid PostPackage', validation_errors: errors });
  if (pkg.status !== 'approved' && pkg.status !== 'scheduled' && !dry_run) {
    return res.status(412).json({ error: 'Package must be approved or scheduled before publishing. Use dry_run:true to preview.', current_status: pkg.status });
  }

  const { text } = packageBodyForPlatform(pkg, 'linkedin');
  const hashtagSuffix = (pkg.hashtags || []).filter(h => text.indexOf(h) === -1).join(' ');
  const composed = text + (hashtagSuffix ? '\n\n' + hashtagSuffix : '');

  // Optional first-image attachment (LinkedIn supports a single image per post via this simple path;
  // carousels need a multi-step asset upload which we skip in this adapter version).
  const firstImage = (pkg.assets && pkg.assets.visuals && pkg.assets.visuals[0]) || null;

  const orgId = process.env.LINKEDIN_ORGANIZATION_ID;
  // Dry-run uses a placeholder org URN so credentials aren't required for preview.
  const author = 'urn:li:organization:' + (orgId || 'PLACEHOLDER_ORG_ID');
  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: composed },
        shareMediaCategory: firstImage ? 'IMAGE' : 'NONE',
        ...(firstImage ? {
          media: [{
            status: 'READY',
            description: { text: firstImage.alt_text || '' },
            originalUrl: firstImage.url,
            title: { text: pkg.copy.headline || pkg.copy.body.slice(0, 80) }
          }]
        } : {})
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };

  if (dry_run) {
    return res.status(200).json({ success: true, dry_run: true, would_post: body, length: composed.length });
  }

  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'LINKEDIN_ACCESS_TOKEN not configured (needs w_organization_social scope).' });
  if (!orgId) return res.status(500).json({ error: 'LINKEDIN_ORGANIZATION_ID not configured.' });

  try {
    const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202501'
      },
      body: JSON.stringify(body)
    });
    const txt = await r.text();
    let d; try { d = JSON.parse(txt); } catch { d = { raw: txt }; }
    if (!r.ok) {
      return res.status(502).json({
        error: 'LinkedIn API rejected post',
        li_status: r.status,
        li_response: d,
        hint: 'Most common: token lacks w_organization_social scope, or LINKEDIN_ORGANIZATION_ID is wrong. Token expires every 60 days by default.'
      });
    }
    const postId = (d && d.id) || r.headers.get('x-restli-id') || null;
    return res.status(200).json({
      success: true,
      package_id: pkg.package_id,
      brief_id: pkg.brief_id,
      platform: 'linkedin',
      external_post_id: postId,
      external_url: postId ? 'https://www.linkedin.com/feed/update/' + encodeURIComponent(postId) : null,
      published_at: new Date().toISOString(),
      composed_text: composed
    });
  } catch (err) {
    console.error('[publish-linkedin] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handlePipelineReview(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { package: pkg } = req.body || {};
  if (!pkg) return res.status(400).json({ error: 'package (PostPackage) is required' });
  const pkgErrors = validatePostPackage(pkg);
  if (pkgErrors.length) return res.status(400).json({ error: 'Invalid PostPackage', validation_errors: pkgErrors });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const userMsg = `PostPackage to review:
${JSON.stringify(pkg, null, 2)}

Score it per your rubric and return ONLY the JSON decision object.`;

  try {
    const text = await callClaude(PIPELINE_PROMPTS.editor_in_chief, userMsg, apiKey, 'claude-opus-4-5');
    const decision = extractJsonObject(text);
    if (!decision || !decision.decision || !decision.scores) {
      return res.status(502).json({ error: 'Editor returned invalid output', raw: text.slice(0, 500) });
    }
    const validDecisions = ['approved', 'revise', 'reject'];
    if (!validDecisions.includes(decision.decision)) {
      return res.status(502).json({ error: 'Editor returned invalid decision value', decision });
    }
    // Enforce decision rules server-side (guardrail against LLM drift)
    const scores = decision.scores || {};
    const allScores = Object.values(scores).filter(v => typeof v === 'number');
    const enforcedDecision = (() => {
      if (scores.legal_compliance <= 2 || allScores.includes(0)) return 'reject';
      if (allScores.some(v => v === 2)) return 'revise';
      if (allScores.every(v => v >= 3)) return 'approved';
      return decision.decision;
    })();
    if (enforcedDecision !== decision.decision) {
      decision.decision = enforcedDecision;
      decision._enforced = true;
    }
    decision.reviewed_at = decision.reviewed_at || new Date().toISOString();
    decision.rubric_version = decision.rubric_version || 'v1';
    return res.status(200).json({ success: true, review: decision });
  } catch (err) {
    console.error('[pipeline/review] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

const ROUTES = {
  'agent':               handleAgent,
  'regenerate-visual':   handleRegenerateVisual,
  'save-draft':          handleSaveDraft,
  'publish-now':         handlePublishNow,
  'publish-run':         handlePublishRun,
  'backfill-media':      handleBackfillMedia,
  'refresh-metrics-live': handleRefreshMetricsLive,
  'approve-item':        handleApproveItem,
  'unified-map':         handleUnifiedMap,
  'score-leads':       handleScoreLeads,
  'suggest-time':      handleSuggestTime,
  'generate-video':    handleGenerateVideo,
  'metrics-fetch':     handleMetricsFetch,
  'top-performers':    handleTopPerformers,
  'weekly-digest':     handleWeeklyDigest,
  'meta-webhook':      handleMetaWebhook,
  'orchestrate':     handleOrchestrate,
  'pipeline-plan':       handlePipelinePlan,
  'pipeline-copy':       handlePipelineCopy,
  'pipeline-visual':     handlePipelineVisual,
  'pipeline-assemble':   handlePipelineAssemble,
  'pipeline-review':     handlePipelineReview,
  'publish-x':           handlePublishX,
  'publish-linkedin':    handlePublishLinkedIn,
  'generate-ai-copy':    handleGenerateAiCopy,
  'bulk-delete-contacts': handleBulkDeleteContacts,
  'enroll-cadence':      handleEnrollCadence,
  'unenroll-cadence':    handleUnenrollCadence,
  'enrollment-timeline': handleEnrollmentTimeline,
  'update-step':         handleUpdateStep,
  'cadences-list':   handleCadencesList,
  'opt-out-enrollment': handleOptOutEnrollment,
  'cadence-cta-redirect': handleCadenceCtaRedirect,
  'enrollments-list': handleEnrollmentsList,
  'contact-history':  handleContactHistory,
  'capture-lead':    handleCaptureLead,
  'lite-signup':     handleLiteSignup,
  'next-action':     handleNextAction,
  'export-leads':    handleExportLeads,
  'auto-enroll':     handleAutoEnroll,
  'publish-webhook': handlePublishWebhook,
  'youtube-stream':  handleYoutubeStream,
  'ai-coach':        handleAiCoach,
  'send-sms':        handleSendSms,
  'send-bulk-sms':   handleSendBulkSms,
  'sms-diagnostics': handleSmsDiagnostics,
  'social-health':   handleSocialHealth,
  'snapshot-social-stats': handleSnapshotSocialStats,
  'social-stats-latest':   handleSocialStatsLatest,
  'send-whatsapp':       handleSendWhatsapp,
  'send-bulk-whatsapp':  handleSendBulkWhatsapp,
  'whatsapp-status':     handleWhatsappStatus,
  'whatsapp-templates':  handleWhatsappTemplates,
  'whatsapp-webhook':    handleWhatsappWebhook,
  'whatsapp-register':   handleWhatsappRegister,
  'verify-gate':         handleVerifyGate,
  'error-log':           handleErrorLog,
  'meta-stats':      handleMetaStats,
  'meta-publish':    handleMetaPublish,
  'meta-conversions': handleMetaConversions,
  'meta-token-exchange': handleMetaTokenExchange,
  'meta-token-diagnostics': handleMetaTokenDiagnostics,
  'meta-ads':           handleMetaAds,
  'meta-ad-insights':   handleMetaAdInsights,
  'google-analytics':   handleGoogleAnalytics,
  'google-search-console': handleGoogleSearchConsole,
  'credentials-status': handleCredentialsStatus,
  'generate-image':    handleGenerateImage,
  'auto-publish':      handleAutoPublish,
  'prospect-clubs':    handleProspectClubs,
  'prospect-players':  handleProspectPlayers,
  'enrich-emails':     handleEnrichEmails,
  'go':                handleGoRedirect
};

module.exports = async function handler(req, res) {
  // The _route param is injected by Vercel rewrite:
  //   /api/marketing/:_route → /api/marketing?_route=:_route
  const route = req.query._route;

  if (!route) {
    return res.status(400).json({
      error: 'Missing route. Use /api/marketing/{action}',
      available_routes: Object.keys(ROUTES)
    });
  }

  const handlerFn = ROUTES[route];
  if (!handlerFn) {
    return res.status(404).json({
      error: `Unknown marketing route: ${route}`,
      available_routes: Object.keys(ROUTES)
    });
  }

  return handlerFn(req, res);
};

// Vercel Hobby plan: max 60s. Pro plan would allow up to 300s.
// Orchestration with 4 Claude calls + DALL-E needs the full window.
// IMPORTANT: maxDuration must be set AFTER module.exports is assigned to take effect.
module.exports.maxDuration = 60;
