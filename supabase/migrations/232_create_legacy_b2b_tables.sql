-- =====================================================================
-- Migration 232: Create the legacy B2B tables (schema audit follow-up)
-- =====================================================================
-- tour_quotes, b2b_pricing_rules, b2b_partner_pricing and
-- b2b_transport_packages are referenced by app code and by migration 223,
-- but were hand-created in the ORIGINAL (sibling) database and never had
-- DDL in any repo — so this multi-tenant deployment never got them, and
-- the B2B pricing-rules / ready-made-quote screens error.
--
-- Schemas below are extracted 1:1 from the sibling's live database
-- (travel-ops-pro, 2026-07-16). Deliberately NO tenant_id and NO RLS
-- here: migration 223 exists precisely to add both — RE-RUN 223 AFTER
-- THIS (it is idempotent and its backfills no-op on empty tables).
-- =====================================================================

CREATE TABLE IF NOT EXISTS tour_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(255) NOT NULL,
  variation_id UUID,
  partner_id UUID,
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(255),
  client_nationality VARCHAR(255),
  travel_date DATE,
  num_adults INTEGER NOT NULL DEFAULT 2,
  num_children INTEGER DEFAULT 0,
  services_snapshot JSONB,
  total_cost NUMERIC,
  margin_percent NUMERIC,
  margin_amount NUMERIC,
  selling_price NUMERIC,
  price_per_person NUMERIC,
  currency VARCHAR(10) DEFAULT 'EUR',
  status VARCHAR(50) DEFAULT 'draft',
  valid_until DATE,
  converted_to_itinerary_id UUID,
  converted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  tour_leader_included BOOLEAN DEFAULT FALSE,
  tour_leader_cost NUMERIC,
  single_supplement NUMERIC,
  is_eur_passport BOOLEAN DEFAULT TRUE,
  season VARCHAR(100),
  itinerary_id UUID,
  trip_name TEXT,
  source VARCHAR(50) DEFAULT 'b2b_template',
  version INTEGER DEFAULT 1,
  last_modified_by UUID,
  last_modified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tour_quotes_number ON tour_quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_tour_quotes_variation ON tour_quotes(variation_id);
CREATE INDEX IF NOT EXISTS idx_tour_quotes_partner ON tour_quotes(partner_id);
CREATE INDEX IF NOT EXISTS idx_tour_quotes_status ON tour_quotes(status);

CREATE TABLE IF NOT EXISTS b2b_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_table VARCHAR(100),
  rate_id UUID,
  service_name VARCHAR(255),
  service_category VARCHAR(100),
  pricing_model VARCHAR(50) NOT NULL DEFAULT 'per_person',
  unit_type VARCHAR(50),
  unit_capacity INTEGER,
  tier1_min_pax INTEGER DEFAULT 1,
  tier1_max_pax INTEGER,
  tier1_rate_eur NUMERIC,
  tier1_label VARCHAR(100),
  tier2_min_pax INTEGER,
  tier2_max_pax INTEGER,
  tier2_rate_eur NUMERIC,
  tier2_label VARCHAR(100),
  tier3_min_pax INTEGER,
  tier3_max_pax INTEGER,
  tier3_rate_eur NUMERIC,
  tier3_label VARCHAR(100),
  tier4_min_pax INTEGER,
  tier4_max_pax INTEGER,
  tier4_rate_eur NUMERIC,
  tier4_label VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  applies_to VARCHAR(50) DEFAULT 'both'
);
CREATE INDEX IF NOT EXISTS idx_b2b_pricing_rules_active ON b2b_pricing_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_b2b_pricing_rules_service ON b2b_pricing_rules(service_name);

CREATE TABLE IF NOT EXISTS b2b_partner_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL,
  variation_id UUID NOT NULL,
  margin_percent_override NUMERIC,
  fixed_price_per_pax NUMERIC,
  price_1_pax NUMERIC,
  price_2_pax NUMERIC,
  price_3_pax NUMERIC,
  price_4_pax NUMERIC,
  price_5_pax NUMERIC,
  price_6_pax NUMERIC,
  price_7_plus_pax NUMERIC,
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_b2b_partner_pricing_partner ON b2b_partner_pricing(partner_id);
CREATE INDEX IF NOT EXISTS idx_b2b_partner_pricing_variation ON b2b_partner_pricing(variation_id);

CREATE TABLE IF NOT EXISTS b2b_transport_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code VARCHAR(100) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  package_type VARCHAR(50) NOT NULL,
  origin_city VARCHAR(100),
  destination_city VARCHAR(100),
  duration_days INTEGER DEFAULT 1,
  sedan_rate NUMERIC,
  sedan_capacity INTEGER DEFAULT 3,
  minivan_rate NUMERIC,
  minivan_capacity INTEGER DEFAULT 7,
  van_rate NUMERIC,
  van_capacity INTEGER DEFAULT 12,
  minibus_rate NUMERIC,
  minibus_capacity INTEGER DEFAULT 20,
  bus_rate NUMERIC,
  bus_capacity INTEGER DEFAULT 50,
  description TEXT,
  includes TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_b2b_transport_code ON b2b_transport_packages(package_code);
CREATE INDEX IF NOT EXISTS idx_b2b_transport_route ON b2b_transport_packages(origin_city, destination_city);
