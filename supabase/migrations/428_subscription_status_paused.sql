-- ============================================
-- 428: a paused subscription is a status the row can hold
-- ============================================
-- Stripe can pause a subscription (e.g. a trial that ends with no payment
-- method when set to pause). 030's CHECK did not list 'paused', so the
-- webhook's upsert failed and the row stayed 'trialing'/'active' for good.

BEGIN;

DO $$
DECLARE
  c RECORD;
BEGIN
  -- The CHECK was created inline (unnamed); find it by what it checks.
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tenant_subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%trialing%'
  LOOP
    EXECUTE format('ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'));

COMMIT;
