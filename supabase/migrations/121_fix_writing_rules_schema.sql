-- =====================================================================
-- Migration 121: Fix writing_rules schema to match UI expectations
-- Description: Adds rule_type, priority, applies_to columns
-- Date: 2026-01-26
-- =====================================================================

-- =====================================================================
-- 1. ADD MISSING COLUMNS
-- =====================================================================

-- Rule type determines enforcement level (used for grouping in UI)
ALTER TABLE writing_rules
  ADD COLUMN IF NOT EXISTS rule_type VARCHAR(20) DEFAULT 'enforce'
  CHECK (rule_type IN ('enforce', 'prefer', 'avoid'));

-- Priority for sorting within groups (1-10, higher = more important)
ALTER TABLE writing_rules
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;

-- Applies to which content types (all, itinerary, email, whatsapp)
ALTER TABLE writing_rules
  ADD COLUMN IF NOT EXISTS applies_to TEXT[] DEFAULT ARRAY['all'];

-- =====================================================================
-- 2. CONVERT EXAMPLES FROM TEXT[] TO JSONB
-- =====================================================================

-- First, add a new JSONB column for examples
ALTER TABLE writing_rules
  ADD COLUMN IF NOT EXISTS examples_json JSONB DEFAULT '{"good": [], "bad": []}';

-- Migrate existing TEXT[] examples to JSONB format
-- The existing examples are tips/examples, we'll put them in the "good" array
UPDATE writing_rules
SET examples_json = jsonb_build_object(
  'good', COALESCE(
    (SELECT jsonb_agg(elem) FROM unnest(examples) AS elem WHERE elem IS NOT NULL AND elem != ''),
    '[]'::jsonb
  ),
  'bad', '[]'::jsonb
)
WHERE examples IS NOT NULL AND array_length(examples, 1) > 0;

-- =====================================================================
-- 3. UPDATE EXISTING DEFAULT RULES WITH PROPER RULE_TYPES
-- =====================================================================

-- Assign rule_types based on category and content
UPDATE writing_rules SET rule_type = 'enforce', priority = 8
WHERE name = 'Use Active Voice';

UPDATE writing_rules SET rule_type = 'prefer', priority = 7
WHERE name = 'Tier-Appropriate Language';

UPDATE writing_rules SET rule_type = 'prefer', priority = 6
WHERE name = 'Sensory Details';

UPDATE writing_rules SET rule_type = 'enforce', priority = 9
WHERE name = 'Specific Over Generic';

UPDATE writing_rules SET rule_type = 'avoid', priority = 7
WHERE name = 'Avoid Superlatives';

-- =====================================================================
-- 4. CREATE INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_writing_rules_rule_type ON writing_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_writing_rules_priority ON writing_rules(priority);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
  rule_count INTEGER;
  enforce_count INTEGER;
  prefer_count INTEGER;
  avoid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'writing_rules';

  SELECT COUNT(*) INTO rule_count FROM writing_rules;
  SELECT COUNT(*) INTO enforce_count FROM writing_rules WHERE rule_type = 'enforce';
  SELECT COUNT(*) INTO prefer_count FROM writing_rules WHERE rule_type = 'prefer';
  SELECT COUNT(*) INTO avoid_count FROM writing_rules WHERE rule_type = 'avoid';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 121 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'writing_rules table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - rule_type (enforce/prefer/avoid)';
  RAISE NOTICE '  - priority (1-10)';
  RAISE NOTICE '  - applies_to (content types)';
  RAISE NOTICE '  - examples_json (JSONB with good/bad)';
  RAISE NOTICE '';
  RAISE NOTICE 'Rule distribution:';
  RAISE NOTICE '  - Enforce: %', enforce_count;
  RAISE NOTICE '  - Prefer: %', prefer_count;
  RAISE NOTICE '  - Avoid: %', avoid_count;
  RAISE NOTICE '';
END $$;
