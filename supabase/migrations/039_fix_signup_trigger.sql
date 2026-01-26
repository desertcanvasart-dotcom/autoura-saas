-- =====================================================================
-- Migration: Fix signup trigger to handle all columns
-- Description: Update handle_new_user_signup to include new columns
-- =====================================================================

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

  -- Create a new tenant with all fields from migration 037
  INSERT INTO tenants (
    company_name,
    contact_email,
    business_type,
    default_currency,
    services_offered
  ) VALUES (
    v_company_name,
    NEW.email,
    'b2c_and_b2b',
    'EUR',
    '["tours", "day-trips", "packages"]'::jsonb
  )
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
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = NOW();

  -- Create default tenant features with all columns including new ones from migrations 037 and 038
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
    true,   -- b2c_enabled
    true,   -- b2b_enabled
    true,   -- whatsapp_integration
    true,   -- email_integration
    true,   -- pdf_generation
    true,   -- analytics_enabled
    10,     -- max_users (starter plan)
    100,    -- max_quotes_per_month
    50,     -- max_partners
    '#2d3b2d',  -- primary_color (app brand)
    '#263A29',  -- secondary_color
    '{}'::jsonb,  -- custom_settings
    false,  -- onboarding_completed (migration 037)
    0       -- onboarding_step (migration 037)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    RAISE WARNING 'Error in handle_new_user_signup: %', SQLERRM;
    -- Re-raise the error so Supabase returns it to the client
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to use the updated function
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
  RAISE NOTICE 'Signup Trigger Fix Migration Complete!';
  RAISE NOTICE '✅ Updated: handle_new_user_signup() function';
  RAISE NOTICE '✅ Includes: onboarding_completed and onboarding_step columns';
  RAISE NOTICE '✅ Added: Error handling with ON CONFLICT for user_profiles';
  RAISE NOTICE '✅ Added: Better error logging';
END $$;
