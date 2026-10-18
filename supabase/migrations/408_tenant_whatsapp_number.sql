-- ============================================================================
-- 408 — a company's own WhatsApp number
-- ============================================================================
-- The platform had ONE WhatsApp number for every company, so a message from
-- someone writing for the first time could not be tied to a company and was
-- dropped. A company may now have its own number (a sender in the platform's
-- Twilio account): messages to it are that company's, and its sends go out
-- from it. A company without one keeps the shared number
-- (TWILIO_WHATSAPP_FROM) — lib/whatsapp-tenant.ts.
--
-- Set by the Autoura team only (Super Admin → company): a company that could
-- set any number could take another's customers (travel-ops-pro, round 14).
-- E.164 with a leading "+", unique across companies; NULL = the shared number.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_whatsapp_number_e164') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_whatsapp_number_e164
      CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_whatsapp_number_unique
  ON public.tenants (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

COMMENT ON COLUMN public.tenants.whatsapp_number IS
  'The company''s own WhatsApp sender (E.164), set by the Autoura team. NULL = the platform''s shared number.';

COMMIT;
