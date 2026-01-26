-- =====================================================================
-- Skip onboarding and mark as completed
-- Use this if you want to bypass the onboarding flow
-- =====================================================================

UPDATE tenant_features
SET
  onboarding_completed = true,
  onboarding_step = 5,  -- Set to final step
  updated_at = NOW()
WHERE tenant_id = (
  SELECT tenant_id FROM tenant_members
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND status = 'active'
  LIMIT 1
);

-- Verify the change
SELECT
  'Onboarding Status Updated' as result,
  onboarding_completed,
  onboarding_step,
  updated_at
FROM tenant_features
WHERE tenant_id = (
  SELECT tenant_id FROM tenant_members
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'islamjp69@gmail.com')
  AND status = 'active'
  LIMIT 1
);
