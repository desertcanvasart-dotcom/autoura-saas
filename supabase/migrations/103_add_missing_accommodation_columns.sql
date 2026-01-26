-- ============================================
-- MIGRATION 103: ADD MISSING ACCOMMODATION_RATES COLUMNS
-- ============================================
-- The original accommodation_rates table (migration 007) was created with
-- basic columns. The hotels API route expects many more columns.
-- This migration adds all missing columns to match the API expectations.
-- Created: 2026-01-25
-- ============================================

-- =====================================================================
-- 0. FIX hotel_name CONSTRAINT (make nullable for API compatibility)
-- =====================================================================
-- The API uses property_name, but original table has hotel_name NOT NULL
-- We need to allow NULL for hotel_name and sync it with property_name

DO $$
BEGIN
  -- Make hotel_name nullable if it exists and has NOT NULL constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates'
    AND column_name = 'hotel_name'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE accommodation_rates ALTER COLUMN hotel_name DROP NOT NULL;
    RAISE NOTICE '✅ Made hotel_name nullable';
  END IF;
END $$;

-- =====================================================================
-- 1. ADD BASIC INFO COLUMNS
-- =====================================================================

-- Add service_code column
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);

-- Add property_name (alias for hotel_name, but API uses this)
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS property_name VARCHAR(255);

-- Sync property_name from hotel_name for existing records
UPDATE accommodation_rates
SET property_name = hotel_name
WHERE property_name IS NULL AND hotel_name IS NOT NULL;

-- Sync hotel_name from property_name for new records that only have property_name
UPDATE accommodation_rates
SET hotel_name = property_name
WHERE hotel_name IS NULL AND property_name IS NOT NULL;

-- Add property_type
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'hotel';

-- Add board_basis
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS board_basis VARCHAR(20) DEFAULT 'BB';

-- Add supplier fields
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);

-- =====================================================================
-- 2. ADD CONTACT FIELDS
-- =====================================================================

ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reservations_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reservations_phone VARCHAR(50);

-- =====================================================================
-- 3. ADD SEASON DATE FIELDS
-- =====================================================================

-- Low Season dates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS low_season_from DATE,
  ADD COLUMN IF NOT EXISTS low_season_to DATE;

-- High Season dates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS high_season_from DATE,
  ADD COLUMN IF NOT EXISTS high_season_to DATE;

-- Peak Season dates (Period 1)
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS peak_season_from DATE,
  ADD COLUMN IF NOT EXISTS peak_season_to DATE;

-- Peak Season dates (Period 2 - optional)
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS peak_season_2_from DATE,
  ADD COLUMN IF NOT EXISTS peak_season_2_to DATE;

-- =====================================================================
-- 4. ADD LOW SEASON RATE FIELDS (EUR and Non-EUR)
-- =====================================================================

-- EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS single_rate_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS double_rate_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triple_rate_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suite_rate_eur DECIMAL(10,2) DEFAULT 0;

-- Non-EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS single_rate_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS double_rate_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triple_rate_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suite_rate_non_eur DECIMAL(10,2) DEFAULT 0;

-- Migrate from legacy columns if they exist
DO $$
BEGIN
  -- Migrate low season single rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_low_season_sgl'
  ) THEN
    UPDATE accommodation_rates
    SET single_rate_eur = COALESCE(rate_low_season_sgl, 0)
    WHERE single_rate_eur = 0 OR single_rate_eur IS NULL;

    UPDATE accommodation_rates
    SET single_rate_non_eur = COALESCE(rate_low_season_sgl, 0)
    WHERE single_rate_non_eur = 0 OR single_rate_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_low_season_sgl to single_rate_eur/non_eur';
  END IF;

  -- Migrate low season double rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_low_season_dbl'
  ) THEN
    UPDATE accommodation_rates
    SET double_rate_eur = COALESCE(rate_low_season_dbl, 0)
    WHERE double_rate_eur = 0 OR double_rate_eur IS NULL;

    UPDATE accommodation_rates
    SET double_rate_non_eur = COALESCE(rate_low_season_dbl, 0)
    WHERE double_rate_non_eur = 0 OR double_rate_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_low_season_dbl to double_rate_eur/non_eur';
  END IF;
END $$;

-- =====================================================================
-- 5. ADD HIGH SEASON RATE FIELDS (EUR and Non-EUR)
-- =====================================================================

-- EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS high_season_single_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_double_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_triple_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_suite_eur DECIMAL(10,2) DEFAULT 0;

-- Non-EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS high_season_single_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_double_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_triple_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_suite_non_eur DECIMAL(10,2) DEFAULT 0;

-- Migrate from legacy columns if they exist
DO $$
BEGIN
  -- Migrate high season single rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_high_season_sgl'
  ) THEN
    UPDATE accommodation_rates
    SET high_season_single_eur = COALESCE(rate_high_season_sgl, 0)
    WHERE high_season_single_eur = 0 OR high_season_single_eur IS NULL;

    UPDATE accommodation_rates
    SET high_season_single_non_eur = COALESCE(rate_high_season_sgl, 0)
    WHERE high_season_single_non_eur = 0 OR high_season_single_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_high_season_sgl to high_season_single_eur/non_eur';
  END IF;

  -- Migrate high season double rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_high_season_dbl'
  ) THEN
    UPDATE accommodation_rates
    SET high_season_double_eur = COALESCE(rate_high_season_dbl, 0)
    WHERE high_season_double_eur = 0 OR high_season_double_eur IS NULL;

    UPDATE accommodation_rates
    SET high_season_double_non_eur = COALESCE(rate_high_season_dbl, 0)
    WHERE high_season_double_non_eur = 0 OR high_season_double_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_high_season_dbl to high_season_double_eur/non_eur';
  END IF;
END $$;

-- =====================================================================
-- 6. ADD PEAK SEASON RATE FIELDS (EUR and Non-EUR)
-- =====================================================================

-- EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS peak_season_single_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_double_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_triple_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_suite_eur DECIMAL(10,2) DEFAULT 0;

-- Non-EUR passport holder rates
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS peak_season_single_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_double_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_triple_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_suite_non_eur DECIMAL(10,2) DEFAULT 0;

-- Migrate from legacy columns if they exist
DO $$
BEGIN
  -- Migrate peak season single rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_peak_season_sgl'
  ) THEN
    UPDATE accommodation_rates
    SET peak_season_single_eur = COALESCE(rate_peak_season_sgl, 0)
    WHERE peak_season_single_eur = 0 OR peak_season_single_eur IS NULL;

    UPDATE accommodation_rates
    SET peak_season_single_non_eur = COALESCE(rate_peak_season_sgl, 0)
    WHERE peak_season_single_non_eur = 0 OR peak_season_single_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_peak_season_sgl to peak_season_single_eur/non_eur';
  END IF;

  -- Migrate peak season double rate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'rate_peak_season_dbl'
  ) THEN
    UPDATE accommodation_rates
    SET peak_season_double_eur = COALESCE(rate_peak_season_dbl, 0)
    WHERE peak_season_double_eur = 0 OR peak_season_double_eur IS NULL;

    UPDATE accommodation_rates
    SET peak_season_double_non_eur = COALESCE(rate_peak_season_dbl, 0)
    WHERE peak_season_double_non_eur = 0 OR peak_season_double_non_eur IS NULL;

    RAISE NOTICE '✅ Migrated rate_peak_season_dbl to peak_season_double_eur/non_eur';
  END IF;
END $$;

-- =====================================================================
-- 7. ADD PPD (PER PERSON DOUBLE) COLUMNS
-- =====================================================================
-- This brings in the PPD model columns that migration 103 was trying to add

-- Low Season PPD
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS ppd_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppd_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS single_supplement_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS single_supplement_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triple_reduction_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triple_reduction_non_eur DECIMAL(10,2) DEFAULT 0;

-- High Season PPD
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS high_season_ppd_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_ppd_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_single_supplement_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_single_supplement_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_triple_reduction_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_season_triple_reduction_non_eur DECIMAL(10,2) DEFAULT 0;

-- Peak Season PPD
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS peak_season_ppd_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_ppd_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_single_supplement_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_single_supplement_non_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_triple_reduction_eur DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_season_triple_reduction_non_eur DECIMAL(10,2) DEFAULT 0;

-- Supplements JSONB column
ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS supplements JSONB DEFAULT '[]'::jsonb;

-- Calculate PPD from double rates if available
UPDATE accommodation_rates
SET
  ppd_eur = COALESCE(double_rate_eur / 2, 0),
  ppd_non_eur = COALESCE(double_rate_non_eur / 2, 0),
  high_season_ppd_eur = COALESCE(high_season_double_eur / 2, 0),
  high_season_ppd_non_eur = COALESCE(high_season_double_non_eur / 2, 0),
  peak_season_ppd_eur = COALESCE(peak_season_double_eur / 2, 0),
  peak_season_ppd_non_eur = COALESCE(peak_season_double_non_eur / 2, 0)
WHERE ppd_eur = 0 OR ppd_eur IS NULL;

-- Calculate single supplement from single vs PPD rates
UPDATE accommodation_rates
SET
  single_supplement_eur = GREATEST(0, COALESCE(single_rate_eur, 0) - COALESCE(ppd_eur, 0)),
  single_supplement_non_eur = GREATEST(0, COALESCE(single_rate_non_eur, 0) - COALESCE(ppd_non_eur, 0)),
  high_season_single_supplement_eur = GREATEST(0, COALESCE(high_season_single_eur, 0) - COALESCE(high_season_ppd_eur, 0)),
  high_season_single_supplement_non_eur = GREATEST(0, COALESCE(high_season_single_non_eur, 0) - COALESCE(high_season_ppd_non_eur, 0)),
  peak_season_single_supplement_eur = GREATEST(0, COALESCE(peak_season_single_eur, 0) - COALESCE(peak_season_ppd_eur, 0)),
  peak_season_single_supplement_non_eur = GREATEST(0, COALESCE(peak_season_single_non_eur, 0) - COALESCE(peak_season_ppd_non_eur, 0))
WHERE single_supplement_eur = 0 OR single_supplement_eur IS NULL;

-- =====================================================================
-- 8. ADD VALIDITY AND OTHER FIELDS
-- =====================================================================

ALTER TABLE accommodation_rates
  ADD COLUMN IF NOT EXISTS rate_valid_from DATE,
  ADD COLUMN IF NOT EXISTS rate_valid_to DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 9. CREATE INDEXES FOR NEW COLUMNS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_accommodation_rates_property_name ON accommodation_rates(property_name);
CREATE INDEX IF NOT EXISTS idx_accommodation_rates_supplier ON accommodation_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_rates_board_basis ON accommodation_rates(board_basis);
CREATE INDEX IF NOT EXISTS idx_accommodation_rates_active ON accommodation_rates(is_active);

-- =====================================================================
-- 10. CREATE UPDATED_AT TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS update_accommodation_rates_updated_at ON accommodation_rates;
CREATE TRIGGER update_accommodation_rates_updated_at
  BEFORE UPDATE ON accommodation_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 11. CREATE SYNC TRIGGER FOR hotel_name <-> property_name
-- =====================================================================
-- Keep hotel_name and property_name in sync for compatibility

CREATE OR REPLACE FUNCTION sync_accommodation_name()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: sync name fields
  IF TG_OP = 'INSERT' THEN
    IF NEW.property_name IS NOT NULL AND NEW.hotel_name IS NULL THEN
      NEW.hotel_name := NEW.property_name;
    ELSIF NEW.hotel_name IS NOT NULL AND NEW.property_name IS NULL THEN
      NEW.property_name := NEW.hotel_name;
    END IF;
  -- On UPDATE: sync if one changed
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.property_name IS DISTINCT FROM OLD.property_name AND NEW.property_name IS NOT NULL THEN
      NEW.hotel_name := NEW.property_name;
    ELSIF NEW.hotel_name IS DISTINCT FROM OLD.hotel_name AND NEW.hotel_name IS NOT NULL THEN
      NEW.property_name := NEW.hotel_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_accommodation_name_trigger ON accommodation_rates;
CREATE TRIGGER sync_accommodation_name_trigger
  BEFORE INSERT OR UPDATE ON accommodation_rates
  FOR EACH ROW
  EXECUTE FUNCTION sync_accommodation_name();

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accommodation_rates';

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration 103 completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'accommodation_rates table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - Made hotel_name nullable (API uses property_name)';
  RAISE NOTICE '  - Added sync trigger: hotel_name <-> property_name';
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - Basic: service_code, property_name, property_type, board_basis';
  RAISE NOTICE '  - Supplier: supplier_id, supplier_name';
  RAISE NOTICE '  - Contacts: contact_name, contact_email, contact_phone, reservations_*';
  RAISE NOTICE '  - Season dates: low/high/peak_season_from/to, peak_season_2_from/to';
  RAISE NOTICE '  - Low season rates: single/double/triple/suite_rate_eur/non_eur';
  RAISE NOTICE '  - High season rates: high_season_*_eur/non_eur';
  RAISE NOTICE '  - Peak season rates: peak_season_*_eur/non_eur';
  RAISE NOTICE '  - PPD columns: ppd_eur, single_supplement_eur, triple_reduction_eur (all seasons)';
  RAISE NOTICE '  - Supplements: supplements (JSONB)';
  RAISE NOTICE '  - Validity: rate_valid_from, rate_valid_to, notes, is_active, updated_at';
  RAISE NOTICE '';
  RAISE NOTICE 'Hotels API should now work correctly!';
END $$;
