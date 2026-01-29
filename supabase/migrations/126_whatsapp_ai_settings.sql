-- ============================================
-- Migration: Add WhatsApp AI Settings
-- ============================================
-- Adds whatsapp_ai_enabled flag to tenant_features table
-- for controlling AI auto-reply per tenant
-- ============================================

-- Add whatsapp_ai_enabled column to tenant_features
ALTER TABLE tenant_features
ADD COLUMN IF NOT EXISTS whatsapp_ai_enabled BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN tenant_features.whatsapp_ai_enabled IS 'Enable AI-powered auto-replies for WhatsApp messages';

-- Update existing rows to have a default value
UPDATE tenant_features
SET whatsapp_ai_enabled = false
WHERE whatsapp_ai_enabled IS NULL;
