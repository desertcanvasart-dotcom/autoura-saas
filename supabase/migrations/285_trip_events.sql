-- ============================================================================
-- 285 — trip_events: the execution layer's checkpoint log
-- ============================================================================
--
-- "Picked up at CAI 14:32 by Ahmed." An append-only record of what actually
-- happened on the ground, per trip — the primitive the execution-layer
-- assessment identifies as THE product: the customer's live status, the
-- office's board, and the end-of-trip audit are all views over this table.
--
-- Design decisions:
--
--   APPEND-ONLY FOR THE APP. authenticated gets SELECT and INSERT, no UPDATE
--   or DELETE policies. An event log is history; corrections are new events.
--   (service_role retains full access for operational repair.)
--
--   actor_name IS FREE TEXT, deliberately and temporarily. Staff identity is
--   phase 1 (five people-models must become one before an event can reference
--   "the staff member"); blocking the checkpoint log on that would invert the
--   dependency. When the unified staff table exists, an actor_staff_id column
--   gets added and this stays as the display fallback.
--
--   lat/lng ARE CAPTURED AT CHECKPOINT TIME ONLY — staff-side, tap-time,
--   never continuous tracking (battery, privacy, works-council).
--
--   note IS INTERNAL. It never crosses the customer boundary — the share
--   page's sanitizer (toClientTripEvents) allowlists it away.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  -- Which assignment this concerns (the driver, the guide). SET NULL rather
  -- than CASCADE: the event happened even if the assignment row is later
  -- removed — history must not vanish with a reassignment.
  itinerary_resource_id UUID REFERENCES itinerary_resources(id) ON DELETE SET NULL,
  event_kind VARCHAR(30) NOT NULL
    CHECK (event_kind IN (
      'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
      'checked_in', 'checked_out', 'completed', 'delayed', 'note'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  -- Internal detail ("flight 20min late, told the client"). NEVER shown to
  -- the customer; the share sanitizer must not copy it.
  note TEXT,
  -- Who logged it — free text until phase 1 unifies staff identity.
  actor_name VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_events_itinerary
  ON trip_events (itinerary_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_events_tenant
  ON trip_events (tenant_id, occurred_at DESC);

ALTER TABLE trip_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_events_tenant_read ON trip_events;
CREATE POLICY trip_events_tenant_read ON trip_events
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS trip_events_tenant_insert ON trip_events;
CREATE POLICY trip_events_tenant_insert ON trip_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Deliberately NO update/delete policies for authenticated: append-only.

DROP POLICY IF EXISTS trip_events_service_role ON trip_events;
CREATE POLICY trip_events_service_role ON trip_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Post-check: structure asserted, then a behavioural probe — an event must
-- write, read back, and refuse a bogus kind. Every migration in this series
-- proves its own outcome (the 220 lesson).
-- --------------------------------------------------------------------------
DO $$
DECLARE
  probe UUID := gen_random_uuid();
  a_tenant UUID; an_itin UUID; got TEXT; rejected BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trip_events'
                   AND policyname = 'trip_events_tenant_insert') THEN
    RAISE EXCEPTION 'insert policy missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trip_events'
               AND cmd IN ('UPDATE','DELETE') AND 'authenticated' = ANY(roles)) THEN
    RAISE EXCEPTION 'append-only violated: authenticated has UPDATE or DELETE';
  END IF;

  SELECT t.id, i.id INTO a_tenant, an_itin
    FROM tenants t JOIN itineraries i ON i.tenant_id = t.id LIMIT 1;
  IF an_itin IS NULL THEN
    RAISE NOTICE 'no itinerary to probe with — structure asserted only';
  ELSE
    INSERT INTO trip_events (id, tenant_id, itinerary_id, event_kind, actor_name, note)
    VALUES (probe, a_tenant, an_itin, 'arrived', 'zz-migration-probe', 'probe');
    SELECT event_kind INTO got FROM trip_events WHERE id = probe;
    DELETE FROM trip_events WHERE id = probe;
    IF got IS DISTINCT FROM 'arrived' THEN
      RAISE EXCEPTION 'probe event did not round-trip (got %)', got;
    END IF;

    BEGIN
      INSERT INTO trip_events (tenant_id, itinerary_id, event_kind)
      VALUES (a_tenant, an_itin, 'teleported');
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'a bogus event_kind was accepted';
    END IF;
    RAISE NOTICE 'probe: round-trip ok, bogus kind rejected, append-only enforced';
  END IF;
END $$;

COMMIT;
