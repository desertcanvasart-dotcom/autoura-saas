-- =====================================================================
-- Migration 103: PPD (Per Person Double) Pricing Model
-- Description: Implements industry-standard hotel pricing with PPD base
--              and dynamic supplements system
-- Version: 1.0
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- PPD PRICING MODEL EXPLAINED:
--
-- Hotels provide rates as:
-- - PPD (Per Person Double): Base rate per person sharing a double room
-- - Single Supplement: Added to PPD for single occupancy
-- - Triple Reduction: Subtracted from PPD for triple occupancy
--
-- Room calculations:
-- - Single Room = PPD + Single Supplement
-- - Double Room = PPD × 2
-- - Triple Room = (PPD - Triple Reduction) × 3
--
-- Example with PPD=$100, Single Supp=$75, Triple Red=$20:
-- - Single = $100 + $75 = $175
-- - Double = $100 × 2 = $200
-- - Triple = ($100 - $20) × 3 = $240
-- =====================================================================

-- =====================================================================
-- 1. ADD PPD PRICING COLUMNS TO ACCOMMODATION_RATES
-- =====================================================================

-- Low Season PPD rates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'ppd_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN ppd_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added ppd_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'ppd_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN ppd_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added ppd_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'single_supplement_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN single_supplement_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added single_supplement_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'single_supplement_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN single_supplement_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added single_supplement_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'triple_reduction_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN triple_reduction_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added triple_reduction_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'triple_reduction_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN triple_reduction_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added triple_reduction_non_eur column';
  END IF;
END $$;

-- =====================================================================
-- 2. ADD HIGH SEASON PPD COLUMNS
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_ppd_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_ppd_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_ppd_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_ppd_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_ppd_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_ppd_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_single_supplement_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_single_supplement_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_single_supplement_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_single_supplement_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_single_supplement_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_single_supplement_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_triple_reduction_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_triple_reduction_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_triple_reduction_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_triple_reduction_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN high_season_triple_reduction_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added high_season_triple_reduction_non_eur column';
  END IF;
END $$;

-- =====================================================================
-- 3. ADD PEAK SEASON PPD COLUMNS
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_ppd_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_ppd_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_ppd_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_ppd_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_ppd_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_ppd_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_single_supplement_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_single_supplement_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_single_supplement_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_single_supplement_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_single_supplement_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_single_supplement_non_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_triple_reduction_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_triple_reduction_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_triple_reduction_eur column';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_triple_reduction_non_eur'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN peak_season_triple_reduction_non_eur DECIMAL(10,2);
    RAISE NOTICE '✅ Added peak_season_triple_reduction_non_eur column';
  END IF;
END $$;

-- =====================================================================
-- 4. ADD SUPPLEMENTS JSONB COLUMN
-- =====================================================================
-- Supplements are stored as JSONB array with structure:
-- [
--   {
--     "type": "view_nile" | "view_sea" | "view_pyramid" | "view_garden" | "view_pool" |
--             "upper_floor" | "half_board" | "full_board" | "all_inclusive" | "ultra_all_inclusive",
--     "name": "Nile View",
--     "low_season": { "eur": 25, "non_eur": 30 },
--     "high_season": { "eur": 35, "non_eur": 40 },
--     "peak_season": { "eur": 45, "non_eur": 50 }
--   }
-- ]

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'supplements'
  ) THEN
    ALTER TABLE accommodation_rates ADD COLUMN supplements JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE '✅ Added supplements JSONB column';
  END IF;
END $$;

-- =====================================================================
-- 5. MIGRATE EXISTING DATA (Convert room rates to PPD)
-- =====================================================================
-- For existing records, derive PPD from double room rate
-- Only runs if the legacy columns exist (double_rate_eur, etc.)

DO $$
BEGIN
  -- Check if double_rate_eur column exists before migrating low season
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'double_rate_eur'
  ) THEN
    UPDATE accommodation_rates
    SET
      ppd_eur = COALESCE(double_rate_eur / 2, 0),
      ppd_non_eur = COALESCE(double_rate_non_eur / 2, 0),
      single_supplement_eur = GREATEST(0, COALESCE(single_rate_eur, 0) - COALESCE(double_rate_eur / 2, 0)),
      single_supplement_non_eur = GREATEST(0, COALESCE(single_rate_non_eur, 0) - COALESCE(double_rate_non_eur / 2, 0)),
      triple_reduction_eur = GREATEST(0, COALESCE(double_rate_eur / 2, 0) - COALESCE(triple_rate_eur / 3, double_rate_eur / 2)),
      triple_reduction_non_eur = GREATEST(0, COALESCE(double_rate_non_eur / 2, 0) - COALESCE(triple_rate_non_eur / 3, double_rate_non_eur / 2))
    WHERE ppd_eur IS NULL AND double_rate_eur IS NOT NULL;
    RAISE NOTICE '✅ Migrated low season rates to PPD model';
  ELSE
    RAISE NOTICE '⚠️ Column double_rate_eur not found - skipping low season data migration';
  END IF;

  -- Check if high_season_double_eur column exists before migrating high season
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'high_season_double_eur'
  ) THEN
    UPDATE accommodation_rates
    SET
      high_season_ppd_eur = COALESCE(high_season_double_eur / 2, 0),
      high_season_ppd_non_eur = COALESCE(high_season_double_non_eur / 2, 0),
      high_season_single_supplement_eur = GREATEST(0, COALESCE(high_season_single_eur, 0) - COALESCE(high_season_double_eur / 2, 0)),
      high_season_single_supplement_non_eur = GREATEST(0, COALESCE(high_season_single_non_eur, 0) - COALESCE(high_season_double_non_eur / 2, 0)),
      high_season_triple_reduction_eur = GREATEST(0, COALESCE(high_season_double_eur / 2, 0) - COALESCE(high_season_triple_eur / 3, high_season_double_eur / 2)),
      high_season_triple_reduction_non_eur = GREATEST(0, COALESCE(high_season_double_non_eur / 2, 0) - COALESCE(high_season_triple_non_eur / 3, high_season_double_non_eur / 2))
    WHERE high_season_ppd_eur IS NULL AND high_season_double_eur IS NOT NULL;
    RAISE NOTICE '✅ Migrated high season rates to PPD model';
  ELSE
    RAISE NOTICE '⚠️ Column high_season_double_eur not found - skipping high season data migration';
  END IF;

  -- Check if peak_season_double_eur column exists before migrating peak season
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accommodation_rates' AND column_name = 'peak_season_double_eur'
  ) THEN
    UPDATE accommodation_rates
    SET
      peak_season_ppd_eur = COALESCE(peak_season_double_eur / 2, 0),
      peak_season_ppd_non_eur = COALESCE(peak_season_double_non_eur / 2, 0),
      peak_season_single_supplement_eur = GREATEST(0, COALESCE(peak_season_single_eur, 0) - COALESCE(peak_season_double_eur / 2, 0)),
      peak_season_single_supplement_non_eur = GREATEST(0, COALESCE(peak_season_single_non_eur, 0) - COALESCE(peak_season_double_non_eur / 2, 0)),
      peak_season_triple_reduction_eur = GREATEST(0, COALESCE(peak_season_double_eur / 2, 0) - COALESCE(peak_season_triple_eur / 3, peak_season_double_eur / 2)),
      peak_season_triple_reduction_non_eur = GREATEST(0, COALESCE(peak_season_double_non_eur / 2, 0) - COALESCE(peak_season_triple_non_eur / 3, peak_season_double_non_eur / 2))
    WHERE peak_season_ppd_eur IS NULL AND peak_season_double_eur IS NOT NULL;
    RAISE NOTICE '✅ Migrated peak season rates to PPD model';
  ELSE
    RAISE NOTICE '⚠️ Column peak_season_double_eur not found - skipping peak season data migration';
  END IF;
END $$;

-- =====================================================================
-- 6. ADD SAME COLUMNS TO NILE_CRUISES TABLE
-- =====================================================================

-- Low Season PPD for cruises
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nile_cruises') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'ppd_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN ppd_eur DECIMAL(10,2);
      RAISE NOTICE '✅ Added ppd_eur to nile_cruises';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'ppd_non_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN ppd_non_eur DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'single_supplement_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN single_supplement_eur DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'single_supplement_non_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN single_supplement_non_eur DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'triple_reduction_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN triple_reduction_eur DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'triple_reduction_non_eur'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN triple_reduction_non_eur DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'supplements'
    ) THEN
      ALTER TABLE nile_cruises ADD COLUMN supplements JSONB DEFAULT '[]'::jsonb;
      RAISE NOTICE '✅ Added supplements to nile_cruises';
    END IF;
  END IF;
END $$;

-- High and Peak season PPD for cruises
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nile_cruises') THEN
    -- High season
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_ppd_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_ppd_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_ppd_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_ppd_non_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_single_supplement_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_single_supplement_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_single_supplement_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_single_supplement_non_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_triple_reduction_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_triple_reduction_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'high_season_triple_reduction_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN high_season_triple_reduction_non_eur DECIMAL(10,2);
    END IF;

    -- Peak season
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_ppd_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_ppd_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_ppd_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_ppd_non_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_single_supplement_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_single_supplement_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_single_supplement_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_single_supplement_non_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_triple_reduction_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_triple_reduction_eur DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nile_cruises' AND column_name = 'peak_season_triple_reduction_non_eur') THEN
      ALTER TABLE nile_cruises ADD COLUMN peak_season_triple_reduction_non_eur DECIMAL(10,2);
    END IF;
  END IF;
END $$;

-- Migrate existing cruise data (only if expected columns exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nile_cruises') THEN
    -- Check for newer column naming (rate_double_eur) first
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'rate_double_eur'
    ) THEN
      UPDATE nile_cruises
      SET
        ppd_eur = COALESCE(rate_double_eur / 2, 0),
        single_supplement_eur = GREATEST(0, COALESCE(rate_single_eur, 0) - COALESCE(rate_double_eur / 2, 0))
      WHERE ppd_eur IS NULL AND rate_double_eur IS NOT NULL;
      RAISE NOTICE '✅ Migrated cruise data to PPD model (from rate_double_eur)';
    -- Check for older column naming (rate_low_season)
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'nile_cruises' AND column_name = 'rate_low_season'
    ) THEN
      -- Older schema: rate_low_season is per cabin, assume 2 people
      UPDATE nile_cruises
      SET
        ppd_eur = COALESCE(rate_low_season / 2, 0)
      WHERE ppd_eur IS NULL AND rate_low_season IS NOT NULL;
      RAISE NOTICE '✅ Migrated cruise data to PPD model (from rate_low_season)';
    ELSE
      RAISE NOTICE '⚠️ No known rate columns found in nile_cruises - skipping data migration';
    END IF;
  END IF;
END $$;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'accommodation_rates'
  AND column_name IN ('ppd_eur', 'single_supplement_eur', 'triple_reduction_eur', 'supplements');

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 103 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ PPD Pricing Model columns added: %/4', col_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New columns for accommodation_rates:';
  RAISE NOTICE '  - ppd_eur, ppd_non_eur (Per Person Double base rate)';
  RAISE NOTICE '  - single_supplement_eur/non_eur (Add to PPD for single)';
  RAISE NOTICE '  - triple_reduction_eur/non_eur (Subtract from PPD for triple)';
  RAISE NOTICE '  - supplements (JSONB array for dynamic supplements)';
  RAISE NOTICE '';
  RAISE NOTICE 'Supplement types supported:';
  RAISE NOTICE '  - View: Nile, Sea, Pyramid, Garden, Pool';
  RAISE NOTICE '  - Upper Floor';
  RAISE NOTICE '  - Half Board (HB)';
  RAISE NOTICE '  - Full Board (FB)';
  RAISE NOTICE '  - All Inclusive (AI)';
  RAISE NOTICE '  - Ultra All Inclusive (UAI)';
  RAISE NOTICE '';
  RAISE NOTICE 'Room rate calculations:';
  RAISE NOTICE '  Single = PPD + Single Supplement';
  RAISE NOTICE '  Double = PPD × 2';
  RAISE NOTICE '  Triple = (PPD - Triple Reduction) × 3';
  RAISE NOTICE '';
END $$;
