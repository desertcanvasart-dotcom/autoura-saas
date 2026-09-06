-- ============================================================================
-- 339 — airport and hotel assistance rates can name their supplier
-- ============================================================================
-- Airport meet-and-greet and hotel porterage are often bought from an
-- outside company. Since 334 an agency can add "Airport assistant" or
-- "Hotel assistant" as its own supplier type (behaving as ground handler),
-- but the two rate pages had no way to point a rate at that supplier — the
-- link every other rate page has. Nullable, SET NULL on delete: a supplier
-- going away never takes its rates with it.
--
-- Idempotent: safe to re-run.

ALTER TABLE airport_staff_rates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE hotel_staff_rates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

CREATE INDEX IF NOT EXISTS idx_airport_staff_rates_supplier ON airport_staff_rates (supplier_id);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_rates_supplier ON hotel_staff_rates (supplier_id);
