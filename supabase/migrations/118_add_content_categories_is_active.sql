-- =====================================================================
-- Migration 118: Add is_active column to content_categories table
-- Description: Adds is_active column needed by the content library API
-- Date: 2026-01-25
-- =====================================================================

-- Add is_active to content_categories
ALTER TABLE content_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active to content_library if missing
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add sort_order if missing
ALTER TABLE content_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_content_categories_is_active ON content_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_content_library_is_active ON content_library(is_active);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 118 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - content_categories.is_active';
  RAISE NOTICE '  - content_categories.sort_order';
  RAISE NOTICE '  - content_library.is_active';
  RAISE NOTICE '';
END $$;
