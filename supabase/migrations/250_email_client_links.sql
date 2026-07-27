-- ============================================================================
-- 250 — email_client_links: attach inbound emails to CRM clients
-- ============================================================================
--
-- The last of the audit's four unbuilt tables to gain a real user: with Afford
-- Egypt's inbox now syncing, the "Link to Client" button (ClientLinkButton)
-- and /api/email/links have a purpose — and both have been failing on a table
-- that never existed. Without it, a received email can never be attached to a
-- client, so it never appears on the client's communication timeline.
--
-- Schema is DERIVED from /api/email/links/route.ts, not invented — every
-- column below is one the route reads or writes.
--
-- Scoping is PER-USER (user_id), like gmail_tokens, because the links annotate
-- ONE USER'S Gmail messages: message_id is an id inside that user's mailbox
-- and means nothing to a colleague syncing a different account. tenant_id is
-- deliberately absent — the route (service-role) never writes it, and the
-- migration-245 lesson applies: an auto_set_tenant_id trigger cannot resolve
-- auth.uid() for a service-role writer, so a NOT NULL tenant_id would 23502
-- every insert.
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Whose mailbox this message lives in. CASCADE: links are annotations on the
  -- user's Gmail view and are meaningless once the user is gone.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gmail message / thread ids (opaque strings, not UUIDs).
  message_id TEXT NOT NULL,
  thread_id TEXT,

  -- The FK is what makes the route's `client:clients(...)` embed resolvable.
  -- tour_days taught this the hard way: id columns without a declared FOREIGN
  -- KEY make PostgREST fail the whole query with PGRST200.
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- The address that matched, kept for display and for re-running auto-link.
  email_address TEXT,

  -- True when created by address-matching rather than a human click.
  auto_linked BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per message per user. The route does check-then-insert, which races
-- under a double-click; this makes the second insert fail loudly instead of
-- silently creating a duplicate the .single() reads would then choke on.
-- NON-partial, per the migration-248 lesson: a partial unique index cannot back
-- ON CONFLICT, and this table is the obvious next candidate for an upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_client_links_user_message
  ON email_client_links (user_id, message_id);

-- The other real query shapes: all links for a client (timeline), and the
-- auto-link duplicate sweep (user + IN message_ids, covered by the unique).
CREATE INDEX IF NOT EXISTS idx_email_client_links_client
  ON email_client_links (client_id);

-- --------------------------------------------------------------------------
-- RLS: service-role only. Every access path goes through /api/email/links,
-- which authenticates with requireAuth() and then queries with the ADMIN
-- client — no browser or RLS-bound reads exist. Locked to service_role so the
-- anonymous key sees nothing, and so any future browser-side read fails loudly
-- here rather than silently returning rows across users.
-- --------------------------------------------------------------------------
ALTER TABLE email_client_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_client_links_service_role ON email_client_links;
CREATE POLICY email_client_links_service_role ON email_client_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE email_client_links IS
  'Attaches a Gmail message (per-user message_id) to a CRM client. Written only '
  'through /api/email/links with the service role; per-user scoped, no tenant_id '
  'by design — see migration header.';

-- ============================================================================
-- Verify after applying:
--   * npm run verify:rls  — table must not answer the anonymous key
--   * In the inbox, open an email → Link to Client → pick a client → the badge
--     must persist across a reload.
-- ============================================================================
