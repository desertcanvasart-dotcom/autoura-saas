-- ============================================================================
-- 217_concierge_chain_wiring.sql
--
-- Threads the operational chain end-to-end and adds a direct money link:
--   concierge_briefs ──(brief_id)──▶ communication_threads ──(thread_id)──▶ itineraries
--   bookings ◀──(booking_id)── supplier_invoices
--
-- Today a concierge brief lands attached only to a client_id — never wired
-- onto the itinerary/booking spine. These columns let the promotion +
-- commit connectors (lib/concierge/*) thread brief → thread → itinerary, and
-- give supplier invoices a direct pointer to their booking (previously only
-- reachable indirectly via the shared itinerary_id).
--
-- Link direction mirrors the reference app (travel-ops-pro): the brief is the
-- root; the thread points back to it (brief_id) and the itinerary points back
-- to the thread (thread_id), so provenance is a clean transitive JOIN.
--
-- All columns are nullable and every statement is IF NOT EXISTS — idempotent
-- and backwards-compatible (existing rows are untouched).
-- ============================================================================

-- 1. concierge brief  ->  communication thread --------------------------------
ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES concierge_briefs(id) ON DELETE SET NULL;
ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS origin TEXT;

-- At most one thread per brief — enforces find-or-create idempotency for the
-- promote step at the DB layer (concurrent webhooks can't double-create).
CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_threads_brief_id_unique
  ON communication_threads(brief_id) WHERE brief_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_threads_origin
  ON communication_threads(origin);

-- 2. communication thread  ->  itinerary --------------------------------------
ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL;

-- At most one itinerary per thread — enforces commit idempotency at the DB layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_thread_id_unique
  ON itineraries(thread_id) WHERE thread_id IS NOT NULL;

-- 3. booking  ->  supplier invoice (direct money link; new vs the reference) --
-- booking_supplier_status and booking_payments already carry booking_id FKs;
-- supplier_invoices previously reached a booking only through itinerary_id.
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_booking_id
  ON supplier_invoices(booking_id) WHERE booking_id IS NOT NULL;
