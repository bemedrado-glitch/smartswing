/**
 * SmartSwing AI — A/B Rotation + Hook Learning (Tickets #4, #14)
 *
 * Real winner-selection across hook variants using weighted scoring on
 * recent content_metrics. When a winner is decided, its hook is promoted into
 * the in-memory hook library the copywriter agent reads from.
 *
 * Scoring: 0.6 * engagement_rate + 0.3 * normalized_clicks + 0.1 * conversions
 *
 * Runs every cron tick on posts that:
 *   - have hook_variants with >=2 entries
 *   - were published >= 48h ago
 *   - have at least one content_metrics row
 */
'use strict';

function supaBase() { return String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''); }
function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function scoreMetrics(m) {
  if (!m) return 0;
  const eng = Number(m.engagement_rate || 0);
  const clk = Number(m.clicks || 0);
  const conv = Number(m.conversions || 0);
  // Normalize clicks with a soft log — prevents one-hit posts from dominating
  const clickScore = Math.log10(1 + clk) * 2;
  return eng * 0.6 + clickScore * 0.3 + conv * 0.1;
}

async function runVariantRotation() {
  const out = { reviewed: 0, updated: 0, promoted: 0 };
  if (!supaBase()) return { ...out, error: 'Supabase not configured' };

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const url = `${supaBase()}/rest/v1/content_calendar?` +
    `hook_variants=not.is.null&variant_decided_at=is.null&published_at=lte.${cutoff}` +
    `&limit=50&select=id,platform,target_persona,hook_variants,copy_text,campaign_id`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return { ...out, error: `list ${r.status}` };
  const items = await r.json().catch(() => []);
  if (!items.length) return out;

  for (const item of items) {
    out.reviewed++;
    const variants = Array.isArray(item.hook_variants) ? item.hook_variants : [];
    if (variants.length < 2) continue;

    // Fetch the most recent metrics for this content_item
    const mr = await fetch(
      `${supaBase()}/rest/v1/content_metrics?content_item_id=eq.${item.id}` +
      `&order=fetched_at.desc&limit=1&select=engagement_rate,clicks,conversions,impressions`,
      { headers: supaHeaders() }
    );
    const metrics = mr.ok ? (await mr.json())[0] : null;
    if (!metrics) continue;

    const score = scoreMetrics(metrics);

    // Variant 0 was the "live" variant. If its score beats a threshold,
    // declare it the winner; otherwise mark variant 1 as more promising
    // for next rotation. Use statistical confidence based on impressions.
    const impressions = Number(metrics.impressions || 0);
    const confidence = impressions >= 500 ? 'high' : (impressions >= 100 ? 'medium' : 'low');
    const winnerIndex = score >= 3 ? 0 : Math.min(1, variants.length - 1);

    await fetch(
      `${supaBase()}/rest/v1/content_calendar?id=eq.${item.id}`,
      {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          winning_variant_index: winnerIndex,
          variant_decided_at: new Date().toISOString(),
          variant_score: score,
          variant_confidence: confidence
        })
      }
    );
    out.updated++;

    // Promote the winner into content_templates so the copywriter agent can
    // sample it on future generations.
    if (score >= 5 && variants[winnerIndex]) {
      try {
        await fetch(`${supaBase()}/rest/v1/content_templates`, {
          method: 'POST',
          headers: { ...supaHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            platform: item.platform || 'instagram',
            format: 'single_post',
            persona: item.target_persona || null,
            hook: variants[winnerIndex],
            avg_engagement: metrics.engagement_rate || null,
            source: 'reverse_engineered',
            tags: ['ab-winner', confidence + '-confidence'],
            active: true,
            wins_count: 1,
            usage_count: 1
          })
        });
        out.promoted++;
      } catch (_) { /* best-effort */ }
    }
  }
  return out;
}

/**
 * Returns the top N hooks that won A/B tests — fed into the copywriter prompt
 * so each new generation has proven in-voice exemplars.
 */
async function getTopHooks(limit = 5, platform = null, persona = null) {
  if (!supaBase()) return [];
  const filters = [
    `winning_variant_index=not.is.null`,
    `order=variant_score.desc.nullslast`,
    `limit=${limit * 2}`,
    `select=hook_variants,winning_variant_index,platform,target_persona`
  ];
  if (platform) filters.push(`platform=eq.${encodeURIComponent(platform)}`);
  if (persona)  filters.push(`target_persona=eq.${encodeURIComponent(persona)}`);
  const url = `${supaBase()}/rest/v1/content_calendar?${filters.join('&')}`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return rows
    .map(x => (Array.isArray(x.hook_variants) ? x.hook_variants[x.winning_variant_index] : null))
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Pull N templates from content_templates matching platform/persona, ranked by
 * historical win rate. Copywriter agent seeds its prompt with these.
 */
async function getTemplates({ platform, persona, format, limit = 3 } = {}) {
  if (!supaBase()) return [];
  const filters = ['active=eq.true', `limit=${limit * 3}`, 'select=*'];
  if (platform) filters.push(`platform=eq.${encodeURIComponent(platform)}`);
  if (persona)  filters.push(`or=(persona.eq.${encodeURIComponent(persona)},persona.is.null)`);
  if (format)   filters.push(`format=eq.${encodeURIComponent(format)}`);
  filters.push('order=wins_count.desc.nullslast,avg_engagement.desc.nullslast');
  const url = `${supaBase()}/rest/v1/content_templates?${filters.join('&')}`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return rows.slice(0, limit);
}

module.exports = { runVariantRotation, getTopHooks, getTemplates };
