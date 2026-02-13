-- =====================================================================
-- Migration 152: Add nationality and language columns to itineraries
-- Description: Enables proper nationality-based rate selection (EUR vs
-- non-EUR) and guide language assignment on itinerary records
-- Date: 2026-02-13
-- =====================================================================

-- Add nationality column to itineraries
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);

-- Add language column to itineraries (guide language for this trip)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS language VARCHAR(50) DEFAULT 'English';

-- Add is_euro_passport for quick rate lookup
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS is_euro_passport BOOLEAN DEFAULT false;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_itineraries_nationality ON itineraries(nationality);

-- Add comments
COMMENT ON COLUMN itineraries.nationality IS 'Client nationality — determines EUR vs non-EUR entrance fee and supplier rates';
COMMENT ON COLUMN itineraries.language IS 'Guide language for this trip — inferred from nationality or explicitly set';
COMMENT ON COLUMN itineraries.is_euro_passport IS 'Whether client uses EUR rates (Eurozone/EEA passport) — affects all pricing';
