-- ============================================
-- 446: service bookings — the supplier network's data model (Phase 1, step 1)
-- ============================================
-- docs/supplier-network/PLAN.md §4. Every service line of a confirmed booking
-- (a car, a guide, a lunch, an airport meet-and-assist, a hotel night) becomes
-- a SERVICE BOOKING that a named supplier accepts and covers — or that one of
-- the agency's own cars, guides or staff covers directly.
--
-- Evolved, not duplicated: booking_supplier_status (201) already is "who has
-- to confirm what on this booking", with its Suppliers tab and the expense a
-- confirmation records (396). It keeps its name (nothing that reads it
-- breaks); the app calls its rows service bookings. This migration only ADDS:
--
--   * per-line facts: the itinerary line it covers, time, pickup/drop-off,
--     guests, the currency of quoted_cost (quoted_cost IS the cost snapshot —
--     one column per fact), the reply deadline;
--   * who covers it: resource_kind own / supplier / network; for own cars,
--     guides and staff the itinerary_resources row (the one record of "who is
--     assigned"); for a supplier, the CAR they name (D1: we book the car, not
--     the driver — a vehicle row or just a plate), or the guide they name,
--     plus an optional driver-of-the-day note;
--   * the new states, ALONGSIDE the old ones:
--       pending → requested → accepted → assigned → done
--       side exits: declined, expired (no reply by the deadline), cancelled
--     The old words (contacted, confirmed, no_response) stay allowed so the
--     app that is live while this runs keeps working; the next step rewrites
--     the rows to the new words and narrows the list;
--   * service_booking_events — append-only: every status change, with who
--     (operator / supplier / system), how (app / link / whatsapp / email /
--     system), from → to, and a note. Never edited.
--
-- Additive and replay-safe.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Per-line facts and who covers the line
-- ---------------------------------------------------------------------------
ALTER TABLE public.booking_supplier_status
  ADD COLUMN IF NOT EXISTS itinerary_service_id UUID
    REFERENCES public.itinerary_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_time TIME,
  ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dropoff_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pax INTEGER,
  ADD COLUMN IF NOT EXISTS cost_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS reply_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resource_kind VARCHAR(20) NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS itinerary_resource_id UUID
    REFERENCES public.itinerary_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID
    REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_plate VARCHAR(30),
  ADD COLUMN IF NOT EXISTS assigned_guide_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assigned_guide_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS driver_note TEXT;

ALTER TABLE public.booking_supplier_status
  DROP CONSTRAINT IF EXISTS booking_supplier_status_resource_kind_check;
ALTER TABLE public.booking_supplier_status
  ADD CONSTRAINT booking_supplier_status_resource_kind_check
  CHECK (resource_kind IN ('own', 'supplier', 'network'));

ALTER TABLE public.booking_supplier_status
  DROP CONSTRAINT IF EXISTS booking_supplier_status_pax_check;
ALTER TABLE public.booking_supplier_status
  ADD CONSTRAINT booking_supplier_status_pax_check
  CHECK (pax IS NULL OR pax > 0);

-- The new states beside the old words (rewritten in the next step).
ALTER TABLE public.booking_supplier_status
  DROP CONSTRAINT IF EXISTS booking_supplier_status_status_check;
ALTER TABLE public.booking_supplier_status
  ADD CONSTRAINT booking_supplier_status_status_check
  CHECK (status IN (
    'pending', 'requested', 'accepted', 'assigned', 'done',
    'declined', 'expired', 'cancelled',
    'contacted', 'confirmed', 'no_response'
  ));

CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_service
  ON public.booking_supplier_status (itinerary_service_id)
  WHERE itinerary_service_id IS NOT NULL;

-- The deadline sweep: requests still waiting for an answer.
CREATE INDEX IF NOT EXISTS idx_booking_supplier_status_waiting
  ON public.booking_supplier_status (reply_deadline)
  WHERE status = 'requested';

COMMENT ON COLUMN public.booking_supplier_status.itinerary_service_id IS
  'The itinerary line this service booking covers (NULL = rows from before per-line service bookings, or added by hand).';
COMMENT ON COLUMN public.booking_supplier_status.cost_currency IS
  'Currency of quoted_cost / confirmed_cost (NULL = the booking''s currency, as before 446).';
COMMENT ON COLUMN public.booking_supplier_status.resource_kind IS
  'Who covers the line: own (the agency''s own car/guide/staff, via itinerary_resource_id), supplier (one of its own suppliers), network (Phase 3).';
COMMENT ON COLUMN public.booking_supplier_status.assigned_vehicle_plate IS
  'The car the supplier named (D1: the car is booked, not the driver) when it is not one of the agency''s vehicles rows.';
COMMENT ON COLUMN public.booking_supplier_status.driver_note IS
  'Optional driver of the day (name/phone) — a note on the booked car, never the booked thing.';

-- ---------------------------------------------------------------------------
-- 2. The event log — append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_booking_id UUID NOT NULL
    REFERENCES public.booking_supplier_status(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_kind VARCHAR(20) NOT NULL
    CHECK (actor_kind IN ('operator', 'supplier', 'system')),
  -- The signed-in person, when the actor is the operator's team.
  actor_user_id UUID,
  -- A readable name: the team member, the supplier, or the job.
  actor_label VARCHAR(255),
  channel VARCHAR(20) NOT NULL
    CHECK (channel IN ('app', 'link', 'whatsapp', 'email', 'system')),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  note TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_service_booking_events_line
  ON public.service_booking_events (service_booking_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_service_booking_events_booking
  ON public.service_booking_events (booking_id);
CREATE INDEX IF NOT EXISTS idx_service_booking_events_tenant
  ON public.service_booking_events (tenant_id);

COMMENT ON TABLE public.service_booking_events IS
  'Append-only history of each service booking (446): who did what, by which channel, from which status to which. Never updated.';

-- Never edited — by anyone, the service role included. Rows leave only with
-- their service booking (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.service_booking_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'service_booking_events is append-only: add a new event instead of changing one';
END
$$;

DROP TRIGGER IF EXISTS trg_service_booking_events_append_only ON public.service_booking_events;
CREATE TRIGGER trg_service_booking_events_append_only
  BEFORE UPDATE ON public.service_booking_events
  FOR EACH ROW EXECUTE FUNCTION public.service_booking_events_append_only();

ALTER TABLE public.service_booking_events ENABLE ROW LEVEL SECURITY;

-- The company reads and adds its own events; no UPDATE or DELETE policy, so a
-- signed-in user can do neither.
DROP POLICY IF EXISTS service_booking_events_select ON public.service_booking_events;
CREATE POLICY service_booking_events_select ON public.service_booking_events
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS service_booking_events_insert ON public.service_booking_events;
CREATE POLICY service_booking_events_insert ON public.service_booking_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Viewers read; they do not write (424's rule).
DROP POLICY IF EXISTS "Viewers cannot insert" ON public.service_booking_events;
CREATE POLICY "Viewers cannot insert" ON public.service_booking_events
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.member_can_write(tenant_id));

DROP POLICY IF EXISTS service_booking_events_service_role ON public.service_booking_events;
CREATE POLICY service_booking_events_service_role ON public.service_booking_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Existing rows start their history with one event
-- ---------------------------------------------------------------------------
INSERT INTO public.service_booking_events
  (tenant_id, booking_id, service_booking_id, occurred_at, actor_kind, actor_label, channel, to_status, note)
SELECT s.tenant_id, s.booking_id, s.id, COALESCE(s.created_at, NOW()), 'system', 'Migration 446', 'system',
       s.status, 'Recorded before the event log existed'
  FROM public.booking_supplier_status s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.service_booking_events e WHERE e.service_booking_id = s.id
 );

-- ---------------------------------------------------------------------------
-- 4. Post-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
    FROM unnest(ARRAY[
      'itinerary_service_id', 'service_time', 'pickup_location', 'dropoff_location', 'pax',
      'cost_currency', 'reply_deadline', 'requested_at', 'assigned_at', 'resource_kind',
      'itinerary_resource_id', 'assigned_vehicle_id', 'assigned_vehicle_plate',
      'assigned_guide_name', 'assigned_guide_phone', 'driver_note'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'booking_supplier_status' AND column_name = c
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '446: booking_supplier_status is missing %', missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_supplier_status s
     WHERE NOT EXISTS (SELECT 1 FROM public.service_booking_events e WHERE e.service_booking_id = s.id)
  ) THEN
    RAISE EXCEPTION '446: a service booking has no event';
  END IF;
END $$;

COMMIT;
