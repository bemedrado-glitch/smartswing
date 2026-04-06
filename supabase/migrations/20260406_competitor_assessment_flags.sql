-- Adds competitor / pro reference video tagging to assessments so that
-- player-owned analyses and competitor benchmark analyses can be persisted
-- in the same table without polluting progress metrics.
--
-- See app-data.js (saveAssessment / syncAssessmentToCloud) and
-- analyze.html (#isCompetitorVideo, #competitorName) for client-side wiring.

alter table public.assessments
  add column if not exists is_competitor boolean not null default false;

alter table public.assessments
  add column if not exists competitor_name text;

create index if not exists idx_assessments_user_competitor
  on public.assessments(user_id, is_competitor);
