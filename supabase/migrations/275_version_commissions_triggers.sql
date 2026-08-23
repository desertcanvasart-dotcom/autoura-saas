-- ============================================================================
-- 275 — bring the commissions triggers into version control
-- ============================================================================
--
-- Found by check 14 (scripts/sql-checks/check-14-diff.sh) on 2026-08-23. Two
-- triggers on `commissions`, and the function one of them calls, exist in the
-- production database and in no file anywhere:
--
--   auto_populate_commissions_tenant_id  BEFORE INSERT ... WHEN (tenant_id IS NULL)
--   update_commissions_updated_at        BEFORE UPDATE
--   auto_populate_commission_tenant()    the function behind the first
--
-- Migration 153 creates the table — with `tenant_id UUID NOT NULL` and NO
-- column default — and declares no trigger at all.
--
-- ── Why this is not cosmetic ────────────────────────────────────────────────
-- Because tenant_id is NOT NULL with no default, that trigger is the only
-- thing letting a row in when the caller does not set tenant_id explicitly.
-- Rebuild this schema from the migrations — a fresh environment, a staging
-- reset, a new region — and you get a commissions table where those inserts
-- fail. The repository cannot currently reproduce its own database.
--
-- This is the same class as 220 (repaired in 274), pointing the other way:
-- 220 was declared and never ran; this ran and was never declared.
--
-- ── Faithfulness ────────────────────────────────────────────────────────────
-- The function is reproduced EXACTLY as it exists in production, deliberately.
-- Migration 245 established a different house pattern for this job
-- (`set_tenant_id_<table>` calling the generic `auto_set_tenant_id()`), and
-- this function is not that: it prefers the tenant of the linked itinerary and
-- only falls back to the caller's tenant. For a commission that is arguably
-- the better rule, and either way, versioning existing behaviour and changing
-- it are two separate changes. This migration only does the first — running it
-- against production must be a no-op.
--
-- Note it is intentionally NOT security definer: the itineraries lookup runs
-- as the caller, so RLS filters it and a foreign itinerary_id cannot pull
-- another tenant's id through. Do not "fix" that by adding SECURITY DEFINER.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION auto_populate_commission_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    -- Try to get tenant from itinerary
    IF NEW.itinerary_id IS NOT NULL THEN
      NEW.tenant_id := (
        SELECT tenant_id
        FROM itineraries
        WHERE id = NEW.itinerary_id
      );
    END IF;

    -- If still null, use user's tenant
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := get_user_tenant_id();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_populate_commissions_tenant_id ON commissions;
CREATE TRIGGER auto_populate_commissions_tenant_id
  BEFORE INSERT ON commissions
  FOR EACH ROW
  WHEN (NEW.tenant_id IS NULL)
  EXECUTE FUNCTION auto_populate_commission_tenant();

DROP TRIGGER IF EXISTS update_commissions_updated_at ON commissions;
CREATE TRIGGER update_commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------------
-- Post-check. 220 shipped without one and silently never ran for weeks;
-- every migration in this repair series asserts its own outcome.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  probe_id  UUID := gen_random_uuid();
  an_itin   UUID;
  its_tenant UUID;
  got       UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_populate_commission_tenant') THEN
    RAISE EXCEPTION 'auto_populate_commission_tenant() was not created';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'commissions' AND NOT t.tgisinternal
        AND t.tgname IN ('auto_populate_commissions_tenant_id','update_commissions_updated_at')) <> 2
  THEN
    RAISE EXCEPTION 'expected both commissions triggers to exist';
  END IF;

  -- Behavioural proof: a row inserted with NO tenant_id must come back carrying
  -- the linked itinerary's tenant. Rolled back either way.
  SELECT id, tenant_id INTO an_itin, its_tenant FROM itineraries LIMIT 1;
  IF an_itin IS NULL THEN
    RAISE NOTICE 'no itineraries row — skipping behavioural probe (structure asserted above)';
  ELSE
    -- commission_type / category / commission_amount / transaction_date are
    -- NOT NULL with no default (and commission_type carries a CHECK constraint);
    -- they are filled only to satisfy the table, and
    -- tenant_id is deliberately left out — that omission IS the test.
    INSERT INTO commissions (id, itinerary_id, commission_type, category,
                             commission_amount, transaction_date)
    VALUES (probe_id, an_itin, 'receivable', 'probe', 0, CURRENT_DATE);
    SELECT tenant_id INTO got FROM commissions WHERE id = probe_id;
    DELETE FROM commissions WHERE id = probe_id;

    IF got IS DISTINCT FROM its_tenant THEN
      RAISE EXCEPTION 'tenant backfill did not fire: expected %, got %', its_tenant, got;
    END IF;
    RAISE NOTICE 'behavioural probe passed: NULL tenant_id backfilled to % from itinerary', got;
  END IF;
END $$;

COMMIT;
