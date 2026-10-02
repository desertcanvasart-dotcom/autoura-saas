-- ============================================
-- 394: what a document's letterhead and footer print
-- ============================================
-- Supplier documents (vouchers, service orders) printed a hard-coded
-- "TRAVEL2EGYPT / Your Gateway to Egypt" header whatever the agency, and a
-- footer of name | website | email | phone at most. Agencies need their
-- address, licence and tax numbers and a line of their own (bank details, a
-- legal note) on what they send suppliers.
--
-- Phone, website and tagline already exist on tenants (onboarding); these
-- are the four that do not. All optional: a blank field omits its line.
--
-- Additive and replay-safe.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS document_footer_text text;

COMMENT ON COLUMN public.tenants.company_address IS
  'Postal address printed in document footers (Settings → Organization). NULL = omitted.';
COMMENT ON COLUMN public.tenants.license_number IS
  'Tourism licence number printed in document footers. NULL = omitted.';
COMMENT ON COLUMN public.tenants.tax_number IS
  'Tax / registration number printed in document footers. NULL = omitted.';
COMMENT ON COLUMN public.tenants.document_footer_text IS
  'Free text the agency writes (bank details, a legal note) printed at the foot of every document. NULL = omitted.';

COMMIT;
