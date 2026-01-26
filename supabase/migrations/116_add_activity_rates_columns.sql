-- =====================================================================
-- Migration 116: Add missing columns to activity_rates table
-- Description: Adds columns needed by the activity rates API
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. ADD MISSING COLUMNS
-- =====================================================================

-- Service identification
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);

-- Activity type and duration
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS activity_type VARCHAR(100);
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS duration VARCHAR(50);

-- Pricing configuration
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(50) DEFAULT 'per_person';
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS unit_label VARCHAR(100);
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS min_capacity INTEGER DEFAULT 1;
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 99;

-- Season and validity
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS rate_valid_from DATE;
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS rate_valid_to DATE;

-- Supplier reference
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);

-- Additional info
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Timestamps
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 2. ADD INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_activity_rates_service_code ON activity_rates(service_code);
CREATE INDEX IF NOT EXISTS idx_activity_rates_activity_type ON activity_rates(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_rates_activity_category ON activity_rates(activity_category);
CREATE INDEX IF NOT EXISTS idx_activity_rates_supplier_id ON activity_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_activity_rates_is_active ON activity_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_activity_rates_pricing_type ON activity_rates(pricing_type);

-- =====================================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_activity_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_activity_rates_updated_at ON activity_rates;
CREATE TRIGGER trigger_activity_rates_updated_at
  BEFORE UPDATE ON activity_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_rates_updated_at();

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'activity_rates';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 116 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'activity_rates table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - service_code';
  RAISE NOTICE '  - activity_type, duration';
  RAISE NOTICE '  - pricing_type, unit_label';
  RAISE NOTICE '  - min_capacity, max_capacity';
  RAISE NOTICE '  - season, rate_valid_from, rate_valid_to';
  RAISE NOTICE '  - supplier_id, supplier_name';
  RAISE NOTICE '  - notes, is_active, updated_at';
  RAISE NOTICE '';
END $$;
