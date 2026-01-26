-- =====================================================================
-- Create RLS helper functions
-- These are required for Row Level Security policies to work
-- =====================================================================

-- Drop existing functions if any
DROP FUNCTION IF EXISTS get_user_tenant_id();
DROP FUNCTION IF EXISTS user_has_role(VARCHAR);
DROP FUNCTION IF EXISTS user_has_role(TEXT[]);

-- =====================================================================
-- Function 1: Get current user's tenant_id
-- =====================================================================

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_tenant_id IS 'Returns the tenant_id for the current authenticated user';

-- =====================================================================
-- Function 2: Check if user has required role
-- =====================================================================

CREATE OR REPLACE FUNCTION user_has_role(required_role VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND tenant_id = get_user_tenant_id()
    AND status = 'active'
    AND (
      role = required_role
      OR role = 'owner'  -- Owners have all permissions
      OR role = 'admin'  -- Admins have all permissions
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_has_role IS 'Checks if the current user has the required role (owner and admin always return true)';

-- =====================================================================
-- Verify creation
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS HELPER FUNCTIONS CREATED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ get_user_tenant_id() - Returns your tenant ID';
  RAISE NOTICE '✅ user_has_role() - Checks permissions';
  RAISE NOTICE '';
  RAISE NOTICE 'Testing functions:';

  BEGIN
    RAISE NOTICE 'Your tenant_id: %', get_user_tenant_id();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Cannot get tenant_id (may need to be logged in): %', SQLERRM;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Refresh your browser';
  RAISE NOTICE '2. The "Error fetching clients" should be gone';
  RAISE NOTICE '========================================';
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_tenant_id() TO anon;
GRANT EXECUTE ON FUNCTION user_has_role(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_role(VARCHAR) TO anon;
