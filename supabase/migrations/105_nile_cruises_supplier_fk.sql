-- =====================================================================
-- Migration 105: Add Foreign Key from nile_cruises to suppliers
-- Description: Fixes the relationship between nile_cruises and suppliers
--              so that PostgREST can resolve the join query
-- Date: 2026-01-25
-- =====================================================================

-- First, ensure supplier_id column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nile_cruises' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE nile_cruises ADD COLUMN supplier_id UUID;
    RAISE NOTICE '✅ Added supplier_id column to nile_cruises';
  ELSE
    RAISE NOTICE 'ℹ️ supplier_id column already exists in nile_cruises';
  END IF;
END $$;

-- Add foreign key constraint to suppliers table
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nile_cruises_supplier_id_fkey'
    AND table_name = 'nile_cruises'
  ) THEN
    -- Check if suppliers table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
      ALTER TABLE nile_cruises
        ADD CONSTRAINT nile_cruises_supplier_id_fkey
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
        ON DELETE SET NULL;
      RAISE NOTICE '✅ Added foreign key constraint nile_cruises_supplier_id_fkey';
    ELSE
      RAISE NOTICE '⚠️ suppliers table does not exist - skipping FK constraint';
    END IF;
  ELSE
    RAISE NOTICE 'ℹ️ Foreign key constraint nile_cruises_supplier_id_fkey already exists';
  END IF;
END $$;

-- Create index on supplier_id for better join performance
CREATE INDEX IF NOT EXISTS idx_nile_cruises_supplier_id ON nile_cruises(supplier_id);

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
DECLARE
  fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nile_cruises_supplier_id_fkey'
    AND table_name = 'nile_cruises'
  ) INTO fk_exists;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 105 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  IF fk_exists THEN
    RAISE NOTICE '✅ Foreign key nile_cruises.supplier_id -> suppliers.id is now active';
    RAISE NOTICE '✅ PostgREST can now resolve: supplier:supplier_id(id, name)';
  ELSE
    RAISE NOTICE '⚠️ Foreign key was not created - check if suppliers table exists';
  END IF;
  RAISE NOTICE '';
END $$;
