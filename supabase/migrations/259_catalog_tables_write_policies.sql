-- ============================================================================
-- 259 — global catalog rows become read-only to tenants (the 218 pattern,
--       extended to the seven rate-catalog tables it missed)
-- ============================================================================
--
-- Migrations 107–113 created these tables with a single policy:
--
--   CREATE POLICY <table>_tenant_isolation ON <table>
--     FOR ALL
--     USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());
--
-- FOR ALL means that USING clause also governs UPDATE and DELETE — and with
-- no separate WITH CHECK, INSERT too. So any authenticated tenant could
-- update or delete the migration-seeded GLOBAL rows (tenant_id IS NULL):
-- editing the Pyramids entrance fee changed it for every tenant on the
-- platform. Migration 218 diagnosed and fixed exactly this on
-- fixed_daily_costs and departments but did not touch these seven.
--
-- Fix (identical shape to 218): reads stay tenant-or-global, writes are
-- constrained to the caller's own tenant. Policies are TO authenticated —
-- migration 242 already narrowed these tables away from anon, and the new
-- policies must not reopen that. service_role policies (used by seeding
-- scripts) are untouched.
--
-- The app layer was fixed in the same PR: every rates update/delete route now
-- also filters .eq('tenant_id', ...) like trains/[id] already did. This
-- migration is the backstop so no future route can repeat the mistake.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);

    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR SELECT TO authenticated
        USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id())
    $p$, t || '_tenant_read', t);

    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR INSERT TO authenticated
        WITH CHECK (tenant_id = get_user_tenant_id())
    $p$, t || '_tenant_insert', t);

    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR UPDATE TO authenticated
        USING (tenant_id = get_user_tenant_id())
        WITH CHECK (tenant_id = get_user_tenant_id())
    $p$, t || '_tenant_update', t);

    EXECUTE format($p$
      CREATE POLICY %I ON %I
        FOR DELETE TO authenticated
        USING (tenant_id = get_user_tenant_id())
    $p$, t || '_tenant_delete', t);

    RAISE NOTICE 'split policies on %', t;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Post-check: fail loudly unless every table ended up in the intended state —
-- no non-service-role FOR ALL policy left, and all four split policies
-- present. A partial apply must not commit.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  leftover integer;
  created integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
    'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates'
  ]
  LOOP
    SELECT count(*) INTO leftover
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t
      AND cmd = 'ALL'
      AND NOT ('service_role' = ANY (roles));
    IF leftover > 0 THEN
      RAISE EXCEPTION '% still has % non-service-role FOR ALL policy(ies)', t, leftover;
    END IF;

    SELECT count(*) INTO created
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t
      AND policyname = ANY (ARRAY[
        t || '_tenant_read', t || '_tenant_insert',
        t || '_tenant_update', t || '_tenant_delete'
      ]);
    IF created <> 4 THEN
      RAISE EXCEPTION '% has %/4 split policies', t, created;
    END IF;
  END LOOP;
  RAISE NOTICE 'post-check OK: 7 catalog tables, global rows now read-only to tenants';
END $$;

COMMIT;
