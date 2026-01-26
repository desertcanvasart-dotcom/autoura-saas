-- ============================================
-- MIGRATION 020: FIX MESSAGE_TEMPLATES SCHEMA
-- ============================================
-- Aligns the message_templates table with the frontend/API expectations
-- Created: 2026-01-25
--
-- CHANGES:
-- - Rename template_name → name
-- - Add description column
-- - Add subcategory column
-- - Add placeholders TEXT[] column
-- - Keep variables JSONB for backward compatibility
-- - Add 'both' as valid channel option
-- ============================================

-- Step 1: Add missing columns
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
  ADD COLUMN IF NOT EXISTS placeholders TEXT[];

-- Step 2: Rename template_name to name (if template_name exists)
DO $$
BEGIN
  -- Check if template_name exists and name doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'template_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'name'
  ) THEN
    ALTER TABLE message_templates RENAME COLUMN template_name TO name;
  END IF;
END $$;

-- Step 3: Update channel constraint to include 'both'
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_channel_check;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_channel_check
  CHECK (channel IN ('email', 'whatsapp', 'sms', 'both'));

-- Step 4: Create index on subcategory for filtering
CREATE INDEX IF NOT EXISTS idx_message_templates_subcategory ON message_templates(subcategory);

-- Step 5: Migrate data from variables to placeholders (if variables has placeholder data)
UPDATE message_templates
SET placeholders = ARRAY(
  SELECT jsonb_array_elements_text(variables)
)
WHERE variables IS NOT NULL
  AND jsonb_typeof(variables) = 'array'
  AND placeholders IS NULL;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'message_templates'
    AND column_name IN ('name', 'description', 'subcategory', 'placeholders');

  IF col_count >= 3 THEN
    RAISE NOTICE '✅ Migration 020 completed successfully!';
    RAISE NOTICE 'message_templates now has: name, description, subcategory, placeholders columns';
  ELSE
    RAISE WARNING '⚠️ Migration may be incomplete. Found % of expected columns.', col_count;
  END IF;
END $$;
