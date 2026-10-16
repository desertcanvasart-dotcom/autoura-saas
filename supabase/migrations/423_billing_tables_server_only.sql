-- ============================================================================
-- 423 — Subscriptions, usage counters and the Stripe customer: server-only
-- ============================================================================
--
-- Pre-launch review (2026-10-15). Three writes signed-in users could make
-- straight through PostgREST with their own session:
--
--   tenant_subscriptions  policy "Owners can manage subscription" (030) is
--                         FOR ALL, plus GRANT ALL TO authenticated. An owner
--                         could set status='active' and the top plan_id and
--                         get every paid limit for free; or set
--                         stripe_customer_id to another business's cus_ id,
--                         and /api/billing/create-portal-session opened THAT
--                         customer's Stripe billing portal.
--   tenant_usage          policies "System can update/insert usage" (030)
--                         let any member reset the counters that enforce
--                         plan limits.
--   tenants.stripe_customer_id
--                         the tenants UPDATE policy lets owners/admins change
--                         every column of their row (see 412, 420).
--
-- All three are written only by the server: the Stripe webhook, checkout
-- (after its owner check) and the super-admin console use the service role;
-- usage goes through the SECURITY DEFINER increment_usage(). Signed-in users
-- keep READ access (the billing pages show plan and usage). Idempotent.
-- ============================================================================

BEGIN;

-- Subscriptions: read your company's; never write.
DROP POLICY IF EXISTS "Owners can manage subscription" ON public.tenant_subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_subscriptions FROM authenticated, anon;

-- Usage counters: read your company's; never write.
DROP POLICY IF EXISTS "System can update usage" ON public.tenant_usage;
DROP POLICY IF EXISTS "System can insert usage" ON public.tenant_usage;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_usage FROM authenticated, anon;

-- The company's Stripe customer: set by the server only.
CREATE OR REPLACE FUNCTION guard_tenant_stripe_customer()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.stripe_customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'A company''s billing account is set by Autoura'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
      RAISE EXCEPTION 'A company''s billing account is set by Autoura'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_tenant_stripe_customer ON public.tenants;
CREATE TRIGGER trg_guard_tenant_stripe_customer
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_stripe_customer();

COMMIT;
