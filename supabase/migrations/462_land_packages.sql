-- ============================================================================
-- 462 — land packages: one per-person price for several days (2026-11-07)
-- ============================================================================
-- Operator, 2026-11-07: the Bahariya Oasis trip is bought from ONE provider
-- as one package — car from Cairo and back, a 4x4 in the desert, a night in
-- the desert camp (or a hotel), the guide, the meals and the protected-area
-- ticket — at one price per person, the same for 1 to 6 people (a seventh
-- just means a second jeep). Versions: 2 days / 1 night (camp), 2 days /
-- 1 night (hotel), 3 days / 2 nights (camp + hotel).
--
-- Priced piece by piece, such a trip charged a road transfer, a guide, meals,
-- a night and entrance fees on top of nothing — the package itself had no
-- home. A land package is that home: it is priced ONCE (per person × pax)
-- and, on the days it covers, what it includes is not charged again
-- (lib/pricing/land-package.ts — the same idea as the cruise sightseeing
-- package, for a land trip).
--
--   duration_days       how many days it covers, from the day it is put on
--   night_places        one entry per night, in order: 'camp' | 'hotel' | 'other'
--   meals               one entry per day: {"breakfast":b,"lunch":b,"dinner":b}
--   includes_*          what it covers on those days; covered_attractions
--                       names the sights its ticket covers (shown on a quote)
--   base_rate_eur       the price PER PERSON; base_rate_non_eur mirrors it
--                       (single-rate entry, like the other sheets), in
--                       rate_currency
--
-- day_blocks gain land_package_id + land_package_day: "this standard day is
-- day N of that package", so the Quote Builder lays the package down once and
-- leaves off what it covers.
--
-- Secured like activity_rates: tenant-scoped RLS, viewers cannot write (424),
-- tenant set on insert, rate audit trail.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS land_packages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id           UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  service_code          TEXT,
  package_name          TEXT NOT NULL,
  city                  TEXT,
  start_city            TEXT,
  duration_days         INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 14),
  night_places          TEXT[] NOT NULL DEFAULT '{}',
  meals                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  includes_transport    BOOLEAN NOT NULL DEFAULT true,
  includes_local_vehicle BOOLEAN NOT NULL DEFAULT false,
  includes_guide        BOOLEAN NOT NULL DEFAULT true,
  includes_entrance     BOOLEAN NOT NULL DEFAULT true,
  covered_attractions   TEXT[] NOT NULL DEFAULT '{}',
  vehicle_capacity      INTEGER CHECK (vehicle_capacity IS NULL OR vehicle_capacity > 0),
  base_rate_eur         NUMERIC,
  base_rate_non_eur     NUMERIC,
  rate_currency         TEXT,
  description           TEXT,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One night per night: a 2-day package has 1, a 3-day package 2.
  CONSTRAINT land_packages_nights_match CHECK (cardinality(night_places) = duration_days - 1),
  CONSTRAINT land_packages_night_kinds CHECK (night_places <@ ARRAY['camp', 'hotel', 'other']::text[])
);

COMMENT ON TABLE land_packages IS
  'A multi-day package bought from one provider at one price per person (the Bahariya desert trip): priced once, and on the days it covers what it includes is not charged again (lib/pricing/land-package.ts).';
COMMENT ON COLUMN land_packages.night_places IS 'One per night, in order: camp | hotel | other. Length = duration_days - 1.';
COMMENT ON COLUMN land_packages.meals IS 'One object per day, in order: {"breakfast":bool,"lunch":bool,"dinner":bool} — the meals the package includes.';
COMMENT ON COLUMN land_packages.base_rate_eur IS 'Price PER PERSON, in rate_currency. base_rate_non_eur mirrors it.';

CREATE INDEX IF NOT EXISTS idx_land_packages_tenant ON land_packages (tenant_id) WHERE is_active;

ALTER TABLE land_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant land_packages" ON land_packages;
CREATE POLICY "Users can view own tenant land_packages" ON land_packages
  FOR SELECT USING (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS "Users can insert own tenant land_packages" ON land_packages;
CREATE POLICY "Users can insert own tenant land_packages" ON land_packages
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS "Users can update own tenant land_packages" ON land_packages;
CREATE POLICY "Users can update own tenant land_packages" ON land_packages
  FOR UPDATE USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS "Users can delete own tenant land_packages" ON land_packages;
CREATE POLICY "Users can delete own tenant land_packages" ON land_packages
  FOR DELETE USING (tenant_id = get_user_tenant_id());

-- Viewers read, never write (as migration 424 did for every rate sheet).
DROP POLICY IF EXISTS "Viewers cannot insert" ON land_packages;
CREATE POLICY "Viewers cannot insert" ON land_packages AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot update" ON land_packages;
CREATE POLICY "Viewers cannot update" ON land_packages AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (member_can_write(tenant_id)) WITH CHECK (member_can_write(tenant_id));
DROP POLICY IF EXISTS "Viewers cannot delete" ON land_packages;
CREATE POLICY "Viewers cannot delete" ON land_packages AS RESTRICTIVE
  FOR DELETE TO authenticated USING (member_can_write(tenant_id));

DROP TRIGGER IF EXISTS set_tenant_id_land_packages ON land_packages;
CREATE TRIGGER set_tenant_id_land_packages BEFORE INSERT ON land_packages
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

CREATE OR REPLACE FUNCTION land_packages_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_land_packages_updated_at ON land_packages;
CREATE TRIGGER trigger_land_packages_updated_at BEFORE UPDATE ON land_packages
  FOR EACH ROW EXECUTE FUNCTION land_packages_touch_updated_at();

DROP TRIGGER IF EXISTS audit_land_packages ON land_packages;
CREATE TRIGGER audit_land_packages AFTER INSERT OR UPDATE OR DELETE ON land_packages
  FOR EACH ROW EXECUTE FUNCTION rate_audit_trigger();

-- A standard day can be day N of a land package.
ALTER TABLE day_blocks
  ADD COLUMN IF NOT EXISTS land_package_id UUID REFERENCES land_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS land_package_day INTEGER CHECK (land_package_day IS NULL OR land_package_day >= 1);

COMMENT ON COLUMN day_blocks.land_package_id IS 'This standard day is part of that land package (see land_package_day).';
COMMENT ON COLUMN day_blocks.land_package_day IS 'Which day of the package this block is (1 = the day it starts and is charged).';

COMMIT;

-- Verify: SELECT count(*) FROM land_packages;  -- 0: nothing changes until one is added.
