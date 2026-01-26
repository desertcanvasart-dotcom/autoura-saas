-- =====================================================================
-- Migration: Diagnostic and Complete Fix for Signup
-- Description: Check existing columns and create a bulletproof signup trigger
-- =====================================================================

-- Step 1: Show current table structure (for debugging)
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '=== CHECKING TENANTS TABLE COLUMNS ===';
  FOR rec IN
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'tenants'
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE 'Column: % | Type: % | Nullable: %', rec.column_name, rec.data_type, rec.is_nullable;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== CHECKING TENANT_FEATURES TABLE COLUMNS ===';
  FOR rec IN
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'tenant_features'
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE 'Column: % | Type: % | Nullable: %', rec.column_name, rec.data_type, rec.is_nullable;
  END LOOP;
END $$;

-- Step 2: Create a dynamic signup function that adapts to available columns
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
  v_has_default_currency BOOLEAN;
  v_has_services_offered BOOLEAN;
  v_has_onboarding_completed BOOLEAN;
  v_has_onboarding_step BOOLEAN;
BEGIN
  -- Extract company name from user metadata
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  -- Check which columns exist in tenants table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'default_currency'
  ) INTO v_has_default_currency;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'services_offered'
  ) INTO v_has_services_offered;

  -- Insert tenant with only guaranteed columns first
  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  -- Update with optional columns if they exist
  IF v_has_default_currency THEN
    EXECUTE format('UPDATE tenants SET default_currency = %L WHERE id = %L', 'EUR', v_tenant_id);
  END IF;

  IF v_has_services_offered THEN
    EXECUTE format('UPDATE tenants SET services_offered = %L WHERE id = %L',
      '["tours", "day-trips", "packages"]'::jsonb, v_tenant_id);
  END IF;

  -- Add user as owner in tenant_members
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- Create user profile (with conflict handling)
  INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_company_name,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = NOW();

  -- Check which columns exist in tenant_features
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_features' AND column_name = 'onboarding_completed'
  ) INTO v_has_onboarding_completed;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_features' AND column_name = 'onboarding_step'
  ) INTO v_has_onboarding_step;

  -- Insert tenant_features with base columns
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

  -- Update with optional columns if they exist
  IF v_has_onboarding_completed THEN
    EXECUTE format('UPDATE tenant_features SET onboarding_completed = false WHERE tenant_id = %L', v_tenant_id);
  END IF;

  IF v_has_onboarding_step THEN
    EXECUTE format('UPDATE tenant_features SET onboarding_step = 0 WHERE tenant_id = %L', v_tenant_id);
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Detailed error logging
    RAISE WARNING 'Error in handle_new_user_signup for user %: %', NEW.email, SQLERRM;
    RAISE WARNING 'Error detail: %', SQLSTATE;
    RAISE WARNING 'Tenant ID (if created): %', v_tenant_id;
    -- Re-raise so user sees the error
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Recreate trigger
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
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE '✅ Created dynamic signup trigger';
  RAISE NOTICE '✅ Trigger adapts to available columns';
  RAISE NOTICE '✅ Added detailed error logging';
  RAISE NOTICE '';
  RAISE NOTICE 'Try signing up again. If it still fails, check the logs above';
  RAISE NOTICE 'for missing columns and run migrations 037-038 if needed.';
END $$;
