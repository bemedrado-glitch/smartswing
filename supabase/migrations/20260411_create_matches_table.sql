-- Matches table for storing live match tracker results
CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent        TEXT NOT NULL DEFAULT 'Opponent',
  result          TEXT NOT NULL CHECK (result IN ('win','loss','draw','abandoned')),
  final_score     TEXT,
  match_format    TEXT,
  mini_game       TEXT,
  sets            JSONB DEFAULT '[]',
  stats           JSONB DEFAULT '{}',
  log             JSONB DEFAULT '[]',
  momentum        JSONB DEFAULT '[]',
  duration_mins   INTEGER,
  notes           TEXT,
  played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX idx_matches_user_id ON matches(user_id);
CREATE INDEX idx_matches_played_at ON matches(played_at DESC);

-- RLS
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own matches
CREATE POLICY "users_own_matches_select" ON matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_matches_insert" ON matches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_matches_update" ON matches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_matches_delete" ON matches FOR DELETE USING (auth.uid() = user_id);

-- Service role full access (for API/webhooks)
CREATE POLICY "service_role_matches" ON matches FOR ALL USING (true) WITH CHECK (true);
