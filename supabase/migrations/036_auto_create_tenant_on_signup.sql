-- =====================================================================
-- Migration: Auto-create tenant on user signup
-- =====================================================================
-- When a user signs up, automatically:
-- 1. Create a tenant for them
-- 2. Add them as the owner in tenant_members
-- 3. Create default tenant_features
-- =====================================================================

-- Function to create tenant and membership for new user
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  -- Extract company name from user metadata (or use email domain as fallback)
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  -- Create a new tenant
  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  -- Add user as owner in tenant_members
  INSERT INTO tenant_members (
    tenant_id,
    user_id,
    role,
    status,
    joined_at
  ) VALUES (
    v_tenant_id,
    NEW.id,
    'owner',
    'active',
    NOW()
  );

  -- Create user profile
  INSERT INTO user_profiles (
    id,
    email,
    full_name,
    company_name,
    is_active
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_company_name,
    true
  );

  -- Create default tenant features
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
    true,   -- b2c_enabled
    true,   -- b2b_enabled
    true,   -- whatsapp_integration
    true,   -- email_integration
    true,   -- pdf_generation
    true,   -- analytics_enabled
    10,     -- max_users (starter plan)
    100,    -- max_quotes_per_month
    50,     -- max_partners
    '#647C47',  -- primary_color (app brand)
    '#263A29',  -- secondary_color
    '{}'::jsonb  -- custom_settings
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function after user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- =====================================================================
-- Grant necessary permissions
-- =====================================================================

-- Allow authenticated users to read their own tenant data
GRANT SELECT ON tenants TO authenticated;
GRANT SELECT ON tenant_members TO authenticated;
GRANT SELECT ON tenant_features TO authenticated;

-- Note: INSERT/UPDATE/DELETE still controlled by RLS policies

-- =====================================================================
-- Test the trigger (optional - comment out in production)
-- =====================================================================

-- To test, create a test user via Supabase auth:
-- 1. Sign up with test@example.com
-- 2. Check that tenant, tenant_member, user_profile, and tenant_features were created
-- 3. Verify user is marked as 'owner' in tenant_members

-- =====================================================================
-- Rollback (if needed)
-- =====================================================================

-- To rollback this migration:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS handle_new_user_signup();
