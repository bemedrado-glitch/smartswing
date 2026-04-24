-- SmartSwing AI — Match Analysis / Phase A — PR 5 slice C follow-up
--
-- `analysis_reports.assessment_id` was declared NOT NULL in the original
-- schema (20260319) because single-swing reports always link to an
-- assessment. Match reports (added in 20260424) describe a full-match
-- artifact that doesn't correspond to a single assessment row — the
-- "subject" has N rallies, not one swing, so there's nothing to foreign-
-- key to.
--
-- Relax the constraint: `assessment_id` may be NULL iff `is_match_report`
-- is true. Single-swing reports retain the original invariant.
--
-- Also relax `report_path` — match reports are rendered from jsonb
-- (match_rallies + match_summary) rather than from an uploaded file,
-- so there's nothing to put in `report_path`. Same check pattern.

ALTER TABLE public.analysis_reports
  ALTER COLUMN assessment_id DROP NOT NULL;

ALTER TABLE public.analysis_reports
  ALTER COLUMN report_path DROP NOT NULL;

-- Enforce that single-swing reports still require both columns.
-- Drop first if it somehow exists, then add.
ALTER TABLE public.analysis_reports
  DROP CONSTRAINT IF EXISTS analysis_reports_match_or_single_chk;

ALTER TABLE public.analysis_reports
  ADD CONSTRAINT analysis_reports_match_or_single_chk
  CHECK (
    (is_match_report = true)
    OR
    (is_match_report = false AND assessment_id IS NOT NULL AND report_path IS NOT NULL)
  );

COMMENT ON CONSTRAINT analysis_reports_match_or_single_chk ON public.analysis_reports IS
  'Single-swing reports must link to an assessment and carry a report_path. Match reports are exempt — they are rendered from match_rallies + match_summary jsonb.';
