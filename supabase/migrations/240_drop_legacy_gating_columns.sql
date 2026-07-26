-- ============================================================================
-- 240 — Drop the legacy business-model and per-tenant limit columns
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
-- Running code must not query a column that no longer exists.
--
-- Two independent drops, both removing a second copy of a fact:
--
-- 1. Which workspaces a tenant sees was stored THREE times —
--    tenants.business_type, tenant_features.b2c_enabled, tenant_features.b2b_enabled
--    — written by different code paths with nothing reconciling them, so they
--    could and did disagree. Migration 239 made tenants.workspace_mode the
--    single source and backfilled it. These three go now.
--
-- 2. tenant_features.max_users / max_quotes_per_month / max_partners were a
--    per-tenant COPY of the plan's limits, written at tier-change time. A copy
--    made at write time goes stale the moment the plan catalogue changes, and
--    the enforced number could differ from the plan the tenant is actually on.
--    lib/usage-limits.ts resolves limits from subscription_plans directly.
--
--    NOTE: subscription_plans.max_quotes_per_month is a DIFFERENT column and is
--    NOT touched. It is the real limit, read by billing-middleware and
--    plans-sync. Only the tenant_features mirror is dropped.
--
-- No CASCADE anywhere: if something still depends on these columns this
-- migration must fail loudly rather than quietly take the dependant with it.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Guard: refuse to drop if the surviving column disagrees with what we are
-- about to delete. A silent drop here would lose a tenant's real setting.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  bad integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'business_type'
  ) THEN
    SELECT count(*) INTO bad
    FROM tenants
    WHERE workspace_mode IS DISTINCT FROM CASE business_type
      WHEN 'b2c_only' THEN 'b2c'
      WHEN 'b2b_only' THEN 'b2b'
      ELSE 'both'
    END;

    IF bad > 0 THEN
      RAISE EXCEPTION
        'Aborting: % tenant(s) have workspace_mode disagreeing with business_type. '
        'Reconcile them before dropping — otherwise the real setting is lost.', bad;
    END IF;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- Drop 1 — the workspace-model mirrors
-- --------------------------------------------------------------------------
ALTER TABLE tenants          DROP COLUMN IF EXISTS business_type;
ALTER TABLE tenant_features  DROP COLUMN IF EXISTS b2c_enabled;
ALTER TABLE tenant_features  DROP COLUMN IF EXISTS b2b_enabled;

-- --------------------------------------------------------------------------
-- Drop 2 — the per-tenant limit copies
-- --------------------------------------------------------------------------
ALTER TABLE tenant_features  DROP COLUMN IF EXISTS max_users;
ALTER TABLE tenant_features  DROP COLUMN IF EXISTS max_quotes_per_month;
ALTER TABLE tenant_features  DROP COLUMN IF EXISTS max_partners;

COMMENT ON COLUMN tenants.workspace_mode IS
  'Single source for which workspaces a tenant sees: b2c | b2b | both. '
  'A free preference on every tier — never an entitlement. Hiding one tidies '
  'navigation only; records stay reachable by link, search and reports.';

COMMIT;

-- ============================================================================
-- Verification (run after applying — all six must report ABSENT):
--
--   SELECT table_name, column_name
--   FROM information_schema.columns
--   WHERE (table_name = 'tenants' AND column_name = 'business_type')
--      OR (table_name = 'tenant_features'
--          AND column_name IN ('b2c_enabled','b2b_enabled',
--                              'max_users','max_quotes_per_month','max_partners'));
--   -- expect 0 rows
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'subscription_plans' AND column_name = 'max_quotes_per_month';
--   -- expect 1 row — this one must SURVIVE
-- ============================================================================
