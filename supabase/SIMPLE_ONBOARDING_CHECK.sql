-- Check your onboarding status
SELECT
  tf.onboarding_completed,
  tf.onboarding_step,
  u.email_confirmed_at,
  CASE
    WHEN tf.onboarding_completed = true THEN 'Will go to /dashboard'
    WHEN tf.onboarding_completed = false THEN 'Should go to /onboarding'
    ELSE 'No status'
  END as what_should_happen
FROM auth.users u
JOIN tenant_members tm ON tm.user_id = u.id
LEFT JOIN tenant_features tf ON tf.tenant_id = tm.tenant_id
WHERE u.email = 'islamjp69@gmail.com';
