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
 */

'use strict';

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
  copywriter: `You are a world-class direct response copywriter specializing in sports technology and tennis.
Your copy uses Corporate Visions methodology (provocative insight, status quo disruption, "Why Change / Why You / Why Now") and SPIN Selling (Situation, Problem, Implication, Need-Payoff questions).
Always write with clarity, specificity, and urgency. Avoid jargon. Use short sentences for impact.
Formats you write: email sequences, landing page headlines, ad copy, SMS messages, social captions, sales page sections.
Brand voice: confident, expert, direct — never pushy. Think Nike x McKinsey.
SmartSwing AI is an AI-powered tennis swing analysis platform. Users upload a video, get biomechanics AI feedback, personalized drills, and a coaching plan in 60 seconds.
Pricing: Starter (free), Player ($9.99/mo), Performance ($19.99/mo), Tournament Pro ($49.99/mo), Coach plans from $29/mo, Club plans from $299/mo.`,

  social_media: `You are SmartSwing AI's social media manager.
Create engaging, platform-native content for TikTok, Instagram, YouTube, Facebook, and LinkedIn.
Know each platform's algorithm and content format:
- TikTok: hooks in first 2 seconds, trending audio suggestions, "POV:", "The secret to...", native text overlays
- Instagram: Reels scripts + captions, carousel copy (10 slides max), Story sequences, hashtag strategies
- YouTube: video titles (high CTR), description templates, chapter markers, thumbnail text ideas
- Facebook: community-building posts, group content, event promotion, longer-form storytelling
- LinkedIn: B2B coach/club outreach, thought leadership, case study posts
Always provide: platform, content type, caption/script, hashtags, CTA, posting time recommendation.
SmartSwing AI brand voice: authoritative but accessible. Expert but human. Data-backed but inspiring.`,

  content_creator: `You are SmartSwing AI's content strategist and scriptwriter.
Create scripts, captions, storyboards, and content briefs adapted to each platform's algorithm.
Deliverables you produce:
- TikTok/Instagram Reel scripts: Hook + Problem + Solution + CTA (60-90 sec format)
- YouTube scripts: Full structured scripts with intro hook, chapters, CTAs, b-roll notes
- Blog post outlines and full drafts (SEO-optimized)
- Email newsletter content
- Podcast episode outlines
- Content series concepts with 4-12 piece arc
Tone: Expert sports performance meets accessible tech. Aspirational but grounded in data.
Always include: target persona, content goal, success metric, distribution plan.`,

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

async function callClaude(systemPrompt, userMessage, apiKey) {
  const payload = {
    model: 'claude-opus-4-5',
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

  const { agent_type, task, context = '', contact_data = null } = req.body || {};
  if (!agent_type || !task) return res.status(400).json({ error: 'agent_type and task are required' });

  const systemPrompt = SYSTEM_PROMPTS[agent_type];
  if (!systemPrompt) {
    return res.status(400).json({ error: `Unknown agent_type. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let userMessage = task;
  if (context) userMessage += `\n\nAdditional context: ${context}`;
  if (contact_data) userMessage += `\n\nContact data: ${JSON.stringify(contact_data, null, 2)}`;

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
        system: systemPrompt,
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
        return res.status(200).json({
          success: true, response: fallbackData.content?.[0]?.text || '',
          agent_type, task_id, model: 'claude-3-5-sonnet-20241022'
        });
      }
      return res.status(502).json({ error: 'AI service error', details: errorData });
    }

    const data = await response.json();
    return res.status(200).json({
      success: true, response: data.content?.[0]?.text || '',
      agent_type, task_id, model: 'claude-opus-4-5', usage: data.usage || {}
    });
  } catch (err) {
    console.error('Agent handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
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

async function generateImage(prompt, size) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  size = size || '1024x1024';
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 4000), n: 1, size, quality: 'standard' })
    });
    if (!res.ok) { console.warn('[generateImage] DALL-E error:', res.status); return null; }
    const data = await res.json();
    return data.data?.[0]?.url || null;
  } catch (err) { console.warn('[generateImage] Error:', err.message); return null; }
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

async function runWorkflowChain(chain, title, context, campaignId, apiKey) {
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

    const output = await callClaude(systemPrompt, userMessage, apiKey);
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

      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 3);
      const row = {
        title, type: calendarType,
        platform: context.platform || 'instagram', status: 'scheduled',
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        copy_text: finalOutput.copy || previousOutput,
        image_url: imageUrl,
        assigned_agent: chain[chain.length - 1].agent,
        approval_status: 'approved',
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
    let status = 'approved';

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
            subChain, subTitle, subContext, workflowId, apiKey
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
      status = workflow_type === 'email_response' ? 'awaiting_approval' : 'approved';
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
// ROUTE: enroll-cadence
// ═══════════════════════════════════════════════════════════════════════════════

async function handleEnrollCadence(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { contact_id, cadence_id, supabase_url, supabase_key } = req.body || {};
  if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });
  if (!cadence_id) return res.status(400).json({ error: 'cadence_id is required' });
  if (!supabase_url || !supabase_key) return res.status(400).json({ error: 'supabase_url and supabase_key are required' });

  const now = new Date().toISOString();

  try {
    let cadenceName = cadence_id;
    try {
      const cadences = await supabaseGet(`${supabase_url}/rest/v1/cadences?id=eq.${cadence_id}&select=id,name&limit=1`, supabase_key);
      if (cadences && cadences.length > 0) cadenceName = cadences[0].name || cadence_id;
    } catch (err) { console.warn('Cadence metadata lookup failed (non-fatal):', err.message); }

    const emailSteps = await supabaseGet(`${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${cadence_id}&order=sequence_num`, supabase_key);
    const smsSteps = await supabaseGet(`${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${cadence_id}&order=sequence_num`, supabase_key);

    const enrollmentId = generateUUID();
    const enrollment = await supabaseInsert(supabase_url, supabase_key, 'contact_cadence_enrollments', {
      id: enrollmentId, contact_id, cadence_id, status: 'active',
      current_step: 1, next_step_at: now, enrolled_at: now, created_at: now
    });

    const executions = [];
    for (const step of (emailSteps || [])) {
      executions.push({
        id: generateUUID(), enrollment_id: enrollmentId, contact_id, cadence_id,
        step_id: step.id || null, sequence_num: step.sequence_num, type: 'email',
        subject: step.subject || null, body: step.body || step.html_body || null,
        status: 'pending', scheduled_at: addDays(now, step.delay_days || 0), created_at: now
      });
    }
    for (const step of (smsSteps || [])) {
      executions.push({
        id: generateUUID(), enrollment_id: enrollmentId, contact_id, cadence_id,
        step_id: step.id || null, sequence_num: step.sequence_num, type: 'sms',
        subject: null, body: step.message || step.body || null,
        status: 'pending', scheduled_at: addDays(now, step.delay_days || 0), created_at: now
      });
    }
    executions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    let insertedExecutions = [];
    if (executions.length > 0) {
      insertedExecutions = await supabaseBulkInsert(supabase_url, supabase_key, 'cadence_step_executions', executions);
    }

    const nextStepAt = executions.length > 0 ? executions[0].scheduled_at : now;
    const schedule = executions.map((exec, idx) => ({
      step: idx + 1, type: exec.type, subject: exec.subject || null,
      body_preview: exec.body ? exec.body.substring(0, 100) : null, scheduled_at: exec.scheduled_at
    }));

    return res.status(200).json({
      success: true, enrollment_id: enrollment?.id || enrollmentId,
      contact_id, cadence_id, cadence_name: cadenceName,
      steps_scheduled: executions.length, next_step_at: nextStepAt, schedule
    });
  } catch (err) {
    console.error('Enroll-cadence handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
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

  const { email, name, phone, persona, source, utm_source, utm_medium, utm_campaign, page_url, notes } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase_url || !supabase_key) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const r = await fetch(`${supabase_url}/rest/v1/lead_captures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}`, 'Prefer': 'return=representation' },
      body: JSON.stringify({ email, name, phone, persona: persona || 'player', source: source || 'website', utm_source, utm_medium, utm_campaign, page_url, notes })
    });
    const data = await r.json();
    return res.status(200).json({ success: true, lead_id: Array.isArray(data) ? data[0]?.id : data?.id });
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

  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = supabase_url || req.query.supabase_url;
  const key = supabase_key || req.query.supabase_key;
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const format = req.query.format || 'csv';
  const source = req.query.source;
  const since = req.query.since;
  const table = req.query.table || 'lead_captures';

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

    if (!data.length) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
      return res.status(200).send('No data found');
    }

    const cols = Object.keys(data[0]);
    const escape = v => {
      if (v === null || v === undefined) return '';
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
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

  const validPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'];
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

  const pageId = process.env.META_PAGE_ID || '61578118551710';
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

  const pageId = process.env.META_PAGE_ID || '61578118551710';
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

    // Run 3 reports in parallel: overview, daily breakdown, top pages, traffic sources
    const [overviewRes, dailyRes, pagesRes, sourcesRes] = await Promise.all([
      // 1) Overview metrics (last 30 days)
      fetch(apiBase + ':runReport', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      }).then(r => r.json()),

      // 2) Daily breakdown for chart
      fetch(apiBase + ':runReport', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'totalUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' }
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }]
        })
      }).then(r => r.json()),

      // 3) Top pages
      fetch(apiBase + ':runReport', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'totalUsers' },
            { name: 'bounceRate' }
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 15
        })
      }).then(r => r.json()),

      // 4) Traffic sources / channels
      fetch(apiBase + ':runReport', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      }).then(r => r.json())
    ]);

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

  const imageUrl = await generateImage(prompt, size);
  if (!imageUrl) return res.status(500).json({ error: 'Image generation failed. Check OPENAI_API_KEY.' });

  // If content_item_id provided, update the calendar item
  if (content_item_id) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', content_item_id, { image_url: imageUrl });
      } catch (err) { console.warn('[generate-image] Failed to update content_calendar:', err.message); }
    }
  }

  return res.status(200).json({ success: true, image_url: imageUrl });
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

        if (platform === 'facebook' || platform === 'both') {
          const fbPayload = { message, access_token: accessToken };
          const fbRes = await fetch('https://graph.facebook.com/v21.0/' + pageId + '/feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fbPayload)
          }).then(r => r.json());
          publishResult.facebook = fbRes;
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
          } else {
            publishResult.instagram = { error: 'Container creation failed', details: containerRes };
          }
        }

        // Update status to published
        await supabasePatch(supabaseUrl, supabaseKey, 'content_calendar', item.id, {
          status: 'published', published_date: today
        });

        results.push({ id: item.id, title: item.title, platform, result: publishResult, status: 'published' });
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

const ROUTES = {
  'agent':           handleAgent,
  'orchestrate':     handleOrchestrate,
  'enroll-cadence':  handleEnrollCadence,
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
  'auto-publish':      handleAutoPublish
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
