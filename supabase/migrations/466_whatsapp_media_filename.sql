-- ============================================================================
-- 466 — a WhatsApp attachment keeps its own file name
-- ============================================================================
-- Operator, 2026-11-13: files on WhatsApp could be opened but not downloaded
-- properly — a saved PDF came out named after an internal id, and the inbox
-- could not send files at all. The inbox now sends photos, video and
-- documents (PDF, Word, Excel, PowerPoint, text, CSV) and offers a Download
-- that saves each file under its own name (lib/whatsapp/attachments.ts).
--
--   media_filename — the file's own name: the one staff attached, or the one
--                    the customer's WhatsApp sent with a document (Meta).
--                    NULL when the provider gives none (Twilio inbound, photos):
--                    the download then makes one from the date and type.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_filename TEXT;

COMMENT ON COLUMN whatsapp_messages.media_filename IS
  'The attachment''s own file name (sent by staff, or given by the customer''s '
  'WhatsApp for a document). NULL = none given; downloads make one up.';

COMMIT;

-- Verify after applying:
--   SELECT count(*) FROM whatsapp_messages WHERE media_filename IS NOT NULL;  -- 0 at first
