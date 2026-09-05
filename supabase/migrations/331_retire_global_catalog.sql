-- Migration 331: Retire the global rate catalog
--
-- Seven rate tables carried migration-seeded GLOBAL rows (tenant_id NULL)
-- every tenant read merged with their own, gated by
-- tenant_features.use_global_catalog (migrations 259/260). In practice the
-- shared rows were pure confusion: rates nobody in the company entered,
-- wearing nobody's contract, showing up in a fresh tenant's rate pages
-- (reported 2026-09-05 — "I'm doubting that it's leaking from other
-- tenants"; it wasn't, but a design you have to defend that way is wrong).
--
-- Each company enters or CSV-imports its own rates; a missing rate is a
-- named hole, never a platform default. Probed before deletion: zero
-- foreign keys reference these tables, zero itinerary/template days
-- reference the global entrance-fee ids, and attraction_aliases is
-- text-only vocabulary (alias → canonical name), which stays.
--
-- Idempotent: re-running deletes nothing, recreates the same policies.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    -- 1. The shared rows go.
    EXECUTE format('DELETE FROM %I WHERE tenant_id IS NULL', t);

    -- 2. Reads become plain tenant isolation (writes already were, mig 259).
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_read', t);
    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR SELECT TO authenticated
        USING (tenant_id = get_user_tenant_id())
    $p$, t || '_tenant_read', t);
    RAISE NOTICE 'catalog retired on %', t;
  END LOOP;
END $$;

-- 3. The gate function and the flag column die with the concept.
DROP FUNCTION IF EXISTS get_use_global_catalog();
ALTER TABLE tenant_features DROP COLUMN IF EXISTS use_global_catalog;

-- Post-check: no NULL-tenant rows survive anywhere in the seven tables.
DO $$
DECLARE
  t text;
  n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', t) INTO n;
    IF n > 0 THEN RAISE EXCEPTION '% still has % global rows', t, n; END IF;
  END LOOP;
END $$;
