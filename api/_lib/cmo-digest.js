/**
 * SmartSwing AI — CMO Weekly Digest (Phase F #6)
 *
 * Every Monday: compile last week's marketing numbers into a single email
 * with 3 AI-suggested actions. Runs inside cron-win-back when the current
 * day is Monday.
 *
 *   leads_added, leads_promoted, top_post, cadence_reply_rate,
 *   content_published, budget_spent (if ads), 3 suggested actions
 */

'use strict';

function supaBase() { return String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''); }
function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function weekStart(d = new Date()) {
  const dt = new Date(d);
  const diff = (dt.getDay() + 6) % 7; // ISO: Monday=0
  dt.setUTCDate(dt.getUTCDate() - diff);
  dt.setUTCHours(0,0,0,0);
  return dt;
}

async function countQuery(path) {
  const r = await fetch(`${supaBase()}/rest/v1/${path}`, {
    headers: { ...supaHeaders(), Prefer: 'count=exact' }
  });
  const range = r.headers.get('content-range') || '';
  const m = range.match(/\/(\d+|\*)$/);
  return m && m[1] !== '*' ? parseInt(m[1], 10) : 0;
}

async function buildSummary() {
  const weekStartDate = weekStart();
  const weekStartIso = weekStartDate.toISOString();
  const lastWeekStart = new Date(weekStartDate.getTime() - 7 * 86400000).toISOString();

  const [leadsAdded, leadsPromoted, postsPublished, cadenceSent, cadenceOpened, cadenceClicked] = await Promise.all([
    countQuery(`marketing_contacts?created_at=gte.${weekStartIso}`),
    countQuery(`marketing_contacts?stage=eq.lead&updated_at=gte.${weekStartIso}`).catch(() => 0),
    countQuery(`content_calendar?status=eq.published&published_at=gte.${weekStartIso}`),
    countQuery(`cadence_step_executions?sent_at=gte.${weekStartIso}`).catch(() => 0),
    countQuery(`cadence_step_executions?opened_at=gte.${weekStartIso}`).catch(() => 0),
    countQuery(`cadence_step_executions?clicked_at=gte.${weekStartIso}`).catch(() => 0)
  ]);

  // Top post (best engagement_rate this week)
  let topPost = null;
  try {
    const r = await fetch(
      `${supaBase()}/rest/v1/content_metrics?fetched_at=gte.${weekStartIso}&order=engagement_rate.desc&limit=1&select=content_item_id,engagement_rate,impressions`,
      { headers: supaHeaders() }
    );
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      if (rows[0]) {
        const cr = await fetch(
          `${supaBase()}/rest/v1/content_calendar?id=eq.${rows[0].content_item_id}&select=title,platform,copy_text,posted_url`,
          { headers: supaHeaders() }
        );
        const cdata = cr.ok ? (await cr.json())[0] : null;
        topPost = { ...rows[0], ...(cdata || {}) };
      }
    }
  } catch (_) {}

  // 3 suggested actions (heuristic — pluggable with Claude later)
  const actions = [];
  if (leadsAdded > 0 && cadenceSent === 0)
    actions.push(`Enroll the ${leadsAdded} new leads in a cadence — none have been contacted yet.`);
  if (postsPublished < 3)
    actions.push(`Publish at least ${3 - postsPublished} more posts this week to stay consistent.`);
  if (cadenceOpened > 0 && cadenceClicked === 0)
    actions.push(`${cadenceOpened} opens with 0 clicks — your CTAs need work. Regenerate with the copywriter agent.`);
  if (topPost) actions.push(`Your top post (${topPost.platform}, ${Math.round(topPost.engagement_rate || 0)}% engagement) — ask the agent to write 3 more in that style.`);
  while (actions.length < 3) actions.push('Run the "Marketing Director" agent with a 30-day content plan prompt.');

  return {
    week_start: weekStartDate.toISOString().slice(0, 10),
    leads_added: leadsAdded,
    leads_promoted: leadsPromoted,
    posts_published: postsPublished,
    cadence_sent: cadenceSent,
    cadence_open_rate: cadenceSent ? Math.round(cadenceOpened / cadenceSent * 1000) / 10 : 0,
    cadence_click_rate: cadenceSent ? Math.round(cadenceClicked / cadenceSent * 1000) / 10 : 0,
    top_post: topPost,
    actions: actions.slice(0, 3)
  };
}

function renderHtml(summary) {
  const act = summary.actions.map(a => `<li style="margin-bottom:8px;">${a}</li>`).join('');
  return `
  <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#F5F5F7;color:#0B1220;">
    <h1 style="font-size:22px;margin:0 0 4px;">Your CMO brief · week of ${summary.week_start}</h1>
    <p style="color:#6b7280;margin:0 0 24px;font-size:13px;">SmartSwing AI — automated weekly summary</p>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px;">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
        <div><div style="font-size:24px;font-weight:700;">${summary.leads_added}</div><div style="font-size:12px;color:#6b7280;">leads added</div></div>
        <div><div style="font-size:24px;font-weight:700;">${summary.posts_published}</div><div style="font-size:12px;color:#6b7280;">posts published</div></div>
        <div><div style="font-size:24px;font-weight:700;">${summary.cadence_open_rate}%</div><div style="font-size:12px;color:#6b7280;">cadence open rate</div></div>
        <div><div style="font-size:24px;font-weight:700;">${summary.cadence_click_rate}%</div><div style="font-size:12px;color:#6b7280;">cadence click rate</div></div>
      </div>
    </div>
    ${summary.top_post ? `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Top post this week</div>
      <div style="font-weight:600;margin-bottom:4px;">${(summary.top_post.title || '').slice(0, 80)}</div>
      <div style="font-size:13px;color:#4b5563;">${summary.top_post.platform} · ${Math.round(summary.top_post.engagement_rate || 0)}% engagement · ${summary.top_post.impressions || 0} impressions</div>
    </div>` : ''}
    <div style="background:#fff;border:1px solid #D8FF00;border-radius:12px;padding:20px;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Do this week</div>
      <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;">${act}</ol>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:24px;">Brought to you by the SmartSwing AI growth engine.</p>
  </div>`;
}

async function runWeeklyDigest(targetEmail) {
  const summary = await buildSummary();

  // Store row
  try {
    await fetch(`${supaBase()}/rest/v1/weekly_digests`, {
      method: 'POST',
      headers: { ...supaHeaders(), Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ week_start: summary.week_start, summary, sent_to: targetEmail || null, sent_at: targetEmail ? new Date().toISOString() : null })
    });
  } catch (_) {}

  // Email if target provided and Resend configured
  if (targetEmail && process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM_ADDRESS || 'SmartSwing AI <noreply@mail.smartswingai.com>';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from, to: targetEmail,
          subject: `Your CMO brief — ${summary.leads_added} leads · ${summary.posts_published} posts this week`,
          html: renderHtml(summary)
        })
      });
    } catch (_) {}
  }
  return summary;
}

module.exports = { runWeeklyDigest, buildSummary };
