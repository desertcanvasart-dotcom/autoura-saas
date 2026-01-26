-- =====================================================================
-- Migration: Enhanced Error Logging for Signup
-- Description: Add step-by-step logging to identify exact failure point
-- =====================================================================

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  RAISE NOTICE '[SIGNUP] Starting signup for user: %', NEW.email;

  -- Step 1: Extract company name
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );
  RAISE NOTICE '[SIGNUP] Company name: %', v_company_name;

  -- Step 2: Create tenant
  BEGIN
    INSERT INTO tenants (company_name, contact_email, business_type)
    VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
    RETURNING id INTO v_tenant_id;
    RAISE NOTICE '[SIGNUP] ✓ Created tenant with ID: %', v_tenant_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[SIGNUP] ✗ Failed to create tenant: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      RAISE;
  END;

  -- Step 3: Add to tenant_members
  BEGIN
    INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());
    RAISE NOTICE '[SIGNUP] ✓ Created tenant member';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[SIGNUP] ✗ Failed to create tenant_members: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      RAISE;
  END;

  -- Step 4: Create user profile
  BEGIN
    INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      company_name = EXCLUDED.company_name,
      updated_at = NOW();
    RAISE NOTICE '[SIGNUP] ✓ Created user profile';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[SIGNUP] ✗ Failed to create user_profiles: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      RAISE;
  END;

  -- Step 5: Create tenant_features (with all columns)
  BEGIN
    -- Try with all columns including optional ones
    INSERT INTO tenant_features (
      tenant_id,
      b2c_enabled,
      b2b_enabled,
      whatsapp_integration,
      email_integration,
      pdf_generation,
      analytics_enabled,
      max_users,
      max_quotes_per_month,
      max_partners,
      primary_color,
      secondary_color,
      custom_settings,
      onboarding_completed,
      onboarding_step
    ) VALUES (
      v_tenant_id,
      true, true, true, true, true, true,
      10, 100, 50,
      '#2d3b2d', '#263A29', '{}'::jsonb,
      false, 0
    );
    RAISE NOTICE '[SIGNUP] ✓ Created tenant_features (with onboarding columns)';
  EXCEPTION
    WHEN undefined_column THEN
      -- Onboarding columns don't exist, try without them
      RAISE NOTICE '[SIGNUP] ! Onboarding columns not found, trying without them';
      BEGIN
        INSERT INTO tenant_features (
          tenant_id,
          b2c_enabled,
          b2b_enabled,
          whatsapp_integration,
          email_integration,
          pdf_generation,
          analytics_enabled,
          max_users,
          max_quotes_per_month,
          max_partners,
          primary_color,
          secondary_color,
          custom_settings
        ) VALUES (
          v_tenant_id,
          true, true, true, true, true, true,
          10, 100, 50,
          '#2d3b2d', '#263A29', '{}'::jsonb
        );
        RAISE NOTICE '[SIGNUP] ✓ Created tenant_features (without onboarding columns)';
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[SIGNUP] ✗ Failed to create tenant_features (fallback): % (SQLSTATE: %)', SQLERRM, SQLSTATE;
          RAISE;
      END;
    WHEN OTHERS THEN
      RAISE WARNING '[SIGNUP] ✗ Failed to create tenant_features: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      RAISE;
  END;

  RAISE NOTICE '[SIGNUP] ✓✓✓ Signup completed successfully for user: %', NEW.email;
  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[SIGNUP] ✗✗✗ SIGNUP FAILED for user %: %', NEW.email, SQLERRM;
    RAISE WARNING '[SIGNUP] Error state: %', SQLSTATE;
    RAISE WARNING '[SIGNUP] Tenant ID (if created): %', v_tenant_id;
    -- Re-raise the error
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ENHANCED ERROR LOGGING ENABLED ===';
  RAISE NOTICE '✅ Function now logs each step';
  RAISE NOTICE '✅ Errors will show exactly where signup fails';
  RAISE NOTICE '✅ Check Postgres logs after signup attempt';
  RAISE NOTICE '';
  RAISE NOTICE 'To view logs: Supabase Dashboard → Logs → Postgres Logs';
END $$;
