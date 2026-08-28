-- ============================================================================
-- 303 — commission directions: sold-by seller + payable audit base (C2)
-- ============================================================================
--
-- The commission engine (lib/commission-generation.ts) now computes by
-- DIRECTION: receivable = a share of the supplier's own price; payable = a
-- share of OUR PROFIT on the service. Two columns support it:
--
--   itinerary_services.sold_by_supplier_id — the guide who SOLD a third
--     party's optional tour is not its supplier; naming the seller yields a
--     second, payable commission on the same profit.
--   commissions.cost_amount — the supplier cost the row was computed
--     against, whichever direction, so a payable row still shows what the
--     profit was made from.
--
-- Both nullable, no backfill: absent values simply mean "no seller" and
-- "recorded before this model".

BEGIN;

ALTER TABLE itinerary_services
  ADD COLUMN IF NOT EXISTS sold_by_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC;

CREATE INDEX IF NOT EXISTS idx_itinerary_services_sold_by
  ON itinerary_services (sold_by_supplier_id)
  WHERE sold_by_supplier_id IS NOT NULL;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE (table_name, column_name) IN
--     (('itinerary_services','sold_by_supplier_id'), ('commissions','cost_amount'));  -- 2
