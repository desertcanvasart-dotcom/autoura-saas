-- ============================================================================
-- 412 — only the Autoura team sets a company's WhatsApp number
-- ============================================================================
--
-- Migration 408 said tenants.whatsapp_number is "set by the Autoura team only",
-- but nothing in the database held that: the tenants UPDATE policy lets a
-- company's admin update its own row, every column included. An admin could
-- set their company's number to the platform's SHARED number from the browser,
-- and every message to the shared number — every other company's customers —
-- would then be routed to them (lib/whatsapp-tenant.ts tenantForWhatsAppNumber).
--
-- The number now changes only through the service role (the Super Admin API,
-- app/api/super-admin/tenants/[id]/whatsapp, which also refuses the shared
-- number). Signed-in users — the `authenticated` role — and anonymous callers
-- cannot set or change it. Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION guard_tenant_whatsapp_number()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.whatsapp_number IS NOT NULL THEN
      RAISE EXCEPTION 'A company''s WhatsApp number is set by the Autoura team'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN
      RAISE EXCEPTION 'A company''s WhatsApp number is set by the Autoura team'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_tenant_whatsapp_number ON public.tenants;
CREATE TRIGGER trg_guard_tenant_whatsapp_number
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_whatsapp_number();

COMMIT;
