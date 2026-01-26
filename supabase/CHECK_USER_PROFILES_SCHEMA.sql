-- =====================================================================
-- Check user_profiles table schema
-- This will show all columns and their data types
-- =====================================================================

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Also check if role column exists specifically
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_profiles'
        AND column_name = 'role'
        AND table_schema = 'public'
    )
    THEN '✅ Role column EXISTS in user_profiles'
    ELSE '❌ Role column MISSING from user_profiles'
  END as role_column_check;

-- Show current roles for all users
SELECT
  email,
  role as profile_role,
  is_active
FROM user_profiles
ORDER BY created_at DESC;
