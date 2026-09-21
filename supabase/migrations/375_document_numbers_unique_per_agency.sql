-- ============================================
-- 375: a document number is unique PER AGENCY, not across all of them
-- ============================================
-- Production has three constraints no migration here creates (found by the
-- build-vs-production comparison behind 374):
--
--     invoices_invoice_number_key               UNIQUE (invoice_number)
--     expenses_expense_number_key               UNIQUE (expense_number)
--     supplier_invoices_internal_reference_key  UNIQUE (internal_reference)
--
-- Unique across EVERY agency on the platform. But the numbers are counted per
-- agency: lib/document-numbering.ts scans the caller's own rows (through RLS)
-- and gives each agency its own INV-2026-001. So:
--
--   agency A issues INV-2026-001.
--   agency B issues its first invoice. It cannot see A's rows, so it also
--   computes INV-2026-001 — and the global constraint refuses it (23505).
--   The retry regenerates the number, which is INV-2026-001 again, five
--   times, and the request fails: "Failed to create invoice".
--
-- The second agency to issue its first invoice, expense or supplier invoice
-- of a year cannot. Nobody has hit it only because all three tables are empty
-- (checked on production 2026-09-21: 0 rows each). Migration 360 fixed the
-- same defect for tour codes. It also leaks: a refusal tells B that somebody
-- else already holds that number.
--
-- The RIGHT constraints are already there, beside the wrong ones:
--
--     invoices_tenant_id_invoice_number_key   UNIQUE (tenant_id, invoice_number)
--     expenses_tenant_id_expense_number_key   UNIQUE (tenant_id, expense_number)
--     uq_supplier_invoices_tenant_reference   UNIQUE (tenant_id, internal_reference) [258]
--
-- so this only removes. Each global constraint goes ONLY if its per-agency
-- twin is in place — a number must never be left with no uniqueness at all,
-- because the retry-on-collision in document-numbering.ts depends on one.
--
-- Where they came from: document-numbering.ts was ported from the sibling
-- product and still names ITS migration (20260626_unique_document_numbers.sql).
-- Global is right there; it is wrong in a multi-agency database.
--
-- CHANGES PRODUCTION (unlike 374). No ordering constraint with the code: no
-- code names these constraints, and none upserts ON CONFLICT on the bare
-- number. Idempotent.

DO $$
DECLARE
  item TEXT[];
  per_agency BOOLEAN;
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    -- table,             global constraint,                           number column
    ['invoices',          'invoices_invoice_number_key',               'invoice_number'],
    ['expenses',          'expenses_expense_number_key',               'expense_number'],
    ['supplier_invoices', 'supplier_invoices_internal_reference_key',  'internal_reference']
  ] LOOP
    CONTINUE WHEN to_regclass('public.' || item[1]) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass('public.' || item[1]) AND conname = item[2]
    );

    -- Is there a UNIQUE index on exactly (tenant_id, <number>)? A constraint
    -- or a plain unique index both count (258's is a partial unique index).
    SELECT EXISTS (
      SELECT 1
        FROM pg_index i
       WHERE i.indrelid = to_regclass('public.' || item[1])
         AND i.indisunique
         AND (
           SELECT array_agg(a.attname::text ORDER BY a.attname::text)
             FROM unnest(i.indkey::int2[]) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         ) = (SELECT array_agg(c ORDER BY c) FROM unnest(ARRAY[item[3], 'tenant_id']) AS c)
    ) INTO per_agency;

    IF NOT per_agency THEN
      RAISE EXCEPTION '375: % has no UNIQUE (tenant_id, %) — refusing to drop %, which would leave the number with no uniqueness at all',
        item[1], item[3], item[2];
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', item[1], item[2]);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
