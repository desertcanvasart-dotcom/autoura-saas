-- =====================================================================
-- 270 — consolidate the two B2B quote stores onto b2b_quotes
-- =====================================================================
-- tour_quotes (B2B Calculator saves, listed at /b2b/quotes) and
-- b2b_quotes (grid/AI/from-itinerary saves, listed at /quotes/b2b) were
-- parallel stores for the same commercial object: a quote saved from
-- New Quote never appeared under B2B → Quotes. Decision record:
-- docs/B2B-QUOTE-STORES-OPTIONS.md (option A). Both tables were EMPTY
-- in production at decision time — no data migration.
--
-- This migration teaches b2b_quotes the calculator's vocabulary so the
-- calculator can save here: per-client fields, pax, the variation link,
-- the services snapshot, and summary pricing. All nullable — quotes
-- born from an itinerary simply leave them empty (and vice versa:
-- calculator quotes have no itinerary_id).
--
-- created_by comes along for Activity-Summary attribution parity with
-- b2c_quotes/invoices (269). tour_quotes itself is dropped in a later
-- migration once the new path has been exercised.
-- =====================================================================

ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS variation_id UUID REFERENCES tour_variations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trip_name TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS client_nationality TEXT,
  ADD COLUMN IF NOT EXISTS travel_date DATE,
  ADD COLUMN IF NOT EXISTS num_adults INT,
  ADD COLUMN IF NOT EXISTS num_children INT,
  ADD COLUMN IF NOT EXISTS is_eur_passport BOOLEAN,
  ADD COLUMN IF NOT EXISTS services_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC,
  ADD COLUMN IF NOT EXISTS price_per_person NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS converted_to_itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_quotes_created_by
  ON b2b_quotes (tenant_id, created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_variation
  ON b2b_quotes (tenant_id, variation_id) WHERE variation_id IS NOT NULL;
