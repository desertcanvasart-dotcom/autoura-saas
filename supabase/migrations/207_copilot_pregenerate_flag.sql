-- ============================================
-- MIGRATION 207: per-tenant copilot pregeneration flag
-- ============================================
-- Opt-in switch. When true, new inbound messages (WhatsApp webhook + email
-- sync) trigger the copilot to draft replies in the background BEFORE the
-- agent opens the thread. Drafts are still reviewed before sending — this
-- is NOT auto-reply.
-- ============================================

ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS copilot_pregenerate_enabled BOOLEAN NOT NULL DEFAULT FALSE;
