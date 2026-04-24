-- SmartSwing AI — Roadmap item #4 (2026-04-15 plan) — Publish-proof logging
--
-- api/_lib/publish-runner.js already writes `published_url` and
-- `platform_response` on successful publish, but `content_calendar`
-- only carries `posted_url` + `provider_post_id` + `failure_reason`.
-- Supabase silently drops unknown fields on PATCH, so every successful
-- publish was losing the live URL + raw platform response.
--
-- Adds:
--   - published_url     text  — canonical live post URL
--   - platform_response jsonb — full raw payload returned by the
--                                 platform API, for debugging + audit
--
-- `posted_url` is left in place (older callers still reference it);
-- new code should prefer `published_url` which matches the field name
-- in the publish-runner + UI. A view or app-side alias can bridge the
-- two later if needed.

ALTER TABLE IF EXISTS public.content_calendar
  ADD COLUMN IF NOT EXISTS published_url     text  NULL,
  ADD COLUMN IF NOT EXISTS platform_response jsonb NULL;

COMMENT ON COLUMN public.content_calendar.published_url IS
  'Live post URL returned by the platform API on successful publish. UI renders "✓ Posted to {platform} → view post" with this link.';

COMMENT ON COLUMN public.content_calendar.platform_response IS
  'Full platform API response JSON (post id, permalink, raw metadata). Useful for debugging failed shares and for post-publish verification.';
