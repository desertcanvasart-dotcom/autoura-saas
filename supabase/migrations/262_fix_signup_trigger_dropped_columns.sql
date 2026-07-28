-- =====================================================================
-- 262 — signup trigger still referenced columns migration 240 dropped
-- =====================================================================
-- Migration 240 (2026-07-26) dropped tenants.business_type and
-- tenant_features.{b2c_enabled, b2b_enabled, max_users,
-- max_quotes_per_month, max_partners} — but handle_new_user_signup
-- (last defined in 228) still INSERTs every one of them. The very first
-- statement (tenants.business_type) hits undefined_column, the trigger
-- RAISEs, GoTrue rolls back, and every signup since 240 was applied has
-- failed with "Database error saving new user". Observed live
-- 2026-07-28 while testing checkout with a fresh account.
--
-- Same failure family as 228 itself (repo text vs live schema drift on
-- this exact function). Kept from the lineage: 227's role='admin' for
-- the signup creator, 228's SECURITY DEFINER + pinned search_path, and
-- the WARN-then-RAISE tail. Changed: the two INSERTs now match the
-- post-240 schema — workspace_mode (240's single source) is set
-- explicitly, and tenant_features relies on column defaults for
-- everything the catalogue/limits work single-sourced away.
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

  INSERT INTO tenants (company_name, contact_email, workspace_mode)
  VALUES (v_company_name, NEW.email, 'both')
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

-- ---------------------------------------------------------------------
-- Post-check: the live function text must reference none of the dropped
-- columns, and must set workspace_mode.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  src text;
  bad text;
BEGIN
  SELECT prosrc INTO src FROM pg_proc WHERE proname = 'handle_new_user_signup';
  IF src IS NULL THEN
    RAISE EXCEPTION 'handle_new_user_signup not found';
  END IF;
  FOREACH bad IN ARRAY ARRAY[
    'business_type', 'b2c_enabled', 'b2b_enabled',
    'max_users', 'max_quotes_per_month', 'max_partners'
  ]
  LOOP
    IF src LIKE '%' || bad || '%' THEN
      RAISE EXCEPTION 'trigger still references dropped column %', bad;
    END IF;
  END LOOP;
  IF src NOT LIKE '%workspace_mode%' THEN
    RAISE EXCEPTION 'trigger does not set workspace_mode';
  END IF;
  RAISE NOTICE 'post-check OK: signup trigger matches the post-240 schema';
END $$;
