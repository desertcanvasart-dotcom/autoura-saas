-- ============================================
-- MIGRATION 208: Link communication_threads to the canonical unified_conversations
-- ============================================
-- Migration 202 (email_conversations) was never applied to the live DB — the
-- canonical inbox model is migration 125's unified_conversations. This adds a
-- direct FK so the copilot's threads/drafts/inbox rows can link to the real
-- customer conversation.
-- ============================================

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS unified_conversation_id UUID REFERENCES unified_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comm_threads_unified
  ON communication_threads(unified_conversation_id);
