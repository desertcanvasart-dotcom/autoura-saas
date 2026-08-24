-- ============================================================================
-- 290 — drop the dead driver free-text columns on itinerary_services
-- ============================================================================
--
-- itinerary_services.driver_name / driver_phone were the last free-text
-- driver fields left after the staff identity unification (mig 288 made
-- drivers real people: team_members with staff_type='driver', assignable
-- through itinerary_resources, and vehicles.default_driver_id replaced
-- default_driver_name). No application code reads or writes these two
-- columns any more — the only remaining mentions are the generated types —
-- and the table holds zero rows in production, so nothing is lost.
--
-- Dropping them removes the last place a driver could exist as untyped
-- text outside the unified staff model.

ALTER TABLE itinerary_services DROP COLUMN IF EXISTS driver_name;
ALTER TABLE itinerary_services DROP COLUMN IF EXISTS driver_phone;

-- Post-check (run after COMMIT):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'itinerary_services'
--     AND column_name IN ('driver_name', 'driver_phone');
--   -- expect: zero rows
