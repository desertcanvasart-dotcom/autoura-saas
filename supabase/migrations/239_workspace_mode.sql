-- =====================================================================
-- Migration 239: tenants.workspace_mode — one source, named for what it is
-- =====================================================================
-- STEP A of an additive-then-cutover rename. This migration ONLY adds and
-- backfills; nothing is dropped. A rename-in-place would break during the
-- deploy gap, when already-running code still queries the old names.
--
-- WHAT IT REPLACES
-- ----------------
-- Whether a tenant sees the B2C and B2B workspaces was stored twice:
--
--   tenants.business_type              'b2c_only' | 'b2b_only' | 'b2c_and_b2b'
--   tenant_features.b2c_enabled/_b2b   two booleans
--
-- Both are written independently (onboarding derives the booleans from the
-- enum; settings writes them separately), so they can drift with nothing to
-- reconcile them. This is the fifth duplicated source of truth found in this
-- area, after the plan catalogue, the usage window, the AI metric and the
-- fail-open path.
--
-- WHY THE NAME CHANGES
-- --------------------
-- `b2c_enabled` sitting on `tenant_features` — the table holding paid
-- capabilities like analytics_enabled — reads as an entitlement. It is not:
-- business model is free on every tier, and gating it left a DMC doing both
-- wholesale and direct with no tier that fit. Moving the setting to `tenants`,
-- beside timezone and locale, puts it with the other things a tenant simply
-- chooses, so a future engineer is not invited to re-gate it.
--
-- Values drop the `_only` suffix, which reads like a restriction someone was
-- sold rather than a preference they picked.
--
-- Date: 2026-07-26
-- =====================================================================

-- =====================================================================
-- 1. ADD THE COLUMN
-- =====================================================================
-- DEFAULT 'both': a tenant created by any path — signup, super-admin, a
-- seed script — sees the whole product until they choose otherwise. The
-- CHECK makes "neither workspace" unrepresentable; an empty app is not a
-- state anyone should be able to reach.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS workspace_mode VARCHAR(8) NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_workspace_mode_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_workspace_mode_check
      CHECK (workspace_mode IN ('b2c', 'b2b', 'both'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.workspace_mode IS
  'Which workspaces this tenant chooses to see: b2c | b2b | both. A free '
  'preference on every tier, NOT an entitlement. Hiding one hides navigation '
  'only — records stay reachable by URL, search and reports '
  '(see lib/workspace-visibility.ts).';

-- =====================================================================
-- 2. BACKFILL — take the UNION where the two old sources disagree
-- =====================================================================
-- Approved conflict rule: prefer the MORE PERMISSIVE reading. Hiding a
-- workspace someone was actively using is a visible, confusing regression;
-- showing one they had hidden is a tidy-up they can redo in one click.
--
-- Precedence per source, unioned:
--   business_type       'b2c_only' -> b2c,  'b2b_only' -> b2b, else both
--   tenant_features     b2c_enabled / b2b_enabled
-- A tenant with no tenant_features row contributes nothing and falls back to
-- business_type alone.

WITH resolved AS (
  SELECT
    t.id,
    -- Union of "shows B2C" across both sources.
    (COALESCE(t.business_type, 'b2c_and_b2b') IN ('b2c_only', 'b2c_and_b2b')
      OR COALESCE(f.b2c_enabled, FALSE)) AS shows_b2c,
    (COALESCE(t.business_type, 'b2c_and_b2b') IN ('b2b_only', 'b2c_and_b2b')
      OR COALESCE(f.b2b_enabled, FALSE)) AS shows_b2b
  FROM tenants t
  LEFT JOIN tenant_features f ON f.tenant_id = t.id
)
UPDATE tenants t
SET workspace_mode = CASE
  WHEN r.shows_b2c AND r.shows_b2b THEN 'both'
  WHEN r.shows_b2c                 THEN 'b2c'
  WHEN r.shows_b2b                 THEN 'b2b'
  -- Neither is unrepresentable and almost certainly a data error, so fall
  -- back to showing everything rather than locking someone out.
  ELSE 'both'
END
FROM resolved r
WHERE r.id = t.id;

-- =====================================================================
-- 3. REPORT ANY TENANT WHOSE SOURCES DISAGREED
-- =====================================================================
-- Not a failure — the union already resolved it — but the operator should
-- know which tenants had contradictory settings before this ran.

DO $$
DECLARE
  rec RECORD;
  v_conflicts INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      t.company_name,
      t.business_type,
      f.b2c_enabled,
      f.b2b_enabled,
      t.workspace_mode
    FROM tenants t
    LEFT JOIN tenant_features f ON f.tenant_id = t.id
    WHERE f.tenant_id IS NOT NULL
      AND (
        (COALESCE(t.business_type,'b2c_and_b2b') IN ('b2c_only','b2c_and_b2b')) IS DISTINCT FROM COALESCE(f.b2c_enabled, FALSE)
        OR
        (COALESCE(t.business_type,'b2c_and_b2b') IN ('b2b_only','b2c_and_b2b')) IS DISTINCT FROM COALESCE(f.b2b_enabled, FALSE)
      )
  LOOP
    v_conflicts := v_conflicts + 1;
    RAISE NOTICE 'CONFLICT: % had business_type=% but flags (b2c=%, b2b=%) — resolved to %',
      rec.company_name, rec.business_type, rec.b2c_enabled, rec.b2b_enabled, rec.workspace_mode;
  END LOOP;

  RAISE NOTICE 'Migration 239: % tenant(s) had disagreeing sources', v_conflicts;
END $$;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  v_null_or_bad INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM tenants;
  SELECT COUNT(*) INTO v_null_or_bad
  FROM tenants
  WHERE workspace_mode IS NULL OR workspace_mode NOT IN ('b2c','b2b','both');

  IF v_null_or_bad > 0 THEN
    RAISE EXCEPTION 'Migration 239 FAILED — % tenant(s) have an invalid workspace_mode', v_null_or_bad;
  END IF;

  RAISE NOTICE 'Migration 239 complete — workspace_mode set for % tenant(s). Old columns retained for cutover.', v_total;
END $$;
