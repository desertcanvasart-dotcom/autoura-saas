-- ============================================
-- MIGRATION 204: Align whatsapp_messages with app code
-- ============================================
-- The app code writes message_body / message_sid / metadata, but the table
-- previously only had message_text. This adds the missing columns and keeps
-- message_text auto-synced for backwards compat.
-- ============================================

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_body TEXT,
  ADD COLUMN IF NOT EXISTS message_sid  TEXT,
  ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}'::jsonb;

UPDATE whatsapp_messages
   SET message_body = message_text
 WHERE message_body IS NULL;

CREATE OR REPLACE FUNCTION sync_whatsapp_message_text()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.message_body IS NULL AND NEW.message_text IS NOT NULL THEN
    NEW.message_body := NEW.message_text;
  ELSIF NEW.message_text IS NULL AND NEW.message_body IS NOT NULL THEN
    NEW.message_text := NEW.message_body;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_whatsapp_message_text ON whatsapp_messages;
CREATE TRIGGER trg_sync_whatsapp_message_text
  BEFORE INSERT OR UPDATE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION sync_whatsapp_message_text();

ALTER TABLE whatsapp_messages ALTER COLUMN message_text DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_message_sid
  ON whatsapp_messages(message_sid) WHERE message_sid IS NOT NULL;

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
