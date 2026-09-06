-- ============================================================================
-- 343 — Drop the four always-on tenant feature booleans
-- ============================================================================
--
-- APPLY THIS *AFTER* THE DEPLOY THAT REMOVES THE READERS HAS FINISHED.
-- Running code must not query a column that no longer exists (the 240 rule).
--
-- tenant_features.whatsapp_integration / email_integration / pdf_generation /
-- analytics_enabled were written true for every tenant at signup and on every
-- plan change, shown as four greyed-out "plan controlled" checkboxes in
-- Organization settings, and read by nothing else. They looked like
-- entitlements and were not — the whole product is on every plan (239, 342).
-- The same PR removes the checkboxes, the context flags, the API fields and
-- the plan catalogue's display-only "capabilities"; this drops the columns.
--
-- The signup trigger (last defined in 342) set all four explicitly, so it is
-- redefined first without them — otherwise the DROP would break signup the
-- way 240 once did. Only that INSERT changes; the rest is 342's text
-- verbatim. tenant_features' remaining columns keep their defaults.
--
-- No CASCADE: if something still depends on a column, fail loudly.
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
    tenant_id, primary_color, secondary_color, custom_settings,
    onboarding_completed, onboarding_step
  ) VALUES (
    v_tenant_id, '#2d3b2d', '#263A29', '{}'::jsonb, false, 0
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[SIGNUP] FAILED for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE tenant_features DROP COLUMN IF EXISTS whatsapp_integration;
ALTER TABLE tenant_features DROP COLUMN IF EXISTS email_integration;
ALTER TABLE tenant_features DROP COLUMN IF EXISTS pdf_generation;
ALTER TABLE tenant_features DROP COLUMN IF EXISTS analytics_enabled;

-- Post-check inside the transaction: no live function may still name one of
-- the dropped columns (the signup trigger above, or anything forgotten).
DO $$
DECLARE
  bad text;
  fn  text;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    'whatsapp_integration', 'email_integration', 'pdf_generation', 'analytics_enabled'
  ]
  LOOP
    SELECT proname INTO fn FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%' || bad || '%'
     LIMIT 1;
    IF fn IS NOT NULL THEN
      RAISE EXCEPTION 'function % still references dropped column %', fn, bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'post-check OK: four feature booleans gone, no function names them';
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'tenant_features'
--      AND column_name IN ('whatsapp_integration','email_integration','pdf_generation','analytics_enabled');
--   -- 0 rows
--   Then: NOTIFY pgrst, 'reload schema'; and regenerate types/database.types.ts.
