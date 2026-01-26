-- =====================================================================
-- Migration 117: Add missing columns to guide_rates table
-- Description: Adds columns needed by the guide rates API
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. ADD MISSING COLUMNS
-- =====================================================================

-- Service identification
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);

-- Guide details
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS guide_language VARCHAR(50);
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS tour_duration VARCHAR(50);

-- Pricing - new format (base_rate_eur instead of half_day_rate/full_day_rate)
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS base_rate_eur DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS base_rate_non_eur DECIMAL(10, 2) DEFAULT 0;

-- Season and validity
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS rate_valid_from DATE;
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS rate_valid_to DATE;

-- Supplier reference
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Additional info
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Timestamps
ALTER TABLE guide_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 2. ADD INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_guide_rates_service_code ON guide_rates(service_code);
CREATE INDEX IF NOT EXISTS idx_guide_rates_guide_language ON guide_rates(guide_language);
CREATE INDEX IF NOT EXISTS idx_guide_rates_guide_type ON guide_rates(guide_type);
CREATE INDEX IF NOT EXISTS idx_guide_rates_tour_duration ON guide_rates(tour_duration);
CREATE INDEX IF NOT EXISTS idx_guide_rates_supplier_id ON guide_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_guide_rates_is_active ON guide_rates(is_active);

-- =====================================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_guide_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guide_rates_updated_at ON guide_rates;
CREATE TRIGGER trigger_guide_rates_updated_at
  BEFORE UPDATE ON guide_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_guide_rates_updated_at();

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'guide_rates';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 117 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'guide_rates table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - service_code';
  RAISE NOTICE '  - guide_language, tour_duration';
  RAISE NOTICE '  - base_rate_eur, base_rate_non_eur';
  RAISE NOTICE '  - season, rate_valid_from, rate_valid_to';
  RAISE NOTICE '  - supplier_id';
  RAISE NOTICE '  - notes, is_active, updated_at';
  RAISE NOTICE '';
END $$;
