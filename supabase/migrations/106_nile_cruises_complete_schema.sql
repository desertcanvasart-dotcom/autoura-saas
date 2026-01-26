-- =====================================================================
-- Migration 106: Complete nile_cruises Table Schema
-- Description: Adds all missing columns to nile_cruises table to match
--              the cruise rates form requirements
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. BASIC IDENTIFICATION COLUMNS
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS cruise_code VARCHAR(50);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS ship_name VARCHAR(255);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS ship_category VARCHAR(50) DEFAULT 'deluxe';
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS route_name VARCHAR(255);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS embark_city VARCHAR(100) DEFAULT 'Luxor';
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS disembark_city VARCHAR(100) DEFAULT 'Aswan';
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS duration_nights JSONB DEFAULT '[4]'::jsonb;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS cabin_type VARCHAR(50) DEFAULT 'standard';

-- =====================================================================
-- 2. SERVICE TIER & PREFERENCES
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard';
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT false;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================================
-- 3. LEGACY RATES (for backward compatibility)
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_single_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_double_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_triple_eur DECIMAL(10,2);

-- =====================================================================
-- 4. PPD MODEL - LOW SEASON
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS ppd_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS ppd_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS single_supplement_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS single_supplement_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS triple_reduction_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS triple_reduction_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS low_season_start DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS low_season_end DATE;

-- =====================================================================
-- 5. PPD MODEL - HIGH SEASON
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_ppd_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_ppd_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_single_supplement_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_single_supplement_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_triple_reduction_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_triple_reduction_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_start DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS high_season_end DATE;

-- =====================================================================
-- 6. PPD MODEL - PEAK SEASON
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_ppd_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_ppd_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_single_supplement_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_single_supplement_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_triple_reduction_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_triple_reduction_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_1_start DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_1_end DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_2_start DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS peak_season_2_end DATE;

-- =====================================================================
-- 7. RATE VALIDITY
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_valid_from DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_valid_to DATE;

-- =====================================================================
-- 8. ADDITIONAL INFO
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS meals_included VARCHAR(50) DEFAULT 'full_board';
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS sightseeing_included BOOLEAN DEFAULT false;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS supplements JSONB DEFAULT '[]'::jsonb;

-- =====================================================================
-- 9. SUPPLIER RELATIONSHIP
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- Add foreign key if suppliers table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nile_cruises_supplier_id_fkey'
    AND table_name = 'nile_cruises'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
      ALTER TABLE nile_cruises
        ADD CONSTRAINT nile_cruises_supplier_id_fkey
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
        ON DELETE SET NULL;
      RAISE NOTICE '✅ Added foreign key constraint nile_cruises_supplier_id_fkey';
    END IF;
  END IF;
END $$;

-- =====================================================================
-- 10. TIMESTAMPS
-- =====================================================================

ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 11. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_nile_cruises_supplier_id ON nile_cruises(supplier_id);
CREATE INDEX IF NOT EXISTS idx_nile_cruises_cruise_code ON nile_cruises(cruise_code);
CREATE INDEX IF NOT EXISTS idx_nile_cruises_ship_name ON nile_cruises(ship_name);
CREATE INDEX IF NOT EXISTS idx_nile_cruises_tier ON nile_cruises(tier);
CREATE INDEX IF NOT EXISTS idx_nile_cruises_is_active ON nile_cruises(is_active);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'nile_cruises';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 106 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'nile_cruises table now has % columns', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - Basic: cruise_code, ship_name, ship_category, route_name';
  RAISE NOTICE '  - Route: embark_city, disembark_city, duration_nights, cabin_type';
  RAISE NOTICE '  - Tier: tier, is_preferred, is_active';
  RAISE NOTICE '  - Legacy rates: rate_single_eur, rate_double_eur, rate_triple_eur';
  RAISE NOTICE '  - PPD Low: ppd_eur, single_supplement_eur, triple_reduction_eur';
  RAISE NOTICE '  - PPD High: high_season_ppd_eur, etc.';
  RAISE NOTICE '  - PPD Peak: peak_season_ppd_eur, etc.';
  RAISE NOTICE '  - Season dates: low/high/peak_season_start/end';
  RAISE NOTICE '  - Validity: rate_valid_from, rate_valid_to';
  RAISE NOTICE '  - Info: meals_included, sightseeing_included, description, notes';
  RAISE NOTICE '  - Supplier: supplier_id (with FK to suppliers)';
  RAISE NOTICE '';
END $$;
