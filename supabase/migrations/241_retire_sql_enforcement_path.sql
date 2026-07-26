-- ============================================================================
-- 241 — Retire the SQL enforcement path
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
--
-- `check_usage_limit` was the original gate. By the time of this migration it
-- was unreachable: it was called only by `checkLimit()` in
-- lib/billing-middleware.ts, which was imported once and invoked zero times.
-- Live enforcement is entirely in lib/usage-limits.ts + lib/usage-enforcement.ts.
--
-- Why it is not worth keeping:
--
--   * It could express only two of the five limits in lib/pricing-config.ts.
--     itineraries/year, B2B partners and brands have no columns at all.
--   * `max_quotes_per_month` was NULL on every plan, so the one quota it was
--     named for enforced nothing.
--   * It hard-blocked at 100% with no grace band — wrong for a seasonal
--     operator, where blocking mid-season is a churn event.
--   * It read usage from whichever `tenant_usage` row had not yet expired,
--     which is a different window from the computed one the gates use, so the
--     two could disagree about the same tenant.
--
-- The limit columns existed only because a SQL function cannot read a
-- TypeScript file. With the function gone, they are a second copy of a number
-- that is already defined in pricing-config.ts — exactly the duplication
-- migration 240 removed elsewhere.
--
-- `increment_usage` is NOT touched. It is live: lib/usage-enforcement.ts calls
-- it with the computed window on every AI generation and itinerary create.
--
-- No CASCADE: if something still depends on these, fail loudly.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- The function — dropped by OID, not by a written-out signature.
--
-- Spelling the arguments would be a trap: 235 declares `p_metric VARCHAR(50)`,
-- so `DROP FUNCTION check_usage_limit(UUID, TEXT)` does NOT match, and with
-- IF EXISTS it fails silently — the migration reports success while the
-- function is still there. Iterating pg_proc also catches any older overload
-- that survived a CREATE OR REPLACE with a different argument list.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  fn RECORD;
  dropped integer := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'check_usage_limit'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION %s', fn.sig);
    dropped := dropped + 1;
    RAISE NOTICE 'dropped %', fn.sig;
  END LOOP;
  RAISE NOTICE 'check_usage_limit overloads dropped: %', dropped;
END $$;

-- --------------------------------------------------------------------------
-- The columns it read. `features` and the stripe/identity columns stay —
-- lib/plans-sync.ts still writes those, and hasFeature() reads `features`.
-- --------------------------------------------------------------------------
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_quotes_per_month;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_team_members;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_whatsapp_messages;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_gmail_accounts;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_storage_mb;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_itinerary_runs_per_month;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS max_pricing_runs_per_month;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS agent_memory_days;

COMMENT ON TABLE subscription_plans IS
  'Plan catalogue: identity, price and capability flags. Generated from '
  'lib/pricing-config.ts by scripts/sync-plans.mjs on every deploy — do not '
  'edit rows by hand, they are overwritten on next boot. LIMITS ARE NOT HERE: '
  'they live only in pricing-config.ts and are read by lib/usage-limits.ts, so '
  'there is no second number that can disagree.';

COMMIT;

-- ============================================================================
-- Verification (run after applying):
--
--   SELECT proname FROM pg_proc WHERE proname = 'check_usage_limit';
--   -- expect 0 rows
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'subscription_plans' AND column_name LIKE 'max\_%';
--   -- expect 0 rows
--
--   SELECT proname FROM pg_proc WHERE proname = 'increment_usage';
--   -- expect 1 row — this one must SURVIVE
-- ============================================================================
