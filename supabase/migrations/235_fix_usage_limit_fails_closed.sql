-- =====================================================================
-- Migration 235: check_usage_limit must FAIL OPEN, not closed
-- =====================================================================
-- LIVE BUG. The function opened with:
--
--     SELECT ... FROM tenant_subscriptions ts JOIN subscription_plans sp ...
--     WHERE ts.tenant_id = p_tenant_id AND ts.status IN ('trialing','active')
--     IF NOT FOUND THEN RETURN FALSE;    -- <-- blocks
--
-- `tenant_subscriptions` is EMPTY (0 rows against 5 tenants), so every tenant
-- failed the check, and app/api/ai/generate-itinerary/route.ts hard-blocked
-- with HTTP 402 "Monthly itinerary generation limit reached".
--
-- AI itinerary generation was therefore unavailable to every tenant on the
-- platform. No error surfaced anywhere — it read as a quota decision.
--
-- A billing check must never be the reason a paying operator cannot work.
-- The rule is now: fail OPEN when we cannot determine entitlement, fail
-- CLOSED only on a genuine, measured over-limit.
--
--   no subscription row      -> ALLOW (pre-subscription / trial)
--   subscription, NULL limit -> ALLOW (unlimited, unchanged)
--   subscription, under cap  -> ALLOW (unchanged)
--   subscription, at/over    -> DENY  (unchanged — the only denial)
--
-- Scope: this migration ONLY changes the not-found branch. Seeding
-- tenant_subscriptions rows and the tier mapping are deliberately separate —
-- that migration needs sign-off, this outage fix does not.
-- Date: 2026-07-26
-- =====================================================================

CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit   INTEGER;
  v_current INTEGER;
  v_subscription RECORD;
BEGIN
  -- Get subscription + plan details
  SELECT
    ts.id,
    ts.status,
    sp.max_quotes_per_month,
    sp.max_whatsapp_messages,
    sp.max_team_members,
    sp.max_gmail_accounts,
    sp.max_itinerary_runs_per_month,
    sp.max_pricing_runs_per_month
  INTO v_subscription
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = p_tenant_id
    AND ts.status IN ('trialing', 'active')
  LIMIT 1;

  -- THE FIX. Previously `RETURN FALSE`, which blocked every tenant without a
  -- subscription row — i.e. all of them. Entitlement we cannot determine is
  -- not the same as entitlement exceeded.
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  -- Get limit based on metric
  CASE p_metric
    WHEN 'quotes' THEN
      v_limit := v_subscription.max_quotes_per_month;
    WHEN 'whatsapp_messages' THEN
      v_limit := v_subscription.max_whatsapp_messages;
    WHEN 'team_members' THEN
      v_limit := v_subscription.max_team_members;
    WHEN 'gmail_accounts' THEN
      v_limit := v_subscription.max_gmail_accounts;
    WHEN 'itinerary_runs' THEN
      v_limit := v_subscription.max_itinerary_runs_per_month;
    WHEN 'pricing_runs' THEN
      v_limit := v_subscription.max_pricing_runs_per_month;
    ELSE
      -- Unknown metric — allow by default
      RETURN TRUE;
  END CASE;

  -- NULL limit = unlimited
  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current usage for this billing period
  SELECT COALESCE(
    CASE p_metric
      WHEN 'itinerary_runs' THEN tu.itinerary_runs
      WHEN 'pricing_runs'   THEN tu.pricing_runs
      WHEN 'quotes'         THEN tu.quotes_created
      WHEN 'whatsapp_messages' THEN tu.whatsapp_messages_sent
      ELSE 0
    END, 0
  )
  INTO v_current
  FROM tenant_usage tu
  WHERE tu.tenant_id = p_tenant_id
    AND tu.period_end > NOW()
  ORDER BY tu.period_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_current := 0;
  END IF;

  RETURN v_current < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_usage_limit(UUID, VARCHAR) IS
  'Returns TRUE when the tenant may perform one more of p_metric. Fails OPEN: '
  'a tenant with no active subscription row is allowed, because undetermined '
  'entitlement is not exceeded entitlement. Only a measured over-limit denies.';

-- =====================================================================
-- VERIFICATION — a tenant with no subscription row must now be allowed
-- =====================================================================

DO $$
DECLARE
  v_allowed BOOLEAN;
  v_orphan  UUID;
BEGIN
  -- A tenant id that certainly has no tenant_subscriptions row.
  v_orphan := '00000000-0000-0000-0000-000000000000'::UUID;
  SELECT check_usage_limit(v_orphan, 'itinerary_runs') INTO v_allowed;

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'Migration 235 FAILED — check_usage_limit still denies a tenant with no subscription row';
  END IF;

  RAISE NOTICE 'Migration 235 complete — check_usage_limit now fails open (no-subscription => allowed)';
END $$;
