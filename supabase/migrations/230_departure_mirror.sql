-- =====================================================================
-- Migration 230: Departure mirror (Sawa -> Autoura)
-- =====================================================================
-- The Sawa seat-pooling platform (separate repo/database) is the
-- authority on its departures and pledges. Autoura's "Sawa Tours"
-- brand-tenant receives a live MIRROR via signed webhook
-- (/api/webhooks/departures) so the capacity calendar, staff views and
-- the WhatsApp AI answer from local data.
--
-- Mirrored rows are ordinary tour_departures rows tagged with their
-- origin; (tenant_id, external_source, external_id) is the idempotency
-- key for upserts.
-- =====================================================================

ALTER TABLE tour_departures
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_departures_external
  ON tour_departures (tenant_id, external_source, external_id)
  WHERE external_source IS NOT NULL;

COMMENT ON COLUMN tour_departures.external_source IS
  'Origin system for mirrored departures (e.g. ''sawa''). NULL = native Autoura departure.';
