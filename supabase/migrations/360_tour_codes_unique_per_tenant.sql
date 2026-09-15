-- ============================================================================
-- 360 — a tour code is unique within an agency, not across the platform
-- ============================================================================
--
--   duplicate key value violates unique constraint
--   "tour_templates_template_code_key"
--
-- Importing a tour into a second workspace failed, because template_code was
-- declared UNIQUE with no tenant in it (migrations 000 and 007) and never
-- revised. One agency using the code CAI-DAY-001 therefore took it away from
-- every other agency on the platform — including the platform's own sandbox,
-- which is how this was found.
--
-- The application has always disagreed with the constraint: every lookup of a
-- template_code is already scoped by tenant_id
-- (app/api/tours/bulk/import/route.ts), and the single variation_code lookup
-- runs through an RLS-scoped client. Nothing anywhere wants global uniqueness;
-- the column simply said so.
--
-- tour_variations.variation_code carries the identical declaration and the
-- identical bug. It has not bitten yet only because variation codes are
-- derived from a template code that could not collide. Fixed here too rather
-- than left as a trap that springs the moment this one is lifted.
--
-- WIDENING, NOT NARROWING: (tenant_id, code) is weaker than (code), so every
-- row that satisfies the old constraint satisfies the new one. No data can
-- fail this, and nothing is rewritten.
--
-- The old constraint is found by its COLUMNS, not its name: a name is a
-- convention and this has to work against whatever the database actually has.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- Drop the single-column UNIQUE on each table, whatever it happens to be named.
DO $$
DECLARE
  t TEXT;
  col TEXT;
  c TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations']
  LOOP
    col := CASE t WHEN 'tour_templates' THEN 'template_code' ELSE 'variation_code' END;

    SELECT conname INTO c
      FROM pg_constraint
     WHERE conrelid = t::regclass
       AND contype = 'u'
       AND conkey = ARRAY[(
             SELECT attnum FROM pg_attribute
              WHERE attrelid = t::regclass AND attname = col
           )]::smallint[];

    IF c IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, c);
      RAISE NOTICE '[360] dropped % on %(%)', c, t, col;
    END IF;
  END LOOP;
END $$;

-- Add the tenant-scoped one, if it is not already there.
DO $$
DECLARE
  t TEXT;
  col TEXT;
  name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations']
  LOOP
    col  := CASE t WHEN 'tour_templates' THEN 'template_code' ELSE 'variation_code' END;
    name := t || '_tenant_' || col || '_key';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = t::regclass AND contype = 'u' AND conname = name
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (tenant_id, %I)', t, name, col);
      RAISE NOTICE '[360] added % on %(tenant_id, %)', name, t, col;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Post-checks, inside the transaction.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  col TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tour_templates', 'tour_variations']
  LOOP
    col := CASE t WHEN 'tour_templates' THEN 'template_code' ELSE 'variation_code' END;

    -- The global constraint must be gone, or two agencies still cannot use
    -- the same code and this migration has achieved nothing.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = t::regclass AND contype = 'u'
         AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                              WHERE attrelid = t::regclass AND attname = col)]::smallint[]
    ) THEN
      RAISE EXCEPTION '%.% is still globally unique', t, col;
    END IF;

    -- And the tenant-scoped one must exist, or a code could now be duplicated
    -- WITHIN one agency — which the upsert-by-code import relies on being
    -- impossible.
    -- Compared as SORTED column sets, not as conkey verbatim: conkey carries
    -- the order the constraint was declared in, and (code, tenant_id) is the
    -- same guarantee as (tenant_id, code).
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
       WHERE c.conrelid = t::regclass AND c.contype = 'u'
         AND (SELECT array_agg(x ORDER BY x) FROM unnest(c.conkey) AS x) =
             (SELECT array_agg(a.attnum ORDER BY a.attnum)
                FROM pg_attribute a
               WHERE a.attrelid = t::regclass AND a.attname IN ('tenant_id', col))
    ) THEN
      RAISE EXCEPTION '%(tenant_id, %) is not unique', t, col;
    END IF;
  END LOOP;
END $$;

COMMIT;
