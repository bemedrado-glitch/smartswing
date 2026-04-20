-- Bug: marketing_contacts.stage was set ONCE by the auth-mirror trigger and
-- never updated thereafter. The Stripe webhook updates profiles.subscription_tier
-- but does not touch marketing_contacts.stage. Result: paying users still show
-- as 'Trial' in the dashboard for months after they've upgraded.
--
-- Confirmed live: 4 of 8 visible "Trial" contacts in the dashboard were
-- actually on the Pro plan (Bernardo Medrado, contato10xai, Arthur Araujo,
-- Flávio Araújo). Discrepancy was undetectable from the UI alone.
--
-- This migration:
--   1. map_billing_to_stage(tier, status, was_ever_paid) function — single
--      source of truth for the tier→stage mapping
--   2. Backfill marketing_contacts.stage from profiles for ALL rows
--   3. Trigger on profiles UPDATE so any future Stripe webhook firing
--      auto-syncs the marketing CRM (no separate JS code needed)
--   4. v_contacts_with_billing view joining mc with the live billing truth
--      so the dashboard can show actual tier (Pro/Free/Coach) alongside stage
--
-- Applied to production 2026-04-20 via Supabase MCP.

CREATE OR REPLACE FUNCTION public.map_billing_to_stage(
  p_tier TEXT,
  p_status TEXT,
  p_was_ever_paid BOOLEAN DEFAULT FALSE
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- Active paid plans
  IF LOWER(COALESCE(p_status,'')) = 'active'
     AND LOWER(COALESCE(p_tier,'')) IN ('pro','elite','coach','tournament','starter','performance','tournament_pro') THEN
    RETURN 'customer';
  END IF;

  -- Past_due, canceled, or downgraded after paying
  IF p_was_ever_paid OR LOWER(COALESCE(p_status,'')) IN ('past_due','canceled','unpaid','incomplete_expired') THEN
    RETURN 'churned';
  END IF;

  -- Free tier, no prior payment → trial (signed up but never bought)
  RETURN 'trial';
END;
$$;

UPDATE marketing_contacts mc
   SET stage = map_billing_to_stage(p.subscription_tier, p.subscription_status, p.stripe_customer_id IS NOT NULL),
       updated_at = NOW()
  FROM profiles p
 WHERE LOWER(p.email) = LOWER(mc.email)
   AND mc.stage IS DISTINCT FROM map_billing_to_stage(p.subscription_tier, p.subscription_status, p.stripe_customer_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.sync_profile_to_marketing_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stage TEXT;
BEGIN
  IF (TG_OP = 'UPDATE'
      AND (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier
           OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status)) THEN
    v_new_stage := map_billing_to_stage(NEW.subscription_tier, NEW.subscription_status, NEW.stripe_customer_id IS NOT NULL);
    UPDATE marketing_contacts
       SET stage = v_new_stage, updated_at = NOW()
     WHERE LOWER(email) = LOWER(NEW.email)
       AND stage IS DISTINCT FROM v_new_stage;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_profile_to_marketing_stage failed for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_marketing_stage ON profiles;
CREATE TRIGGER trg_sync_profile_to_marketing_stage
  AFTER UPDATE OF subscription_tier, subscription_status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_to_marketing_stage();

CREATE OR REPLACE VIEW v_contacts_with_billing AS
SELECT
  mc.*,
  p.subscription_tier AS live_billing_tier,
  p.subscription_status AS live_billing_status,
  p.stripe_customer_id IS NOT NULL AS has_stripe_customer,
  CASE
    WHEN p.subscription_tier IN ('pro','elite','coach','tournament','performance','tournament_pro')
         AND p.subscription_status = 'active' THEN TRUE
    ELSE FALSE
  END AS is_paying_customer
FROM marketing_contacts mc
LEFT JOIN profiles p ON LOWER(p.email) = LOWER(mc.email);
