-- ============================================================
-- Nosginal License System — Migration 002
-- Apply in Supabase SQL Editor after 001_full_schema.sql
-- ============================================================

-- ── licenses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.licenses (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product         text         NOT NULL,
  tier            text         NOT NULL CHECK (tier IN ('15d', '30d', 'lifetime')),
  license_key     text         NOT NULL UNIQUE,
  activated_at    timestamptz  NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  hwid            text,
  hwid_bound_at   timestamptz,
  revoked         boolean      NOT NULL DEFAULT false,
  revoked_reason  text,
  stripe_session  text         UNIQUE,
  stripe_customer text,
  amount_cents    integer,
  currency        text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_user_idx     ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS licenses_product_idx  ON public.licenses(product);
CREATE INDEX IF NOT EXISTS licenses_expires_idx  ON public.licenses(expires_at);
CREATE INDEX IF NOT EXISTS licenses_key_idx      ON public.licenses(license_key);

-- View: current active license per (user, product)
CREATE OR REPLACE VIEW public.active_licenses AS
SELECT DISTINCT ON (user_id, product)
  id, user_id, product, tier, license_key,
  activated_at, expires_at, hwid, revoked,
  CASE
    WHEN revoked THEN 'revoked'
    WHEN tier = 'lifetime' THEN 'active'
    WHEN expires_at IS NULL THEN 'active'
    WHEN expires_at > now() THEN 'active'
    ELSE 'expired'
  END AS status
FROM public.licenses
ORDER BY user_id, product, activated_at DESC;

-- ── payment_events (audit trail for every webhook) ──────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text         NOT NULL DEFAULT 'stripe',
  event_id       text         NOT NULL UNIQUE,
  event_type     text         NOT NULL,
  session_id     text,
  user_id        uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_cents   integer,
  currency       text,
  payload        jsonb        NOT NULL,
  processed_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_type_idx    ON public.payment_events(event_type);
CREATE INDEX IF NOT EXISTS payment_events_user_idx    ON public.payment_events(user_id);
CREATE INDEX IF NOT EXISTS payment_events_session_idx ON public.payment_events(session_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.licenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Users can read only their own licenses.
DROP POLICY IF EXISTS licenses_select_own ON public.licenses;
CREATE POLICY licenses_select_own ON public.licenses FOR SELECT
  USING (auth.uid() = user_id);

-- Admins/owners can read all licenses.
DROP POLICY IF EXISTS licenses_select_admin ON public.licenses;
CREATE POLICY licenses_select_admin ON public.licenses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','owner')
  ));

-- No direct inserts/updates from client — webhook uses service role which bypasses RLS.

-- payment_events: admin/owner read only, no client writes.
DROP POLICY IF EXISTS payment_events_select ON public.payment_events;
CREATE POLICY payment_events_select ON public.payment_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','owner')
  ));

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.licenses_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS licenses_touch_updated_at ON public.licenses;
CREATE TRIGGER licenses_touch_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.licenses_touch_updated_at();
