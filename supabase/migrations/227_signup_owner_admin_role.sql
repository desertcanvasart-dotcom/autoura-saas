-- =====================================================================
-- Migration 227: Signup creator gets admin profile role
-- =====================================================================
-- The app has two role systems: tenant_members.role ('owner' for the
-- signup creator) and user_profiles.role — and the UI/middleware enforce
-- ONLY the latter (hooks/useRole.tsx, Sidebar section filtering,
-- middleware ROUTE_PERMISSIONS). The signup trigger inserted
-- user_profiles without a role, so the column default ('agent') applied:
-- every new tenant OWNER landed with a stripped sidebar (no Operations,
-- Rates, Finance, Settings) and was blocked from /rates, /settings, etc.
--
-- Fix: the trigger now writes role='admin' for the signup creator (they
-- own the tenant they just created). The ON CONFLICT branch deliberately
-- does NOT touch role, so a pre-existing profile (e.g. created by an
-- invite flow) keeps whatever role it was given.
--
-- Backfill: existing tenant owners stuck as 'agent' are promoted.
--
-- Body otherwise identical to migration 041 (incl. step logging and the
-- undefined_column fallback for tenant_features).
--
-- NOTE (future refactor, out of scope here): ideally ONE role system —
-- either useRole reads tenant_members.role, or profiles are the single
-- source of truth and memberships stop carrying a role.
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

  -- Step 4: Create user profile — role='admin': the signup creator owns
  -- the tenant; the 'agent' column default crippled their sidebar/routes.
  BEGIN
    INSERT INTO user_profiles (id, email, full_name, company_name, is_active, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true, 'admin')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      company_name = EXCLUDED.company_name,
      updated_at = NOW();
    RAISE NOTICE '[SIGNUP] ✓ Created user profile (role=admin)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[SIGNUP] ✗ Failed to create user_profiles: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      RAISE;
  END;

  -- Step 5: Create tenant_features (with all columns)
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
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger unchanged; recreate defensively in case it was dropped.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- =====================================================================
-- Backfill: promote existing tenant OWNERS whose profile is still the
-- 'agent' default. Touches only owner+agent combinations — invited
-- members with deliberate roles are untouched.
-- =====================================================================
UPDATE user_profiles p
SET role = 'admin', updated_at = NOW()
FROM tenant_members m
WHERE m.user_id = p.id
  AND m.role = 'owner'
  AND p.role = 'agent';
