-- ============================================
-- MIGRATION 022: ADD TEMPLATE LANGUAGE SUPPORT
-- ============================================
-- Adds multi-language support to message_templates
-- Created: 2026-01-25
-- ============================================

-- Add language column (default 'en' for English)
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Add parent_template_id to link translations
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS parent_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;

-- Create index for language queries
CREATE INDEX IF NOT EXISTS idx_message_templates_language ON message_templates(language);
CREATE INDEX IF NOT EXISTS idx_message_templates_parent ON message_templates(parent_template_id);

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'language'
  ) THEN
    RAISE NOTICE '✅ Migration 022 completed: language support added to message_templates';
  ELSE
    RAISE WARNING '⚠️ Migration 022 may be incomplete';
  END IF;
END $$;
