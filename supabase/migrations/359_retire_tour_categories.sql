-- ============================================================================
-- 359 — retire tour_categories, the theme table nothing could fill
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
-- Running code must not query a table that no longer exists (the 240 rule).
--
-- tour_categories was a per-tenant table holding tour themes, with a UUID
-- foreign key from tour_templates.category_id. It had no seed, no screen that
-- could add a row, and exactly one API route (GET/POST) that only the GET half
-- was ever called from. Measured before writing this: ZERO rows across every
-- tenant, and not one of the templates had a category_id set. It was a
-- dropdown that had never had anything in it.
--
-- 358 replaced it with the tour_theme vocabulary and tour_templates.tour_theme,
-- which stores a key like every other vocabulary field on a row.
--
-- Nothing is migrated here because there was nothing to migrate — and the
-- migration proves that rather than assuming it: if any row or any populated
-- category_id has appeared since, this ABORTS instead of destroying it.
--
-- No CASCADE on the table drop: anything still depending on it should fail
-- loudly rather than be silently swept away.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- Refuse to destroy data that was not there when this was written. If either
-- of these fires, stop and re-plan the migration rather than forcing it.
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'tour_categories') THEN
    EXECUTE 'SELECT count(*) FROM tour_categories' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'tour_categories now holds % row(s) — migrate them to the tour_theme vocabulary before dropping', n;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'tour_templates'
                AND column_name = 'category_id') THEN
    EXECUTE 'SELECT count(*) FROM tour_templates WHERE category_id IS NOT NULL' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '% template(s) still point at a tour_category — re-file them onto tour_theme first', n;
    END IF;
  END IF;
END $$;

ALTER TABLE tour_templates DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS tour_categories;

-- ============================================================================
-- Post-checks, inside the transaction.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'tour_categories') THEN
    RAISE EXCEPTION 'tour_categories is still present';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'tour_templates'
                AND column_name = 'category_id') THEN
    RAISE EXCEPTION 'tour_templates.category_id is still present';
  END IF;

  -- The replacement must be in place, or themes would have no home at all.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'tour_templates'
                    AND column_name = 'tour_theme') THEN
    RAISE EXCEPTION 'tour_templates.tour_theme is missing — apply 358 first';
  END IF;
END $$;

-- No function may still name the dropped column or table: plpgsql bodies are
-- stored as text, so nothing else would catch it until the next call.
DO $$
DECLARE
  fn text;
BEGIN
  SELECT proname INTO fn
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND (prosrc ~* '\mtour_categories\M' OR prosrc ~* 'tour_templates[^;]*\mcategory_id\M')
   LIMIT 1;
  IF fn IS NOT NULL THEN
    RAISE EXCEPTION 'function % still references tour_categories / category_id', fn;
  END IF;
END $$;

COMMIT;
