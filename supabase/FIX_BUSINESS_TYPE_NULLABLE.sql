-- Step 1: Remove NOT NULL constraint from business_type column
ALTER TABLE tenants
ALTER COLUMN business_type DROP NOT NULL;

-- Step 2: Update existing tenants that haven't completed onboarding to NULL
UPDATE tenants
SET business_type = NULL
WHERE id IN (
  SELECT tenant_id FROM tenant_features
  WHERE onboarding_completed = false
);

-- Step 3: Update the signup trigger to NOT set business_type
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

  -- Create tenant WITHOUT business_type (will be set during onboarding)
  INSERT INTO tenants (company_name, contact_email)
  VALUES (v_company_name, NEW.email)
  RETURNING id INTO v_tenant_id;

  -- Create tenant member
  INSERT INTO tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, NEW.id, 'owner', 'active', NOW());

  -- Create user profile
  INSERT INTO user_profiles (id, email, full_name, company_name, is_active)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), v_company_name, true)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  -- Create tenant features (onboarding not completed)
  INSERT INTO tenant_features (tenant_id, onboarding_completed, onboarding_step)
  VALUES (v_tenant_id, false, 0)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Step 4: Verify changes
SELECT
  t.id,
  t.company_name,
  t.business_type,
  tf.onboarding_completed
FROM tenants t
JOIN tenant_features tf ON tf.tenant_id = t.id
ORDER BY t.created_at DESC
LIMIT 5;
