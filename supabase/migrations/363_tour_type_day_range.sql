-- ============================================================================
-- 363 — A tour type says how many days it covers, so nothing is overwritten
-- ============================================================================
--
-- Typing a duration rewrote the tour's TYPE. The form does:
--
--   if (duration_days >= 2) updated.tour_type = 'multi_day'
--
-- Every agency that added a type of its own loses it the moment someone edits
-- the duration. On production today that is real: Sawa Tours has "Package",
-- "OverDay Trip" and "OverNight Trip"; Autoura Sandbox has the same three.
-- Set a Package tour to 5 days and it silently became a Multi-Day Tour.
--
-- The app also decides "is this measured in hours?" from a hardcoded key list
-- (day_tour, stopover), so Sawa's "OverDay Trip" — a day trip — was held to at
-- least 2 days and 1 night.
--
-- The range belongs to the vocabulary entry, beside the agency's own word for
-- it: meta.min_days, and meta.max_days (absent = open-ended). The three seeded
-- keys get theirs here. An agency-added type keeps meta {} — an unknown range,
-- which the form treats as "the operator decided this, leave it alone": never
-- auto-suggested, and never overwritten.
--
-- Idempotent: jsonb || jsonb re-applies the same keys. Only the three seeded
-- keys are touched, and only where the value is not already set.
-- ============================================================================

BEGIN;

-- Existing tenants
UPDATE tenant_vocabularies
   SET meta = COALESCE(meta, '{}'::jsonb) || '{"min_days": 1, "max_days": 1}'::jsonb
 WHERE kind = 'tour_type'
   AND key IN ('day_tour', 'stopover')
   AND NOT (COALESCE(meta, '{}'::jsonb) ? 'max_days');

UPDATE tenant_vocabularies
   SET meta = COALESCE(meta, '{}'::jsonb) || '{"min_days": 2}'::jsonb
 WHERE kind = 'tour_type'
   AND key = 'multi_day'
   AND NOT (COALESCE(meta, '{}'::jsonb) ? 'min_days');

-- New tenants: the seeder plants the same ranges.
CREATE OR REPLACE FUNCTION seed_tour_type_day_range()
RETURNS void AS $$
BEGIN
  -- Kept as its own statement so a later re-definition of
  -- seed_tenant_vocabulary (which owns the labels) cannot drop the ranges:
  -- this runs after it and fills whatever is missing.
  UPDATE tenant_vocabularies
     SET meta = COALESCE(meta, '{}'::jsonb) || '{"min_days": 1, "max_days": 1}'::jsonb
   WHERE kind = 'tour_type' AND key IN ('day_tour', 'stopover')
     AND NOT (COALESCE(meta, '{}'::jsonb) ? 'max_days');
  UPDATE tenant_vocabularies
     SET meta = COALESCE(meta, '{}'::jsonb) || '{"min_days": 2}'::jsonb
   WHERE kind = 'tour_type' AND key = 'multi_day'
     AND NOT (COALESCE(meta, '{}'::jsonb) ? 'min_days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION seed_tour_type_day_range() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seed_tour_type_day_range() TO service_role;

CREATE OR REPLACE FUNCTION seed_tour_type_range_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'tour_type' AND NEW.key IN ('day_tour', 'stopover')
     AND NOT (COALESCE(NEW.meta, '{}'::jsonb) ? 'max_days') THEN
    NEW.meta := COALESCE(NEW.meta, '{}'::jsonb) || '{"min_days": 1, "max_days": 1}'::jsonb;
  ELSIF NEW.kind = 'tour_type' AND NEW.key = 'multi_day'
     AND NOT (COALESCE(NEW.meta, '{}'::jsonb) ? 'min_days') THEN
    NEW.meta := COALESCE(NEW.meta, '{}'::jsonb) || '{"min_days": 2}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_tour_type_range ON tenant_vocabularies;
CREATE TRIGGER trg_seed_tour_type_range
  BEFORE INSERT ON tenant_vocabularies
  FOR EACH ROW
  EXECUTE FUNCTION seed_tour_type_range_on_insert();

COMMIT;
