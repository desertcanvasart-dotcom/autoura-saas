-- ============================================================================
-- 471 — a transport card's pickup area, and the sights a sightseeing card covers
-- ============================================================================
-- docs/transport-zones/PLAN.md step 3.
--
-- zone: which area of its city the card prices — a key from the agency's
--   zones for that city (migration 469). Empty = the city's default zone, so
--   every existing card keeps meaning what it means today. A Cairo airport
--   card for 6th of October hotels and one for Downtown hotels are two cards.
--
-- covers_sights: for a sightseeing card, the sights it covers (Luxor East
--   Bank: Karnak, Luxor Temple), by their fee-sheet names. Step 4 picks the
--   smallest card covering every sight of the day. Empty = not stated.
--
-- The route unique index (migration 460) gains the zone: the same route name
-- and vehicle may be priced once per area.
--
-- Until step 4 the engine leaves out cards in a NON-default area (they would
-- otherwise compete with the default card on the same lookup); cards with no
-- area, or the city's default area, price exactly as before.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS covers_sights TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE transportation_rates DROP CONSTRAINT IF EXISTS transportation_rates_zone_key;
ALTER TABLE transportation_rates ADD CONSTRAINT transportation_rates_zone_key
  CHECK (zone IS NULL OR zone ~ '^[a-z0-9][a-z0-9_]{0,59}$');

DROP INDEX IF EXISTS idx_transportation_rates_route_vehicle_supplier;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transportation_rates_route_vehicle_supplier
  ON transportation_rates (
    tenant_id, service_type,
    coalesce(city, ''), coalesce(route_name, ''), coalesce(origin_city, ''), coalesce(destination_city, ''),
    coalesce(duration, ''), coalesce(area, ''), coalesce(zone, ''),
    lower(vehicle_type),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMIT;
