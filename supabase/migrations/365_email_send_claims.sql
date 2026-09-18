-- ============================================================================
-- 365 — Never the same email reply twice
-- ============================================================================
--
-- /api/gmail/send sends whatever reaches it. A double click, a retried
-- request, a second tab, or two colleagues answering the same customer each
-- send a real email to that customer. Nothing in the app prevents it: the only
-- duplicate check today runs AFTER Gmail has already accepted the message.
--
-- One row per send ATTEMPT, keyed by a key the composer makes once per reply
-- and repeats on retry. The route claims the key BEFORE calling Gmail, so a
-- second request carrying it is refused by the primary key, however close
-- together the two arrive. The same row then records what happened, so the
-- second request can answer with the first attempt's result instead of
-- sending again.
--
-- It also answers two questions the route asks before sending:
--   * did somebody already reply to this thread after the message being
--     answered — from the app, or an attempt still in flight;
--   * is this the same text, to the same thread, within ten minutes.
--
-- tenant_id is stamped by the usual trigger and carries the usual four
-- policies: a claim names a customer thread and who wrote to it.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_send_claims (
  request_key text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid,
  thread_id text,
  body_hash text,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  gmail_message_id text,
  gmail_thread_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_send_claims_thread
  ON public.email_send_claims (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_claims_body
  ON public.email_send_claims (thread_id, body_hash, created_at DESC);

ALTER TABLE public.email_send_claims ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id_email_send_claims ON public.email_send_claims;
CREATE TRIGGER set_tenant_id_email_send_claims
  BEFORE INSERT ON public.email_send_claims
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- The four-policy pattern (see docs/ARCHITECTURE.md): SELECT tolerates the
-- global NULL tenant, the writes never do.
DROP POLICY IF EXISTS email_send_claims_select ON public.email_send_claims;
CREATE POLICY email_send_claims_select ON public.email_send_claims
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_send_claims_insert ON public.email_send_claims;
CREATE POLICY email_send_claims_insert ON public.email_send_claims
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_send_claims_update ON public.email_send_claims;
CREATE POLICY email_send_claims_update ON public.email_send_claims
  FOR UPDATE USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_send_claims_delete ON public.email_send_claims;
CREATE POLICY email_send_claims_delete ON public.email_send_claims
  FOR DELETE USING (tenant_id = get_user_tenant_id());

COMMIT;
