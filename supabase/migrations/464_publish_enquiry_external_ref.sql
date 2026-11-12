-- ============================================================================
-- 464 — website enquiries from a company's OWN site carry its reference
-- ============================================================================
-- Operator, 2026-11-12: Travel2Egypt's website enquiry form (travel2egypt-next
-- /api/lead, live since 2026-11-08) only emailed info@travel2egypt.org, which
-- the app does not read — 22 enquiries never reached the app. The site now
-- also sends each enquiry, signed, to /api/webhooks/website-lead, which files
-- it like an enquiry from an app-published site: a lead, a publish_enquiries
-- row, a client note and a bell notice.
--
--   external_ref — the site's own reference for the enquiry ("T2E-7KQ2MX").
--                  One enquiry per company per reference: a retried or
--                  replayed send finds the row it already made and files
--                  nothing twice.
--
-- site_id stays NULL for these rows (the site is not an app-published one).
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE publish_enquiries
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

COMMENT ON COLUMN publish_enquiries.external_ref IS
  'The company''s own website reference for the enquiry (e.g. T2E-7KQ2MX); '
  'NULL for enquiries from app-published sites. Unique per company.';

CREATE UNIQUE INDEX IF NOT EXISTS publish_enquiries_tenant_external_ref
  ON publish_enquiries (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT count(*) FROM publish_enquiries WHERE external_ref IS NOT NULL;
--   -- 0 right after applying; one per enquiry the site sends from then on.
-- ============================================================================
