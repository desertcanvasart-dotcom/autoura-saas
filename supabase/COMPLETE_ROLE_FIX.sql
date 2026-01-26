-- =====================================================================
-- COMPLETE ROLE FIX
-- Updates both tenant_members and user_profiles roles
-- Also fixes the signup trigger to set correct roles going forward
-- =====================================================================

-- Part 1: Fix YOUR current user's roles
-- =====================================================================

-- Update tenant_members (new system) - make you an owner
UPDATE tenant_members
SET role = 'owner'
WHERE user_id = (
  SELECT id FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1
);

-- Update user_profiles (old system) - make you an admin
UPDATE user_profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1
);

-- Part 2: Fix the signup trigger for FUTURE users
-- =====================================================================

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

  -- 1. Create tenant
  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  -- 2. Create tenant member with 'owner' role (NEW SYSTEM)
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- 3. Create user profile with 'admin' role (OLD SYSTEM)
  INSERT INTO user_profiles (id, email, full_name, company_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_company_name,
    'admin',  -- ← Set admin role for compatibility with old useRole hook
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- 4. Create tenant features (with fallback for missing onboarding columns)
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

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Grant permissions
GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user_signup() TO anon;

-- Part 3: Verify the changes
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================'  ;
  RAISE NOTICE 'ROLE FIX COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '1. Updated your tenant_members.role to "owner"';
  RAISE NOTICE '2. Updated your user_profiles.role to "admin"';
  RAISE NOTICE '3. Fixed signup trigger to set both roles for new users';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Log out and log back in';
  RAISE NOTICE '2. Check your role in the UI';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;

-- Verify current user roles
SELECT
  u.email,
  tm.role as tenant_role,
  up.role as profile_role,
  tm.status,
  CASE
    WHEN tm.role = 'owner' AND up.role = 'admin' THEN '✅ Roles fixed correctly'
    ELSE '⚠️ Roles may need manual adjustment'
  END as status_check
FROM auth.users u
LEFT JOIN tenant_members tm ON tm.user_id = u.id
LEFT JOIN user_profiles up ON up.id = u.id
ORDER BY u.created_at DESC
LIMIT 5;
