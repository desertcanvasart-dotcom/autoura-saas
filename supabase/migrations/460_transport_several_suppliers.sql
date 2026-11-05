-- ============================================================================
-- 460 — several transport companies may price the same route and vehicle
-- ============================================================================
-- Operator, 2026-11-05: two transport companies sell Alexandria → Cairo by
-- sedan at different prices. Saving the second was refused — "This route
-- already prices sedan" — because migration 337's "each vehicle once per
-- route" index did not know about the supplier (migration 355 added it later,
-- one per route).
--
-- 1. The index now includes the supplier: each company may price a vehicle on
--    a route once. A route with no supplier still counts as one "company", so
--    two supplier-less copies stay refused, as before.
-- 2. is_preferred — the engine's default company when several price the same
--    route and vehicle (lib/pricing/transport-suppliers.ts). Same rule as
--    hotels: one company → it; several, exactly one starred → that one;
--    otherwise a pricing hole naming the companies, never a guess. No unique
--    index on it: one company's several named routes in one city all carry
--    its star.
--
-- Live on 2026-11-05: 0 route+vehicle pairs priced by more than one company,
-- so nothing prices differently after this migration.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_transportation_rates_route_vehicle;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transportation_rates_route_vehicle_supplier
  ON transportation_rates (
    tenant_id, service_type,
    coalesce(city, ''), coalesce(route_name, ''), coalesce(origin_city, ''), coalesce(destination_city, ''),
    coalesce(duration, ''), coalesce(area, ''),
    lower(vehicle_type),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE transportation_rates
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN transportation_rates.is_preferred IS
  'The engine''s default transport company when several price the same route and vehicle. Set on every vehicle row of the starred route.';

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'transportation_rates'
--     AND indexname LIKE 'idx_transportation_rates_route_vehicle%';      -- only ..._supplier
--   SELECT count(*) FROM transportation_rates WHERE is_preferred;        -- 0
