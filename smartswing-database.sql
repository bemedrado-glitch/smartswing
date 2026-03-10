-- ================================================================
-- SMARTSWING AI - COMPLETE DATABASE SCHEMA
-- Ultra-modern tennis AI platform with all competitive features
-- ================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- USERS & PROFILES
-- ================================================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Tennis details
  skill_level DECIMAL(2,1), -- NTRP: 1.0 to 7.0
  utr_rating DECIMAL(3,2), -- UTR: 1.00 to 16.00
  age_range TEXT CHECK (age_range IN ('under-13', '13-17', '18-24', '25-34', '35-44', '45-54', '55-59', '60+')),
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer-not-to-say')),
  preferred_hand TEXT CHECK (preferred_hand IN ('right', 'left', 'ambidextrous')),
  playing_style TEXT CHECK (playing_style IN ('aggressive-baseline', 'defensive-baseline', 'all-court', 'serve-volley', 'counter-puncher')),
  
  -- Location for player matching
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_city TEXT,
  location_country TEXT,
  search_radius_km INTEGER DEFAULT 25,
  
  -- Availability
  available_days TEXT[], -- ['monday', 'tuesday', ...]
  available_times TEXT[], -- ['morning', 'afternoon', 'evening']
  
  -- Subscription
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'coach')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  stripe_customer_id TEXT,
  
  -- Usage limits
  analyses_this_month INTEGER DEFAULT 0,
  analyses_limit INTEGER DEFAULT 10,
  
  -- Preferences
  privacy_settings JSONB DEFAULT '{"profile_visible": true, "location_visible": true, "stats_visible": true}'::jsonb,
  notification_settings JSONB DEFAULT '{"email": true, "push": true, "match_requests": true, "messages": true}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT false,
  
  CONSTRAINT valid_ntrp CHECK (skill_level BETWEEN 1.0 AND 7.0),
  CONSTRAINT valid_utr CHECK (utr_rating BETWEEN 1.00 AND 16.00)
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view public profiles"
  ON public.profiles FOR SELECT
  USING (
    privacy_settings->>'profile_visible' = 'true'
    OR auth.uid() = id
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Indexes for performance
CREATE INDEX idx_profiles_location ON public.profiles(location_lat, location_lng);
CREATE INDEX idx_profiles_skill_level ON public.profiles(skill_level);
CREATE INDEX idx_profiles_subscription ON public.profiles(subscription_tier, subscription_status);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- ================================================================
-- ANALYSES & ASSESSMENTS
-- ================================================================

CREATE TABLE public.assessments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Video details
  video_url TEXT,
  video_duration DECIMAL(10, 2), -- seconds
  video_fps INTEGER,
  video_resolution TEXT, -- e.g., "1920x1080"
  thumbnail_url TEXT,
  
  -- Stroke type
  stroke_type TEXT CHECK (stroke_type IN (
    'forehand', 'backhand', 'serve', 'volley-forehand', 'volley-backhand', 
    'overhead', 'drop-shot', 'slice', 'topspin'
  )) NOT NULL,
  
  -- Biomechanics metrics (stored as JSONB for flexibility)
  metrics JSONB DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "racquet_speed": 72.5,
  --   "shoulder_rotation": 95.3,
  --   "hip_rotation": 88.2,
  --   "x_factor": 45.1,
  --   "contact_height": 142.5,
  --   "follow_through": "complete",
  --   "knee_bend": 32.1,
  --   "balance_score": 8.5,
  --   "timing_score": 9.2
  -- }
  
  -- Scoring
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  grade TEXT CHECK (grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')),
  percentile INTEGER CHECK (percentile BETWEEN 0 AND 100),
  
  -- Pro comparisons
  pro_comparison JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"player": "Federer", "similarity": 85.2}, {"player": "Nadal", "similarity": 78.5}]
  
  -- Pose detection data
  pose_keypoints JSONB, -- Raw pose detection data
  pose_confidence DECIMAL(5, 2),
  
  -- AI Analysis
  analyzed_with_gpt BOOLEAN DEFAULT false,
  gpt_analysis TEXT,
  gpt_recommendations TEXT[],
  gpt_drills TEXT[],
  gpt_tokens_used INTEGER DEFAULT 0,
  gpt_cost DECIMAL(10, 6) DEFAULT 0.0,
  
  -- Session data (for multi-frame analysis)
  session_data JSONB,
  frame_count INTEGER,
  key_frames INTEGER[],
  
  -- Line calling data (if applicable)
  line_calls JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"frame": 120, "call": "in", "confidence": 0.97, "distance_cm": 2.3}]
  
  -- Highlights
  highlight_url TEXT,
  highlight_duration DECIMAL(10, 2),
  
  -- Status
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  
  -- Privacy
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')),
  
  -- Engagement
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own assessments"
  ON public.assessments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public assessments"
  ON public.assessments FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Users can insert own assessments"
  ON public.assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assessments"
  ON public.assessments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assessments"
  ON public.assessments FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_assessments_user ON public.assessments(user_id, created_at DESC);
CREATE INDEX idx_assessments_stroke ON public.assessments(stroke_type);
CREATE INDEX idx_assessments_score ON public.assessments(overall_score DESC);
CREATE INDEX idx_assessments_visibility ON public.assessments(visibility) WHERE visibility = 'public';

-- ================================================================
-- TRAINING PLANS
-- ================================================================

CREATE TABLE public.training_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Plan details
  title TEXT NOT NULL,
  description TEXT,
  duration_weeks INTEGER NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'professional')),
  
  -- Goals
  focus_areas TEXT[], -- ['forehand', 'serve', 'footwork', ...]
  target_improvements JSONB,
  
  -- Schedule
  plan_data JSONB NOT NULL,
  -- Structure:
  -- {
  --   "weeks": [
  --     {
  --       "week_number": 1,
  --       "focus": "Forehand fundamentals",
  --       "days": [
  --         {
  --           "day": "Monday",
  --           "drills": [...],
  --           "duration_minutes": 90
  --         }
  --       ]
  --     }
  --   ]
  -- }
  
  -- Progress tracking
  current_week INTEGER DEFAULT 1,
  completion_percentage DECIMAL(5, 2) DEFAULT 0.0,
  completed_days INTEGER DEFAULT 0,
  
  -- AI generated
  generated_by_ai BOOLEAN DEFAULT true,
  generation_prompt TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'paused')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own training plans"
  ON public.training_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_training_plans_user ON public.training_plans(user_id, status);

-- ================================================================
-- PLAYER MATCHING & SOCIAL
-- ================================================================

-- Player connections (friends/partners)
CREATE TABLE public.player_connections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  requestee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  connection_type TEXT CHECK (connection_type IN ('friend', 'practice-partner', 'doubles-partner', 'coach-student')),
  
  -- Match history
  matches_played INTEGER DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT different_users CHECK (requester_id != requestee_id),
  CONSTRAINT unique_connection UNIQUE (requester_id, requestee_id)
);

ALTER TABLE public.player_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.player_connections FOR SELECT
  USING (auth.uid() IN (requester_id, requestee_id));

CREATE POLICY "Users can create connections"
  ON public.player_connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update connections"
  ON public.player_connections FOR UPDATE
  USING (auth.uid() IN (requester_id, requestee_id));

CREATE INDEX idx_connections_users ON public.player_connections(requester_id, requestee_id);
CREATE INDEX idx_connections_status ON public.player_connections(status);

-- ================================================================
-- MESSAGING
-- ================================================================

CREATE TABLE public.messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Message content
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'analysis', 'match-invite')),
  
  -- Metadata (for special message types)
  metadata JSONB,
  
  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  deleted_by_sender BOOLEAN DEFAULT false,
  deleted_by_recipient BOOLEAN DEFAULT false,
  
  -- Threading
  thread_id UUID,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT different_users CHECK (sender_id != recipient_id)
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (
    auth.uid() IN (sender_id, recipient_id)
    AND NOT (
      (auth.uid() = sender_id AND deleted_by_sender)
      OR (auth.uid() = recipient_id AND deleted_by_recipient)
    )
  );

CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can delete own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() IN (sender_id, recipient_id));

CREATE INDEX idx_messages_conversation ON public.messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_messages_unread ON public.messages(recipient_id, read) WHERE NOT read;

-- ================================================================
-- COURTS DATABASE
-- ================================================================

CREATE TABLE public.courts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Location
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL,
  postal_code TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  
  -- Court details
  surface_type TEXT CHECK (surface_type IN ('hard', 'clay', 'grass', 'carpet', 'synthetic')),
  indoor BOOLEAN DEFAULT false,
  number_of_courts INTEGER DEFAULT 1,
  lighting BOOLEAN DEFAULT false,
  
  -- Amenities
  amenities TEXT[], -- ['restrooms', 'water-fountain', 'parking', 'pro-shop', ...]
  
  -- Booking
  booking_required BOOLEAN DEFAULT false,
  booking_url TEXT,
  phone TEXT,
  email TEXT,
  price_per_hour DECIMAL(10, 2),
  
  -- Ratings
  rating DECIMAL(3, 2) DEFAULT 0.0,
  review_count INTEGER DEFAULT 0,
  
  -- Photos
  photos TEXT[],
  
  -- Status
  verified BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Public read access for courts
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active courts"
  ON public.courts FOR SELECT
  USING (active = true);

CREATE POLICY "Authenticated users can add courts"
  ON public.courts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Spatial index for location-based queries
CREATE INDEX idx_courts_location ON public.courts USING GIST(
  ll_to_earth(latitude, longitude)
);
CREATE INDEX idx_courts_surface ON public.courts(surface_type);

-- ================================================================
-- MATCHES & LIVE TRACKING
-- ================================================================

CREATE TABLE public.matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Players
  player1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  player2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  player3_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- For doubles
  player4_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- For doubles
  
  -- Match details
  match_type TEXT CHECK (match_type IN ('singles', 'doubles', 'practice')) NOT NULL,
  match_format TEXT CHECK (match_format IN ('best-of-3', 'best-of-5', 'single-set', 'pro-set')) DEFAULT 'best-of-3',
  
  -- Location
  court_id UUID REFERENCES public.courts(id),
  location_name TEXT,
  
  -- Score
  score JSONB,
  -- Structure: {"sets": [{"player1": 6, "player2": 4}, ...], "games": [...], "points": [...]}
  
  current_set INTEGER DEFAULT 1,
  current_game INTEGER DEFAULT 1,
  current_score TEXT, -- e.g., "40-30"
  
  -- Statistics
  stats JSONB DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "player1": {"aces": 5, "double_faults": 2, "winners": 15, ...},
  --   "player2": {...}
  -- }
  
  -- Winner
  winner_id UUID REFERENCES public.profiles(id),
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  
  -- Live features
  live_streaming BOOLEAN DEFAULT false,
  live_url TEXT,
  spectator_count INTEGER DEFAULT 0,
  
  -- Video
  recording_url TEXT,
  highlight_url TEXT,
  
  -- Metadata
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own matches"
  ON public.matches FOR SELECT
  USING (
    auth.uid() IN (player1_id, player2_id, player3_id, player4_id)
  );

CREATE POLICY "Anyone can view public live matches"
  ON public.matches FOR SELECT
  USING (status = 'live' AND live_streaming = true);

CREATE POLICY "Players can create matches"
  ON public.matches FOR INSERT
  WITH CHECK (auth.uid() = player1_id);

CREATE INDEX idx_matches_players ON public.matches(player1_id, player2_id);
CREATE INDEX idx_matches_live ON public.matches(status) WHERE status = 'live';
CREATE INDEX idx_matches_scheduled ON public.matches(scheduled_at) WHERE status = 'scheduled';

-- ================================================================
-- SOCIAL FEED
-- ================================================================

CREATE TABLE public.posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Content
  content TEXT,
  post_type TEXT CHECK (post_type IN ('text', 'match-result', 'achievement', 'training-update', 'court-checkin')) NOT NULL,
  
  -- Media
  media_urls TEXT[],
  
  -- References
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  court_id UUID REFERENCES public.courts(id) ON DELETE SET NULL,
  
  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Visibility
  visibility TEXT DEFAULT 'friends' CHECK (visibility IN ('public', 'friends', 'private')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public posts"
  ON public.posts FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Users can view friends posts"
  ON public.posts FOR SELECT
  USING (
    visibility = 'friends' AND EXISTS (
      SELECT 1 FROM public.player_connections
      WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND requestee_id = posts.user_id)
           OR (requestee_id = auth.uid() AND requester_id = posts.user_id))
    )
  );

CREATE POLICY "Users can view own posts"
  ON public.posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_posts_user ON public.posts(user_id, created_at DESC);
CREATE INDEX idx_posts_public ON public.posts(visibility, created_at DESC) WHERE visibility = 'public';

-- ================================================================
-- ACHIEVEMENTS & GAMIFICATION
-- ================================================================

CREATE TABLE public.achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Achievement details
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT CHECK (category IN ('analysis', 'social', 'training', 'matches', 'milestones')),
  
  -- Requirements
  requirement_type TEXT CHECK (requirement_type IN ('count', 'streak', 'score', 'custom')),
  requirement_value INTEGER,
  
  -- Rarity
  rarity TEXT CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')) DEFAULT 'common',
  
  -- Points
  points INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements
CREATE TABLE public.user_achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_achievement UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own achievements"
  ON public.user_achievements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_achievements ON public.user_achievements(user_id, completed);

-- ================================================================
-- FUNCTIONS & TRIGGERS
-- ================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_courts_updated_at BEFORE UPDATE ON public.courts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reset monthly analysis count
CREATE OR REPLACE FUNCTION reset_monthly_analysis_count()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET analyses_this_month = 0
  WHERE subscription_tier = 'free';
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- STORAGE BUCKETS
-- ================================================================

-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES
  ('videos', 'videos', false),
  ('thumbnails', 'thumbnails', true),
  ('highlights', 'highlights', true),
  ('avatars', 'avatars', true),
  ('court-photos', 'court-photos', true);

-- Storage policies for videos (private)
CREATE POLICY "Users can upload own videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own videos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for public assets
CREATE POLICY "Anyone can view public assets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('thumbnails', 'highlights', 'avatars', 'court-photos'));

CREATE POLICY "Users can upload public assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('thumbnails', 'highlights', 'avatars', 'court-photos')
    AND auth.uid() IS NOT NULL
  );

-- ================================================================
-- SEED DATA - Sample Achievements
-- ================================================================

INSERT INTO public.achievements (code, name, description, category, requirement_type, requirement_value, rarity, points) VALUES
  ('first_analysis', 'First Swing', 'Complete your first analysis', 'analysis', 'count', 1, 'common', 10),
  ('ace_analyzer', '100 Analyses', 'Complete 100 analyses', 'analysis', 'count', 100, 'rare', 100),
  ('week_streak', 'Week Warrior', 'Analyze for 7 consecutive days', 'analysis', 'streak', 7, 'rare', 50),
  ('month_streak', 'Dedication', 'Analyze for 30 consecutive days', 'analysis', 'streak', 30, 'epic', 200),
  ('perfect_score', 'Perfection', 'Achieve a perfect 100 score', 'analysis', 'score', 100, 'legendary', 500),
  ('social_butterfly', 'Network Builder', 'Connect with 10 players', 'social', 'count', 10, 'common', 25),
  ('match_master', 'Match Master', 'Complete 50 matches', 'matches', 'count', 50, 'epic', 150),
  ('training_complete', 'Training Graduate', 'Complete a training plan', 'training', 'custom', 1, 'rare', 75);

-- ================================================================
-- END OF SCHEMA
-- ================================================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
