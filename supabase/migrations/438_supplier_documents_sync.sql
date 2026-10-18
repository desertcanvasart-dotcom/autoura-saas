-- ============================================================================
-- 438 — Supplier documents that stay in step with their itinerary
-- ============================================================================
--
-- "Generate documents" made a document once and skipped it on every later
-- run, so a trip edited after its first Generate never reached its
-- documents (live ITN-S-2026-8987: the newest guide, meals and entrance
-- documents each missed services; the hotel and transport ones were older,
-- per-city leftovers). Generate becomes Sync (lib/documents/plan-supplier-documents.ts, syncSupplierDocuments):
-- it updates the drafts it made, retires the ones the trip no longer needs,
-- and never overwrites a document a person edited or sent — it says so.
--
-- For that it needs to know, of each document:
--   sync_key     which planned document it is (kind and supplier or hotel,
--                and the stay), stable across syncs;
--   synced_hash  a hash of the lines Sync last wrote. Lines that still hash
--                to it were not edited by hand, so Sync may update them.
-- Both NULL on documents made before Sync: those are never changed by Sync
-- (listed as out of date when their lines left the trip, as before).
--
-- Additive and replay-safe. Apply BEFORE deploying the code that writes them.
-- ============================================================================

BEGIN;

ALTER TABLE public.supplier_documents ADD COLUMN IF NOT EXISTS sync_key TEXT;
ALTER TABLE public.supplier_documents ADD COLUMN IF NOT EXISTS synced_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_supplier_documents_itinerary_sync_key
  ON public.supplier_documents (itinerary_id, sync_key);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'supplier_documents' AND column_name = 'sync_key')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'supplier_documents' AND column_name = 'synced_hash') THEN
    RAISE EXCEPTION 'supplier_documents.sync_key / synced_hash were not added';
  END IF;
END $$;

COMMIT;
