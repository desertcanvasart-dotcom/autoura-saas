-- =====================================================================
-- Migration 236: a contact-sales plan has no list price
-- =====================================================================
-- `subscription_plans.price_monthly` was declared NOT NULL, from a time when
-- every plan had a published number. Enterprise (and, for now, Agency) are
-- "Talk to us" — priced by conversation, not by a page.
--
-- The deploy-time catalogue sync therefore failed on every boot:
--
--     sync-plans: skipped — upsert failed: null value in column
--     "price_monthly" of relation "subscription_plans" violates
--     not-null constraint
--
-- It is non-fatal by design, so the site booted normally and the catalogue
-- simply stayed stale — the exact silent-drift failure the sync exists to
-- prevent. Making the column nullable is what lets "no list price" be
-- expressible instead of being faked with a 0 (which would read as a free
-- tier) or a sentinel (which is how a real 1500 cap once became "unlimited").
--
-- price_yearly is already nullable. NULL now means, on both columns:
-- "no published price — contact sales", never "free".
-- Date: 2026-07-26
-- =====================================================================

ALTER TABLE subscription_plans
  ALTER COLUMN price_monthly DROP NOT NULL;

COMMENT ON COLUMN subscription_plans.price_monthly IS
  'Monthly list price. NULL = no published price (contact sales), never free. '
  'Derived from lib/pricing-config.ts via supabase/generated/plans.json.';

COMMENT ON COLUMN subscription_plans.price_yearly IS
  'Annual list price. NULL = no published price (contact sales), never free.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  v_notnull BOOLEAN;
BEGIN
  SELECT attnotnull INTO v_notnull
  FROM pg_attribute
  WHERE attrelid = 'subscription_plans'::regclass
    AND attname = 'price_monthly'
    AND NOT attisdropped;

  IF v_notnull THEN
    RAISE EXCEPTION 'Migration 236 FAILED — price_monthly is still NOT NULL, the catalogue sync will keep failing';
  END IF;

  RAISE NOTICE 'Migration 236 complete — price_monthly is nullable; contact-sales plans can now sync';
END $$;
