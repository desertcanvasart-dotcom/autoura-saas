-- =====================================================
-- Migration 031: Fix User Table RLS Policies
-- =====================================================
-- Add missing RLS policies for user-related tables
-- to prevent cross-user data access

-- =====================================================
-- 1. USER_PROFILES RLS
-- =====================================================

-- Enable RLS on user_profiles if not already enabled
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Users can only view their own profile
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE
  USING (id = auth.uid());

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- =====================================================
-- 2. USER_SETTINGS RLS (if table exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_settings') THEN
    -- Enable RLS
    ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view their own settings" ON user_settings;
    DROP POLICY IF EXISTS "Users can update their own settings" ON user_settings;
    DROP POLICY IF EXISTS "Users can insert their own settings" ON user_settings;

    -- Users can only view their own settings
    EXECUTE 'CREATE POLICY "Users can view their own settings" ON user_settings
      FOR SELECT
      USING (user_id = auth.uid())';

    -- Users can only update their own settings
    EXECUTE 'CREATE POLICY "Users can update their own settings" ON user_settings
      FOR UPDATE
      USING (user_id = auth.uid())';

    -- Users can insert their own settings
    EXECUTE 'CREATE POLICY "Users can insert their own settings" ON user_settings
      FOR INSERT
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- =====================================================
-- 3. USER_PREFERENCES RLS (if table exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_preferences') THEN
    -- Enable RLS
    ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view their own preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Users can insert their own preferences" ON user_preferences;
    DROP POLICY IF EXISTS "Users can delete their own preferences" ON user_preferences;

    -- Users can only view their own preferences
    EXECUTE 'CREATE POLICY "Users can view their own preferences" ON user_preferences
      FOR SELECT
      USING (user_id = auth.uid())';

    -- Users can only update their own preferences
    EXECUTE 'CREATE POLICY "Users can update their own preferences" ON user_preferences
      FOR UPDATE
      USING (user_id = auth.uid())';

    -- Users can insert their own preferences
    EXECUTE 'CREATE POLICY "Users can insert their own preferences" ON user_preferences
      FOR INSERT
      WITH CHECK (user_id = auth.uid())';

    -- Users can delete their own preferences
    EXECUTE 'CREATE POLICY "Users can delete their own preferences" ON user_preferences
      FOR DELETE
      USING (user_id = auth.uid())';
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE user_profiles IS 'User profiles with RLS enabled - users can only access their own data';
