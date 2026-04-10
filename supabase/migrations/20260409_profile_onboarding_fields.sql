-- Add onboarding quiz fields to profiles so the welcome quiz data
-- persists in Supabase alongside the existing localStorage copy.

alter table public.profiles
  add column if not exists player_identity text,
  add column if not exists dominant_hand text,
  add column if not exists playing_level text,
  add column if not exists rating_system text,
  add column if not exists playing_style text,
  add column if not exists practice_frequency text,
  add column if not exists favorite_shot text,
  add column if not exists improvement_goals text[],
  add column if not exists onboarding_completed_at timestamptz;
