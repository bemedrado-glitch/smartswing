/**
 * SmartSwing AI — Marketing Orchestration Engine
 * POST /api/marketing/orchestrate
 *
 * Chains multiple specialist agents sequentially based on workflow_type.
 * Each agent receives the prior agent's output as context.
 *
 * Supported workflow_types:
 *   email_response | social_post | reel | youtube_video | blog_post | campaign_strategy
 */

'use strict';

// ---------------------------------------------------------------------------
// Agent system prompts (inline — Vercel functions are isolated, no imports)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS = {
  copywriter: `You are a world-class direct response copywriter specializing in sports technology, tennis, and pickleball.
Your copy uses Corporate Visions methodology (provocative insight, status quo disruption, "Why Change / Why You / Why Now") and SPIN Selling (Situation, Problem, Implication, Need-Payoff questions).
Always write with clarity, specificity, and urgency. Avoid jargon. Use short sentences for impact.
Formats you write: email sequences, landing page headlines, ad copy, SMS messages, social captions, sales page sections.
Brand voice: confident, expert, direct — never pushy. Think Nike x McKinsey.
SmartSwing AI is an AI-powered tennis and pickleball swing analysis platform. Users upload a video, get biomechanics AI feedback, personalized drills, and a coaching plan in 60 seconds.
Pricing: Starter (free), Player ($9.99/mo), Performance ($19.99/mo), Tournament Pro ($49.99/mo), Coach plans from $29/mo, Club plans from $299/mo.`,

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
Current growth stage: early traction, moving to scale. Focus on referral loops, content SEO, and coach/club B2B outreach.`,

  social_media: `You are SmartSwing AI's social media manager.
Create engaging, platform-native content for TikTok, Instagram, YouTube, Facebook, and LinkedIn.
Know each platform's algorithm and content format:
- TikTok: hooks in first 2 seconds, trending audio suggestions, "POV:", "The secret to...", native text overlays
- Instagram: Reels scripts + captions, carousel copy (10 slides max), Story sequences, hashtag strategies
- YouTube: video titles (high CTR), description templates, chapter markers, thumbnail text ideas
- Facebook: community-building posts, group content, event promotion, longer-form storytelling
- LinkedIn: B2B coach/club outreach, thought leadership, case study posts
Always provide: platform, content type, caption/script, hashtags, CTA, posting time recommendation.
SmartSwing AI brand voice: authoritative but accessible. Expert but human. Data-backed but inspiring.`
};

// ---------------------------------------------------------------------------
// Workflow definitions — ordered list of agent steps per workflow_type
// ---------------------------------------------------------------------------

const WORKFLOW_CHAINS = {
  email_response: [
    { agent: 'copywriter',         role: 'Draft the email reply' },
    { agent: 'ux_designer',        role: 'Review for visual structure and suggest HTML formatting' },
    { agent: 'marketing_director', role: 'Final review — approve or request changes, confirm status' }
  ],
  social_post: [
    { agent: 'copywriter',         role: 'Write caption, hashtags, and CTA' },
    { agent: 'content_creator',    role: 'Write visual brief: image description, style direction, b-roll notes' },
    { agent: 'ux_designer',        role: 'Review visual formatting, suggest improvements' },
    { agent: 'marketing_director', role: 'Approve and assign publish date and platform' }
  ],
  reel: [
    { agent: 'copywriter',         role: 'Write hook, script, and voiceover copy' },
    { agent: 'content_creator',    role: 'Full production brief: shot list, transitions, text overlays, audio notes' },
    { agent: 'ux_designer',        role: 'Visual review: thumbnail, cover frame, text style' },
    { agent: 'marketing_director', role: 'Approve and schedule' }
  ],
  youtube_video: [
    { agent: 'copywriter',         role: 'Write high-CTR title, description, chapters, and tags' },
    { agent: 'content_creator',    role: 'Full script with intro hook, chapters, CTAs, b-roll notes, thumbnail brief' },
    { agent: 'ux_designer',        role: 'Thumbnail design brief and end screen layout' },
    { agent: 'marketing_director', role: 'Approve and schedule publish date' }
  ],
  blog_post: [
    { agent: 'copywriter',         role: 'Write SEO title, meta description, and full 800-word draft' },
    { agent: 'content_creator',    role: 'Image briefs (hero, inline) and content structure suggestions' },
    { agent: 'ux_designer',        role: 'Formatting review and CTA placement' },
    { agent: 'marketing_director', role: 'Final approval' }
  ],
  campaign_strategy: [
    { agent: 'marketing_director', role: 'Create full 30-day campaign strategy with a content map listing each deliverable (type, platform, date, goal, assigned agent)' }
  ]
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Call Claude (claude-opus-4-5 with fallback to claude-3-5-sonnet).
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {string} apiKey
 * @returns {Promise<string>} text output
 */
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
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok && (response.status === 404 || response.status === 400)) {
    // Fallback to a known-available model
    payload.model = 'claude-3-5-sonnet-20241022';
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Insert a row into a Supabase REST table.
 * @returns {Promise<object>} inserted row
 */
async function supabaseInsert(supabaseUrl, supabaseKey, table, row) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
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

/**
 * Parse the marketing_director campaign strategy output and extract
 * individual deliverables (best-effort JSON or line parsing).
 * @param {string} strategyText
 * @returns {Array<object>}
 */
function parseDeliverables(strategyText) {
  // Try to find a JSON block first
  const jsonMatch = strategyText.match(/```json\s*([\s\S]*?)```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.deliverables && Array.isArray(parsed.deliverables)) return parsed.deliverables;
    } catch (_) { /* fall through */ }
  }

  // Heuristic: look for lines with a recognisable pattern
  const deliverables = [];
  const lines = strategyText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;
    // Match patterns like "Day X: [type] on [platform] — [description]"
    const match = trimmed.match(/day\s+(\d+)[:\s]+(.+)/i);
    if (match) {
      deliverables.push({
        day: parseInt(match[1], 10),
        description: match[2].trim(),
        type: 'social_post',  // default
        platform: 'instagram',
        goal: 'engagement'
      });
    }
  }

  // If nothing matched, return a single placeholder so the workflow completes
  if (deliverables.length === 0) {
    deliverables.push({
      day: 1,
      description: strategyText.substring(0, 200),
      type: 'social_post',
      platform: 'instagram',
      goal: 'brand_awareness'
    });
  }

  return deliverables;
}

/**
 * Map a deliverable type string to one of the known workflow_types.
 */
function mapDeliverableToWorkflowType(type = '') {
  const t = type.toLowerCase().replace(/[_\s-]/g, '');
  if (t.includes('reel') || t.includes('tiktok') || t.includes('short')) return 'reel';
  if (t.includes('youtube') || t.includes('video')) return 'youtube_video';
  if (t.includes('blog') || t.includes('article')) return 'blog_post';
  if (t.includes('email')) return 'email_response';
  return 'social_post';
}

// ---------------------------------------------------------------------------
// Core orchestration logic
// ---------------------------------------------------------------------------

/**
 * Run a linear workflow chain.
 * @returns {{ steps: Array, finalOutput: object, contentItems: Array }}
 */
async function runWorkflowChain(chain, title, context, supabaseUrl, supabaseKey, campaignId, apiKey) {
  const steps = [];
  let previousOutput = '';
  const contentItems = [];

  const contextString = [
    context.topic    ? `Topic: ${context.topic}`        : '',
    context.platform ? `Platform: ${context.platform}`  : '',
    context.persona  ? `Persona: ${context.persona}`    : '',
    context.additional ? `Additional context: ${context.additional}` : ''
  ].filter(Boolean).join('\n');

  for (const step of chain) {
    const systemPrompt = SYSTEM_PROMPTS[step.agent];
    if (!systemPrompt) {
      throw new Error(`Unknown agent: ${step.agent}`);
    }

    let userMessage = `Task: ${step.role}\n\nContent title/brief: ${title}\n\n${contextString}`;
    if (previousOutput) {
      userMessage += `\n\nPrevious step output:\n${previousOutput}`;
    }

    const output = await callClaude(systemPrompt, userMessage, apiKey);

    steps.push({
      agent: step.agent,
      role: step.role,
      output
    });

    // Persist to workflow_steps if Supabase creds provided
    if (supabaseUrl && supabaseKey) {
      try {
        await supabaseInsert(supabaseUrl, supabaseKey, 'workflow_steps', {
          agent: step.agent,
          role: step.role,
          output,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('workflow_steps insert warning:', err.message);
      }
    }

    previousOutput = output;
  }

  // Build final output object from the steps
  const finalOutput = {
    copy:          steps.find(s => s.agent === 'copywriter')?.output         || '',
    visual_brief:  steps.find(s => s.agent === 'content_creator')?.output    || '',
    ux_review:     steps.find(s => s.agent === 'ux_designer')?.output        || '',
    approval:      steps.find(s => s.agent === 'marketing_director')?.output || ''
  };

  // Insert content calendar item for content-producing workflows
  const contentWorkflows = ['social_post', 'reel', 'youtube_video', 'blog_post'];
  const isContentWorkflow = contentWorkflows.some(wt =>
    chain === WORKFLOW_CHAINS[wt] || chain.length > 1
  );

  if (isContentWorkflow && supabaseUrl && supabaseKey) {
    try {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 3); // default: 3 days out

      const calendarItem = await supabaseInsert(supabaseUrl, supabaseKey, 'content_calendar', {
        title,
        type: context.platform ? 'social_post' : 'content',
        platform: context.platform || 'instagram',
        status: 'approved',
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        copy_text: finalOutput.copy || previousOutput,
        assigned_agent: chain[chain.length - 1].agent,
        campaign_id: campaignId || context.campaign_id || null,
        created_at: new Date().toISOString()
      });

      contentItems.push(calendarItem);
    } catch (err) {
      console.warn('content_calendar insert warning:', err.message);
    }
  }

  return { steps, finalOutput, contentItems };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    workflow_type,
    title,
    context = {},
    supabase_url,
    supabase_key
  } = req.body || {};

  // Validation
  if (!workflow_type) {
    return res.status(400).json({ error: 'workflow_type is required' });
  }
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const validWorkflows = Object.keys(WORKFLOW_CHAINS);
  if (!validWorkflows.includes(workflow_type)) {
    return res.status(400).json({
      error: `Invalid workflow_type. Must be one of: ${validWorkflows.join(', ')}`
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const workflowId = generateUUID();

  try {
    let allSteps = [];
    let allContentItems = [];
    let finalOutput = {};
    let status = 'approved';

    if (workflow_type === 'campaign_strategy') {
      // -----------------------------------------------------------------------
      // Campaign strategy: first get the master plan, then spin up sub-workflows
      // -----------------------------------------------------------------------
      const strategyChain = WORKFLOW_CHAINS.campaign_strategy;

      const { steps: strategySteps, finalOutput: strategyOutput } = await runWorkflowChain(
        strategyChain,
        title,
        context,
        supabase_url,
        supabase_key,
        null,
        apiKey
      );

      allSteps.push(...strategySteps);
      finalOutput = strategyOutput;

      const strategyText = strategySteps[0]?.output || '';
      const deliverables = parseDeliverables(strategyText);

      // For each deliverable, run the appropriate sub-workflow
      for (let i = 0; i < deliverables.length; i++) {
        const d = deliverables[i];
        const subWorkflowType = mapDeliverableToWorkflowType(d.type);
        const subChain = WORKFLOW_CHAINS[subWorkflowType];
        const subTitle = d.description || `${d.type} — Day ${d.day || i + 1}`;
        const subContext = {
          ...context,
          platform: d.platform || context.platform || 'instagram',
          topic: d.goal || d.description || context.topic
        };

        try {
          const { steps: subSteps, contentItems: subItems } = await runWorkflowChain(
            subChain,
            subTitle,
            subContext,
            supabase_url,
            supabase_key,
            workflowId,
            apiKey
          );

          allSteps.push(...subSteps);
          allContentItems.push(...subItems);
        } catch (subErr) {
          console.warn(`Sub-workflow ${i + 1} failed:`, subErr.message);
          // Continue — don't abort the entire campaign for one failed deliverable
        }
      }

      status = 'approved';
    } else {
      // -----------------------------------------------------------------------
      // Standard linear workflow
      // -----------------------------------------------------------------------
      const chain = WORKFLOW_CHAINS[workflow_type];

      const { steps, finalOutput: fo, contentItems } = await runWorkflowChain(
        chain,
        title,
        context,
        supabase_url,
        supabase_key,
        context.campaign_id || null,
        apiKey
      );

      allSteps = steps;
      finalOutput = fo;
      allContentItems = contentItems;

      // email_response goes to 'awaiting_approval'; everything else is 'approved'
      status = workflow_type === 'email_response' ? 'awaiting_approval' : 'approved';
    }

    // Persist the workflow record
    if (supabase_url && supabase_key) {
      try {
        await supabaseInsert(supabase_url, supabase_key, 'orchestration_workflows', {
          id: workflowId,
          workflow_type,
          title,
          context: JSON.stringify(context),
          status,
          steps: JSON.stringify(allSteps),
          content_items_created: JSON.stringify(allContentItems),
          created_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('orchestration_workflows insert warning:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      workflow_id: workflowId,
      workflow_type,
      steps: allSteps,
      final_output: finalOutput,
      content_items_created: allContentItems,
      status
    });
  } catch (err) {
    console.error('Orchestrate handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
