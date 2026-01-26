-- =====================================================================
-- MANUAL SIGNUP TEST
-- Run this to test the signup flow step-by-step
-- =====================================================================

-- First, let's simulate the signup process manually to find the issue

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID := gen_random_uuid(); -- Simulate a new user ID
  v_email VARCHAR := 'test-' || floor(random() * 1000)::text || '@example.com';
  v_company_name VARCHAR := 'Test Company';
BEGIN
  RAISE NOTICE '=== TESTING SIGNUP PROCESS ===';
  RAISE NOTICE 'Test user: %', v_email;
  RAISE NOTICE '';

  -- Step 1: Create tenant
  RAISE NOTICE '[1/4] Creating tenant...';
  BEGIN
    INSERT INTO tenants (company_name, contact_email, business_type)
    VALUES (v_company_name, v_email, 'b2c_and_b2b')
    RETURNING id INTO v_tenant_id;
    RAISE NOTICE '  ✓ Tenant created: %', v_tenant_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '  ✗ FAILED: %', SQLERRM;
      RAISE EXCEPTION 'Stopped at tenant creation';
  END;

  -- Step 2: Create tenant member
  RAISE NOTICE '[2/4] Creating tenant member...';
  BEGIN
    INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant_id, v_user_id, 'owner', 'active', NOW());
    RAISE NOTICE '  ✓ Tenant member created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '  ✗ FAILED: %', SQLERRM;
      RAISE EXCEPTION 'Stopped at tenant member creation';
  END;

  -- Step 3: Create user profile
  RAISE NOTICE '[3/4] Creating user profile...';
  BEGIN
    INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
    VALUES (v_user_id, v_email, 'Test User', v_company_name, true);
    RAISE NOTICE '  ✓ User profile created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '  ✗ FAILED: %', SQLERRM;
      RAISE EXCEPTION 'Stopped at user profile creation';
  END;

  -- Step 4: Create tenant features
  RAISE NOTICE '[4/4] Creating tenant features...';
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
    RAISE NOTICE '  ✓ Tenant features created';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE '  ! Onboarding columns not found, trying without them...';
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
        RAISE NOTICE '  ✓ Tenant features created (without onboarding columns)';
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE '  ✗ FAILED (fallback): %', SQLERRM;
          RAISE EXCEPTION 'Stopped at tenant features creation';
      END;
    WHEN OTHERS THEN
      RAISE NOTICE '  ✗ FAILED: %', SQLERRM;
      RAISE EXCEPTION 'Stopped at tenant features creation';
  END;

  RAISE NOTICE '';
  RAISE NOTICE '=== ✓✓✓ ALL STEPS PASSED ===';
  RAISE NOTICE 'The signup flow works! The issue might be:';
  RAISE NOTICE '  1. RLS policies blocking auth.users trigger';
  RAISE NOTICE '  2. Supabase Auth not triggering the function';
  RAISE NOTICE '  3. Function permissions issue';
  RAISE NOTICE '';

  -- Cleanup test data
  DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
  DELETE FROM user_profiles WHERE id = v_user_id;
  DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  RAISE NOTICE 'Test data cleaned up.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '';
    RAISE NOTICE '=== ✗✗✗ TEST FAILED ===';
    RAISE NOTICE 'Error: %', SQLERRM;
    RAISE NOTICE 'This is the issue preventing signup!';
    RAISE NOTICE '';
    -- Cleanup even on failure
    IF v_tenant_id IS NOT NULL THEN
      DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
      DELETE FROM user_profiles WHERE id = v_user_id;
      DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
      DELETE FROM tenants WHERE id = v_tenant_id;
    END IF;
END $$;

-- =====================================================================
-- After running this test, also check RLS policies:
-- =====================================================================

-- Show RLS status for key tables
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('tenants', 'tenant_members', 'tenant_features', 'user_profiles')
ORDER BY tablename;

-- Show existing policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('tenants', 'tenant_members', 'tenant_features', 'user_profiles')
ORDER BY tablename, policyname;
