-- ============================================================================
-- 242 — Restore RLS on 13 tables where production drifted from the migrations
-- ============================================================================
--
-- Found by an anonymous-client sweep on 2026-07-26: 13 tables were readable
-- with the PUBLIC anon key (the one shipped in the browser bundle), and
-- `tenants` accepted anonymous INSERT, UPDATE and DELETE.
--
-- Every one of these tables has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in
-- an earlier migration, and ~90 other tables from the same migrations are
-- correctly protected. So this is DRIFT — RLS was switched off in production
-- after the fact, almost certainly by hand while debugging.
--
-- ── Why re-enabling alone is NOT enough ────────────────────────────────────
--
-- The reference tables carry policies shaped like
--
--     USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id())
--
-- with NO role clause, so they apply to `public` — which INCLUDES anon. For an
-- anonymous caller `get_user_tenant_id()` returns NULL, so `tenant_id IS NULL`
-- matches. Every row in all ten of those tables is global (tenant_id IS NULL),
-- verified against production. Re-enabling RLS on its own would therefore have
-- looked like a fix and changed nothing at all.
--
-- Part 1 narrows those policies to `authenticated`. It uses ALTER POLICY rather
-- than drop-and-recreate so the USING/WITH CHECK expressions are preserved
-- byte-for-byte: the only thing that changes is who the policy applies to.
--
-- ── What does NOT need narrowing ───────────────────────────────────────────
--
-- tenants / tenant_members / tenant_features scope on `= get_user_tenant_id()`
-- with no `IS NULL` escape. For anon that comparison is NULL, never true, so
-- enabling RLS is sufficient for those three.
--
-- ── Access patterns this preserves ─────────────────────────────────────────
--
--   * Rates are read AND written through authenticated user-session clients
--     (lib/supabase-server createAuthenticatedClient, and the @supabase/ssr
--     cookie client in app/api/exchange-rates). `TO authenticated` keeps both.
--   * Server routes using createAdminClient() are service_role and bypass RLS.
--   * Signup creates tenants through a SECURITY DEFINER trigger (migration
--     228, search_path pinned), which also bypasses RLS.
--   * No browser-side code reads these reference tables directly.
--
-- Authenticated users could already read and write the global rows while RLS
-- was off; this migration deliberately does not change that. It removes
-- ANONYMOUS access. Whether one tenant should be able to edit shared global
-- rates is a real question, but a separate one from this security fix.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Guard: the policies are worthless if their helper is missing.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_user_tenant_id' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'get_user_tenant_id() is missing — enabling RLS now would lock the '
      'application out of its own data. Restore the helper first.';
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- Part 1 — narrow `public` policies to `authenticated` on the global
-- reference tables, so anon stops matching the `tenant_id IS NULL` branch.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
  narrowed integer := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
        'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates',
        'fixed_daily_costs', 'departments'
      ])
      -- Policies with no TO clause report as {public}. service_role policies
      -- are already scoped and must be left alone.
      AND 'public' = ANY (roles)
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      pol.policyname, pol.schemaname, pol.tablename
    );
    narrowed := narrowed + 1;
    RAISE NOTICE 'narrowed %.% policy % to authenticated',
      pol.schemaname, pol.tablename, pol.policyname;
  END LOOP;
  RAISE NOTICE 'policies narrowed to authenticated: %', narrowed;
END $$;

-- --------------------------------------------------------------------------
-- Part 2 — exchange_rates has RLS enabled by an earlier migration but NO
-- policies at all. Enabling it without these would deny every read and break
-- app/api/exchange-rates, which uses a user-session client. That combination
-- is the most likely reason RLS was switched off in the first place.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS exchange_rates_authenticated ON exchange_rates;
CREATE POLICY exchange_rates_authenticated ON exchange_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS exchange_rates_service_role ON exchange_rates;
CREATE POLICY exchange_rates_service_role ON exchange_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Part 3 — turn RLS back on.
--
-- tenants/tenant_members/tenant_features: existing policies already exclude
-- anon. The rest are covered by Parts 1 and 2.
-- --------------------------------------------------------------------------
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features      ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrance_fees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipping_rates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_staff_rates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE airport_staff_rates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleeping_train_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_daily_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates       ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Post-check: every targeted table must now have RLS on AND at least one
-- policy. RLS with no policy denies everything, which is its own outage.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY[
      'tenants','tenant_members','tenant_features','departments',
      'entrance_fees','flight_rates','train_rates','tipping_rates',
      'hotel_staff_rates','airport_staff_rates','sleeping_train_rates',
      'fixed_daily_costs','exchange_rates'
    ])
    AND (
      c.relrowsecurity IS FALSE
      OR NOT EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname = 'public' AND p.tablename = c.relname)
    );

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'RLS enabled without policies (would deny everything) on: %', bad;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after applying — run scripts/verify-rls.mjs, which re-runs the
-- anonymous sweep that found this and asserts the app's own reads still work.
-- ============================================================================
