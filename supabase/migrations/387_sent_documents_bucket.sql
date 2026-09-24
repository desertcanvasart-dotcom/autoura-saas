-- ============================================================================
-- 387 — A private bucket for the PDFs we send by WhatsApp
-- ============================================================================
-- Operator, 2026-09-24: "Send Contract via WhatsApp" → "Failed to upload PDF:
-- Bucket not found". The contract, invoice and supplier-document senders
-- upload to a `documents` bucket that was never created on production (live
-- buckets: quote-pdfs, supplier-contracts, tenant-logos, traveller-documents).
--
-- These PDFs carry clients' names, trips and prices, so the bucket is
-- PRIVATE: objects are written and signed by the server (service role, which
-- storage RLS does not restrict) under a tenant-first path, and shared as a
-- 7-day signed link (lib/storage/shareable-pdf.ts). No policy grants
-- authenticated users anything here — nothing in the browser reads it.

-- id/name/public only, like 301 and 332 (the replay test's storage stub
-- carries just these; only the server writes here, and only PDFs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('sent-documents', 'sent-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;
