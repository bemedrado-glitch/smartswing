/**
 * SmartSwing AI — Marketing Next Best Action API
 * GET /api/marketing/next-action
 *
 * Returns prioritized AI-generated marketing recommendations.
 * Currently returns intelligent mock data — designed for easy replacement
 * with real Supabase queries + Claude analysis.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Compute today's date for dynamic deadline labels
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const inThreeDays = new Date(now);
  inThreeDays.setDate(inThreeDays.getDate() + 3);

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const recommendations = [
    {
      priority: 1,
      action: 'Follow up with 3 prospects who opened the "backhand" email but didn\'t click — use the objection-handling SMS template',
      type: 'email',
      urgency: 'high',
      deadline: 'Today',
      estimated_impact: 'High — hot leads going cold',
      suggested_agent: 'copywriter',
      suggested_prompt: 'Write a 2-sentence follow-up SMS for a tennis player who opened my email about backhand mechanics but didn\'t click the CTA. Use curiosity and social proof.'
    },
    {
      priority: 2,
      action: 'Post Tuesday TikTok — "3 things your coach can see in your swing that you can\'t" — backhand mechanics breakdown',
      type: 'social',
      urgency: 'medium',
      deadline: formatDate(tomorrow),
      estimated_impact: 'Medium — organic reach driver',
      suggested_agent: 'content_creator',
      suggested_prompt: 'Write a 60-second TikTok script for "3 things your coach can see in your tennis swing that you can\'t" — hook, 3 points, CTA to upload a free swing analysis'
    },
    {
      priority: 3,
      action: 'Launch Q2 coach outreach cadence — 47 contacts in the pipeline ready to enroll in "New Lead — Tennis Coaches" sequence',
      type: 'campaign',
      urgency: 'medium',
      deadline: 'This week',
      estimated_impact: 'High — 47 qualified coach leads',
      suggested_agent: 'marketing_director',
      suggested_prompt: 'Create a 30-day activation plan for launching our coach outreach cadence to 47 USPTA-certified coaches. Include pre-send hygiene tasks, A/B test variants, and success metrics.'
    },
    {
      priority: 4,
      action: 'Publish "How AI is changing tennis coaching in 2026" blog post — SEO target: "AI tennis coach"',
      type: 'content',
      urgency: 'low',
      deadline: formatDate(inThreeDays),
      estimated_impact: 'Medium — long-term SEO',
      suggested_agent: 'copywriter',
      suggested_prompt: 'Write a 1,200-word SEO blog post titled "How AI is Changing Tennis Coaching in 2026" — target keyword: AI tennis coach. Include stats, 3 case studies, and a CTA to try SmartSwing.'
    },
    {
      priority: 5,
      action: 'Respond to 2 negative brand mentions on Reddit r/tennis — acknowledge the feedback, offer free analysis',
      type: 'brand',
      urgency: 'high',
      deadline: 'Today',
      estimated_impact: 'High — reputation protection',
      suggested_agent: 'marketing_director',
      suggested_prompt: 'Write a genuine, non-defensive response to a Reddit comment that says "SmartSwing AI feels like a gimmick — AI can\'t replace a real coach." Use empathy, acknowledge the concern, offer value.'
    }
  ];

  const summary = {
    total_actions: recommendations.length,
    high_urgency: recommendations.filter(r => r.urgency === 'high').length,
    medium_urgency: recommendations.filter(r => r.urgency === 'medium').length,
    low_urgency: recommendations.filter(r => r.urgency === 'low').length,
    generated_at: now.toISOString(),
    next_refresh: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() // 4 hours
  };

  return res.status(200).json({
    success: true,
    recommendations,
    summary
  });
}
