-- ============================================================================
-- 368 — "Not a lead", remembered
-- ============================================================================
--
-- Email that arrives is now judged once: a travel request becomes a client at
-- status 'lead', linked to the conversation it came from. A judgement can be
-- wrong — a supplier's newsletter, a colleague's forward, a job application
-- that mentions Egypt — and the operator says so by dismissing it.
--
-- Without a memory that dismissal lasts until the next sync: the same sender
-- writes again, the same judgement runs, and the same wrong lead comes back.
-- One row per sender per tenant says "never again for this address".
--
-- The sender is the key, not the message: somebody who is not a customer does
-- not become one by writing a second time.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_lead_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sender_email text NOT NULL,
  dismissed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_email_lead_dismissals_sender
  ON public.email_lead_dismissals (tenant_id, sender_email);

ALTER TABLE public.email_lead_dismissals ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id_email_lead_dismissals ON public.email_lead_dismissals;
CREATE TRIGGER set_tenant_id_email_lead_dismissals
  BEFORE INSERT ON public.email_lead_dismissals
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- The four-policy pattern (docs/ARCHITECTURE.md).
DROP POLICY IF EXISTS email_lead_dismissals_select ON public.email_lead_dismissals;
CREATE POLICY email_lead_dismissals_select ON public.email_lead_dismissals
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_lead_dismissals_insert ON public.email_lead_dismissals;
CREATE POLICY email_lead_dismissals_insert ON public.email_lead_dismissals
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_lead_dismissals_update ON public.email_lead_dismissals;
CREATE POLICY email_lead_dismissals_update ON public.email_lead_dismissals
  FOR UPDATE USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS email_lead_dismissals_delete ON public.email_lead_dismissals;
CREATE POLICY email_lead_dismissals_delete ON public.email_lead_dismissals
  FOR DELETE USING (tenant_id = get_user_tenant_id());

COMMIT;
