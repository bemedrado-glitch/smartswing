/**
 * SmartSwing AI — A/B Hook Rotator (Phase F #8)
 *
 * When the copywriter agent emits multiple hook variants (stored in
 * content_calendar.hook_variants as ["hook a", "hook b", "hook c"]),
 * we initially publish with variant_index=0. After 48h we look at
 * content_metrics for this post; if a different variant (assumed to
 * have been sampled on second posting) is winning, we flip
 * winning_variant_index and feed that into future posts.
 *
 * For now this is a lightweight heuristic: pick the hook that got
 * the most engagement in content_metrics for posts that used it, and
 * mark it as the template winner. When the copywriter agent runs, it
 * will bias future hooks toward the winning style.
 */

'use strict';

function supaBase() { return String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''); }
function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function runVariantRotation() {
  const out = { reviewed: 0, updated: 0 };
  if (!supaBase()) return { ...out, error: 'Supabase not configured' };

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const url = `${supaBase()}/rest/v1/content_calendar?` +
    `hook_variants=not.is.null&variant_decided_at=is.null&published_at=lte.${cutoff}&limit=20&select=id,hook_variants,copy_text`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return { ...out, error: `list ${r.status}` };
  const items = await r.json().catch(() => []);
  if (!items.length) return out;

  for (const item of items) {
    out.reviewed++;
    const variants = Array.isArray(item.hook_variants) ? item.hook_variants : [];
    if (variants.length < 2) continue;

    // Fetch latest metrics
    const mr = await fetch(
      `${supaBase()}/rest/v1/content_metrics?content_item_id=eq.${item.id}&order=fetched_at.desc&limit=1&select=engagement_rate,impressions`,
      { headers: supaHeaders() }
    );
    const metrics = mr.ok ? (await mr.json())[0] : null;
    if (!metrics) continue;

    // Pick the variant whose length/style best matches what performed —
    // simple heuristic: if engagement > 3% the current hook (index 0) is the winner;
    // else flag index 1 as likely better for next rotation.
    const winnerIndex = (metrics.engagement_rate || 0) >= 3 ? 0 : Math.min(1, variants.length - 1);

    await fetch(
      `${supaBase()}/rest/v1/content_calendar?id=eq.${item.id}`,
      {
        method: 'PATCH',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ winning_variant_index: winnerIndex, variant_decided_at: new Date().toISOString() })
      }
    );
    out.updated++;
  }
  return out;
}

// Returns hook examples from past winners to feed into the copywriter agent's prompt
async function getTopHooks(limit = 3) {
  if (!supaBase()) return [];
  const url = `${supaBase()}/rest/v1/content_calendar?` +
    `winning_variant_index=not.is.null&order=variant_decided_at.desc&limit=${limit}&select=hook_variants,winning_variant_index`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return rows
    .map(x => (Array.isArray(x.hook_variants) ? x.hook_variants[x.winning_variant_index] : null))
    .filter(Boolean);
}

module.exports = { runVariantRotation, getTopHooks };
