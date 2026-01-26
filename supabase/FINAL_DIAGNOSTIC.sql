-- =====================================================================
-- FINAL DIAGNOSTIC - Find Signup Issue
-- Run this in Supabase SQL Editor to see exactly what's wrong
-- =====================================================================

-- Part 1: Check if trigger function exists and get its definition
SELECT
  'Trigger Function' as check_type,
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'handle_new_user_signup';

-- Part 2: Check if trigger is attached to auth.users
SELECT
  'Trigger Status' as check_type,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Part 3: Check which columns exist in tenant_features
SELECT
  'tenant_features columns' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tenant_features'
ORDER BY ordinal_position;

-- Part 4: Check which columns exist in tenants
SELECT
  'tenants columns' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tenants'
ORDER BY ordinal_position;

-- Part 5: Check if tables exist
SELECT
  'Tables Check' as check_type,
  table_name,
  CASE
    WHEN table_name = 'tenants' THEN '✓'
    WHEN table_name = 'tenant_members' THEN '✓'
    WHEN table_name = 'tenant_features' THEN '✓'
    WHEN table_name = 'user_profiles' THEN '✓'
    ELSE ''
  END as exists
FROM information_schema.tables
WHERE table_name IN ('tenants', 'tenant_members', 'tenant_features', 'user_profiles')
  AND table_schema = 'public';

-- Part 6: Manually test the signup process step by step
DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID := gen_random_uuid();
  v_email VARCHAR := 'diagnostic-test@example.com';
  v_company_name VARCHAR := 'Diagnostic Company';
  v_step TEXT := 'Starting';
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MANUAL SIGNUP TEST';
  RAISE NOTICE 'Email: %', v_email;
  RAISE NOTICE '========================================';

  -- Step 1: Create tenant
  v_step := 'Creating tenant';
  RAISE NOTICE 'Step 1: %', v_step;
  BEGIN
    INSERT INTO tenants (company_name, contact_email, business_type)
    VALUES (v_company_name, v_email, 'b2c_and_b2b')
    RETURNING id INTO v_tenant_id;
    RAISE NOTICE '✓ Tenant created: %', v_tenant_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'FAILED at step "%": % (SQLSTATE: %)', v_step, SQLERRM, SQLSTATE;
  END;

  -- Step 2: Create tenant_members
  v_step := 'Creating tenant_members';
  RAISE NOTICE 'Step 2: %', v_step;
  BEGIN
    INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant_id, v_user_id, 'owner', 'active', NOW());
    RAISE NOTICE '✓ Tenant member created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'FAILED at step "%": % (SQLSTATE: %)', v_step, SQLERRM, SQLSTATE;
  END;

  -- Step 3: Create user_profiles
  v_step := 'Creating user_profiles';
  RAISE NOTICE 'Step 3: %', v_step;
  BEGIN
    INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
    VALUES (v_user_id, v_email, 'Test User', v_company_name, true);
    RAISE NOTICE '✓ User profile created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'FAILED at step "%": % (SQLSTATE: %)', v_step, SQLERRM, SQLSTATE;
  END;

  -- Step 4: Create tenant_features (with onboarding columns)
  v_step := 'Creating tenant_features (with onboarding columns)';
  RAISE NOTICE 'Step 4: %', v_step;
  BEGIN
    INSERT INTO tenant_features (
      tenant_id, b2c_enabled, b2b_enabled,
      whatsapp_integration, email_integration, pdf_generation,
      analytics_enabled, max_users, max_quotes_per_month,
      max_partners, primary_color, secondary_color, custom_settings,
      onboarding_completed, onboarding_step
    ) VALUES (
      v_tenant_id, true, true, true, true, true, true,
      10, 100, 50, '#2d3b2d', '#263A29', '{}'::jsonb,
      false, 0
    );
    RAISE NOTICE '✓ Tenant features created (with onboarding columns)';
  EXCEPTION
    WHEN undefined_column THEN
      -- Try without onboarding columns
      v_step := 'Creating tenant_features (without onboarding columns)';
      RAISE NOTICE 'Onboarding columns missing, trying without them...';
      BEGIN
        INSERT INTO tenant_features (
          tenant_id, b2c_enabled, b2b_enabled,
          whatsapp_integration, email_integration, pdf_generation,
          analytics_enabled, max_users, max_quotes_per_month,
          max_partners, primary_color, secondary_color, custom_settings
        ) VALUES (
          v_tenant_id, true, true, true, true, true, true,
          10, 100, 50, '#2d3b2d', '#263A29', '{}'::jsonb
        );
        RAISE NOTICE '✓ Tenant features created (without onboarding columns)';
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'FAILED at step "%": % (SQLSTATE: %)', v_step, SQLERRM, SQLSTATE;
      END;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'FAILED at step "%": % (SQLSTATE: %)', v_step, SQLERRM, SQLSTATE;
  END;

  RAISE NOTICE '========================================';
  RAISE NOTICE '✓✓✓ ALL STEPS PASSED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'The database schema is correct.';
  RAISE NOTICE 'The issue is likely with the trigger not being called.';
  RAISE NOTICE '';

  -- Cleanup
  DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
  DELETE FROM user_profiles WHERE id = v_user_id;
  DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  RAISE NOTICE 'Test data cleaned up.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✗✗✗ TEST FAILED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Error: %', SQLERRM;
    RAISE NOTICE 'SQL State: %', SQLSTATE;
    RAISE NOTICE 'Failed at step: %', v_step;
    RAISE NOTICE '';
    RAISE NOTICE 'This is what''s preventing signup from working!';
    RAISE NOTICE 'Run the missing migration or fix the schema issue above.';
    -- Cleanup even on failure
    IF v_tenant_id IS NOT NULL THEN
      DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
      DELETE FROM user_profiles WHERE id = v_user_id;
      DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
      DELETE FROM tenants WHERE id = v_tenant_id;
    END IF;
END $$;
