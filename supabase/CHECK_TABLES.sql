-- =====================================================================
-- Quick Check: Which tables exist?
-- =====================================================================

-- Check if required tables exist
SELECT
  'Required Tables Check' as check_type,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants' AND table_schema = 'public')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 001_phase1_core_tables.sql'
  END as tenants_table,

  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_members' AND table_schema = 'public')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 002_phase1b_multi_tenancy.sql'
  END as tenant_members_table,

  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_features' AND table_schema = 'public')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 002_phase1b_multi_tenancy.sql'
  END as tenant_features_table,

  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles' AND table_schema = 'public')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 000_foundation_tables.sql'
  END as user_profiles_table;
