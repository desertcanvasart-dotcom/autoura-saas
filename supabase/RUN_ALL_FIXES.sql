-- =====================================================================
-- ALL-IN-ONE FIX: Create signup trigger with all necessary components
-- Run this if the trigger is missing or not working
-- =====================================================================

-- Step 1: Drop existing trigger and function (if any)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user_signup();

-- Step 2: Create the signup function with error handling
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  -- Extract company name from metadata
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  -- Create tenant
  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  -- Create tenant member
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- Create user profile
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

  -- Create tenant features (try with onboarding columns first)
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
  EXCEPTION
    WHEN undefined_column THEN
      -- Fallback: insert without onboarding columns
      INSERT INTO tenant_features (
        tenant_id, b2c_enabled, b2b_enabled,
        whatsapp_integration, email_integration, pdf_generation,
        analytics_enabled, max_users, max_quotes_per_month,
        max_partners, primary_color, secondary_color, custom_settings
      ) VALUES (
        v_tenant_id, true, true, true, true, true, true,
        10, 100, 50, '#2d3b2d', '#263A29', '{}'::jsonb
      );
  END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE WARNING 'Signup failed for %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Step 4: Verify it was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'on_auth_user_created'
  ) THEN
    RAISE NOTICE '✅ Trigger created successfully!';
  ELSE
    RAISE WARNING '❌ Trigger creation failed!';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'handle_new_user_signup'
  ) THEN
    RAISE NOTICE '✅ Function created successfully!';
  ELSE
    RAISE WARNING '❌ Function creation failed!';
  END IF;
END $$;
