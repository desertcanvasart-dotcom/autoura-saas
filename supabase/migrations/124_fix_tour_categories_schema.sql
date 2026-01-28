-- ============================================
-- MIGRATION 124: FIX TOUR TABLES SCHEMA
-- ============================================
-- Adds missing columns to tour_categories and tour_templates
-- that the API expects but were missing from migration 007
-- ============================================

-- ============================================
-- PART 1: FIX TOUR_CATEGORIES
-- ============================================

-- Add missing columns to tour_categories
ALTER TABLE tour_categories
  ADD COLUMN IF NOT EXISTS category_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 99;

-- Populate category_code from slug if null
UPDATE tour_categories
SET category_code = UPPER(REPLACE(slug, '-', '_'))
WHERE category_code IS NULL;

-- Create index on category_code
CREATE INDEX IF NOT EXISTS idx_tour_categories_code ON tour_categories(category_code);

-- ============================================
-- PART 2: FIX TOUR_TEMPLATES
-- ============================================

-- Add missing columns to tour_templates
ALTER TABLE tour_templates
  ADD COLUMN IF NOT EXISTS tour_type VARCHAR(50) DEFAULT 'day_tour',
  ADD COLUMN IF NOT EXISTS cities_covered TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS destinations_covered TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS best_for TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS physical_level VARCHAR(20) DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS age_suitability VARCHAR(20) DEFAULT 'all_ages',
  ADD COLUMN IF NOT EXISTS pickup_required BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS accommodation_nights INTEGER,
  ADD COLUMN IF NOT EXISTS meals_included TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_transportation_service VARCHAR(50) DEFAULT 'day_tour',
  ADD COLUMN IF NOT EXISTS transportation_city VARCHAR(100) DEFAULT 'Cairo',
  ADD COLUMN IF NOT EXISTS itinerary JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS inclusions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_destination_id UUID;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 124 completed: tour tables schema fixed';
  RAISE NOTICE '  tour_categories: Added category_code, is_active, sort_order';
  RAISE NOTICE '  tour_templates: Added tour_type, cities_covered, destinations_covered,';
  RAISE NOTICE '                  best_for, physical_level, age_suitability, pickup_required,';
  RAISE NOTICE '                  accommodation_nights, meals_included, image_url, gallery_urls,';
  RAISE NOTICE '                  is_featured, popularity_score, default_transportation_service,';
  RAISE NOTICE '                  transportation_city, itinerary, inclusions, exclusions';
END $$;
