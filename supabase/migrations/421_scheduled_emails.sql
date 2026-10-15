-- ============================================================================
-- 421 — Schedule send: an email that goes out at a chosen time
-- ============================================================================
--
-- The inbox composer can now "Schedule send". The message itself is a Gmail
-- draft (its recipients, body and attachments live in the person's mailbox,
-- exactly as when they save a draft); this row is the time to send it and
-- what became of it. The scheduled-send job (/api/cron/scheduled-send, every
-- 5 minutes) sends each due draft with users.drafts.send.
--
--   pending   waiting for send_at
--   sending   claimed by a job run (claimed_at). A claim older than 15
--             minutes means a run died mid-send: it becomes failed with
--             "check Sent", never retried — Gmail may already have sent it
--   sent      gone; gmail_message_id is the sent message
--   failed    could not be sent (error says why); shown in the Scheduled list
--   cancelled the person cancelled it; the draft stays in Drafts
--
-- A schedule is personal (one person's mailbox in one company), so the
-- policies are the person's own rows in their current company. The routes use
-- the service role with the same filters.
--
-- (The older public.scheduled_sends, migration 023, is the unused template-
-- send queue — nothing processes it — and is left alone.)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  gmail_draft_id text NOT NULL,
  gmail_thread_id text,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  -- What the Scheduled list shows without opening the draft.
  to_summary text,
  subject text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The job's query: what is due.
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due
  ON public.scheduled_emails (status, send_at);

-- The Scheduled list: one person's, in one company.
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_owner
  ON public.scheduled_emails (tenant_id, user_id, send_at);

-- One live schedule per draft.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_emails_live_draft
  ON public.scheduled_emails (user_id, gmail_draft_id)
  WHERE status IN ('pending', 'sending');

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_emails_select ON public.scheduled_emails;
CREATE POLICY scheduled_emails_select ON public.scheduled_emails
  FOR SELECT USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS scheduled_emails_insert ON public.scheduled_emails;
CREATE POLICY scheduled_emails_insert ON public.scheduled_emails
  FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS scheduled_emails_update ON public.scheduled_emails;
CREATE POLICY scheduled_emails_update ON public.scheduled_emails
  FOR UPDATE USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS scheduled_emails_delete ON public.scheduled_emails;
CREATE POLICY scheduled_emails_delete ON public.scheduled_emails
  FOR DELETE USING (user_id = auth.uid() AND tenant_id = get_user_tenant_id());

COMMIT;
