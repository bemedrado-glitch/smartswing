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
  copywriter: `You are a world-class direct response copywriter specializing in sports technology, tennis, and pickleball.
Your copy uses Corporate Visions methodology (provocative insight, status quo disruption, "Why Change / Why You / Why Now") and SPIN Selling (Situation, Problem, Implication, Need-Payoff questions).
Always write with clarity, specificity, and urgency. Avoid jargon. Use short sentences for impact.
Formats you write: email sequences, landing page headlines, ad copy, SMS messages, social captions, sales page sections.
Brand voice: confident, expert, direct — never pushy. Think Nike x McKinsey.
SmartSwing AI is an AI-powered tennis and pickleball swing analysis platform. Users upload a video, get biomechanics AI feedback, personalized drills, and a coaching plan in 60 seconds.
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
SmartSwing AI target personas: recreational tennis players (3.0-4.5 NTRP), tennis coaches (USPTA/PTR certified), tennis clubs/academies, tennis parents, pickleball players.
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

async function runWorkflowChain(chain, title, context, supabaseUrl, supabaseKey, campaignId, apiKey) {
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
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 3);
      const calendarItem = await supabaseInsert(supabaseUrl, supabaseKey, 'content_calendar', {
        title, type: context.platform ? 'social_post' : 'content',
        platform: context.platform || 'instagram', status: 'approved',
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        copy_text: finalOutput.copy || previousOutput,
        assigned_agent: chain[chain.length - 1].agent,
        campaign_id: campaignId || context.campaign_id || null,
        created_at: new Date().toISOString()
      });
      contentItems.push(calendarItem);
    } catch (err) { console.warn('content_calendar insert warning:', err.message); }
  }

  return { steps, finalOutput, contentItems };
}

async function handleOrchestrate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { workflow_type, title, context = {}, supabase_url, supabase_key } = req.body || {};
  if (!workflow_type) return res.status(400).json({ error: 'workflow_type is required' });
  if (!title) return res.status(400).json({ error: 'title is required' });

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
        WORKFLOW_CHAINS.campaign_strategy, title, context, supabase_url, supabase_key, null, apiKey
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
            subChain, subTitle, subContext, supabase_url, supabase_key, workflowId, apiKey
          );
          allSteps.push(...subSteps);
          allContentItems.push(...subItems);
        } catch (subErr) { console.warn(`Sub-workflow ${i + 1} failed:`, subErr.message); }
      }
    } else {
      const chain = WORKFLOW_CHAINS[workflow_type];
      const { steps, finalOutput: fo, contentItems } = await runWorkflowChain(
        chain, title, context, supabase_url, supabase_key, context.campaign_id || null, apiKey
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
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE-STREAM — resolves a YouTube video ID to a direct MP4/stream URL
// using public Invidious instances. Used by analyze.html to feed real
// pose-detection on YouTube clips without bundling ytdl-core (which would
// push us over the Vercel Hobby 12-function limit).
// ═══════════════════════════════════════════════════════════════════════════════

// Rotated list of public Invidious mirrors. Raced in parallel — first to
// respond wins. Keep this list current; instances come and go frequently.
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
  'https://invidious.nerdvpn.de',
  'https://invidious.fdn.fr',
  'https://yt.artemislena.eu',
  'https://invidious.incogniweb.net',
  'https://invidious.perennialte.ch'
];

// Per-instance timeout (ms). Vercel Hobby functions have a 10s wall-clock
// limit, so keep this well under that.
const INVIDIOUS_TIMEOUT_MS = 6000;

function isValidYoutubeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

// Fetch video metadata from a single Invidious instance with a hard timeout.
// local=true asks Invidious to return proxied stream URLs (same-origin to the
// instance), which serve proper CORS headers needed for canvas pose detection.
async function fetchFromInstance(base, videoId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVIDIOUS_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${base}/api/v1/videos/${videoId}?local=true&fields=videoId,title,lengthSeconds,formatStreams,adaptiveFormats`,
      { headers: { 'User-Agent': 'Mozilla/5.0 SmartSwingAI/1.0' }, signal: controller.signal }
    );
    if (!resp.ok) throw new Error(`${base} returned ${resp.status}`);
    const data = await resp.json();
    if (!data || !data.videoId) throw new Error(`${base} returned no videoId`);
    return { instance: base, data };
  } finally {
    clearTimeout(timer);
  }
}

// Race all instances in parallel; resolve as soon as ONE succeeds.
// Promise.any cancels the wait the moment a winner is found — much faster
// than allSettled which would sit through every timeout.
async function fetchInvidiousVideo(videoId) {
  try {
    return await Promise.any(
      INVIDIOUS_INSTANCES.map((base) => fetchFromInstance(base, videoId))
    );
  } catch (err) {
    // AggregateError — every instance failed
    const messages = (err.errors || [err]).map((e) => e && e.message).filter(Boolean);
    throw new Error('All Invidious instances failed: ' + messages.slice(0, 3).join('; '));
  }
}

function pickBestStream(formatStreams = [], adaptiveFormats = []) {
  // Prefer progressive (audio+video in one file) MP4 streams — cleanest for
  // <video> playback. Fall back to adaptive video-only MP4 if needed.
  const progressive = formatStreams
    .filter((f) => (f.container || '').toLowerCase() === 'mp4')
    .sort((a, b) => parseInt(b.qualityLabel || '0', 10) - parseInt(a.qualityLabel || '0', 10));
  if (progressive.length) return progressive[0];

  const adaptive = adaptiveFormats
    .filter((f) => (f.type || '').startsWith('video/mp4'))
    .sort((a, b) => parseInt(b.qualityLabel || '0', 10) - parseInt(a.qualityLabel || '0', 10));
  return adaptive[0] || null;
}

async function handleYoutubeStream(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = (req.query.videoId || req.query.id || '').toString().trim();
  if (!isValidYoutubeId(videoId)) {
    return res.status(400).json({ error: 'Invalid or missing videoId (must be the 11-char YouTube ID)' });
  }

  try {
    const { data, instance } = await fetchInvidiousVideo(videoId);
    const stream = pickBestStream(data.formatStreams, data.adaptiveFormats);
    if (!stream || !stream.url) {
      return res.status(404).json({ error: 'No usable MP4 stream found for this video' });
    }
    return res.status(200).json({
      videoId: data.videoId,
      title: data.title || null,
      lengthSeconds: data.lengthSeconds || null,
      streamUrl: stream.url,
      qualityLabel: stream.qualityLabel || null,
      container: stream.container || 'mp4',
      mimeType: stream.type || 'video/mp4',
      source: instance
    });
  } catch (err) {
    console.error('youtube-stream error:', err);
    return res.status(502).json({
      error: 'Could not resolve YouTube stream',
      message: err.message || String(err)
    });
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
  'youtube-stream':  handleYoutubeStream
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
