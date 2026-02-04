-- =====================================================================
-- Migration 132: Update Itinerary Services Table Schema
-- Description: Adds ALL missing columns to itinerary_services table
-- Date: 2026-02-04
-- =====================================================================

-- =====================================================================
-- PRICING COLUMNS
-- =====================================================================

-- Add service_code column (unique code for each service type)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS service_code VARCHAR(50);

-- Add client_price column (price charged to client after margin)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS client_price DECIMAL(10,2) DEFAULT 0;

-- Add rate_eur column (EUR passport rate)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS rate_eur DECIMAL(10,2) DEFAULT 0;

-- Add rate_non_eur column (non-EUR passport rate)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS rate_non_eur DECIMAL(10,2) DEFAULT 0;

-- Add selling_price column (final price to client)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10,2) DEFAULT 0;

-- Add cost column (supplier cost)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) DEFAULT 0;

-- Add currency column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';

-- =====================================================================
-- DAY REFERENCE COLUMNS
-- =====================================================================

-- Add itinerary_day_id column (the code uses this instead of day_id)
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS itinerary_day_id UUID REFERENCES itinerary_days(id) ON DELETE CASCADE;

-- Copy existing day_id values to itinerary_day_id
UPDATE itinerary_services
SET itinerary_day_id = day_id
WHERE itinerary_day_id IS NULL AND day_id IS NOT NULL;

-- =====================================================================
-- NOTES AND METADATA
-- =====================================================================

-- Add notes column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add is_optional flag for add-on services
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT false;

-- =====================================================================
-- COMMISSION TRACKING
-- =====================================================================

-- Add commission_rate column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2);

-- Add commission_percent column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5,2);

-- Add commission_amount column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);

-- Add commission_status column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS commission_status VARCHAR(20) DEFAULT 'pending';

-- Add is_preferred_supplier flag
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS is_preferred_supplier BOOLEAN DEFAULT false;

-- =====================================================================
-- TRANSPORT-SPECIFIC FIELDS
-- =====================================================================

-- Add vehicle_type column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50);

-- Add driver_name column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100);

-- Add driver_phone column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50);

-- Add pickup_location column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(255);

-- Add dropoff_location column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS dropoff_location VARCHAR(255);

-- Add pickup_time column
ALTER TABLE itinerary_services
ADD COLUMN IF NOT EXISTS pickup_time TIME;

-- =====================================================================
-- CONSTRAINTS AND INDEXES
-- =====================================================================

-- Update service_type CHECK constraint to include more types
ALTER TABLE itinerary_services DROP CONSTRAINT IF EXISTS itinerary_services_service_type_check;
ALTER TABLE itinerary_services ADD CONSTRAINT itinerary_services_service_type_check
  CHECK (service_type IN ('accommodation', 'transportation', 'guide', 'entrance', 'entrance_fee', 'meal', 'tip', 'tips', 'flight', 'transfer', 'cruise', 'activity', 'supplies', 'service_fee', 'hotel', 'other'));

-- Update commission_status CHECK constraint (drop and recreate to avoid conflicts)
ALTER TABLE itinerary_services DROP CONSTRAINT IF EXISTS itinerary_services_commission_status_check;
ALTER TABLE itinerary_services ADD CONSTRAINT itinerary_services_commission_status_check
  CHECK (commission_status IN ('pending', 'invoiced', 'paid', 'waived', 'generated'));

-- Create index for itinerary_day_id
CREATE INDEX IF NOT EXISTS idx_itinerary_services_day_id ON itinerary_services(itinerary_day_id);

-- Create index for service_code
CREATE INDEX IF NOT EXISTS idx_itinerary_services_code ON itinerary_services(service_code);

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 132 Added to itinerary_services table:
-- PRICING:
--   ✅ service_code VARCHAR(50)
--   ✅ client_price DECIMAL(10,2)
--   ✅ rate_eur DECIMAL(10,2)
--   ✅ rate_non_eur DECIMAL(10,2)
--   ✅ selling_price DECIMAL(10,2)
--   ✅ cost DECIMAL(10,2)
--   ✅ currency VARCHAR(3)
-- DAY REFERENCE:
--   ✅ itinerary_day_id UUID
-- NOTES:
--   ✅ notes TEXT
--   ✅ is_optional BOOLEAN
-- COMMISSION:
--   ✅ commission_rate DECIMAL(5,2)
--   ✅ commission_percent DECIMAL(5,2)
--   ✅ commission_amount DECIMAL(10,2)
--   ✅ commission_status VARCHAR(20)
--   ✅ is_preferred_supplier BOOLEAN
-- TRANSPORT:
--   ✅ vehicle_type VARCHAR(50)
--   ✅ driver_name VARCHAR(100)
--   ✅ driver_phone VARCHAR(50)
--   ✅ pickup_location VARCHAR(255)
--   ✅ dropoff_location VARCHAR(255)
--   ✅ pickup_time TIME
-- CONSTRAINTS:
--   ✅ Updated service_type CHECK constraint
--   ✅ Added commission_status CHECK constraint
--   ✅ Added indexes
