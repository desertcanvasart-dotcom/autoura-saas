-- =====================================================================
-- Fix: Don't set business_type until user chooses during onboarding
-- =====================================================================

-- Update signup trigger to NOT set business_type
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user_signup();

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  -- 1. Create tenant WITHOUT business_type (user will choose in onboarding)
  INSERT INTO tenants (company_name, contact_email)
  VALUES (v_company_name, NEW.email)
  RETURNING id INTO v_tenant_id;

  -- 2. Create tenant member with 'owner' role
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- 3. Create user profile with 'admin' role
  INSERT INTO user_profiles (id, email, full_name, company_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_company_name,
    'admin',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- 4. Create tenant features (onboarding NOT completed)
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO anon;

-- Also update your existing tenant to null business_type
UPDATE tenants
SET business_type = NULL
WHERE contact_email = 'islamjp69@gmail.com';

SELECT 'Fixed!' as result;
