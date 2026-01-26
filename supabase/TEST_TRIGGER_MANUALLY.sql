-- =====================================================================
-- Test the signup process step-by-step manually
-- This will show exactly which step fails
-- =====================================================================

DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
  test_email VARCHAR := 'manual-test-' || floor(random() * 10000)::text || '@example.com';
  v_tenant_id UUID;
  v_company_name VARCHAR := 'Manual Test Company';
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MANUAL SIGNUP SIMULATION';
  RAISE NOTICE 'Email: %', test_email;
  RAISE NOTICE 'User ID: %', test_user_id;
  RAISE NOTICE '========================================';

  -- Step 1: Insert tenant
  BEGIN
    RAISE NOTICE '[1/4] Inserting tenant...';
    INSERT INTO tenants (company_name, contact_email, business_type)
    VALUES (v_company_name, test_email, 'b2c_and_b2b')
    RETURNING id INTO v_tenant_id;
    RAISE NOTICE '✅ Tenant created: %', v_tenant_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ FAILED at tenant creation';
      RAISE NOTICE 'Error: %', SQLERRM;
      RAISE EXCEPTION 'Stopped';
  END;

  -- Step 2: Insert tenant_members
  BEGIN
    RAISE NOTICE '[2/4] Inserting tenant member...';
    INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant_id, test_user_id, 'owner', 'active', NOW());
    RAISE NOTICE '✅ Tenant member created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ FAILED at tenant_members creation';
      RAISE NOTICE 'Error: %', SQLERRM;
      RAISE EXCEPTION 'Stopped';
  END;

  -- Step 3: Insert user_profiles
  BEGIN
    RAISE NOTICE '[3/4] Inserting user profile...';
    INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
    VALUES (test_user_id, test_email, 'Test User', v_company_name, true);
    RAISE NOTICE '✅ User profile created';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ FAILED at user_profiles creation';
      RAISE NOTICE 'Error: %', SQLERRM;
      RAISE EXCEPTION 'Stopped';
  END;

  -- Step 4: Insert tenant_features
  BEGIN
    RAISE NOTICE '[4/4] Inserting tenant features...';
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
      RAISE NOTICE '✅ Tenant features created (with onboarding columns)';
    EXCEPTION
      WHEN undefined_column THEN
        RAISE NOTICE 'Onboarding columns not found, trying without...';
        INSERT INTO tenant_features (
          tenant_id, b2c_enabled, b2b_enabled,
          whatsapp_integration, email_integration, pdf_generation,
          analytics_enabled, max_users, max_quotes_per_month,
          max_partners, primary_color, secondary_color, custom_settings
        ) VALUES (
          v_tenant_id, true, true, true, true, true, true,
          10, 100, 50, '#2d3b2d', '#263A29', '{}'::jsonb
        );
        RAISE NOTICE '✅ Tenant features created (without onboarding columns)';
    END;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ FAILED at tenant_features creation';
      RAISE NOTICE 'Error: %', SQLERRM;
      RAISE EXCEPTION 'Stopped';
  END;

  RAISE NOTICE '========================================';
  RAISE NOTICE '✅✅✅ ALL STEPS PASSED!';
  RAISE NOTICE 'The database inserts work correctly.';
  RAISE NOTICE 'The issue must be with how the trigger is called.';
  RAISE NOTICE '========================================';

  -- Cleanup
  DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
  DELETE FROM user_profiles WHERE id = test_user_id;
  DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  RAISE NOTICE 'Test data cleaned up.';

EXCEPTION
  WHEN OTHERS THEN
    -- Cleanup on failure
    IF v_tenant_id IS NOT NULL THEN
      DELETE FROM tenant_features WHERE tenant_id = v_tenant_id;
      DELETE FROM user_profiles WHERE id = test_user_id;
      DELETE FROM tenant_members WHERE tenant_id = v_tenant_id;
      DELETE FROM tenants WHERE id = v_tenant_id;
    END IF;
END $$;
