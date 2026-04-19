-- DB-level mirror: every new auth.users row → marketing_contacts row.
-- Migration: 20260419_auth_to_marketing_mirror.sql
--
-- WHY:
-- Before this migration, the auth → marketing_contacts mirror only ran in the
-- email/password success path inside signup.html. Two failure modes:
--   1. Google OAuth users land on auth-callback.html which had no mirror code,
--      so every Google signup was missing from the marketing dashboard.
--   2. The mirror was added around Apr 10-11; users who signed up before that
--      had no backfill.
--
-- Result: 9 of 19 auth users (47%) were missing from marketing_contacts when
-- diagnosed on Apr 19. Including the user testing the dashboard
-- (contato10xai@gmail.com, signed up Apr 9 via Google).
--
-- FIX:
-- 1. Postgres trigger on auth.users INSERT runs regardless of which JS path
--    created the user. Idempotent via ON CONFLICT (email) DO NOTHING.
-- 2. One-time backfill of the 9 historical users.
--
-- Applied to production 2026-04-19 via Supabase MCP.

CREATE OR REPLACE FUNCTION public.mirror_auth_user_to_marketing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_full_name TEXT;
  v_role TEXT;
  v_provider TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );
  v_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'userRole',
    'player'
  );
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  IF v_role NOT IN ('player','coach','club','parent','pickleball') THEN
    v_role := 'player';
  END IF;

  INSERT INTO public.marketing_contacts (
    email, name, persona, stage, source, created_at, updated_at
  )
  VALUES (
    NEW.email, v_full_name, v_role, 'trial',
    'auth_signup_' || v_provider,
    NEW.created_at, NEW.created_at
  )
  ON CONFLICT (email) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup if mirror fails — log + continue
  RAISE WARNING 'mirror_auth_user_to_marketing failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_mirror ON auth.users;
CREATE TRIGGER trg_auth_user_mirror
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_auth_user_to_marketing();

-- Backfill historical users that fell through the gap.
INSERT INTO public.marketing_contacts (email, name, persona, stage, source, created_at, updated_at)
SELECT
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name',
           au.raw_user_meta_data->>'name',
           split_part(au.email, '@', 1)),
  CASE
    WHEN COALESCE(au.raw_user_meta_data->>'role','player') IN ('player','coach','club','parent','pickleball')
      THEN COALESCE(au.raw_user_meta_data->>'role','player')
    ELSE 'player'
  END,
  'trial',
  'auth_backfill_' || COALESCE(au.raw_app_meta_data->>'provider','email'),
  au.created_at,
  au.created_at
FROM auth.users au
LEFT JOIN public.marketing_contacts mc ON LOWER(mc.email) = LOWER(au.email)
WHERE mc.id IS NULL
ON CONFLICT (email) DO NOTHING;
