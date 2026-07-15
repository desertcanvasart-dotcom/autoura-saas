-- =====================================================================
-- Migration 228: Pin search_path in the signup trigger (fixes signups)
-- =====================================================================
-- Migration 227 recreated handle_new_user_signup verbatim from 041 —
-- which is SECURITY DEFINER WITHOUT a pinned search_path. Such a
-- function inherits the CALLER's search_path: fine from the SQL editor
-- (public), broken from GoTrue's session (no public), where every
-- unqualified table reference fails to resolve -> "Database error
-- saving new user" on every signup. Production had evidently been
-- running a drifted/corrected version; re-applying the repo's text
-- reintroduced the latent bug. Symptom observed live 2026-07-15;
-- restored within minutes by applying this definition.
--
-- Fix: SET search_path = public on the function. Body also simplified:
-- the per-step BEGIN/EXCEPTION logging blocks were 041-era debugging,
-- and the undefined_column fallback guarded onboarding columns that
-- provably exist. Keeps 227's actual change (role='admin' for the
-- signup creator; ON CONFLICT deliberately leaves role untouched).
--
-- ALREADY APPLIED to production by hand on 2026-07-15 — this file is
-- the canonical record. Idempotent (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_company_name VARCHAR(255);
BEGIN
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Company'
  );

  INSERT INTO tenants (company_name, contact_email, business_type)
  VALUES (v_company_name, NEW.email, 'b2c_and_b2b')
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- role='admin': the signup creator owns the tenant they just created;
  -- the 'agent' column default crippled their sidebar/routes (see 227).
  INSERT INTO user_profiles (id, email, full_name, company_name, is_active, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = NOW();

  INSERT INTO tenant_features (
    tenant_id, b2c_enabled, b2b_enabled, whatsapp_integration, email_integration,
    pdf_generation, analytics_enabled, max_users, max_quotes_per_month, max_partners,
    primary_color, secondary_color, custom_settings, onboarding_completed, onboarding_step
  ) VALUES (
    v_tenant_id, true, true, true, true, true, true,
    10, 100, 50, '#2d3b2d', '#263A29', '{}'::jsonb, false, 0
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[SIGNUP] FAILED for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
