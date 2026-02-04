-- =====================================================================
-- Migration 129: Update Clients Table Schema
-- Description: Adds missing columns to clients table that the code expects
-- Date: 2026-02-04
-- =====================================================================

-- Add first_name and last_name columns (splitting full_name)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Make full_name nullable (we now use first_name/last_name)
ALTER TABLE clients ALTER COLUMN full_name DROP NOT NULL;

-- Set default for full_name to empty string for new inserts
ALTER TABLE clients ALTER COLUMN full_name SET DEFAULT '';

-- Populate first_name and last_name from full_name (for existing records)
UPDATE clients
SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = CASE
    WHEN POSITION(' ' IN full_name) > 0
    THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
    ELSE SPLIT_PART(full_name, ' ', 1)
  END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Create trigger function to auto-populate full_name from first_name + last_name
CREATE OR REPLACE FUNCTION update_client_full_name()
RETURNS TRIGGER AS $$
BEGIN
  -- If full_name is not provided but first_name/last_name are, generate it
  IF (NEW.full_name IS NULL OR NEW.full_name = '') AND (NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL) THEN
    NEW.full_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before insert/update
DROP TRIGGER IF EXISTS trigger_update_client_full_name ON clients;
CREATE TRIGGER trigger_update_client_full_name
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_client_full_name();

-- Add client_type column
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS client_type VARCHAR(50) DEFAULT 'individual'
  CHECK (client_type IN ('individual', 'family', 'group', 'corporate', 'agent'));

-- Add passport_type column
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS passport_type VARCHAR(50) DEFAULT 'other'
  CHECK (passport_type IN ('normal', 'diplomatic', 'service', 'official', 'other'));

-- Add preferred_language column (alias for existing language column)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50) DEFAULT 'English';

-- Copy existing language values to preferred_language
UPDATE clients
SET preferred_language = COALESCE(language, 'English')
WHERE preferred_language IS NULL OR preferred_language = 'English';

-- Add client_source column (alias for existing source column)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS client_source VARCHAR(50) DEFAULT 'direct'
  CHECK (client_source IN ('direct', 'referral', 'website', 'social_media', 'whatsapp', 'email', 'partner', 'other'));

-- Copy existing source values to client_source
UPDATE clients
SET client_source = COALESCE(source, 'direct')
WHERE client_source IS NULL OR client_source = 'direct';

-- Add vip_status column
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS vip_status BOOLEAN DEFAULT false;

-- Add lead_source column for tracking where leads come from
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS lead_source VARCHAR(100);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_clients_first_name ON clients(first_name);
CREATE INDEX IF NOT EXISTS idx_clients_last_name ON clients(last_name);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_vip_status ON clients(vip_status);
CREATE INDEX IF NOT EXISTS idx_clients_client_source ON clients(client_source);

-- Update status constraint to include 'prospect' (used by WhatsApp parser)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active', 'inactive', 'blocked', 'prospect', 'lead'));

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 129 Added to clients table:
-- ✅ first_name VARCHAR(100)
-- ✅ last_name VARCHAR(100)
-- ✅ Made full_name nullable (was NOT NULL)
-- ✅ Added trigger to auto-populate full_name from first_name + last_name
-- ✅ client_type VARCHAR(50) with CHECK constraint
-- ✅ passport_type VARCHAR(50) with CHECK constraint
-- ✅ preferred_language VARCHAR(50)
-- ✅ client_source VARCHAR(50) with CHECK constraint
-- ✅ vip_status BOOLEAN
-- ✅ lead_source VARCHAR(100)
-- ✅ Updated status constraint to include 'prospect' and 'lead'
-- ✅ Added indexes for new columns
