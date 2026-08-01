-- =====================================================================
-- 269 — Activity Summary phase 2: per-user attribution columns
-- =====================================================================
-- Phase 1 (267) could only count what the schema attributed: tasks,
-- itineraries, copilot reviews. These columns attribute the rest —
-- outbound messages, B2C quotes, invoices — to the staff member who
-- performed the action, so /api/activity can count real output.
--
-- All nullable, all attribution-only (no behavior change):
--   - NULL means system/bot/pre-269. The WhatsApp webhook auto-reply and
--     the AI agent deliberately do NOT set sent_by — a bot reply is not
--     staff activity. Counts start the day this lands; historical rows
--     stay unattributed and the UI says so rather than faking it.
--   - ON DELETE SET NULL: removing a user must never cascade into
--     message/quote/invoice history.
-- =====================================================================

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE b2c_quotes
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Activity queries filter by (tenant, sender/creator, time window).
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_by
  ON whatsapp_messages (tenant_id, sent_by) WHERE sent_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_by
  ON email_messages (tenant_id, sent_by) WHERE sent_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2c_quotes_created_by
  ON b2c_quotes (tenant_id, created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_created_by
  ON invoices (tenant_id, created_by) WHERE created_by IS NOT NULL;
