-- Bug: marketing_contacts.player_type column had DEFAULT 'club', so every
-- auth signup landed with persona='player' but player_type='club'. The
-- dashboard renders by player_type, making all signed-up players appear as
-- 🏟️ clubs in the Leads tab + Contacts tab + Enrollments tab.
--
-- Fix:
-- 1. Drop the misleading default (uncategorized rows should be NULL, not 'club')
-- 2. Backfill: align player_type with persona for auth-sourced rows
-- 3. Update mirror_auth_user_to_marketing trigger so all NEW signups set both
--
-- Applied to production 2026-04-19 via Supabase MCP.

ALTER TABLE marketing_contacts ALTER COLUMN player_type DROP DEFAULT;

UPDATE marketing_contacts
   SET player_type = persona
 WHERE persona IS NOT NULL
   AND persona IN ('player','coach','club','parent','pickleball')
   AND (player_type IS NULL OR player_type != persona)
   AND (source LIKE 'auth_%' OR source IN ('website','signup','subscription','web_signup','landing_page','organic'));

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
    email, name, persona, player_type, stage, source, created_at, updated_at
  )
  VALUES (
    NEW.email, v_full_name, v_role, v_role, 'trial',
    'auth_signup_' || v_provider,
    NEW.created_at, NEW.created_at
  )
  ON CONFLICT (email) DO UPDATE
    SET player_type = EXCLUDED.player_type
    WHERE marketing_contacts.player_type IS NULL OR marketing_contacts.player_type != EXCLUDED.player_type;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'mirror_auth_user_to_marketing failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;
