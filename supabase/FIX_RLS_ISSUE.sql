-- =====================================================================
-- FIX: Signup trigger with proper RLS bypass
-- This ensures the trigger can insert records regardless of RLS policies
-- =====================================================================

-- Drop and recreate with proper permissions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user_signup();

-- Create function that bypasses RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER
SECURITY DEFINER  -- Run with function owner's permissions, not caller's
SET search_path = public  -- Prevent SQL injection
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  -- Extract company name
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  -- Insert tenant (will bypass RLS due to SECURITY DEFINER)
  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  -- Insert tenant member
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- Insert user profile
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

  -- Insert tenant features (with fallback for missing columns)
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
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO anon;

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE '========================================';

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    RAISE NOTICE '✅ Trigger created successfully';
  ELSE
    RAISE NOTICE '❌ Trigger creation failed';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user_signup') THEN
    RAISE NOTICE '✅ Function created successfully';
  ELSE
    RAISE NOTICE '❌ Function creation failed';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Trigger is now configured with SECURITY DEFINER';
  RAISE NOTICE 'This bypasses RLS policies for signup operations';
  RAISE NOTICE '========================================';
END $$;
