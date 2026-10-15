-- ============================================================================
-- 420 — only the server sets a company's sending domain; repair Gmail expiry
-- ============================================================================
--
-- 1. Sending-domain columns.
--    lib/tenant-email-domain.ts sends From the tenant's own domain whenever
--    tenants.email_domain_status = 'verified'. Nothing in the database held
--    that column: the tenants UPDATE policy (migration 002) lets a company's
--    admin update every column of its own row. An admin could set
--    email_domain to ANY domain verified in the platform's Resend account —
--    the platform's own included — mark it 'verified' straight through
--    PostgREST, and invoices, quotes and itineraries would go out as
--    anything@that-domain. Resend checks verification per account, not per
--    company, so it would accept them.
--
--    The columns now change only through the service role:
--    app/api/settings/email-domain (which claims the domain with Resend and
--    reads the verified status back from Resend). Same shape as migration 412.
--
-- 2. gmail_tokens.token_expiry.
--    The Google OAuth callback stored Date.now() + expiry_date, but
--    expiry_date is already an absolute time, so every connected mailbox
--    carries an expiry decades out and the routes never refreshed (or saved)
--    the access token. Any expiry more than a day out is impossible for a
--    Google access token; set it to now() so the next request refreshes and
--    stores a real one.
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION guard_tenant_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND (
         NEW.email_domain IS NOT NULL
      OR NEW.resend_domain_id IS NOT NULL
      OR NEW.email_domain_verified_at IS NOT NULL
      OR COALESCE(NEW.email_domain_status, 'not_configured') <> 'not_configured'
    ) THEN
      RAISE EXCEPTION 'A company''s sending domain is set through Settings > Email'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND (
         NEW.email_domain IS DISTINCT FROM OLD.email_domain
      OR NEW.email_from_local IS DISTINCT FROM OLD.email_from_local
      OR NEW.email_domain_status IS DISTINCT FROM OLD.email_domain_status
      OR NEW.email_domain_verified_at IS DISTINCT FROM OLD.email_domain_verified_at
      OR NEW.resend_domain_id IS DISTINCT FROM OLD.resend_domain_id
    ) THEN
      RAISE EXCEPTION 'A company''s sending domain is set through Settings > Email'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_tenant_email_domain ON public.tenants;
CREATE TRIGGER trg_guard_tenant_email_domain
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_email_domain();

UPDATE public.gmail_tokens
   SET token_expiry = now()
 WHERE token_expiry > now() + interval '1 day';

COMMIT;
