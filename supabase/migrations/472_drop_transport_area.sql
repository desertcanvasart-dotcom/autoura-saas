-- ============================================================================
-- 472 — retire transportation_rates.area
-- ============================================================================
-- docs/transport-zones/PLAN.md step 6. `area` meant a SIGHTSEEING area the
-- engine guessed from a fixed keyword list (east_bank, pyramids, …) — the same
-- list for every company. It was empty on every one of 2,142 rows (checked
-- 2026-11-16), not in the card form, and never decided a price. A card's
-- pickup area is now `zone` (migration 471, the agency's own zones) and the
-- sights it covers `covers_sights`; the engine reads those and nothing reads
-- `area` any more.
--
-- The route unique index (migrations 460/471) named the column, so it is
-- rebuilt without it first. Same rows stay unique: area was '' on all of them.
--
-- Idempotent: safe to re-run.

BEGIN;

DROP INDEX IF EXISTS idx_transportation_rates_route_vehicle_supplier;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transportation_rates_route_vehicle_supplier
  ON transportation_rates (
    tenant_id, service_type,
    coalesce(city, ''), coalesce(route_name, ''), coalesce(origin_city, ''), coalesce(destination_city, ''),
    coalesce(duration, ''), coalesce(zone, ''),
    lower(vehicle_type),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE transportation_rates DROP COLUMN IF EXISTS area;

COMMIT;
