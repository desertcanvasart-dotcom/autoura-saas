-- =====================================================================
-- Migration 114: Add missing columns to meal_rates table
-- Description: Adds columns needed by the meal rates API
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. ADD MISSING COLUMNS
-- =====================================================================

-- Service identification
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);

-- Cuisine and restaurant type
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS cuisine_type VARCHAR(100);
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS restaurant_type VARCHAR(100);

-- Season and validity
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS rate_valid_from DATE;
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS rate_valid_to DATE;

-- Supplier reference
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);

-- Meal details
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS meal_category VARCHAR(100);
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS dietary_options JSONB DEFAULT '[]'::jsonb;
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS per_person_rate BOOLEAN DEFAULT true;
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS minimum_pax INTEGER;

-- Additional info
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Timestamps
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 2. ADD INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_meal_rates_service_code ON meal_rates(service_code);
CREATE INDEX IF NOT EXISTS idx_meal_rates_cuisine_type ON meal_rates(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_meal_rates_restaurant_type ON meal_rates(restaurant_type);
CREATE INDEX IF NOT EXISTS idx_meal_rates_supplier_id ON meal_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_meal_rates_is_active ON meal_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_meal_rates_meal_type ON meal_rates(meal_type);
CREATE INDEX IF NOT EXISTS idx_meal_rates_tier ON meal_rates(tier);

-- =====================================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_meal_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_meal_rates_updated_at ON meal_rates;
CREATE TRIGGER trigger_meal_rates_updated_at
  BEFORE UPDATE ON meal_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_rates_updated_at();

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'meal_rates';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 114 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'meal_rates table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - service_code';
  RAISE NOTICE '  - cuisine_type, restaurant_type';
  RAISE NOTICE '  - season, rate_valid_from, rate_valid_to';
  RAISE NOTICE '  - supplier_id, supplier_name';
  RAISE NOTICE '  - meal_category, dietary_options';
  RAISE NOTICE '  - per_person_rate, minimum_pax';
  RAISE NOTICE '  - notes, is_active, updated_at';
  RAISE NOTICE '';
END $$;
