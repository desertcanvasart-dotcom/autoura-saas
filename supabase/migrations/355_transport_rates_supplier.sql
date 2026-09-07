-- ============================================================================
-- 355 — transportation_rates.supplier_id: which company drives the route
-- ============================================================================
-- Every other rate table names its supplier (accommodation_rates,
-- nile_cruises, meal_rates, entrance_fees, activity_rates …). Transport never
-- had the column, so the rate form had nothing to offer, the resources API
-- carried a dead ?supplier_id filter, and the "Transport company" supplier
-- type's promise — "picked by transport rates" — was unfulfilled.
--
-- One supplier per ROUTE: the form writes the same supplier onto every
-- vehicle row of a route (one row per vehicle, migration 337).
-- ============================================================================

ALTER TABLE transportation_rates
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN transportation_rates.supplier_id IS
  'The transport company this route is bought from (suppliers of behaviour transport_company). Set on every vehicle row of the route.';

CREATE INDEX IF NOT EXISTS transportation_rates_supplier_id_idx
  ON transportation_rates (supplier_id)
  WHERE supplier_id IS NOT NULL;
