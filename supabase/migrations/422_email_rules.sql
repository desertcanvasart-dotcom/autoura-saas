-- ============================================================================
-- 422 — Mail rules ("filters")
-- ============================================================================
--
-- "When an email is from / to / has this subject / has these words, then file
-- it in a folder / skip the Inbox / mark it read / star it / send it to Spam /
-- delete it." Rules belong to the company: they run on new mail in every
-- connected mailbox at each sync (every 10 minutes), and a new rule can also
-- be run once on what is already in the Inbox.
--
--   conditions  { from?, to?, subject?, words? }   — all given must match
--   actions     { folder?, skipInbox?, markRead?, star?, spam?, delete? }
--
-- `folder` is a folder NAME, not a Gmail label id: each person's mailbox has
-- its own ids, so the name is looked up (and created if missing) per mailbox.
--
-- Everyone in the company can see the rules; managers and admins create and
-- change them (the API checks roles — lib/api-role-gate 'manage'). Reads go
-- through RLS; writes use the service role after that check.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_rules_tenant
  ON public.email_rules (tenant_id, enabled, created_at);

ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;

-- Readable by the company; no write policy for signed-in users at all —
-- changes go through /api/email/rules, which checks the manager role.
DROP POLICY IF EXISTS email_rules_select ON public.email_rules;
CREATE POLICY email_rules_select ON public.email_rules
  FOR SELECT USING (tenant_id = get_user_tenant_id());

COMMIT;
