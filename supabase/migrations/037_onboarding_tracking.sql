-- =====================================================================
-- Migration: Onboarding Tracking
-- Description: Add onboarding status tracking to tenant_features
-- Version: 1.0
-- Date: 2026-01-23
-- =====================================================================

-- Add onboarding fields to tenant_features
DO $$
BEGIN
  -- Add onboarding_completed column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_features' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE tenant_features
      ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
  END IF;

  -- Add onboarding_completed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_features' AND column_name = 'onboarding_completed_at'
  ) THEN
    ALTER TABLE tenant_features
      ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
  END IF;

  -- Add onboarding_step column (track current step)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_features' AND column_name = 'onboarding_step'
  ) THEN
    ALTER TABLE tenant_features
      ADD COLUMN onboarding_step INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add business configuration fields to tenants table
DO $$
BEGIN
  -- Add default_currency column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'default_currency'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN default_currency VARCHAR(3) DEFAULT 'EUR';
  END IF;

  -- Add services_offered column (JSONB array)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'services_offered'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN services_offered JSONB DEFAULT '["tours", "day-trips", "packages"]'::jsonb;
  END IF;

  -- Add company_website column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'company_website'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN company_website TEXT;
  END IF;

  -- Add company_phone column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'company_phone'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN company_phone VARCHAR(50);
  END IF;

  -- Add tagline column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'tagline'
  ) THEN
    ALTER TABLE tenants
      ADD COLUMN tagline TEXT;
  END IF;
END $$;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE 'Onboarding Tracking Migration Complete!';
  RAISE NOTICE '✅ Added: onboarding_completed to tenant_features';
  RAISE NOTICE '✅ Added: onboarding_completed_at to tenant_features';
  RAISE NOTICE '✅ Added: onboarding_step to tenant_features';
  RAISE NOTICE '✅ Added: default_currency to tenants';
  RAISE NOTICE '✅ Added: services_offered to tenants';
  RAISE NOTICE '✅ Added: company_website to tenants';
  RAISE NOTICE '✅ Added: company_phone to tenants';
  RAISE NOTICE '✅ Added: tagline to tenants';
END $$;
