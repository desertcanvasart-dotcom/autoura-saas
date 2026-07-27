-- ============================================================================
-- 246 — RLS on subscription_plans
-- ============================================================================
--
-- The last table the 2026-07-26 anonymous sweep found readable without
-- authentication. It was deliberately excluded from migrations 242/243: no
-- migration had ever enabled RLS on it, and the contents were public pricing.
--
-- That reasoning no longer holds. scripts/setup-stripe-plans.mjs writes
-- stripe_product_id and stripe_price_id_monthly/yearly into this table. Those
-- are not secrets — a price id is visible to any Checkout session — but there
-- is no reason to serve an operator's full billing wiring to an anonymous
-- caller, and "it was public before" is a weak reason to leave it open.
--
-- Readers, all authenticated or service_role:
--   app/api/billing/create-checkout-session   requireAuth() -> authenticated
--   lib/billing-middleware hasFeature()       authenticated
--   scripts/sync-plans.mjs                    service_role, runs on deploy
--
-- The public /pricing page reads lib/pricing-config.ts, NOT this table, so
-- nothing anonymous needs it. That was verified before writing this migration —
-- enabling RLS on a table an anonymous page reads would blank the page.
-- ============================================================================

BEGIN;

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Signed-in users read the catalogue (billing screens, plan pickers).
-- Explicitly TO authenticated: migration 242 had to go back and narrow a dozen
-- policies that omitted the role clause and therefore applied to `public`,
-- which includes anon. Not repeating that.
DROP POLICY IF EXISTS subscription_plans_read ON subscription_plans;
CREATE POLICY subscription_plans_read ON subscription_plans
  FOR SELECT
  TO authenticated
  USING (true);

-- The deploy-time catalogue sync owns writes.
DROP POLICY IF EXISTS subscription_plans_service_role ON subscription_plans;
CREATE POLICY subscription_plans_service_role ON subscription_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Post-check: RLS on with no readable policy would break every billing screen.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_plans'
      AND 'authenticated' = ANY (roles)
      AND cmd IN ('SELECT', 'ALL')
  ) THEN
    RAISE EXCEPTION
      'No authenticated SELECT policy on subscription_plans — billing screens '
      'could not read the catalogue. Refusing to commit.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify: npm run verify:rls        -- subscription_plans must stop leaking
--         npm run plans:check       -- the deploy sync must still see 4 plans
-- Then load /settings/billing/plans signed in; the plan list must render.
-- ============================================================================
