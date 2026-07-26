-- =====================================================================
-- Migration 238: increment_usage must accept the COMPUTED window
-- =====================================================================
-- Two problems, both of which would leave a meter reading zero forever while
-- everything looked wired.
--
-- 1. NO BRANCH FOR itineraries_created.
--    increment_usage maps a metric name to a column with a CASE ending in
--    `ELSE RETURN`. Migration 237 added the itineraries_created column, but
--    no branch writes to it — so increment_usage('itineraries') silently does
--    nothing. Exactly the shape of `pricing_runs`: a counter that exists and
--    is never written.
--
-- 2. IT KEYED ROWS ON THE FROZEN SUBSCRIPTION PERIOD.
--    The function read `current_period_start` off tenant_subscriptions and
--    used it as the tenant_usage row key. That column only ever advances via
--    the Stripe webhook, so for a tenant without a Stripe subscription it
--    never moves (see migration 235 and lib/usage-window.ts).
--
--    Meanwhile the application now READS usage keyed on a COMPUTED window
--    (lib/usage-window.ts). The moment a window rolls, writer and reader
--    disagree: increments keep landing on the old frozen row while the check
--    reads a new empty one, so usage would appear to reset to zero every
--    period and no limit would ever be reached.
--
--    The window is now passed IN. It stays computed in one place (TypeScript,
--    with the sticky month-end clamping already tested there) rather than
--    being reimplemented in PL/pgSQL where it would drift.
--
-- The increment itself stays in SQL deliberately: INSERT ... ON CONFLICT DO
-- UPDATE SET col = col + n is atomic, so two concurrent creates cannot lose
-- an increment the way a read-modify-write in application code would.
--
-- The old 3-argument signature is dropped and recreated with defaults, so
-- existing callers (billing-middleware trackUsage) keep working unchanged and
-- fall back to the subscription period as before.
-- Date: 2026-07-26
-- =====================================================================

DROP FUNCTION IF EXISTS increment_usage(UUID, VARCHAR, INTEGER);

CREATE OR REPLACE FUNCTION increment_usage(
  p_tenant_id UUID,
  p_metric VARCHAR(50),
  p_amount INTEGER DEFAULT 1,
  -- When supplied, these define the usage window. When NULL, fall back to the
  -- subscription period so pre-existing callers behave exactly as before.
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_subscription_id UUID;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_column_name TEXT;
BEGIN
  -- tenant_usage.subscription_id is NOT NULL, so a subscription is still
  -- required to record usage at all.
  SELECT id, current_period_start, current_period_end
  INTO v_subscription_id, v_period_start, v_period_end
  FROM tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status IN ('trialing', 'active')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Caller-supplied window wins.
  IF p_period_start IS NOT NULL THEN
    v_period_start := p_period_start;
  END IF;
  IF p_period_end IS NOT NULL THEN
    v_period_end := p_period_end;
  END IF;

  CASE p_metric
    WHEN 'quotes'            THEN v_column_name := 'quotes_created';
    WHEN 'whatsapp_messages' THEN v_column_name := 'whatsapp_messages_sent';
    WHEN 'gmail_emails'      THEN v_column_name := 'gmail_emails_fetched';
    WHEN 'pdfs'              THEN v_column_name := 'pdfs_generated';
    WHEN 'api_calls'         THEN v_column_name := 'api_calls';
    WHEN 'itinerary_runs'    THEN v_column_name := 'itinerary_runs';
    WHEN 'pricing_runs'      THEN v_column_name := 'pricing_runs';
    -- THE MISSING BRANCH (problem 1).
    WHEN 'itineraries'       THEN v_column_name := 'itineraries_created';
    ELSE RETURN;
  END CASE;

  EXECUTE format('
    INSERT INTO tenant_usage (tenant_id, subscription_id, period_start, period_end, %I)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET %I = tenant_usage.%I + $5, updated_at = NOW()
  ', v_column_name, v_column_name, v_column_name)
  USING p_tenant_id, v_subscription_id, v_period_start, v_period_end, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_usage(UUID, VARCHAR, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Atomically increments a usage counter. Pass p_period_start/p_period_end to '
  'key the row on the COMPUTED window (lib/usage-window.ts); omit them to fall '
  'back to the subscription period. Writer and reader must agree on the window '
  'or usage appears to reset every period.';

-- =====================================================================
-- VERIFICATION — the itineraries branch must actually write
-- =====================================================================

DO $$
DECLARE
  v_tenant UUID;
  v_before INTEGER;
  v_after INTEGER;
  v_start TIMESTAMPTZ := '2000-01-01T00:00:00Z';  -- a window no real usage uses
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM tenant_subscriptions
  WHERE status IN ('trialing','active')
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Migration 238 complete — no active subscription to smoke-test against';
    RETURN;
  END IF;

  SELECT COALESCE(itineraries_created, 0) INTO v_before
  FROM tenant_usage WHERE tenant_id = v_tenant AND period_start = v_start;

  PERFORM increment_usage(v_tenant, 'itineraries', 1, v_start, v_start + INTERVAL '1 year');

  SELECT COALESCE(itineraries_created, 0) INTO v_after
  FROM tenant_usage WHERE tenant_id = v_tenant AND period_start = v_start;

  IF COALESCE(v_after, 0) <> COALESCE(v_before, 0) + 1 THEN
    RAISE EXCEPTION 'Migration 238 FAILED — increment_usage(itineraries) did not write (% -> %)', v_before, v_after;
  END IF;

  -- Remove the probe row; it is not real usage.
  DELETE FROM tenant_usage WHERE tenant_id = v_tenant AND period_start = v_start;

  RAISE NOTICE 'Migration 238 complete — itineraries branch writes, computed window honoured';
END $$;
