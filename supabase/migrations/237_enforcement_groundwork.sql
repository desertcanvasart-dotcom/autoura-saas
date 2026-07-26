-- =====================================================================
-- Migration 237: enforcement groundwork
-- =====================================================================
-- Two additive pieces the throughput limits need. Neither changes existing
-- behaviour on its own — nothing reads them until enforcement is wired.
--
--   1. tenant_usage.itineraries_created — the annual volume meter. The table
--      had counters for quotes, WhatsApp, PDFs and AI runs, but itineraries
--      per year is one of the six metered dimensions and had nowhere to go.
--
--   2. fail_open_events — a record of every time a limit check ALLOWED an
--      action because entitlement could not be determined.
--
-- Why (2) matters: `check_usage_limit` fails open by design (migration 235,
-- after it hard-blocked every tenant from AI generation with a 402). But
-- fail-open that nobody counts is indistinguishable from no enforcement at
-- all — which is exactly what the 402 bug turned out to be, invisible for
-- weeks. Recording each event makes "we are not enforcing" a number somebody
-- can look at rather than an assumption.
-- Date: 2026-07-26
-- =====================================================================

-- =====================================================================
-- 1. ANNUAL ITINERARY METER
-- =====================================================================

ALTER TABLE tenant_usage
  ADD COLUMN IF NOT EXISTS itineraries_created INTEGER DEFAULT 0;

COMMENT ON COLUMN tenant_usage.itineraries_created IS
  'Itineraries created in this usage window. Annual metric — the window is '
  'computed from the subscription anniversary (lib/usage-window.ts), not '
  'stored, because current_period_start only advances via the Stripe webhook '
  'and a tenant without a Stripe subscription would never roll over.';

-- =====================================================================
-- 2. FAIL-OPEN TELEMETRY
-- =====================================================================

CREATE TABLE IF NOT EXISTS fail_open_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable: the whole point is that we sometimes cannot resolve the tenant.
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  /* The metric whose check was bypassed, e.g. 'itinerary_runs', 'seats'. */
  metric VARCHAR(50) NOT NULL,

  /* Why we allowed it. Kept as free text rather than an enum so a new cause
     can be recorded without a migration — the point is to SEE causes, and a
     CHECK constraint that rejects an unforeseen one would lose the event. */
  reason VARCHAR(100) NOT NULL,

  /* Optional detail: error code, message fragment, plan slug. */
  detail TEXT,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fail_open_events IS
  'One row per limit check that ALLOWED an action because entitlement could '
  'not be determined. A non-trivial rate here means enforcement is not '
  'actually running — the failure mode that hid the 402 outage.';

-- Read patterns: recent events, and per-tenant history.
CREATE INDEX IF NOT EXISTS idx_fail_open_events_occurred
  ON fail_open_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fail_open_events_tenant
  ON fail_open_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fail_open_events_reason
  ON fail_open_events (reason, occurred_at DESC);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================
-- Operational telemetry, not tenant data. Service role only: a tenant has no
-- reason to read (or write) the record of checks that were bypassed.

ALTER TABLE fail_open_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fail_open_events_service_role ON fail_open_events;
CREATE POLICY fail_open_events_service_role ON fail_open_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  v_has_column BOOLEAN;
  v_has_table  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_usage' AND column_name = 'itineraries_created'
  ) INTO v_has_column;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'fail_open_events'
  ) INTO v_has_table;

  IF NOT v_has_column THEN
    RAISE EXCEPTION 'Migration 237 FAILED — tenant_usage.itineraries_created missing';
  END IF;
  IF NOT v_has_table THEN
    RAISE EXCEPTION 'Migration 237 FAILED — fail_open_events missing';
  END IF;

  RAISE NOTICE 'Migration 237 complete — annual itinerary meter + fail-open telemetry ready';
END $$;
