-- SmartSwing AI — Match Analysis / Phase A follow-up — per-report sharing
--
-- Problem: the coach dashboard (PR #144) ships with a panel that queries
-- analysis_reports filtered to athletes on the roster, but current RLS
-- (`auth.uid() = user_id`) blocks coaches from reading them. Without a
-- sharing mechanism, the panel forever shows the empty state.
--
-- This migration adds opt-in per-report sharing via `shared_with_coach_id`
-- and an additive RLS policy that grants SELECT to that coach. It's
-- intentionally narrow:
--   - No global "coach sees all my reports" switch — athletes decide per
--     report. Preserves privacy, gives a clear audit trail, matches how
--     match reports actually get used (selective, not global).
--   - One coach per report. If an athlete works with two coaches, they
--     share each report twice (second share overwrites — good enough for
--     now; multi-coach share can evolve later without breaking existing
--     rows).
--   - Coach side: SELECT only. Coaches can read shared reports; they
--     cannot modify or delete them. UPDATE/DELETE still blocked to the
--     author.
--
-- Column is plain nullable uuid (no FK to profiles) so a share can point
-- at any user_id, including one whose profile row was later deleted —
-- matches the behaviour of `user_id` on the same table.

ALTER TABLE IF EXISTS public.analysis_reports
  ADD COLUMN IF NOT EXISTS shared_with_coach_id uuid NULL;

-- Partial index: coaches query "reports shared with me" all the time;
-- the partial keeps it cheap because most reports aren't shared.
CREATE INDEX IF NOT EXISTS analysis_reports_shared_with_coach_idx
  ON public.analysis_reports (shared_with_coach_id, created_at DESC)
  WHERE shared_with_coach_id IS NOT NULL;

-- Additive RLS — grants SELECT when the current user is the designated
-- share recipient. Existing "Users read own reports" policy remains in
-- place; this is an OR-combined additional path.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'analysis_reports'
      AND policyname = 'Coaches read reports shared with them'
  ) THEN
    CREATE POLICY "Coaches read reports shared with them"
      ON public.analysis_reports
      FOR SELECT
      USING (auth.uid() = shared_with_coach_id);
  END IF;
END $$;

COMMENT ON COLUMN public.analysis_reports.shared_with_coach_id IS
  'User id (auth.users / profiles) of the coach the athlete chose to share this specific report with. NULL by default. Grants that coach SELECT via RLS policy "Coaches read reports shared with them".';
