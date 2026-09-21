-- ============================================
-- 374: adopt what production has and this repo's migrations never built
-- ============================================
-- Migrations 371–373 turned up columns on production that NO migration here
-- creates. A search of the migration text found five. That search was too
-- weak: the honest test is to BUILD a database from every migration in this
-- folder and compare it with production, column by column and index by index.
-- Done on 2026-09-21, that comparison found:
--
--   - 23 columns production has and a fresh build does not;
--   - 28 columns both have, with a different NOT NULL or DEFAULT;
--   - 1 column a fresh build has and production does not;
--   - 8 indexes production has and a fresh build does not;
--   - 4 indexes that are the same index under two names;
--   - 14 indexes production has TWICE, under two names;
--   - 3 indexes a fresh build makes twice.
--
-- These were added by hand, in the SQL editor, over the life of the project.
-- The app's types are generated from PRODUCTION, so the code already relies on
-- them: a database built from this folder alone is one the app cannot run on.
--
-- THE RULE OF THIS FILE: every statement is a no-op on production. It changes
-- nothing there — not a column, not a default, not an index. It only brings a
-- database built from this repo to where production already is. (One rule, so
-- it can be applied without a second thought. Things that WOULD change
-- production are listed at the bottom, and are not done.)
--
-- Idempotent. No ordering constraint with the code.

-- ------------------------------------------------------------
-- 1. Columns production has (21 of the 23 — see "NOT adopted")
-- ------------------------------------------------------------
-- Types and defaults are production's, exactly.

ALTER TABLE IF EXISTS public.email_conversations
  ADD COLUMN IF NOT EXISTS emails_synced INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE IF EXISTS public.b2c_quotes ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.b2b_quotes ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.tour_days
  ADD COLUMN IF NOT EXISTS is_arrival BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_departure BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE IF EXISTS public.tour_variations ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE IF EXISTS public.content_variations
  ADD COLUMN IF NOT EXISTS day_by_day JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_suppliers TEXT[] DEFAULT '{}'::text[];

-- The three legacy B2B tables the July audit flagged as having no tenant_id.
-- Production got one by hand; nullable there, so nullable here.
ALTER TABLE IF EXISTS public.tour_quotes
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.b2b_partner_pricing
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.b2b_transport_packages
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.transportation_rates
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.content_library
  ADD COLUMN IF NOT EXISTS is_cruise BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS route VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tour_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- ------------------------------------------------------------
-- 2. Columns both have, brought to production's NOT NULL / DEFAULT
-- ------------------------------------------------------------

-- The one that matters. A fresh build gives every hotel price column
-- DEFAULT 0, so a rate saved without a price is a hotel that costs NOTHING —
-- and the engine, which refuses to guess, would price it as stated. Production
-- has no default: no price is NULL, and NULL is a hole. (Same doctrine as
-- 373's neighbours: never fabricate a rate.)
ALTER TABLE IF EXISTS public.accommodation_rates
  ALTER COLUMN ppd_eur DROP DEFAULT,
  ALTER COLUMN ppd_non_eur DROP DEFAULT,
  ALTER COLUMN single_supplement_eur DROP DEFAULT,
  ALTER COLUMN single_supplement_non_eur DROP DEFAULT,
  ALTER COLUMN triple_reduction_eur DROP DEFAULT,
  ALTER COLUMN triple_reduction_non_eur DROP DEFAULT,
  ALTER COLUMN high_season_ppd_eur DROP DEFAULT,
  ALTER COLUMN high_season_ppd_non_eur DROP DEFAULT,
  ALTER COLUMN high_season_single_supplement_eur DROP DEFAULT,
  ALTER COLUMN high_season_single_supplement_non_eur DROP DEFAULT,
  ALTER COLUMN high_season_triple_reduction_eur DROP DEFAULT,
  ALTER COLUMN high_season_triple_reduction_non_eur DROP DEFAULT,
  ALTER COLUMN peak_season_ppd_eur DROP DEFAULT,
  ALTER COLUMN peak_season_ppd_non_eur DROP DEFAULT,
  ALTER COLUMN peak_season_single_supplement_eur DROP DEFAULT,
  ALTER COLUMN peak_season_single_supplement_non_eur DROP DEFAULT,
  ALTER COLUMN peak_season_triple_reduction_eur DROP DEFAULT,
  ALTER COLUMN peak_season_triple_reduction_non_eur DROP DEFAULT;

-- Same again for a commission: no amount is not an amount of 0. Production
-- also REQUIRES what a commission cannot be without.
ALTER TABLE IF EXISTS public.commissions
  ALTER COLUMN commission_rate DROP DEFAULT,
  ALTER COLUMN commission_amount DROP DEFAULT,
  ALTER COLUMN commission_type SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN commission_amount SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN transaction_date SET NOT NULL;

-- Here production is the LOOSER side, and the code runs against production:
-- a fresh build that refuses what production accepts is a fresh build that
-- fails where production works. (Whether production should be tightened is a
-- separate question; this file changes nothing there.)
ALTER TABLE IF EXISTS public.itinerary_services
  ALTER COLUMN itinerary_id DROP NOT NULL,
  ALTER COLUMN service_type DROP NOT NULL;
ALTER TABLE IF EXISTS public.content_library ALTER COLUMN slug DROP NOT NULL;

-- ------------------------------------------------------------
-- 3. The column only a fresh build has
-- ------------------------------------------------------------
-- Migration 202 creates it; production's table was made by hand without it.
-- No code reads or writes it and the generated types do not have it.
ALTER TABLE IF EXISTS public.email_conversations DROP COLUMN IF EXISTS last_sync_at;

-- ------------------------------------------------------------
-- 4. Indexes
-- ------------------------------------------------------------
-- 4a. The same index under two names: production's name wins. Renamed only
--     when the repo's name exists and production's does not — so on
--     production, where it is the other way round, nothing happens.
DO $$
DECLARE
  pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['idx_commissions_tenant_id',        'idx_commissions_tenant'],
    ['idx_commissions_itinerary_id',     'idx_commissions_itinerary'],
    ['idx_commissions_supplier_id',      'idx_commissions_supplier'],
    ['idx_commissions_client_id',        'idx_commissions_client']
  ] LOOP
    IF to_regclass('public.' || pair[1]) IS NOT NULL AND to_regclass('public.' || pair[2]) IS NULL THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;

-- 4b. Made twice by a fresh build: 030_admin_billing names them
--     idx_billing_invoices_*, 030_admin_billing_fixed names the same three
--     idx_invoices_*. Production has the first set only. Dropped only if the
--     index really is on billing_invoices AND its twin is there.
DO $$
DECLARE
  pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['idx_invoices_subscription', 'idx_billing_invoices_subscription'],
    ['idx_invoices_stripe',       'idx_billing_invoices_stripe'],
    ['idx_invoices_date',         'idx_billing_invoices_date']
  ] LOOP
    IF to_regclass('public.' || pair[2]) IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = pair[1] AND tablename = 'billing_invoices'
    ) THEN
      EXECUTE format('DROP INDEX public.%I', pair[1]);
    END IF;
  END LOOP;
END $$;

-- 4c. Production has them, a fresh build does not.
DO $$
BEGIN
  IF to_regclass('public.commissions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_commissions_type ON public.commissions (commission_type);
  END IF;
  IF to_regclass('public.itinerary_days') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_itinerary_days_cruise_day
      ON public.itinerary_days (itinerary_id, is_cruise_day) WHERE (is_cruise_day = true);
  END IF;
  IF to_regclass('public.tour_quotes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tour_quotes_tenant ON public.tour_quotes (tenant_id);
  END IF;
  IF to_regclass('public.b2b_partner_pricing') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_b2b_partner_pricing_tenant ON public.b2b_partner_pricing (tenant_id);
  END IF;
  IF to_regclass('public.b2b_transport_packages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_b2b_transport_packages_tenant ON public.b2b_transport_packages (tenant_id);
  END IF;
  IF to_regclass('public.content_library') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_content_library_is_cruise ON public.content_library (is_cruise);
    CREATE INDEX IF NOT EXISTS idx_content_library_route ON public.content_library (route);
    CREATE INDEX IF NOT EXISTS idx_content_library_tour_type ON public.content_library (tour_type);
  END IF;
END $$;

-- ------------------------------------------------------------
-- NOT adopted — production is the side that is wrong
-- ------------------------------------------------------------
--   * content_library.content_type, itineraries.cabin_allocation — strays, like
--     373's column: no migration, no code. Adopting them would give a mistake
--     a history. Their drop is its own decision.
--   * invoices_invoice_number_key, expenses_expense_number_key,
--     supplier_invoices_internal_reference_key — UNIQUE across ALL agencies.
--     Numbers are counted per agency, so the second agency to issue its first
--     invoice collides with the first one's. The per-agency unique indexes
--     (tenant_id, number) are already in place beside them; the global ones
--     are the defect migration 360 fixed for tour codes. Dropping them changes
--     production, so it is not for this file.
--
-- NOT done — would change production
--   * fourteen indexes production has twice: migration 100 names them
--     idx_bookings_*_v2, idx_passengers_*_v2 and idx_booking_payments_*_v2, and
--     production ALSO has each one without the suffix, made by hand before
--     that. A fresh build has the _v2 set only, which is the right number of
--     them. The spare set on production costs a little on every booking
--     write and nothing else; dropping it is a production change.
--   * five indexes a fresh build has and production lacks: idx_usage_current,
--     idx_content_library_created_by, idx_writing_rules_category,
--     idx_itineraries_cost_mode, idx_itinerary_services_code.

NOTIFY pgrst, 'reload schema';
