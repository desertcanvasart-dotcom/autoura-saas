-- ============================================================================
-- 243 — Finish the RLS restore: exchange_rates
-- ============================================================================
--
-- Migration 242 fixed 12 of 13 tables. `exchange_rates` still leaked to the
-- anonymous key, caught by `npm run verify:rls`.
--
-- Two mistakes in 242, both corrected here.
--
-- 1. I concluded exchange_rates had NO policies and created a blanket pair.
--    That was wrong: migration 123 defines three, and my grep missed them
--    because the table name sits on the LINE AFTER `CREATE POLICY`:
--
--        CREATE POLICY "Users can view exchange rates"
--        ON exchange_rates FOR SELECT
--
--    Since I believed there were none, exchange_rates was left out of 242's
--    narrowing pass — so 123's `public` policies survived and kept serving
--    anonymous callers. 123's own comment says "viewable by all authenticated
--    users", but without a `TO authenticated` clause the policy applies to
--    `public`, and for anon `tenant_id IS NULL` matches. Right intent, leaky
--    implementation — the same shape as the other ten tables.
--
-- 2. The blanket policy I added, `exchange_rates_authenticated`, was
--    `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. That let any
--    authenticated user read and write EVERY tenant's rates — broader than
--    what 123 intended and broader than the app needs. It is dropped here.
--
-- 123's policies already model the real access correctly:
--
--    view   : tenant_id IS NULL (shared) OR the caller's own tenant
--    manage : tenant_id IS NOT NULL AND caller is owner/admin of that tenant
--
-- which matches app/api/exchange-rates exactly — it writes tenant overrides
-- only (`tenant_id: memberData.tenant_id`), never system-level rows. System
-- rates are written by the cron using the service role, which bypasses RLS.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Remove 242's over-permissive addition.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS exchange_rates_authenticated ON exchange_rates;

-- --------------------------------------------------------------------------
-- 2. Narrow every remaining `public` policy on exchange_rates.
--
-- The service-role policy is scoped TO service_role rather than authenticated:
-- its USING already tests auth.role() = 'service_role', so handing it to
-- authenticated would be meaningless, and leaving it on `public` keeps the
-- table looking anonymous-reachable to any audit.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
  narrowed integer := 0;
BEGIN
  FOR pol IN
    SELECT policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exchange_rates'
      AND 'public' = ANY (roles)
  LOOP
    IF pol.qual ILIKE '%service_role%' THEN
      EXECUTE format('ALTER POLICY %I ON public.exchange_rates TO service_role', pol.policyname);
      RAISE NOTICE 'narrowed % to service_role', pol.policyname;
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.exchange_rates TO authenticated', pol.policyname);
      RAISE NOTICE 'narrowed % to authenticated', pol.policyname;
    END IF;
    narrowed := narrowed + 1;
  END LOOP;
  RAISE NOTICE 'exchange_rates policies narrowed: %', narrowed;
END $$;

-- --------------------------------------------------------------------------
-- 3. Post-check — a SELECT path must survive for authenticated callers, or
--    the exchange-rates page goes blank. RLS on with nothing readable is its
--    own outage, which is exactly what 242 was written to avoid.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  readable integer;
BEGIN
  SELECT count(*) INTO readable
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'exchange_rates'
    AND 'authenticated' = ANY (roles)
    AND cmd IN ('SELECT', 'ALL');

  IF readable = 0 THEN
    RAISE EXCEPTION
      'No authenticated SELECT policy left on exchange_rates — the app could '
      'not read its own rates. Refusing to commit.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify: npm run verify:rls  — expect "nothing anonymous, nothing locked out"
-- Then load the exchange-rates page signed in; it must still list rates.
-- ============================================================================
