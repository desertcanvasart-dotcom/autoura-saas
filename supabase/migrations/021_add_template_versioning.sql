-- ============================================
-- MIGRATION 021: ADD TEMPLATE VERSIONING
-- ============================================
-- Adds simple version tracking to message_templates
-- Created: 2026-01-25
-- ============================================

-- Add version column with default 1
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add last_modified_by to track who made changes
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id);

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_message_templates_version ON message_templates(version);

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'version'
  ) THEN
    RAISE NOTICE '✅ Migration 021 completed: version column added to message_templates';
  ELSE
    RAISE WARNING '⚠️ Migration 021 may be incomplete';
  END IF;
END $$;
