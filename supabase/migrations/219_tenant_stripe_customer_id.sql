-- =====================================================
-- Migration 219: persist the Stripe customer id on tenants
-- =====================================================
-- getOrCreateStripeCustomer() created a Stripe customer but never stored the
-- id anywhere until a subscription completed. tenant_subscriptions can't hold
-- it early — plan_id / current_period_* are NOT NULL and only exist after
-- checkout. So every abandoned-then-retried checkout minted a NEW Stripe
-- customer for the same tenant (duplicate customers, split billing history).
--
-- Fix: a nullable, unique stripe_customer_id on tenants — a stable home that
-- exists from tenant creation, independent of subscription lifecycle. The
-- helper writes it on first create and reuses it thereafter.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE tenants ADD COLUMN stripe_customer_id VARCHAR(255);
  END IF;
END $$;

-- Backfill from any existing subscription so already-subscribed tenants don't
-- get a second customer created.
UPDATE tenants t
SET stripe_customer_id = s.stripe_customer_id
FROM tenant_subscriptions s
WHERE s.tenant_id = t.id
  AND t.stripe_customer_id IS NULL
  AND s.stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
