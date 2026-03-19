-- ============================================================================
-- SUPABASE SCHEMA UPDATE - Enhanced User Profile Fields
-- ============================================================================

-- Add new columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS usta_level TEXT,
ADD COLUMN IF NOT EXISTS utr_rating TEXT,
ADD COLUMN IF NOT EXISTS preferred_hand TEXT,
ADD COLUMN IF NOT EXISTS gpt_analysis_enabled BOOLEAN DEFAULT TRUE;

-- Add new columns to assessments table for GPT
ALTER TABLE public.assessments
ADD COLUMN IF NOT EXISTS gpt_analysis TEXT,
ADD COLUMN IF NOT EXISTS analyzed_with_gpt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS gpt_tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS gpt_cost DECIMAL(10,6);

-- Create index for GPT queries
CREATE INDEX IF NOT EXISTS idx_assessments_gpt ON assessments(analyzed_with_gpt);
CREATE INDEX IF NOT EXISTS idx_profiles_usta ON profiles(usta_level);
CREATE INDEX IF NOT EXISTS idx_profiles_utr ON profiles(utr_rating);

-- Update the handle_new_user function to include new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name,
    age_range,
    gender,
    usta_level,
    utr_rating,
    preferred_hand,
    subscription_tier
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'age_range',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'usta_level',
    NEW.raw_user_meta_data->>'utr_rating',
    NEW.raw_user_meta_data->>'preferred_hand',
    COALESCE(NEW.raw_user_meta_data->>'subscription_tier', 'free')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN profiles.usta_level IS 'USTA NTRP rating from 1.0 to 7.0';
COMMENT ON COLUMN profiles.utr_rating IS 'Universal Tennis Rating from 1-16';
COMMENT ON COLUMN profiles.preferred_hand IS 'right, left, or ambidextrous';
COMMENT ON COLUMN assessments.gpt_analysis IS 'AI coach feedback from GPT-4';
COMMENT ON COLUMN assessments.gpt_tokens_used IS 'Total tokens used for this analysis';
COMMENT ON COLUMN assessments.gpt_cost IS 'Estimated cost in USD for GPT analysis';

-- Create view for player statistics with ratings
CREATE OR REPLACE VIEW player_stats AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.age_range,
  p.gender,
  p.usta_level,
  p.utr_rating,
  p.preferred_hand,
  COUNT(a.id) as total_assessments,
  AVG(a.overall_score) as avg_score,
  MAX(a.overall_score) as best_score,
  COUNT(CASE WHEN a.analyzed_with_gpt THEN 1 END) as gpt_analyses_count
FROM profiles p
LEFT JOIN assessments a ON p.id = a.user_id
GROUP BY p.id;

COMMENT ON VIEW player_stats IS 'Comprehensive player statistics including ratings';

