-- ============================================================================
-- 251 — email_client_links: snapshot columns for client-page display
-- ============================================================================
--
-- Linking works (250), but the link stored only ids — so the client page had
-- nothing to SHOW. The obvious fix, fetching each message from Gmail at view
-- time, is wrong twice over:
--
--   * message ids are PER-MAILBOX. The links belong to the user who synced the
--     mailbox; a colleague viewing the client page could never resolve those
--     ids against their own Gmail. The CRM view must not depend on who is
--     looking.
--   * it would be an N+1 of Gmail API calls per client page load, and would
--     break retroactively the day the mailbox owner disconnects Gmail.
--
-- So the link carries a display snapshot, captured at link time from data the
-- inbox already has in hand. Emails are immutable, so the snapshot cannot go
-- stale. Nullable throughout: the auto-link path matches on addresses alone
-- and has no subject to offer.
-- ============================================================================

BEGIN;

ALTER TABLE email_client_links
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS snippet TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- The client page's one query: this client's emails, newest first.
CREATE INDEX IF NOT EXISTS idx_email_client_links_client_sent
  ON email_client_links (client_id, sent_at DESC);

COMMENT ON COLUMN email_client_links.subject IS
  'Display snapshot captured at link time. Emails are immutable, so this cannot '
  'go stale; it exists because message ids are per-mailbox and a colleague '
  'viewing the client page cannot resolve them against their own Gmail.';

COMMIT;

-- ============================================================================
-- Verify after applying: link an email in the inbox, then open the client's
-- Communications tab — the email must appear with its subject and date.
-- Links created BEFORE this migration have no snapshot and render as
-- "(no subject captured)" — expected, not a bug; relink to backfill.
-- ============================================================================
