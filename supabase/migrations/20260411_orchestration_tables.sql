-- Orchestration workflows tracking
CREATE TABLE IF NOT EXISTS orchestration_workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type   TEXT NOT NULL,
  title           TEXT NOT NULL,
  context         JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'running',
  steps           JSONB DEFAULT '[]',
  content_items_created JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID,
  agent           TEXT NOT NULL,
  role            TEXT,
  output          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expand content_calendar type constraint to include orchestrator values
ALTER TABLE content_calendar DROP CONSTRAINT IF EXISTS content_calendar_type_check;
ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_type_check
  CHECK (type IN ('post','reel','story','video','blog','email','ad','script','social_post','content'));

-- RLS
ALTER TABLE orchestration_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_orchestration_workflows" ON orchestration_workflows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_workflow_steps" ON workflow_steps FOR ALL USING (true) WITH CHECK (true);
