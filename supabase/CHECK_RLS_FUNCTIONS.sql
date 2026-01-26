-- =====================================================================
-- Check if RLS helper functions exist
-- =====================================================================

SELECT
  'Function Check' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = 'get_user_tenant_id'
        AND routine_schema = 'public'
    )
    THEN '✅ get_user_tenant_id() EXISTS'
    ELSE '❌ get_user_tenant_id() MISSING'
  END as get_user_tenant_id_status;

SELECT
  'Function Check' as check_type,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_name = 'user_has_role'
        AND routine_schema = 'public'
    )
    THEN '✅ user_has_role() EXISTS'
    ELSE '❌ user_has_role() MISSING'
  END as user_has_role_status;

-- Test the functions if they exist
DO $$
BEGIN
  BEGIN
    RAISE NOTICE 'Testing get_user_tenant_id()...';
    RAISE NOTICE 'Your tenant_id: %', get_user_tenant_id();
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE '❌ get_user_tenant_id() function does not exist';
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ get_user_tenant_id() error: %', SQLERRM;
  END;

  BEGIN
    RAISE NOTICE 'Testing user_has_role()...';
    RAISE NOTICE 'Has owner role: %', user_has_role('owner');
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE '❌ user_has_role() function does not exist';
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ user_has_role() error: %', SQLERRM;
  END;
END $$;
