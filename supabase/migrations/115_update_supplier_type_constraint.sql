-- =====================================================================
-- Migration 115: Update supplier_type check constraint
-- Description: Adds missing supplier types to the check constraint
-- Date: 2026-01-25
-- =====================================================================

-- =====================================================================
-- 1. DROP EXISTING CONSTRAINT
-- =====================================================================

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;

-- =====================================================================
-- 2. ADD UPDATED CONSTRAINT WITH ALL TYPES
-- =====================================================================

ALTER TABLE suppliers ADD CONSTRAINT suppliers_supplier_type_check
  CHECK (supplier_type IN (
    'hotel',
    'transport',
    'transport_company',
    'driver',
    'guide',
    'restaurant',
    'cruise',
    'airline',
    'activity',
    'activity_provider',
    'attraction',
    'tour_operator',
    'ground_handler',
    'shop',
    'other'
  ));

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 115 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated supplier_type check constraint to include:';
  RAISE NOTICE '  - hotel';
  RAISE NOTICE '  - transport, transport_company, driver';
  RAISE NOTICE '  - guide';
  RAISE NOTICE '  - restaurant';
  RAISE NOTICE '  - cruise';
  RAISE NOTICE '  - airline';
  RAISE NOTICE '  - activity, activity_provider';
  RAISE NOTICE '  - attraction';
  RAISE NOTICE '  - tour_operator';
  RAISE NOTICE '  - ground_handler';
  RAISE NOTICE '  - shop';
  RAISE NOTICE '  - other';
  RAISE NOTICE '';
END $$;
