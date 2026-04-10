-- Add rating_value column to store specific USTA/UTR/ITF rating level
-- from the onboarding quiz (e.g. "3.5" for USTA, "8.5" for UTR).

alter table public.profiles
  add column if not exists rating_value text;
