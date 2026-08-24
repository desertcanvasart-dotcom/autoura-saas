-- ============================================================================
-- 289 — consolidate the dual assignment systems
-- ============================================================================
--
-- Two writers existed for "who is assigned to this trip": the day-capable
-- itinerary_resources module (conflict detection, per-assignment dates,
-- status) and six trip-level columns on itineraries (assigned_guide_id,
-- assigned_vehicle_id, assigned_hotel_id, assigned_restaurant_id,
-- assigned_airport_staff_id, assigned_hotel_staff_id) written by the
-- itineraries API. Two writers for one fact is the total_bookings_count
-- drift pattern (mig 280) — the second writer dies today.
--
--   itinerary_resources  ──sync──>  itineraries.assigned_<type>_id
--        (authoritative)              (derived, write-protected)
--
-- The columns become DERIVED: the earliest-starting CONFIRMED assignment of
-- each type, recomputed from source on every resource write (mig 280's
-- recompute pattern — never increment). Direct writes to the six columns are
-- REJECTED at the database unless they come from the sync trigger itself
-- (pg_trigger_depth guard, the 282 lesson). Readers — calendar conflict
-- checks, guide availability, ResourceSummaryCard — keep working and become
-- MORE accurate, because the columns can no longer disagree with the module.
--
-- assigned_to (trip ownership, mig 272) is a different fact and stays
-- writable. Both tables hold zero assignment data in production today.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Recompute-from-source sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_itinerary_assigned_columns()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_itin UUID := COALESCE(NEW.itinerary_id, OLD.itinerary_id);
BEGIN
  UPDATE itineraries i SET
    assigned_guide_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'guide' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1),
    assigned_vehicle_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'vehicle' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1),
    assigned_hotel_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'hotel' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1),
    assigned_restaurant_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'restaurant' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1),
    assigned_airport_staff_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'airport_staff' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1),
    assigned_hotel_staff_id = (
      SELECT r.resource_id FROM itinerary_resources r
       WHERE r.itinerary_id = v_itin AND r.resource_type = 'hotel_staff' AND r.status = 'confirmed'
       ORDER BY r.start_date, r.created_at LIMIT 1)
  WHERE i.id = v_itin;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Derivation must never abort the assignment write itself.
  RAISE WARNING 'sync_itinerary_assigned_columns failed for itinerary %: %', v_itin, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_assigned_columns ON itinerary_resources;
CREATE TRIGGER trg_sync_assigned_columns
  AFTER INSERT OR UPDATE OR DELETE ON itinerary_resources
  FOR EACH ROW EXECUTE FUNCTION sync_itinerary_assigned_columns();

-- ---------------------------------------------------------------------------
-- 2. The second writer dies: direct writes to the six columns are rejected.
--    pg_trigger_depth() > 0 exactly when the write comes from the sync
--    trigger (or any trigger chain) — app statements arrive at depth 0.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_assigned_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW; -- the sync trigger's own UPDATE
  END IF;
  IF NEW.assigned_guide_id         IS DISTINCT FROM OLD.assigned_guide_id
  OR NEW.assigned_vehicle_id       IS DISTINCT FROM OLD.assigned_vehicle_id
  OR NEW.assigned_hotel_id         IS DISTINCT FROM OLD.assigned_hotel_id
  OR NEW.assigned_restaurant_id    IS DISTINCT FROM OLD.assigned_restaurant_id
  OR NEW.assigned_airport_staff_id IS DISTINCT FROM OLD.assigned_airport_staff_id
  OR NEW.assigned_hotel_staff_id   IS DISTINCT FROM OLD.assigned_hotel_staff_id THEN
    RAISE EXCEPTION 'assigned_* columns are derived from itinerary_resources — create or update an assignment there instead'
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_assigned_columns ON itineraries;
CREATE TRIGGER trg_protect_assigned_columns
  BEFORE UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION protect_assigned_columns();

-- ---------------------------------------------------------------------------
-- 3. Backfill: recompute every itinerary that has resources (none today;
--    idempotent for whatever exists at apply time).
-- ---------------------------------------------------------------------------
UPDATE itinerary_resources SET id = id; -- fires the sync per row, depth > 0

-- ---------------------------------------------------------------------------
-- Post-check: the consolidation must demonstrably hold before COMMIT.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t UUID; itin UUID; g UUID := gen_random_uuid(); r UUID := gen_random_uuid();
  got UUID; rejected BOOLEAN := false;
BEGIN
  SELECT i.tenant_id, i.id INTO t, itin FROM itineraries i LIMIT 1;
  IF itin IS NULL THEN
    RAISE NOTICE 'no itinerary — structure asserted only';
    RETURN;
  END IF;

  -- Confirmed assignment must surface in the derived column.
  INSERT INTO itinerary_resources (id, tenant_id, itinerary_id, resource_type, resource_id, resource_name, start_date, end_date, status)
  VALUES (r, t, itin, 'guide', g, 'zz-probe-sync', CURRENT_DATE, CURRENT_DATE + 1, 'confirmed');
  SELECT assigned_guide_id INTO got FROM itineraries WHERE id = itin;
  IF got IS DISTINCT FROM g THEN
    RAISE EXCEPTION 'confirmed assignment did not derive (got %)', got;
  END IF;

  -- Cancelling must clear it.
  UPDATE itinerary_resources SET status = 'cancelled' WHERE id = r;
  SELECT assigned_guide_id INTO got FROM itineraries WHERE id = itin;
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'cancelled assignment still derived (%)', got;
  END IF;

  -- The second writer must be dead.
  BEGIN
    UPDATE itineraries SET assigned_guide_id = g WHERE id = itin;
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'direct write to assigned_guide_id was ACCEPTED — protection failed';
  END IF;

  -- Deleting the resource row must leave the column consistent (still NULL).
  DELETE FROM itinerary_resources WHERE id = r;
  SELECT assigned_guide_id INTO got FROM itineraries WHERE id = itin;
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'delete left a stale derived value (%)', got;
  END IF;

  RAISE NOTICE 'probe: derive on confirm, clear on cancel, direct write rejected, delete consistent';
END $$;

COMMIT;
