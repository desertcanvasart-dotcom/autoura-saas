-- ============================================================================
-- 465 — a company blocks WhatsApp numbers
-- ============================================================================
-- Operator, 2026-11-12: "is it possible to add block numbers on the
-- WhatsApp?". Until now every inbound message was filed: a spammer or an
-- abusive sender became a conversation, rang the bell, was made a CRM lead and
-- could get the AI auto-reply.
--
-- One row = one number this company does not want to hear from. Per company
-- (the white-label rule): Travel2Egypt blocking a number never touches another
-- company's inbox.
--
-- What blocking does (app/api/whatsapp/webhook, lib/whatsapp-blocked.ts): a
-- message from the number is NOT stored — no conversation, no message, no
-- bell, no CRM lead, no AI reply. Only two things are kept, on this row, so a
-- manager can see the block is working: how many messages were ignored and
-- when the last one came. Never what they said.
--
-- It blocks inside Autoura only. The sender's WhatsApp still delivers to the
-- number; a WhatsApp-level block exists only on Meta's Cloud API (not Twilio).
--
--   phone_number           — E.164 ("+2010…"), as lib/whatsapp-tenant.ts
--                            toWhatsAppE164 writes it. One row per number.
--   reason                 — the manager's own note, optional.
--   blocked_by             — the login who blocked it.
--   blocked_message_count  — messages ignored since it was blocked.
--   last_blocked_at        — when the last one came.
--
-- Who: everyone in the company sees the list (the inbox shows "Blocked");
-- owners, admins and managers block and unblock. The webhook writes the count
-- with the service connection, which RLS does not limit.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_blocked_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  reason TEXT,
  blocked_by UUID DEFAULT auth.uid(),
  blocked_message_count INTEGER NOT NULL DEFAULT 0,
  last_blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_blocked_numbers_one_per_company UNIQUE (tenant_id, phone_number)
);

COMMENT ON TABLE whatsapp_blocked_numbers IS
  'Numbers a company blocked on WhatsApp: their messages are not stored, notified, '
  'made leads or auto-answered (migration 465). Inside Autoura only.';
COMMENT ON COLUMN whatsapp_blocked_numbers.phone_number IS 'E.164, e.g. +201001234567.';
COMMENT ON COLUMN whatsapp_blocked_numbers.blocked_message_count IS
  'Messages ignored since the block. Their content is never kept.';

ALTER TABLE whatsapp_blocked_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_blocked_numbers_read ON whatsapp_blocked_numbers;
CREATE POLICY whatsapp_blocked_numbers_read ON whatsapp_blocked_numbers
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS whatsapp_blocked_numbers_write ON whatsapp_blocked_numbers;
CREATE POLICY whatsapp_blocked_numbers_write ON whatsapp_blocked_numbers
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND user_has_role(ARRAY['owner', 'admin', 'manager']::TEXT[]))
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_has_role(ARRAY['owner', 'admin', 'manager']::TEXT[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_blocked_numbers TO authenticated;

COMMIT;

-- ============================================================================
-- Verify after applying:
--   SELECT count(*) FROM whatsapp_blocked_numbers;   -- 0: nothing is blocked yet
-- ============================================================================
