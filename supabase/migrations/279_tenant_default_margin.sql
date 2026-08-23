-- ============================================================================
-- 279 — a company-level default margin
-- ============================================================================
--
-- Check 11: "a margin that lives only on the person, not the company".
--
-- Margin is stored per USER (user_preferences.default_margin_percent, DEFAULT
-- 25.00), per B2B PARTNER, and on each quote record — but nowhere for the
-- tenant. So two colleagues in the same agency quote the same trip at
-- different margins, and no one can set the house rate. Worse in a
-- multi-tenant app than the single-company case it was found in: the constant
-- 25 is identical for every tenant on the platform.
--
-- NULLABLE, and deliberately NO DEFAULT. A `DEFAULT 25` would hand every
-- tenant the same number and reproduce the problem one level up, and it would
-- make "the company has not chosen" indistinguishable from "the company chose
-- 25" — the exact conflation migration 278 had to undo for entrance fees.
--
--   NULL = no house rate set -> fall back to the platform constant
--   0    = a deliberate at-cost house rate
--   n    = the house rate
--
-- Resolution order is implemented once, in lib/pricing/resolve-margin.ts:
--   explicit (request or record) -> user preference -> tenant -> constant
-- ============================================================================

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_margin_percent NUMERIC(5,2);

COMMENT ON COLUMN tenants.default_margin_percent IS
  'House margin for this tenant. NULL = not set (fall back to the platform '
  'constant). 0 is a legitimate at-cost rate — never coerce with `|| 25`.';

-- --------------------------------------------------------------------------
-- Post-check: the column must exist AND must not have acquired a default.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  col RECORD;
BEGIN
  SELECT is_nullable, column_default INTO col
  FROM information_schema.columns
  WHERE table_name = 'tenants' AND column_name = 'default_margin_percent';

  IF col IS NULL THEN
    RAISE EXCEPTION 'tenants.default_margin_percent was not created';
  END IF;
  IF col.is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'tenants.default_margin_percent must be nullable — NULL means "not set"';
  END IF;
  IF col.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'tenants.default_margin_percent must have NO default — a default hands every tenant the same number';
  END IF;
END $$;

COMMIT;
