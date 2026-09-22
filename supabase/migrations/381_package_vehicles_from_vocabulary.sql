-- ============================================================================
-- 381 — A transport package prices its vehicles from the agency's vocabulary
-- ============================================================================
-- A cruise-sightseeing (or transfer) package used to carry five fixed vehicle
-- slots: sedan / minivan / van / minibus / bus, each with its own rate and
-- capacity column. That is the same mistake transportation rates had before
-- vehicles became vocabulary: an agency whose fleet is "sedan / suv / 4x4 /
-- minivan" (Travel2Egypt) could not enter half of it, and a group that fell in
-- a band the package did not name was priced as a Bus or, worse, sold for
-- nothing.
--
-- A package now carries ONE list, `vehicles`, keyed by the agency's own
-- vehicle_type vocabulary — exactly like transportation_rates. Each entry is
-- { "vehicle_type": <vocab key>, "rate": <number> }. It stores NO capacity:
-- which vehicle seats a group is read from the vehicle_type vocabulary bands at
-- pricing time (vehicleForPax), so a package can never drift out of step with
-- the fleet the agency actually defined.
--
-- The five legacy columns are left in place, dormant, for a later drop; the
-- engine and the form read `vehicles`. Backfill converts any legacy row (there
-- are none in production — 0 rows in any tenant — but the shape must be right
-- for a fresh build).

ALTER TABLE b2b_transport_packages
  ADD COLUMN IF NOT EXISTS vehicles JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Carry any legacy fixed-column rate onto the list, in fleet order. Keys use
-- the generic Egypt-preset words; a tenant whose vocabulary differs re-enters
-- the package through the form (which lists that tenant's own vehicles).
UPDATE b2b_transport_packages SET vehicles =
       (CASE WHEN sedan_rate   IS NOT NULL THEN jsonb_build_array(jsonb_build_object('vehicle_type','sedan',  'rate',sedan_rate))   ELSE '[]'::jsonb END)
    || (CASE WHEN minivan_rate IS NOT NULL THEN jsonb_build_array(jsonb_build_object('vehicle_type','minivan','rate',minivan_rate)) ELSE '[]'::jsonb END)
    || (CASE WHEN van_rate     IS NOT NULL THEN jsonb_build_array(jsonb_build_object('vehicle_type','van',    'rate',van_rate))     ELSE '[]'::jsonb END)
    || (CASE WHEN minibus_rate IS NOT NULL THEN jsonb_build_array(jsonb_build_object('vehicle_type','minibus','rate',minibus_rate)) ELSE '[]'::jsonb END)
    || (CASE WHEN bus_rate     IS NOT NULL THEN jsonb_build_array(jsonb_build_object('vehicle_type','bus',    'rate',bus_rate))     ELSE '[]'::jsonb END)
WHERE (vehicles IS NULL OR vehicles = '[]'::jsonb)
  AND (sedan_rate IS NOT NULL OR minivan_rate IS NOT NULL OR van_rate IS NOT NULL
       OR minibus_rate IS NOT NULL OR bus_rate IS NOT NULL);

COMMENT ON COLUMN b2b_transport_packages.vehicles IS
  'The agency''s vehicles for this package, keyed by its vehicle_type vocabulary: [{ "vehicle_type": <key>, "rate": <number> }]. Sizes come from the vocabulary at pricing time — no capacity is stored here. Replaces the fixed sedan/minivan/van/minibus/bus rate columns.';
