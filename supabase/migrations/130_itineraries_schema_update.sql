-- =====================================================================
-- Migration 130: Update Itineraries Table Schema
-- Description: Adds missing columns to itineraries table that the code expects
-- Date: 2026-02-04
-- =====================================================================

-- Add cost_mode column (auto = AI calculates costs, manual = user enters costs)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS cost_mode VARCHAR(20) DEFAULT 'auto'
  CHECK (cost_mode IN ('auto', 'manual'));

-- Add total_revenue column (for tracking revenue)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;

-- Add tenant_id for multi-tenancy (if not exists)
ALTER TABLE itineraries
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Create index for cost_mode
CREATE INDEX IF NOT EXISTS idx_itineraries_cost_mode ON itineraries(cost_mode);

-- Create index for tenant_id
CREATE INDEX IF NOT EXISTS idx_itineraries_tenant ON itineraries(tenant_id);

-- =====================================================================
-- SUMMARY
-- =====================================================================

-- Migration 130 Added to itineraries table:
-- ✅ cost_mode VARCHAR(20) with CHECK constraint
-- ✅ total_revenue DECIMAL(12,2)
-- ✅ tenant_id UUID (for multi-tenancy)
-- ✅ Added indexes for new columns
