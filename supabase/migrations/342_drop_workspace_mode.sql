-- ============================================================================
-- 342 — Drop the per-tenant workspace preference: everyone sees everything
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
-- Running code must not query a column that no longer exists (the 240 rule).
--
-- Business model has never been a paid feature (239, pricing-config). What
-- remained was tenants.workspace_mode — a per-tenant choice, made in
-- onboarding and in Organization settings, to hide the B2C or the B2B side
-- of the sidebar. The decision on 2026-09-06: no such switch at all. Every
-- tenant, on every plan, sees the whole product. The onboarding question,
-- the settings field, the sidebar gate and the eight page guards are gone
-- in the same PR as this file; this drops the column they read.
--
-- The signup trigger (last defined in 262) set the column explicitly, so it
-- is redefined first without it — otherwise the DROP would break signup the
-- way 240 once did. Only that INSERT changes; the rest of the function is
-- 262's text verbatim.
--
-- No CASCADE: if something still depends on the column, fail loudly.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

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

  INSERT INTO tenants (company_name, contact_email)
  VALUES (v_company_name, NEW.email)
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- role='admin': the signup creator owns the tenant they just created (227).
  INSERT INTO user_profiles (id, email, full_name, company_name, is_active, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = NOW();

  INSERT INTO tenant_features (
    tenant_id, whatsapp_integration, email_integration,
    pdf_generation, analytics_enabled,
    primary_color, secondary_color, custom_settings,
    onboarding_completed, onboarding_step
  ) VALUES (
    v_tenant_id, true, true, true, true,
    '#2d3b2d', '#263A29', '{}'::jsonb, false, 0
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[SIGNUP] FAILED for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_workspace_mode_check;
ALTER TABLE tenants DROP COLUMN IF EXISTS workspace_mode;

-- Post-check inside the transaction: the live trigger must not mention the
-- column, or the next signup fails.
DO $$
DECLARE
  src text;
BEGIN
  SELECT prosrc INTO src FROM pg_proc WHERE proname = 'handle_new_user_signup';
  IF src IS NULL THEN
    RAISE EXCEPTION 'handle_new_user_signup not found';
  END IF;
  IF src LIKE '%workspace_mode%' THEN
    RAISE EXCEPTION 'signup trigger still references workspace_mode';
  END IF;
  RAISE NOTICE 'post-check OK: workspace_mode gone, signup trigger clean';
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'tenants' AND column_name = 'workspace_mode';  -- 0 rows
--   Then: NOTIFY pgrst, 'reload schema'; and regenerate types/database.types.ts.
