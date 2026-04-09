-- ============================================================================
-- Grip Assessment — adds grip inference results to each saved assessment
-- ============================================================================
-- The grip analysis engine (grip-analysis-engine.js) runs in the browser at
-- report generation time. It infers the player's grip from body-only pose
-- kinematics at the contact frame (wrist extension, contact height, swing
-- plane, elbow angle, forearm pronation proxy) and emits a JSON payload with
-- the detected grip, probability distribution, indicator values, shot-match
-- coaching verdict, and actionable recommendations.
--
-- We store the full payload in a JSONB column so the dashboard, history, and
-- AI coach narrative can reference it without recomputing. Schema is additive
-- and nullable — existing rows remain valid and older clients without the
-- engine simply persist NULL.
-- ============================================================================

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS grip_assessment JSONB;

COMMENT ON COLUMN public.assessments.grip_assessment IS
  'Grip inference payload from grip-analysis-engine.js. Shape: { detected_grip, confidence, distribution, indicators, shot_match, recommendations, drill_ids, contact_frame_index, handedness, notes }. NULL for assessments saved before the grip engine was deployed.';

-- Index on detected grip for dashboard trend queries ("what grip is this user
-- playing most often?"). Partial index keeps it cheap — ignores NULL rows.
CREATE INDEX IF NOT EXISTS assessments_detected_grip_idx
  ON public.assessments ((grip_assessment->>'detected_grip'))
  WHERE grip_assessment IS NOT NULL;
