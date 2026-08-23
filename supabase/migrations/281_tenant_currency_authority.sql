-- ============================================================================
-- 281 — one tenant currency, not two that disagree
-- ============================================================================
--
-- Check 12 says there is no tenant currency setting. There are TWO, and they
-- do not agree.
--
--   tenants.currency          original schema (000/001/006)
--   tenants.default_currency  added by onboarding (037)
--
-- Only `default_currency` is ever READ — onboarding writes it and
-- lib/ai/user-preferences.ts resolves from it. `currency` is read by nothing.
--
-- But it is still WRITABLE: app/api/super-admin/tenants/[id]/route.ts and
-- app/api/admin/tenant/settings/route.ts both list 'currency' in their
-- allowed-field sets. So an administrator can set a tenant's currency, get a
-- success response, and change nothing at all. The more obvious of the two
-- names is the inert one.
--
-- Live proof on 2026-08-23: "capital travel" onboarded choosing USD —
-- default_currency = 'USD' — while currency still read 'EUR', the untouched
-- original default. Nothing surfaced the disagreement because nothing reads
-- the column that was wrong.
--
-- This backfills `currency` from the authoritative value and adds a trigger
-- that mirrors either column onto the other, so the two can never diverge
-- again regardless of which writer touches which. Mirroring rather than
-- dropping: `currency` is referenced by two live admin routes and by the
-- generated DB types, and removing a column at 23:00 to fix a value mismatch
-- is not a trade worth making.
-- ============================================================================

BEGIN;

-- The user's actual choice wins. `currency` held the original default.
UPDATE tenants
   SET currency = default_currency
 WHERE default_currency IS NOT NULL
   AND currency IS DISTINCT FROM default_currency;

-- …and where onboarding never ran, keep the legacy value as the default.
UPDATE tenants
   SET default_currency = currency
 WHERE default_currency IS NULL
   AND currency IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_tenant_currency()
RETURNS TRIGGER AS $$
BEGIN
  -- Whichever side changed, the other follows. `default_currency` is
  -- authoritative when both change in one statement.
  IF NEW.default_currency IS DISTINCT FROM OLD.default_currency THEN
    NEW.currency := NEW.default_currency;
  ELSIF NEW.currency IS DISTINCT FROM OLD.currency THEN
    NEW.default_currency := NEW.currency;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_tenant_currency ON tenants;
CREATE TRIGGER trg_sync_tenant_currency
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION sync_tenant_currency();

-- --------------------------------------------------------------------------
-- Post-check: no tenant may be left holding two different currencies.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad FROM tenants
   WHERE currency IS DISTINCT FROM default_currency;

  IF bad > 0 THEN
    RAISE EXCEPTION '% tenant(s) still hold two different currencies', bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'tenants' AND t.tgname = 'trg_sync_tenant_currency'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_sync_tenant_currency was not created';
  END IF;

  RAISE NOTICE 'tenant currencies reconciled and pinned together';
END $$;

COMMIT;
