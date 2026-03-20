-- SmartSwing training resources, recommendation tracking, and progress sync

CREATE TABLE IF NOT EXISTS public.training_resources (
  id text PRIMARY KEY,
  resource_type text NOT NULL CHECK (resource_type IN ('drill', 'tactic')),
  title text NOT NULL,
  description text,
  youtube_url text NOT NULL,
  channel_name text,
  skill_level text NOT NULL DEFAULT 'Intermediate',
  stroke_type text[] NOT NULL DEFAULT '{}',
  situation_type text,
  duration text,
  focus text,
  targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  weakness_match jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_improvement jsonb NOT NULL DEFAULT '{}'::jsonb,
  tactical_focus text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_id text NOT NULL REFERENCES public.training_resources(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended', 'started', 'completed', 'skipped')),
  weakness_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  weakness_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  improvement_achieved jsonb NOT NULL DEFAULT '{}'::jsonb,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  feedback text,
  found_helpful boolean,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS public.training_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_id text NOT NULL REFERENCES public.training_resources(id) ON DELETE CASCADE,
  weakness_addressed text NOT NULL,
  relevance_score numeric(5,2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
  expected_improvement jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_practice_time text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'completed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_training_resources_type_level ON public.training_resources(resource_type, skill_level);
CREATE INDEX IF NOT EXISTS idx_training_resources_stroke ON public.training_resources USING gin (stroke_type);
CREATE INDEX IF NOT EXISTS idx_training_resources_focus ON public.training_resources USING gin (tactical_focus);
CREATE INDEX IF NOT EXISTS idx_user_training_progress_user_status ON public.user_training_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_assessment ON public.training_recommendations(assessment_id);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_user_status ON public.training_recommendations(user_id, status);

ALTER TABLE public.training_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_resources_read_all ON public.training_resources;
CREATE POLICY training_resources_read_all
  ON public.training_resources
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS user_training_progress_owner_all ON public.user_training_progress;
CREATE POLICY user_training_progress_owner_all
  ON public.user_training_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS training_recommendations_owner_all ON public.training_recommendations;
CREATE POLICY training_recommendations_owner_all
  ON public.training_recommendations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO public.training_resources (
  id,
  resource_type,
  title,
  description,
  youtube_url,
  channel_name,
  skill_level,
  stroke_type,
  duration,
  focus,
  targets,
  weakness_match,
  expected_improvement,
  tactical_focus,
  metadata
)
SELECT
  id,
  'drill',
  title,
  focus,
  video_url,
  channel,
  initcap(skill_level),
  ARRAY[stroke_type],
  duration,
  focus,
  jsonb_build_object('metrics', metric_tags),
  jsonb_build_object(),
  jsonb_build_object(),
  ARRAY[]::text[],
  jsonb_build_object('source', 'drill_library')
FROM public.drill_library
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  youtube_url = EXCLUDED.youtube_url,
  channel_name = EXCLUDED.channel_name,
  skill_level = EXCLUDED.skill_level,
  stroke_type = EXCLUDED.stroke_type,
  duration = EXCLUDED.duration,
  focus = EXCLUDED.focus,
  targets = EXCLUDED.targets,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.training_resources (
  id,
  resource_type,
  title,
  description,
  youtube_url,
  channel_name,
  skill_level,
  stroke_type,
  situation_type,
  focus,
  tactical_focus,
  metadata
)
SELECT
  id,
  'tactic',
  title,
  summary,
  video_url,
  channel,
  initcap(skill_level),
  ARRAY[]::text[],
  situation,
  summary,
  ARRAY[situation],
  jsonb_build_object('source', 'tactic_library')
FROM public.tactic_library
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  youtube_url = EXCLUDED.youtube_url,
  channel_name = EXCLUDED.channel_name,
  skill_level = EXCLUDED.skill_level,
  stroke_type = EXCLUDED.stroke_type,
  situation_type = EXCLUDED.situation_type,
  focus = EXCLUDED.focus,
  tactical_focus = EXCLUDED.tactical_focus,
  metadata = EXCLUDED.metadata,
  updated_at = now();
