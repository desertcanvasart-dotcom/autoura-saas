-- ============================================================================
-- 470 — a hotel's area (zone) within its city
-- ============================================================================
-- docs/transport-zones/PLAN.md step 2. A transfer to a 6th of October hotel
-- costs more than one to a Downtown hotel; the hotel says which part of its
-- city it is in. The value is a key from the agency's zones for that city
-- (migration 469, city_zones). Empty = the city's default zone, so nothing
-- changes until a hotel is given an area.
--
-- On the hotel's rate row, beside its city — the row the pricing engine
-- chooses for a city and tier. The supplier's property record often has no
-- city (Travel2Egypt: 0 of 13), and some agencies' hotel rows link to no
-- property at all, so the property could not carry it.
--
-- No foreign key: a zone is (city, key), and the row's city is free text
-- matched ignoring capitals. The app checks the key against the city's zones
-- on every save and import; deleting a zone a hotel uses is refused.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS zone TEXT;

ALTER TABLE accommodation_rates DROP CONSTRAINT IF EXISTS accommodation_rates_zone_key;
ALTER TABLE accommodation_rates ADD CONSTRAINT accommodation_rates_zone_key
  CHECK (zone IS NULL OR zone ~ '^[a-z0-9][a-z0-9_]{0,59}$');

COMMIT;
