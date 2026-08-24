-- ============================================================================
-- 288 — staff identity unification (execution layer, phase 1)
-- ============================================================================
--
-- The five people-models become one identity spine. team_members is already
-- the directory the app actually integrates (user_id linkage from 264/265,
-- UNIQUE(tenant_id,email), notifications, WhatsApp agent assignment, trip
-- assignee) — so it BECOMES the unified staff model, rather than a seventh
-- table competing with six. Specialist tables keep their domain fields
-- (daily_rate, license, airport_location, vehicle mechanics); identity —
-- who this person IS — lives in one place.
--
--   guides ─────────────┐
--   airport_staff ──────┼── team_member_id ──> team_members (name, phone,
--   hotel_staff ────────┘                       email, whatsapp, staff_type,
--   vehicles.default_driver_* ── default_driver_id ──>   user_id, photo)
--   trip_events.actor_team_member_id ──────────>
--
-- Link-or-create triggers (the 264/265 pattern: SECURITY DEFINER,
-- warn-and-continue, BEFORE so no self-UPDATE) mean every specialist row
-- written by ANY app path gets an identity row automatically. Drivers stop
-- being free text: writing vehicles.default_driver_name now creates a real
-- person with staff_type='driver'.
--
-- All four source tables hold 0 rows in production today — this is the
-- cheapest this migration will ever be. The backfill is written anyway
-- (idempotent) for any data that arrives between authoring and applying.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. team_members: the identity fields the specialist tables carry
-- ---------------------------------------------------------------------------
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS staff_type VARCHAR(30) NOT NULL DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50),
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_staff_type_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_staff_type_check
  CHECK (staff_type IN ('office', 'guide', 'driver', 'airport_staff', 'hotel_staff'));

-- ---------------------------------------------------------------------------
-- 2. Link columns. SET NULL, not CASCADE: deleting a directory row must not
--    delete the guide's rate card, and vice versa.
-- ---------------------------------------------------------------------------
ALTER TABLE guides        ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE airport_staff ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE hotel_staff   ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE vehicles      ADD COLUMN IF NOT EXISTS default_driver_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
-- The event log gains real identity alongside the display-name fallback.
ALTER TABLE trip_events   ADD COLUMN IF NOT EXISTS actor_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Link-or-create: specialist row -> directory identity.
--    Match by email first (the real UNIQUE), then phone; create when new.
--    Reading NEW via jsonb because the three tables name their columns
--    differently (guides has full_name; the others only name).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_specialist_to_directory()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j JSONB;
  v_name TEXT; v_email TEXT; v_phone TEXT; v_whatsapp TEXT; v_photo TEXT;
  v_id UUID;
  v_type TEXT := TG_ARGV[0];
BEGIN
  IF NEW.team_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  j := to_jsonb(NEW);
  v_name  := COALESCE(NULLIF(j->>'full_name', ''), NULLIF(j->>'name', ''));
  v_email := NULLIF(LOWER(TRIM(j->>'email')), '');
  v_phone := NULLIF(TRIM(j->>'phone'), '');
  v_whatsapp := NULLIF(TRIM(j->>'whatsapp'), '');
  v_photo := COALESCE(NULLIF(j->>'profile_photo_url', ''), NULLIF(j->>'photo_url', ''));
  IF v_name IS NULL THEN
    RETURN NEW; -- nothing to identify
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM team_members
     WHERE tenant_id = NEW.tenant_id AND LOWER(email) = v_email;
  END IF;
  IF v_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_id FROM team_members
     WHERE tenant_id = NEW.tenant_id AND phone = v_phone
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    IF v_email IS NOT NULL THEN
      INSERT INTO team_members (tenant_id, name, email, phone, whatsapp, role, staff_type, photo_url)
      VALUES (NEW.tenant_id, v_name, j->>'email', v_phone, v_whatsapp, 'staff', v_type, v_photo)
      ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_id;
    ELSE
      INSERT INTO team_members (tenant_id, name, phone, whatsapp, role, staff_type, photo_url)
      VALUES (NEW.tenant_id, v_name, v_phone, v_whatsapp, 'staff', v_type, v_photo)
      RETURNING id INTO v_id;
    END IF;
  ELSE
    -- An office/unclassified person who turns out to be a guide gets
    -- classified; an already-specific type is never overwritten.
    UPDATE team_members SET staff_type = v_type
     WHERE id = v_id AND staff_type = 'office';
  END IF;

  NEW.team_member_id := v_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'link_specialist_to_directory(%) failed for tenant %: %',
    v_type, NEW.tenant_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_directory ON guides;
CREATE TRIGGER trg_link_directory
  BEFORE INSERT OR UPDATE ON guides
  FOR EACH ROW EXECUTE FUNCTION link_specialist_to_directory('guide');

DROP TRIGGER IF EXISTS trg_link_directory ON airport_staff;
CREATE TRIGGER trg_link_directory
  BEFORE INSERT OR UPDATE ON airport_staff
  FOR EACH ROW EXECUTE FUNCTION link_specialist_to_directory('airport_staff');

DROP TRIGGER IF EXISTS trg_link_directory ON hotel_staff;
CREATE TRIGGER trg_link_directory
  BEFORE INSERT OR UPDATE ON hotel_staff
  FOR EACH ROW EXECUTE FUNCTION link_specialist_to_directory('hotel_staff');

-- ---------------------------------------------------------------------------
-- 4. Drivers become people. Writing default_driver_name creates/links a
--    directory row; clearing it clears the link (the directory row stays —
--    the person still exists, they just aren't this vehicle's default).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_driver_to_directory()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_name TEXT := NULLIF(TRIM(NEW.default_driver_name), '');
  v_phone TEXT := NULLIF(TRIM(NEW.default_driver_phone), '');
BEGIN
  IF v_name IS NULL THEN
    NEW.default_driver_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.default_driver_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_id FROM team_members
     WHERE tenant_id = NEW.tenant_id AND phone = v_phone
     LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM team_members
     WHERE tenant_id = NEW.tenant_id AND staff_type = 'driver' AND name = v_name
     LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO team_members (tenant_id, name, phone, whatsapp, role, staff_type)
    VALUES (NEW.tenant_id, v_name, v_phone, v_phone, 'staff', 'driver')
    RETURNING id INTO v_id;
  END IF;

  NEW.default_driver_id := v_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'link_driver_to_directory failed for tenant %: %', NEW.tenant_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_driver ON vehicles;
CREATE TRIGGER trg_link_driver
  BEFORE INSERT OR UPDATE OF default_driver_name, default_driver_phone ON vehicles
  FOR EACH ROW EXECUTE FUNCTION link_driver_to_directory();

-- ---------------------------------------------------------------------------
-- 5. 'driver' becomes an assignable resource type.
-- ---------------------------------------------------------------------------
ALTER TABLE itinerary_resources DROP CONSTRAINT IF EXISTS itinerary_resources_resource_type_check;
ALTER TABLE itinerary_resources ADD CONSTRAINT itinerary_resources_resource_type_check
  CHECK (resource_type IN ('guide', 'vehicle', 'driver', 'hotel', 'restaurant', 'cruise', 'airport_staff', 'hotel_staff'));

-- ---------------------------------------------------------------------------
-- 6. Backfill (no-op self-updates fire the BEFORE UPDATE triggers).
--    Empty tables today, but idempotent for any rows that exist by apply time.
-- ---------------------------------------------------------------------------
UPDATE guides        SET team_member_id = NULL WHERE team_member_id IS NULL;
UPDATE airport_staff SET team_member_id = NULL WHERE team_member_id IS NULL;
UPDATE hotel_staff   SET team_member_id = NULL WHERE team_member_id IS NULL;
UPDATE vehicles      SET default_driver_id = NULL
 WHERE default_driver_id IS NULL AND default_driver_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Post-check: the unification must DEMONSTRABLY work before this commits.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t UUID; itin UUID;
  g_id UUID := gen_random_uuid(); a_id UUID := gen_random_uuid();
  v_id UUID := gen_random_uuid(); r_id UUID := gen_random_uuid();
  g_tm UUID; a_tm UUID; v_tm UUID; v_type TEXT;
BEGIN
  SELECT id INTO t FROM tenants LIMIT 1;
  IF t IS NULL THEN
    RAISE NOTICE 'no tenant — structure asserted only';
    RETURN;
  END IF;

  -- A guide written with an email must MATERIALIZE an identity.
  INSERT INTO guides (id, tenant_id, name, full_name, email, phone)
  VALUES (g_id, t, 'zz-probe', 'ZZ Probe Guide', 'zz-probe-unify@example.com', '+20100000ZZ01');
  SELECT team_member_id INTO g_tm FROM guides WHERE id = g_id;
  IF g_tm IS NULL THEN RAISE EXCEPTION 'guide did not link to directory'; END IF;
  SELECT staff_type INTO v_type FROM team_members WHERE id = g_tm;
  IF v_type IS DISTINCT FROM 'guide' THEN RAISE EXCEPTION 'directory row not classified as guide (got %)', v_type; END IF;

  -- The SAME person appearing as airport staff must resolve to the SAME
  -- identity — this is what "unification" means.
  INSERT INTO airport_staff (id, tenant_id, name, airport_location, email, phone)
  VALUES (a_id, t, 'ZZ Probe Guide', 'ZZ Airport', 'zz-probe-unify@example.com', '+20100000ZZ01');
  SELECT team_member_id INTO a_tm FROM airport_staff WHERE id = a_id;
  IF a_tm IS DISTINCT FROM g_tm THEN
    RAISE EXCEPTION 'same email produced two identities (% vs %)', g_tm, a_tm;
  END IF;

  -- A free-text driver must become a person.
  INSERT INTO vehicles (id, tenant_id, name, vehicle_type, default_driver_name, default_driver_phone)
  VALUES (v_id, t, 'zz-probe-van', 'van', 'ZZ Probe Driver', '+20100000ZZ02');
  SELECT default_driver_id INTO v_tm FROM vehicles WHERE id = v_id;
  IF v_tm IS NULL THEN RAISE EXCEPTION 'driver did not materialize'; END IF;
  SELECT staff_type INTO v_type FROM team_members WHERE id = v_tm;
  IF v_type IS DISTINCT FROM 'driver' THEN RAISE EXCEPTION 'driver row not classified (got %)', v_type; END IF;

  -- 'driver' must now be assignable.
  SELECT id INTO itin FROM itineraries LIMIT 1;
  IF itin IS NOT NULL THEN
    INSERT INTO itinerary_resources (id, tenant_id, itinerary_id, resource_type, resource_id, resource_name, start_date, end_date, status)
    VALUES (r_id, t, itin, 'driver', v_tm, 'ZZ Probe Driver', CURRENT_DATE, CURRENT_DATE + 1, 'confirmed');
    DELETE FROM itinerary_resources WHERE id = r_id;
  ELSE
    RAISE NOTICE 'no itinerary — driver-assignability probe skipped';
  END IF;

  -- Clean up everything the probes created.
  DELETE FROM guides WHERE id = g_id;
  DELETE FROM airport_staff WHERE id = a_id;
  DELETE FROM vehicles WHERE id = v_id;
  DELETE FROM team_members WHERE id IN (g_tm, v_tm);

  RAISE NOTICE 'probe: guide linked+classified, same-email dedupe held, driver materialized, driver assignable';
END $$;

COMMIT;
