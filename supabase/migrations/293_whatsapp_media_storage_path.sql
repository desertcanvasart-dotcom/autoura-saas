-- ============================================================================
-- 293 — whatsapp_messages.media_storage_path: close the public media bucket
-- ============================================================================
--
-- Inbound WhatsApp media was downloaded into the `whatsapp-media` bucket,
-- which the webhook created with `public: true`, and the resulting
-- `getPublicUrl()` was stored in `media_url` and rendered as a link in
-- /conversations. A public Supabase bucket serves every object to anyone
-- holding the URL — no session, no tenant check.
--
-- This is worse than the supplier-invoice case fixed alongside it, for two
-- reasons:
--
--   IT IS THE CUSTOMER'S FILE, not ours. Whatever a traveller sends into a
--   WhatsApp thread lands here: a passport page for a visa application, a
--   payment receipt, a photo of a booking voucher.
--
--   THE PATH HAS NO TENANT PREFIX. Objects are written to
--   `inbound/<message_sid>.<ext>` — one flat namespace shared by every
--   tenant, so the path cannot even be used to scope a guess.
--
-- WHY A COLUMN AND NOT A REUSED ONE. `media_url` legitimately holds URLs we
-- do NOT own and must not rewrite: Twilio serves inbound media from its own
-- host, and lib/whatsapp-ai-agent stores the outbound quote PDF's URL there.
-- Mixing "a link someone else hosts" and "a path in our private bucket" in one
-- column is how the next reader gets it wrong. Ours gets its own column, and
-- its presence is what tells the UI to route through the signed-URL endpoint.
--
-- NOT NULLABLE-CONSTRAINED and no backfill here: existing rows are backfilled
-- by scripts/make-whatsapp-media-private.mjs, which derives the path from the
-- public URL already stored and can be re-run.
--
-- The `unified_messages` view is deliberately NOT updated: it does not expose
-- media to any caller that renders it (app code reads `whatsapp_messages`
-- directly via `select('*')`, so the new column flows through on its own).
-- ============================================================================

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

COMMENT ON COLUMN whatsapp_messages.media_storage_path IS
  'Path to inbound media in the PRIVATE whatsapp-media bucket. Read only via GET /api/whatsapp/media/[id], which re-checks permission and signs a short-lived URL. media_url is for externally hosted links (Twilio media, outbound PDFs) — never a public URL for one of our own objects.';
