-- ============================================================================
-- 337 — transportation_rates: one row per vehicle, whatever the vehicle
-- ============================================================================
-- Migration 200 gave transportation_rates twenty WIDE columns — a rate,
-- non-EUR rate and capacity band for each of five fixed classes (sedan,
-- minivan, van, minibus, bus) — so a route was one row. Since 334 each
-- agency names its own vehicles ("Coaster", "Hiace", "Coach"), and a sixth
-- vehicle had no column to land in. The table's ORIGINAL shape — one row per
-- (route, vehicle_type) with base_rate_eur / capacity_min / capacity_max —
-- is the one the pricing engine, the grid and the CSV import already read,
-- so the wide columns go and the tall shape is the only shape.
--
-- Rows were wiped on 2026-09-06 (scripts/wipe-test-data.mjs), so nothing is
-- migrated; vehicle_type becomes NOT NULL and a route can carry each vehicle
-- once.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE transportation_rates
  DROP COLUMN IF EXISTS sedan_rate_eur,     DROP COLUMN IF EXISTS sedan_rate_non_eur,
  DROP COLUMN IF EXISTS sedan_capacity_min, DROP COLUMN IF EXISTS sedan_capacity_max,
  DROP COLUMN IF EXISTS minivan_rate_eur,     DROP COLUMN IF EXISTS minivan_rate_non_eur,
  DROP COLUMN IF EXISTS minivan_capacity_min, DROP COLUMN IF EXISTS minivan_capacity_max,
  DROP COLUMN IF EXISTS van_rate_eur,     DROP COLUMN IF EXISTS van_rate_non_eur,
  DROP COLUMN IF EXISTS van_capacity_min, DROP COLUMN IF EXISTS van_capacity_max,
  DROP COLUMN IF EXISTS minibus_rate_eur,     DROP COLUMN IF EXISTS minibus_rate_non_eur,
  DROP COLUMN IF EXISTS minibus_capacity_min, DROP COLUMN IF EXISTS minibus_capacity_max,
  DROP COLUMN IF EXISTS bus_rate_eur,     DROP COLUMN IF EXISTS bus_rate_non_eur,
  DROP COLUMN IF EXISTS bus_capacity_min, DROP COLUMN IF EXISTS bus_capacity_max;

-- A vehicle key from the tenant's vocabulary (vehicle_type kind); rows compare
-- as slugs in the engine, so store the key.
UPDATE transportation_rates SET vehicle_type = 'sedan' WHERE vehicle_type IS NULL;
ALTER TABLE transportation_rates ALTER COLUMN vehicle_type SET NOT NULL;

-- Each vehicle once per route.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transportation_rates_route_vehicle
  ON transportation_rates (
    tenant_id, service_type,
    coalesce(city, ''), coalesce(route_name, ''), coalesce(origin_city, ''), coalesce(destination_city, ''),
    coalesce(duration, ''), coalesce(area, ''),
    lower(vehicle_type)
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'transportation_rates' AND column_name LIKE '%_rate_eur'; -- 0
