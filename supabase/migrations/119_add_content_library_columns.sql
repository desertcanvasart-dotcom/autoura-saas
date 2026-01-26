-- =====================================================================
-- Migration 119: Add missing columns to content_library table
-- Description: Adds columns needed by the content library API
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. ADD MISSING COLUMNS TO content_library
-- =====================================================================

-- Metadata for flexible content attributes
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Tags for content classification
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Audit columns
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Additional content fields
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS duration VARCHAR(100);
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Timestamps (ensure they exist)
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 2. ADD INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_content_library_tags ON content_library USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_content_library_metadata ON content_library USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_content_library_location ON content_library(location);
CREATE INDEX IF NOT EXISTS idx_content_library_created_by ON content_library(created_by);

-- =====================================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_content_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_content_library_updated_at ON content_library;
CREATE TRIGGER trigger_content_library_updated_at
  BEFORE UPDATE ON content_library
  FOR EACH ROW
  EXECUTE FUNCTION update_content_library_updated_at();

-- =====================================================================
-- 4. CREATE content_variations TABLE (if not exists)
-- =====================================================================

CREATE TABLE IF NOT EXISTS content_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_library(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),
  title VARCHAR(255),
  description TEXT,
  highlights TEXT[] DEFAULT '{}',
  inclusions TEXT[] DEFAULT '{}',
  internal_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, tier)
);

-- Indexes for variations
CREATE INDEX IF NOT EXISTS idx_content_variations_content_id ON content_variations(content_id);
CREATE INDEX IF NOT EXISTS idx_content_variations_tier ON content_variations(tier);
CREATE INDEX IF NOT EXISTS idx_content_variations_is_active ON content_variations(is_active);

-- Trigger for variations updated_at
CREATE OR REPLACE FUNCTION update_content_variations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_content_variations_updated_at ON content_variations;
CREATE TRIGGER trigger_content_variations_updated_at
  BEFORE UPDATE ON content_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_content_variations_updated_at();

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  lib_col_count INTEGER;
  var_col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO lib_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'content_library';

  SELECT COUNT(*) INTO var_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'content_variations';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 119 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'content_library table now has % columns', lib_col_count;
  RAISE NOTICE 'content_variations table now has % columns', var_col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added to content_library:';
  RAISE NOTICE '  - metadata (JSONB)';
  RAISE NOTICE '  - tags (TEXT[])';
  RAISE NOTICE '  - created_by, updated_by';
  RAISE NOTICE '  - duration, location';
  RAISE NOTICE '';
  RAISE NOTICE 'Created content_variations table with:';
  RAISE NOTICE '  - tier (budget/standard/deluxe/luxury)';
  RAISE NOTICE '  - title, description, highlights, inclusions';
  RAISE NOTICE '  - internal_notes, is_active';
  RAISE NOTICE '  - created_by, updated_by';
  RAISE NOTICE '';
END $$;
