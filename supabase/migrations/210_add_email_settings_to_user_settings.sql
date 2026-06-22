-- =====================================================================
-- Migration 210: Add email_settings column to user_settings
-- Description: Per-user email preferences (signature, auto-reply) used by
--              /api/settings/email. Stored as JSONB alongside the existing
--              per-user notification_preferences. Scoped by user_id (NOT a
--              singleton row) to match our per-user user_settings model.
-- Date: 2026-06-22
-- =====================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS email_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_settings.email_settings IS 'Per-user email preferences: { signature, auto_reply_enabled, auto_reply_message, gmail_connected, gmail_email }';
