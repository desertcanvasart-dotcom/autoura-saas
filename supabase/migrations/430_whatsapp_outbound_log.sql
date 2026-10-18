-- ============================================
-- 430: every WhatsApp the app sends is on record, with its delivery outcome
-- ============================================
-- The send routes (invoice, reminder, receipt, quote, contract, pickup…) kept
-- no row of what they sent. A message refused AFTER leaving us — typically
-- outside WhatsApp's 24-hour window (Twilio 63016, Meta 131047), which only
-- arrives later in the delivery callback — matched nothing and was dropped:
-- the invoice showed "sent", nobody was told. Each send now leaves a row here
-- (lib/whatsapp-outbound.ts), the callbacks update it, and a failure notifies
-- the person who sent it. Written by the server only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_outbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_sid TEXT NOT NULL UNIQUE,
  to_number TEXT NOT NULL,
  body_preview TEXT,
  sent_by UUID,
  status TEXT NOT NULL DEFAULT 'sent',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_outbound_tenant_created ON public.whatsapp_outbound (tenant_id, created_at DESC);

ALTER TABLE public.whatsapp_outbound ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_outbound FROM anon, authenticated;

DROP POLICY IF EXISTS "Members read their company's sent WhatsApp" ON public.whatsapp_outbound;
CREATE POLICY "Members read their company's sent WhatsApp" ON public.whatsapp_outbound
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

COMMIT;
