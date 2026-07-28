-- ============================================================================
-- 260 — per-tenant catalog choice: use the shared global catalog, or not
-- ============================================================================
--
-- 259 made the migration-seeded global rows (tenant_id IS NULL) read-only to
-- tenants. This migration adds the onboarding choice on top:
--
--   tenant_features.use_global_catalog
--     true  (default) — tenant sees global catalog rows merged with their own
--     false           — tenant sees only their own rows ("start clean", or
--                       "imported the catalog as my own editable copy")
--
-- Enforcement for every RLS-client read happens HERE, in the SELECT policies:
-- the NULL branch now also requires the caller's flag. App code using the
-- service-role client (the pricing engine, trains/sleeping-trains routes)
-- applies the same rule explicitly via lib/catalog-scope.ts.
--
-- get_use_global_catalog() is SECURITY DEFINER (same pattern as
-- get_user_tenant_id from migration 002) so the policy's lookup of
-- tenant_features is not itself subject to tenant_features RLS — avoiding
-- the policy-recursion class of bug this schema has hit before.
-- COALESCE(true): a tenant with no tenant_features row behaves like today.

BEGIN;

ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS use_global_catalog BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION get_use_global_catalog()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (SELECT use_global_catalog
     FROM tenant_features
     WHERE tenant_id = get_user_tenant_id()
     LIMIT 1),
    true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    -- 259 created these as: USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id())
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_read', t);
    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR SELECT TO authenticated
        USING (
          tenant_id = get_user_tenant_id()
          OR (tenant_id IS NULL AND get_use_global_catalog())
        )
    $p$, t || '_tenant_read', t);
    RAISE NOTICE 'flag-aware read policy on %', t;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Post-check: the column, the function, and all seven rebuilt policies exist.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n integer;
BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_name = 'tenant_features' AND column_name = 'use_global_catalog';
  IF NOT FOUND THEN RAISE EXCEPTION 'use_global_catalog column missing'; END IF;

  PERFORM 1 FROM pg_proc WHERE proname = 'get_use_global_catalog';
  IF NOT FOUND THEN RAISE EXCEPTION 'get_use_global_catalog() missing'; END IF;

  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t
       AND policyname = t || '_tenant_read'
       AND qual LIKE '%get_use_global_catalog%';
    IF n <> 1 THEN
      RAISE EXCEPTION '% read policy is not flag-aware', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'post-check OK: catalog visibility is now per-tenant';
END $$;

COMMIT;
