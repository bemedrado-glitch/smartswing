-- ── SmartSwing AI — Referral & Paywall Tracking ──────────────────────────────
-- Adds referral_code, referral_bonus_count, and paywall_hit_at to profiles
-- Creates referrals table for tracking referral chains and bonus grants

-- 1. Add columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code       TEXT,
  ADD COLUMN IF NOT EXISTS referral_bonus_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paywall_hit_at       TIMESTAMPTZ;

-- Unique index on referral_code (sparse — only index non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- Index for cron win-back queries on paywall_hit_at
CREATE INDEX IF NOT EXISTS profiles_paywall_hit_at_idx
  ON public.profiles (paywall_hit_at)
  WHERE paywall_hit_at IS NOT NULL;

-- 2. Create referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_code     TEXT        NOT NULL,
  referrer_user_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  referred_user_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at      TIMESTAMPTZ,
  bonus_granted     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up referrals by referrer
CREATE INDEX IF NOT EXISTS referrals_referrer_code_idx
  ON public.referrals (referrer_code);

CREATE INDEX IF NOT EXISTS referrals_referred_user_id_idx
  ON public.referrals (referred_user_id);

-- 3. RLS policies for referrals table
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own referrals (as referrer or referred)
CREATE POLICY "Users can read own referrals" ON public.referrals
  FOR SELECT
  USING (
    auth.uid() = referrer_user_id
    OR auth.uid() = referred_user_id
  );

-- Only service role can insert/update referrals (done via Edge Functions or API)
CREATE POLICY "Service role can manage referrals" ON public.referrals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Updated_at trigger for referrals
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referrals_updated_at ON public.referrals;
CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Helper function: grant referral bonus atomically
-- Called when a referred user completes their first analysis
CREATE OR REPLACE FUNCTION public.grant_referral_bonus(
  p_referrer_code TEXT,
  p_referred_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
  v_already_granted BOOLEAN;
BEGIN
  -- Find referrer by code
  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = p_referrer_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN RETURN; END IF;
  IF v_referrer_id = p_referred_user_id THEN RETURN; END IF; -- no self-referral

  -- Check if bonus already granted
  SELECT EXISTS(
    SELECT 1 FROM public.referrals
    WHERE referrer_code = p_referrer_code
      AND referred_user_id = p_referred_user_id
      AND bonus_granted = TRUE
  ) INTO v_already_granted;

  IF v_already_granted THEN RETURN; END IF;

  -- Upsert the referral record
  INSERT INTO public.referrals (referrer_code, referrer_user_id, referred_user_id, completed_at, bonus_granted)
  VALUES (p_referrer_code, v_referrer_id, p_referred_user_id, now(), TRUE)
  ON CONFLICT DO NOTHING;

  -- Grant +2 to referrer
  UPDATE public.profiles
  SET referral_bonus_count = referral_bonus_count + 2
  WHERE id = v_referrer_id;

  -- Grant +2 to referred user (they also get a bonus)
  UPDATE public.profiles
  SET referral_bonus_count = referral_bonus_count + 2
  WHERE id = p_referred_user_id;
END;
$$;
