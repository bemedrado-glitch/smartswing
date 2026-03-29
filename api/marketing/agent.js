/**
 * SmartSwing AI — Marketing Agent API
 * POST /api/marketing/agent
 *
 * Accepts: { agent_type, task, context, contact_data }
 * Returns: { success, response, agent_type, task_id }
 */

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agent_type, task, context = '', contact_data = null } = req.body || {};

  if (!agent_type || !task) {
    return res.status(400).json({ error: 'agent_type and task are required' });
  }

  const systemPrompt = SYSTEM_PROMPTS[agent_type];
  if (!systemPrompt) {
    return res.status(400).json({
      error: `Unknown agent_type. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Build user message with optional context
  let userMessage = task;
  if (context) {
    userMessage += `\n\nAdditional context: ${context}`;
  }
  if (contact_data) {
    userMessage += `\n\nContact data: ${JSON.stringify(contact_data, null, 2)}`;
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
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, errorData);

      // Fallback to claude-3-5-sonnet if opus-4-5 fails
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
            messages: [
              { role: 'user', content: userMessage }
            ]
          })
        });

        if (!fallbackResponse.ok) {
          return res.status(502).json({ error: 'AI service error', details: await fallbackResponse.text() });
        }

        const fallbackData = await fallbackResponse.json();
        return res.status(200).json({
          success: true,
          response: fallbackData.content?.[0]?.text || '',
          agent_type,
          task_id,
          model: 'claude-3-5-sonnet-20241022'
        });
      }

      return res.status(502).json({ error: 'AI service error', details: errorData });
    }

    const data = await response.json();
    const agentResponse = data.content?.[0]?.text || '';

    return res.status(200).json({
      success: true,
      response: agentResponse,
      agent_type,
      task_id,
      model: 'claude-opus-4-5',
      usage: data.usage || {}
    });

  } catch (err) {
    console.error('Agent handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
