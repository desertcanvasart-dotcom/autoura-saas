-- ============================================================================
-- 247 — Per-tenant sending domains
-- ============================================================================
--
-- Invoices and itineraries currently leave from the platform's verified domain
-- (quotes@getautoura.net) carrying the operator's display name and reply-to.
-- The traveller sees the right name, but the envelope says Autoura — which is
-- wrong for a white-label product, and much harder to change once operators
-- have sent thousands of invoices from it.
--
-- These columns let each operator verify their OWN domain in Resend and send
-- as themselves. Columns on `tenants` rather than a side table on purpose: the
-- four send paths already join `tenants` for company_name/contact_email, and
-- the reminder cron sends per-invoice across every tenant — a second join there
-- would be a query per email.
--
-- THE SAFETY RULE, enforced in lib/tenant-email-domain.ts: the tenant address
-- is used ONLY when status is 'verified'. Anything else falls back to the
-- platform sender. Sending from an unverified domain is rejected by Resend, so
-- a wrong answer here does not misdeliver — it stops the mail entirely.
-- ============================================================================

BEGIN;

ALTER TABLE tenants
  -- Bare domain the operator owns, e.g. 'sawatours.org'. No scheme, no local part.
  ADD COLUMN IF NOT EXISTS email_domain TEXT,

  -- Local part to send from, so the operator picks invoices@ vs bookings@.
  ADD COLUMN IF NOT EXISTS email_from_local TEXT NOT NULL DEFAULT 'invoices',

  -- Resend's id for the domain, needed to re-check verification later.
  ADD COLUMN IF NOT EXISTS resend_domain_id TEXT,

  ADD COLUMN IF NOT EXISTS email_domain_status TEXT NOT NULL DEFAULT 'not_configured',

  ADD COLUMN IF NOT EXISTS email_domain_verified_at TIMESTAMPTZ;

-- Added separately so re-running the migration cannot fail on a duplicate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_email_domain_status_check'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_email_domain_status_check
      CHECK (email_domain_status IN ('not_configured', 'pending', 'verified', 'failed'));
  END IF;
END $$;

-- A domain claimed twice would let one tenant send as another. Partial, so the
-- many tenants with no domain yet do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_email_domain_unique
  ON tenants (lower(email_domain))
  WHERE email_domain IS NOT NULL;

COMMENT ON COLUMN tenants.email_domain IS
  'Operator-owned sending domain, verified in Resend. Bare domain only. '
  'Used as the envelope sender ONLY while email_domain_status = ''verified'' — '
  'see lib/tenant-email-domain.ts. Otherwise the platform sender is used.';

COMMENT ON COLUMN tenants.email_domain_status IS
  'not_configured | pending (DNS records issued, awaiting verification) | '
  'verified | failed. Only ''verified'' changes the From address.';

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT company_name, email_domain, email_from_local, email_domain_status
--   FROM tenants;
--   -- every row should read: NULL / 'invoices' / 'not_configured'
--   -- i.e. nothing changes sender behaviour until an operator opts in.
-- ============================================================================
