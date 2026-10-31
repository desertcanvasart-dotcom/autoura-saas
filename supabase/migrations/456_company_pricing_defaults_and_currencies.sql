-- ============================================================================
-- 456 — Pricing defaults are the company's; currencies in use, a conversion
--       buffer, and who set each exchange-rate override
-- ============================================================================
-- Settings › Pricing defaults and Settings › Currencies & rates (navigation
-- brief, 2026-10-30).
--
-- 1. The old Preferences tab saved cost mode, tier and markup per USER
--    (user_preferences), while the house markup sat on tenants (279). The
--    operator chose company-wide: one set per company. Existing personal
--    values are copied ONCE into the company where it has none, taken from
--    the owner (else the earliest admin) who had saved them. user_preferences
--    stays — nothing is dropped — but the app reads the company's values.
--
--    default_cost_mode: NOT NULL DEFAULT 'auto' — every company already gets
--    'auto' today when no one chose (lib/itineraries/default-cost-mode).
--    default_tier: nullable — a tier word from the company's own vocabulary
--    (335); NULL = no default chosen.
--    default_margin_percent: unchanged (279), still NULL = not chosen.
--    default_quote_currency: the currency new quotes are SHOWN in (the old
--    per-user default_currency). NOT tenants.default_currency, which is the
--    currency the company bills in (281) — a display choice must never move
--    that. NULL = show in the billing currency.
--
-- 2. conversion_buffer_percent: added when a price is SHOWN in another
--    currency — display = price × rate × (1 + buffer/100). Display only:
--    never applied to an amount charged, which stays in the billing currency. 0 = off (the default,
--    so nothing changes until a company sets it). Capped at 20%.
--
-- 3. currencies_in_use: which currencies quote pickers offer. NULL = all the
--    supported ones (today's behaviour). Unticked currencies keep their rate.
--
-- 4. exchange_rates.set_by / set_at: who made a company's override and when
--    (tenant rows only; the shared API rows have tenant_id NULL).
--    exchange_rate_events: every override, reset and in-use change, kept.
-- ============================================================================

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_cost_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS default_tier text,
  ADD COLUMN IF NOT EXISTS default_quote_currency text,
  ADD COLUMN IF NOT EXISTS conversion_buffer_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currencies_in_use text[];

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_default_cost_mode_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_default_cost_mode_check
  CHECK (default_cost_mode IN ('auto', 'manual'));
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_default_quote_currency_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_default_quote_currency_check
  CHECK (default_quote_currency IS NULL OR default_quote_currency IN
    ('EUR', 'USD', 'GBP', 'EGP', 'AED', 'SAR', 'JOD', 'MAD', 'TND', 'KES', 'TZS', 'ZAR'));
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_conversion_buffer_percent_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_conversion_buffer_percent_check
  CHECK (conversion_buffer_percent >= 0 AND conversion_buffer_percent <= 20);

COMMENT ON COLUMN public.tenants.default_cost_mode IS
  'New itineraries: auto = costs from the rate sheets, manual = typed. Company-wide (456).';
COMMENT ON COLUMN public.tenants.default_tier IS
  'Default service tier for new quotes, a word from the company''s tier vocabulary. NULL = none chosen (456).';
COMMENT ON COLUMN public.tenants.default_quote_currency IS
  'The currency new quotes are shown in. NULL = the billing currency (default_currency). Display only (456).';
COMMENT ON COLUMN public.tenants.conversion_buffer_percent IS
  'Added when a EUR price is shown in another currency (display only, never charged). 0 = off (456).';
COMMENT ON COLUMN public.tenants.currencies_in_use IS
  'Currencies quote pickers offer. NULL = every supported currency (456).';

-- The one-time copy of personal defaults into the company (see 1 above).
WITH chosen AS (
  SELECT DISTINCT ON (m.tenant_id)
         m.tenant_id, p.default_cost_mode, p.default_tier, p.default_margin_percent, p.default_currency
  FROM public.tenant_members m
  JOIN public.user_preferences p ON p.user_id = m.user_id
  WHERE m.role IN ('owner', 'admin')
  ORDER BY m.tenant_id, (m.role = 'owner') DESC, m.created_at ASC
)
UPDATE public.tenants t
SET default_margin_percent = COALESCE(t.default_margin_percent, c.default_margin_percent),
    default_tier = COALESCE(t.default_tier, NULLIF(c.default_tier, '')),
    default_quote_currency = COALESCE(t.default_quote_currency,
      CASE WHEN c.default_currency IN ('EUR', 'USD', 'GBP', 'EGP', 'AED', 'SAR', 'JOD', 'MAD', 'TND', 'KES', 'TZS', 'ZAR')
           AND c.default_currency IS DISTINCT FROM t.default_currency
           THEN c.default_currency END),
    default_cost_mode = CASE WHEN c.default_cost_mode IN ('auto', 'manual') THEN c.default_cost_mode ELSE t.default_cost_mode END
FROM chosen c
WHERE c.tenant_id = t.id;

ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS set_at timestamptz;

-- Overrides made before 456 have no author; their last change is the best
-- "when" there is.
UPDATE public.exchange_rates
SET set_at = COALESCE(last_updated_at, updated_at, created_at)
WHERE tenant_id IS NOT NULL AND set_at IS NULL;

CREATE TABLE IF NOT EXISTS public.exchange_rate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency text NOT NULL,
  action text NOT NULL CHECK (action IN ('override', 'reset', 'in_use', 'not_in_use')),
  old_rate numeric,
  new_rate numeric,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_rate_events_tenant_created_idx
  ON public.exchange_rate_events (tenant_id, created_at DESC);

ALTER TABLE public.exchange_rate_events ENABLE ROW LEVEL SECURITY;

-- Read by the company; written by the settings API in the admin's own
-- session (the API refuses non-admins). Never updated or deleted: a log.
DROP POLICY IF EXISTS exchange_rate_events_tenant_read ON public.exchange_rate_events;
CREATE POLICY exchange_rate_events_tenant_read ON public.exchange_rate_events
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS exchange_rate_events_tenant_insert ON public.exchange_rate_events;
CREATE POLICY exchange_rate_events_tenant_insert ON public.exchange_rate_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND public.member_can_write(tenant_id));
DROP POLICY IF EXISTS exchange_rate_events_service_role ON public.exchange_rate_events;
CREATE POLICY exchange_rate_events_service_role ON public.exchange_rate_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
