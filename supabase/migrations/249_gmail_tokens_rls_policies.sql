-- ============================================================================
-- 249 — gmail_tokens: RLS was enabled with ZERO policies
-- ============================================================================
--
-- The fourth and final bug in the Gmail connection chain. After 248 fixed the
-- upsert, connecting succeeded — the row exists, written by the OAuth callback
-- through the SERVICE-ROLE client, which bypasses RLS. But migration 007
-- enabled RLS on gmail_tokens and nothing ever created a policy, and RLS with
-- no policies denies everything to every non-bypass role.
--
-- So every read through an authenticated client silently returned nothing:
--
--   app/settings/email        status check   -> shows "Connect Gmail" forever
--   app/inbox                 banner check   -> never offers to sync
--   /api/email/sync           token lookup   -> cannot fetch mail AT ALL
--   /api/templates/send       token lookup   -> cannot send
--   /api/send-supplier-document               -> cannot send
--
-- (Those three routes use requireAuth()'s client, which is RLS-bound. The
-- gmail/* routes use the admin client and kept working — which is why the
-- connect flow succeeded while everything reading the result looked empty.)
--
-- This is why "Gmail connected successfully!" and a Connect button showed on
-- the same screen: the banner comes from the callback's redirect querystring,
-- the button from an RLS-filtered read.
--
-- ── The policy model ────────────────────────────────────────────────────────
-- Tokens are PER-USER credentials for the user's own mailbox, so the scope is
-- auth.uid() = user_id, not tenant membership: a colleague in the same tenant
-- has no business reading another member's Gmail refresh token.
--
--   SELECT  own row  — status checks and the sync/send routes
--   DELETE  own row  — the Disconnect button deletes from the browser
--   no INSERT/UPDATE for authenticated: the only writer is the OAuth callback,
--     which uses the service role. Tokens should not be forgeable client-side.
--
-- Future hardening, deliberately NOT done here: the SELECT policy necessarily
-- exposes access_token/refresh_token to the user's own browser client (RLS is
-- row-level, not column-level). Moving /api/email/sync, /api/templates/send
-- and /api/send-supplier-document to the admin client would allow revoking the
-- token columns from `authenticated` entirely, shrinking the XSS blast radius.
-- That is a refactor of three live routes, not a policy change.
-- ============================================================================

BEGIN;

-- 007 already enabled RLS; repeated here so this migration is self-sufficient.
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_tokens_select_own ON gmail_tokens;
CREATE POLICY gmail_tokens_select_own ON gmail_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS gmail_tokens_delete_own ON gmail_tokens;
CREATE POLICY gmail_tokens_delete_own ON gmail_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS gmail_tokens_service_role ON gmail_tokens;
CREATE POLICY gmail_tokens_service_role ON gmail_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Post-check: an authenticated SELECT path must exist, or the sync and status
-- reads stay broken and this migration changed nothing observable.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gmail_tokens'
      AND 'authenticated' = ANY (roles) AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'No authenticated SELECT policy on gmail_tokens — refusing to commit.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after applying:
--   * Reload /settings/email as the connected user — the card must now show
--     the connected address instead of the Connect button.
--   * npm run verify:rls — gmail_tokens holds a real refresh token and must
--     stay invisible to the anonymous key.
-- ============================================================================
