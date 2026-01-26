-- =====================================================================
-- Check if signup trigger exists and is working
-- =====================================================================

-- 1. Check if trigger function exists
SELECT
  'Function Check' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = 'handle_new_user_signup'
      AND routine_schema = 'public'
    )
    THEN '✅ Function EXISTS'
    ELSE '❌ Function MISSING - Run migration 036 or 041'
  END as function_status;

-- 2. Check if trigger is attached to auth.users
SELECT
  'Trigger Check' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'on_auth_user_created'
      AND event_object_table = 'users'
      AND event_object_schema = 'auth'
    )
    THEN '✅ Trigger EXISTS and attached to auth.users'
    ELSE '❌ Trigger MISSING - Run migration 036 or 041'
  END as trigger_status;

-- 3. Show trigger details if it exists
SELECT
  trigger_name,
  event_manipulation as event,
  event_object_schema as schema,
  event_object_table as table_name,
  action_timing as timing,
  action_statement as function_call
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 4. Check if we have permission to see auth schema
SELECT
  'Permission Check' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'auth' AND table_name = 'users'
    )
    THEN '✅ Can see auth.users table'
    ELSE '⚠️  Cannot see auth.users (this is normal in some Supabase setups)'
  END as auth_visibility;
