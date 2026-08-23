-- ============================================================================
-- 273 — gmail_tokens: stop handing refresh tokens to the browser
-- ============================================================================
--
-- The hardening migration 249 named and deliberately deferred:
--
--   "the SELECT policy necessarily exposes access_token/refresh_token to the
--    user's own browser client (RLS is row-level, not column-level). Moving
--    /api/email/sync, /api/templates/send and /api/send-supplier-document to
--    the admin client would allow revoking the token columns from
--    `authenticated` entirely, shrinking the XSS blast radius. That is a
--    refactor of three live routes, not a policy change."
--
-- Those three routes now read gmail_tokens with the admin client, so the
-- policy change can land. Until it does, any script running in a signed-in
-- browser can read that user's Google refresh token — a long-lived credential
-- for their whole mailbox — with one query.
--
-- RLS cannot express this: a policy filters ROWS. Withholding a COLUMN is a
-- grant, so that is what this does.
--
-- ── What still works ────────────────────────────────────────────────────────
-- Everything that reads gmail_tokens from an authenticated client asks only
-- for non-secret columns, and was checked one by one before this was written:
--
--   app/settings/email/page.tsx      select('email')            browser
--   app/inbox/page.tsx               select('email')            browser
--   app/settings/email/page.tsx      delete()                   browser
--   app/api/settings/email/route.ts  select('email, updated_at')
--
-- DELETE is a table privilege, not a column one, so the Disconnect button is
-- untouched. service_role keeps full access and is how every token read now
-- happens.
--
-- ── Deploy order matters ────────────────────────────────────────────────────
-- Ship the route changes FIRST. Applying this against the old code breaks
-- sending and syncing immediately: those routes selected access_token (one of
-- them with `select('*')`) through the authenticated client.
-- ============================================================================

BEGIN;

-- A column-level grant cannot narrow a table-level one — the table-wide SELECT
-- has to go first, then the permitted columns are granted back by name.
REVOKE SELECT ON public.gmail_tokens FROM authenticated;
GRANT SELECT (
  id, tenant_id, user_id, token_type, expiry_date,
  email_address, email, token_expiry, created_at, updated_at
) ON public.gmail_tokens TO authenticated;

-- anon has no SELECT policy so RLS already denies it every row. Revoked anyway:
-- if a policy is ever added by accident, this keeps the secrets out of it.
REVOKE SELECT ON public.gmail_tokens FROM anon;

-- --------------------------------------------------------------------------
-- Post-checks. A migration whose effect nobody verified is how 249's four-bug
-- chain stayed hidden — assert the outcome, in both directions.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- 1. The secrets must be unreachable.
  IF has_column_privilege('authenticated', 'public.gmail_tokens', 'access_token', 'SELECT')
  THEN RAISE EXCEPTION 'authenticated can still SELECT gmail_tokens.access_token';
  END IF;

  IF has_column_privilege('authenticated', 'public.gmail_tokens', 'refresh_token', 'SELECT')
  THEN RAISE EXCEPTION 'authenticated can still SELECT gmail_tokens.refresh_token';
  END IF;

  -- 2. …and the connection-status reads must still work, or settings and inbox
  --    silently show "Connect Gmail" forever — exactly the 249 failure mode.
  IF NOT has_column_privilege('authenticated', 'public.gmail_tokens', 'email', 'SELECT')
  THEN RAISE EXCEPTION 'authenticated lost SELECT on gmail_tokens.email — status checks would break';
  END IF;

  -- 3. Disconnect must still be possible from the browser.
  IF NOT has_table_privilege('authenticated', 'public.gmail_tokens', 'DELETE')
  THEN RAISE EXCEPTION 'authenticated lost DELETE on gmail_tokens — Disconnect would break';
  END IF;

  -- 4. The routes that now do the real work must be unaffected.
  IF NOT has_column_privilege('service_role', 'public.gmail_tokens', 'refresh_token', 'SELECT')
  THEN RAISE EXCEPTION 'service_role cannot read gmail_tokens.refresh_token — sending and syncing would break';
  END IF;
END $$;

COMMIT;
