-- =====================================================================
-- Check onboarding status for your user
-- =====================================================================

SELECT
  'Your Onboarding Status' as info,
  tf.onboarding_completed,
  tf.onboarding_step,
  t.company_name,
  u.email,
  u.email_confirmed_at,
  CASE
    WHEN tf.onboarding_completed = true THEN '✅ Onboarding completed - will go to dashboard'
    WHEN tf.onboarding_completed = false THEN '⚠️ Onboarding NOT completed - should redirect to /onboarding'
    ELSE '❌ No onboarding status found'
  END as expected_behavior
FROM auth.users u
JOIN tenant_members tm ON tm.user_id = u.id
JOIN tenants t ON t.id = tm.tenant_id
LEFT JOIN tenant_features tf ON tf.tenant_id = tm.tenant_id
WHERE u.email = 'islamjp69@gmail.com';

-- Check if onboarding columns exist
SELECT
  'Onboarding Columns' as info,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tenant_features'
        AND column_name = 'onboarding_completed'
    )
    THEN '✅ onboarding_completed column exists'
    ELSE '❌ onboarding_completed column MISSING'
  END as onboarding_completed_status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tenant_features'
        AND column_name = 'onboarding_step'
    )
    THEN '✅ onboarding_step column exists'
    ELSE '❌ onboarding_step column MISSING'
  END as onboarding_step_status;
