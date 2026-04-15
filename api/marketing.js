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
    console.warn('[persistAgentOutput] agent_tasks insert failed:', err.message);
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
      console.warn('[persistAgentOutput] content_calendar insert failed:', r.status, (await r.text()).slice(0, 200));
    }
  } catch (err) {
    console.warn('[persistAgentOutput] content_calendar insert error:', err.message);
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
 * Generate an image via DALL-E 3 and immediately mirror the bytes to Supabase
 * Storage so the URL is permanent (DALL-E's CDN URLs expire in ~60min).
 *
 * Returns either:
 *   - a permanent public URL string (back-compat with existing callers), or
 *   - null on failure.
 *
 * Pass `opts.returnDetail = true` to get `{ url, assetId, promptUsed }`.
 */
async function generateImage(prompt, size, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return opts.returnDetail ? { url: null, assetId: null } : null;
  size = size || '1024x1024';
  const brandedPrompt = brandImagePrompt(prompt);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s max for image gen
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-3', prompt: brandedPrompt.slice(0, 4000), n: 1, size, quality: 'standard' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn('[generateImage] DALL-E error:', res.status);
      return opts.returnDetail ? { url: null, assetId: null } : null;
    }
    const data = await res.json();
    const ephemeralUrl = data.data?.[0]?.url || null;
    if (!ephemeralUrl) return opts.returnDetail ? { url: null, assetId: null } : null;

    // Persist to Supabase Storage so it survives beyond DALL-E's 60min TTL.
    const persisted = await persistGeneratedImage(ephemeralUrl, {
      prompt: brandedPrompt,
      model: 'dall-e-3',
      contentItemId: opts.contentItemId || null
    });

    const finalUrl = persisted.url || ephemeralUrl;  // Fall back to ephemeral if storage fails
    return opts.returnDetail
      ? { url: finalUrl, assetId: persisted.assetId, promptUsed: brandedPrompt }
      : finalUrl;
  } catch (err) {
    console.warn('[generateImage] Error:', err.message);
    return opts.returnDetail ? { url: null, assetId: null } : null;
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

    // Use Sonnet for workflow steps — fast enough for 4 steps + image gen within 60s
    const output = await callClaude(systemPrompt, userMessage, apiKey, 'claude-sonnet-4-20250514');
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

    // Only include steps the contact can actually receive
    const emailSteps = hasRealEmail ? allEmailSteps : [];
    const smsSteps   = hasPhone     ? allSmsSteps   : [];

    const skippedChannels = [];
    if (!hasRealEmail && allEmailSteps.length > 0) skippedChannels.push(`email (${allEmailSteps.length} steps skipped — no valid email)`);
    if (!hasPhone     && allSmsSteps.length > 0)   skippedChannels.push(`SMS (${allSmsSteps.length} steps skipped — no phone number)`);

    const enrollmentId = generateUUID();
    // Compute the first step's scheduled_at so next_step_at on the enrollment matches it
    const firstEmail = emailSteps[0];
    const firstSms = smsSteps[0];
    const firstDelayDays = Math.min(
      firstEmail ? (firstEmail.delay_days || 0) : Number.MAX_SAFE_INTEGER,
      firstSms   ? (firstSms.delay_days   || 0) : Number.MAX_SAFE_INTEGER
    );
    const firstNextAt = isFinite(firstDelayDays) ? addDays(now, firstDelayDays) : now;

    const enrollment = await supabaseInsert(supabase_url, supabase_key, 'contact_cadence_enrollments', {
      id: enrollmentId, contact_id, cadence_id, status: 'active',
      current_step: 1, next_step_at: firstNextAt, enrolled_at: now, created_at: now
    });

    // Build step executions. DB columns: step_type, step_num (NOT type/sequence_num).
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
    executions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    if (executions.length > 0) {
      await supabaseBulkInsert(supabase_url, supabase_key, 'cadence_step_executions', executions);
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
      success: true, enrollment_id: enrollment?.id || enrollmentId,
      contact_id, cadence_id, cadence_name: cadenceName,
      campaign_id: campaign_id || null,
      stage: 'lead',
      steps_scheduled: executions.length,
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
        // Non-blocking — lead was already captured in lead_captures
        console.warn('[capture-lead] marketing_contacts sync failed:', syncErr.message);
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
    }
  };

  const total = Object.keys(credentials).length;
  const configured = Object.values(credentials).filter(c => c.configured).length;

  return res.status(200).json({ success: true, configured, total, credentials });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMS SENDING VIA AWS SNS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSendSms(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, message, subject } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel env vars.' });
  }

  const originationNumber = process.env.AWS_SMS_ORIGINATION_NUMBER || '+18885429135';

  try {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    const client = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const params = {
      PhoneNumber: phone,
      Message: message,
      Subject: subject || undefined,
      MessageAttributes: {
        'AWS.MM.SMS.OriginationNumber': { DataType: 'String', StringValue: originationNumber },
        'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Promotional' }
      }
    };
    const result = await client.send(new PublishCommand(params));
    return res.status(200).json({ success: true, messageId: result.MessageId });
  } catch (err) {
    console.error('[send-sms] Error:', err);
    return res.status(500).json({ error: 'SMS send failed: ' + (err.message || 'Unknown error') });
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
      recipients.map(({ phone, message, subject }) => {
        if (!phone || !message) {
          return Promise.reject(new Error('Each recipient must have phone and message'));
        }
        return client.send(new PublishCommand({
          PhoneNumber: phone,
          Message: message,
          Subject: subject || undefined,
          MessageAttributes: {
            'AWS.MM.SMS.OriginationNumber': { DataType: 'String', StringValue: originationNumber },
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Promotional' }
          }
        }));
      })
    );

    const summary = results.map((r, i) => ({
      phone: recipients[i].phone,
      success: r.status === 'fulfilled',
      messageId: r.status === 'fulfilled' ? r.value.MessageId : undefined,
      error: r.status === 'rejected' ? r.reason.message : undefined
    }));

    const sent = summary.filter(s => s.success).length;
    const failed = summary.filter(s => !s.success).length;

    return res.status(200).json({ success: true, sent, failed, results: summary });
  } catch (err) {
    console.error('[send-bulk-sms] Error:', err);
    return res.status(500).json({ error: 'Bulk SMS send failed: ' + (err.message || 'Unknown error') });
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
      fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name,followers_count,fan_count,engagement&access_token=${accessToken}`).then(r => r.json()),
      fetch(`https://graph.facebook.com/v21.0/${igAccountId}?fields=followers_count,media_count,username&access_token=${accessToken}`).then(r => r.json())
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

      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbPayload)
      }).then(r => r.json());

      results.facebook = fbRes;
    }

    // Publish to Instagram (requires image_url for IG)
    if ((platform === 'instagram' || platform === 'both') && image_url) {
      // Step 1: Create media container
      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media`, {
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
        const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/media_publish`, {
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

    const result = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
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
    const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
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
    const pagesUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${longLivedUserToken}`;
    const pageRes = await fetch(pagesUrl).then(r => r.json());

    if (pageRes.error) {
      // If page-specific query fails, try listing all pages
      const allPagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`;
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
      const campaignsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time&limit=50&access_token=${accessToken}`;
      const campaignsRes = await fetch(campaignsUrl).then(r => r.json());

      if (campaignsRes.error) {
        return res.status(400).json({ error: 'Failed to fetch campaigns', details: campaignsRes.error.message });
      }

      // Fetch account-level insights (last 30 days)
      const insightsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=impressions,clicks,spend,cpc,cpm,ctr,reach,actions&date_preset=last_30d&access_token=${accessToken}`;
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

      const campaignRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/campaigns`, {
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

        const adSetRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adsets`, {
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

          const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adcreatives`, {
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

            const adRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/ads`, {
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
      const updateRes = await fetch(`https://graph.facebook.com/v21.0/${campaign_id}`, {
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
      fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type&date_preset=${preset}&access_token=${accessToken}`).then(r => r.json()),
      fetch(`https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=impressions,clicks,spend,ctr,reach&date_preset=${preset}&time_increment=1&limit=90&access_token=${accessToken}`).then(r => r.json())
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
          const fbRes = await fetch('https://graph.facebook.com/v21.0/' + pageId + '/feed', {
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
          const containerRes = await fetch('https://graph.facebook.com/v21.0/' + igAccountId + '/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: item.image_url, caption: message, access_token: accessToken })
          }).then(r => r.json());

          if (containerRes.id) {
            const pubRes = await fetch('https://graph.facebook.com/v21.0/' + igAccountId + '/media_publish', {
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
            status: 'published', published_date: today, posted_url: publishedUrl
          });
          results.push({ id: item.id, title: item.title, platform, result: publishResult, status: 'published', url: publishedUrl });
        } else {
          // Keep status='scheduled' so it retries next run; record the failure reason
          await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', item.id, {
            failure_reason: (failureReason || 'Publish failed — no post ID returned').slice(0, 500)
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
  'generate-ai-copy':    handleGenerateAiCopy,
  'bulk-delete-contacts': handleBulkDeleteContacts,
  'enroll-cadence':      handleEnrollCadence,
  'unenroll-cadence':    handleUnenrollCadence,
  'enrollment-timeline': handleEnrollmentTimeline,
  'update-step':         handleUpdateStep,
  'capture-lead':    handleCaptureLead,
  'next-action':     handleNextAction,
  'export-leads':    handleExportLeads,
  'auto-enroll':     handleAutoEnroll,
  'publish-webhook': handlePublishWebhook,
  'youtube-stream':  handleYoutubeStream,
  'ai-coach':        handleAiCoach,
  'send-sms':        handleSendSms,
  'send-bulk-sms':   handleSendBulkSms,
  'meta-stats':      handleMetaStats,
  'meta-publish':    handleMetaPublish,
  'meta-conversions': handleMetaConversions,
  'meta-token-exchange': handleMetaTokenExchange,
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
