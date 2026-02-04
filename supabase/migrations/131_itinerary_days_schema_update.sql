-- =====================================================================
-- Migration 131: Update Itinerary Days Table Schema
-- Description: Adds missing columns to itinerary_days table
-- Date: 2026-02-04
-- =====================================================================

-- Add attractions column (array of attraction names visited this day)
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS attractions TEXT[] DEFAULT '{}';

-- Add lunch_included column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS lunch_included BOOLEAN DEFAULT false;

-- Add dinner_included column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS dinner_included BOOLEAN DEFAULT false;

-- Add hotel_included column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS hotel_included BOOLEAN DEFAULT true;

-- Add flight_from column (for flight arrival/departure tracking)
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS flight_from VARCHAR(100);

-- Add flight_to column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS flight_to VARCHAR(100);

-- Add is_cruise_day column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS is_cruise_day BOOLEAN DEFAULT false;

-- Add is_sailing_day column (sailing between ports, limited activities)
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS is_sailing_day BOOLEAN DEFAULT false;

-- Add is_transfer_only column
ALTER TABLE itinerary_days
ADD COLUMN IF NOT EXISTS is_transfer_only BOOLEAN DEFAULT false;

-- Create index for attractions
CREATE INDEX IF NOT EXISTS idx_itinerary_days_attractions ON itinerary_days USING GIN(attractions);

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 131 Added to itinerary_days table:
-- ✅ attractions TEXT[] (array of attraction names)
-- ✅ lunch_included BOOLEAN
-- ✅ dinner_included BOOLEAN
-- ✅ hotel_included BOOLEAN
-- ✅ flight_from VARCHAR(100)
-- ✅ flight_to VARCHAR(100)
-- ✅ is_cruise_day BOOLEAN
-- ✅ is_sailing_day BOOLEAN
-- ✅ is_transfer_only BOOLEAN
-- ✅ Added GIN index for attractions array
