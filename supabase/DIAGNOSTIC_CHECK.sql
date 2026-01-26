-- =====================================================================
-- DIAGNOSTIC: Check Database State Before Fixing Signup
-- Run this in Supabase SQL Editor to see what's configured
-- =====================================================================

-- 1. Check if tenants table has required columns
SELECT
  'tenants' as table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tenants'
ORDER BY ordinal_position;

-- 2. Check if tenant_features table has required columns
SELECT
  'tenant_features' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tenant_features'
ORDER BY ordinal_position;

-- 3. Check if tenant_members table exists
SELECT
  'tenant_members' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'tenant_members'
ORDER BY ordinal_position;

-- 4. Check if user_profiles table exists
SELECT
  'user_profiles' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 5. Check if signup trigger exists
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 6. Check if trigger function exists
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user_signup';

-- =====================================================================
-- EXPECTED RESULTS:
-- =====================================================================
--
-- If you see errors or missing results for any of these queries,
-- you need to run these migrations in order:
--
-- 1. 000_foundation_tables.sql (creates user_profiles)
-- 2. 001_phase1_core_tables.sql (creates tenants)
-- 3. 002_phase1b_multi_tenancy.sql (creates tenant_members, tenant_features)
-- 4. 036_auto_create_tenant_on_signup.sql (creates signup trigger)
-- 5. 037_onboarding_tracking.sql (adds onboarding columns)
-- 6. 038_tenant_logos_storage.sql (adds logo storage)
-- 7. 040_diagnostic_and_fix.sql (fixes the trigger)
--
-- =====================================================================
