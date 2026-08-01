-- =====================================================================
-- 266 — user_profiles.last_seen_at
-- =====================================================================
-- "When were they last active?" — written by a throttled client
-- heartbeat (POST /api/profiles/heartbeat, every 5 minutes while a tab
-- is open) and shown on User Management next to Last login.
--
-- Deliberately NOT a logout stamp: sessions are stateless tokens and
-- most of them end by tab-close or expiry, never by the Sign out
-- button, so a recorded "logout time" would usually be missing or
-- misleading. Last-seen is the honest version. Last LOGIN needs no
-- column at all — auth.users.last_sign_in_at is Supabase's own record,
-- surfaced by /api/profiles via the admin client.
-- =====================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
