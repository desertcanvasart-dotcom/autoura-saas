-- ============================================
-- MIGRATION 007: CREATE TOURS & TEMPLATES TABLES
-- ============================================
-- Creates tours and templates modules with multi-tenancy built-in
-- Created: 2026-01-23
--
-- SCOPE:
-- - Tours module: tour_templates, variations, pricing, rates
-- - Templates module: message_templates, placeholders, send_log, tokens
-- - All tables created with tenant_id from the start
-- ============================================

-- ============================================
-- PART 0: HANDLE EXISTING tour_templates TABLE
-- ============================================
-- Migration 000 created a basic tour_templates without tenant_id
-- We need to drop it and recreate with proper structure

DROP TABLE IF EXISTS tour_templates CASCADE;

-- ============================================
-- PART 1: TOURS MODULE CORE TABLES (IN DEPENDENCY ORDER)
-- ============================================

-- 1.1: Tour Categories (NO DEPENDENCIES)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  category_name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_tour_categories_tenant ON tour_categories(tenant_id);

-- 1.2: Destinations (NO DEPENDENCIES)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  destination_name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  country VARCHAR(100),
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_destinations_tenant ON destinations(tenant_id);

-- 1.3: Content Categories (NO DEPENDENCIES)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS content_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  icon VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_content_categories_tenant ON content_categories(tenant_id);

-- 1.4: Content Library (DEPENDS ON: content_categories)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES content_categories(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  short_description TEXT,
  long_description TEXT,

  location VARCHAR(255),
  duration VARCHAR(50),

  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_content_library_tenant ON content_library(tenant_id);
CREATE INDEX idx_content_library_category ON content_library(category_id);

-- 1.5: Tour Templates (DEPENDS ON: tour_categories, destinations)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  short_description TEXT,
  long_description TEXT,

  duration_days INTEGER NOT NULL DEFAULT 1,
  duration_nights INTEGER NOT NULL DEFAULT 0,

  category_id UUID REFERENCES tour_categories(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,

  highlights TEXT[],
  main_attractions TEXT[],

  is_active BOOLEAN DEFAULT true,
  uses_day_builder BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tour_templates_tenant ON tour_templates(tenant_id);
CREATE INDEX idx_tour_templates_category ON tour_templates(category_id);
CREATE INDEX idx_tour_templates_destination ON tour_templates(destination_id);
CREATE INDEX idx_tour_templates_code ON tour_templates(template_code);

-- 1.6: Tour Variations (DEPENDS ON: tour_templates)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES tour_templates(id) ON DELETE CASCADE,

  variation_code VARCHAR(50) UNIQUE NOT NULL,
  variation_name VARCHAR(255) NOT NULL,

  tier VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (tier IN ('budget', 'standard', 'deluxe', 'luxury')),
  group_type VARCHAR(20) DEFAULT 'private' CHECK (group_type IN ('private', 'shared', 'group')),

  min_pax INTEGER DEFAULT 2,
  max_pax INTEGER DEFAULT 30,

  guide_type VARCHAR(50),
  guide_languages TEXT[],
  vehicle_type VARCHAR(100),

  inclusions TEXT[],
  exclusions TEXT[],
  optional_extras JSONB,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tour_variations_tenant ON tour_variations(tenant_id);
CREATE INDEX idx_tour_variations_template ON tour_variations(template_id);
CREATE INDEX idx_tour_variations_code ON tour_variations(variation_code);

-- 1.7: Tour Days (DEPENDS ON: tour_templates)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES tour_templates(id) ON DELETE CASCADE,

  day_number INTEGER NOT NULL,
  city VARCHAR(100),

  accommodation_id UUID,
  breakfast_included BOOLEAN DEFAULT true,
  lunch_meal_id UUID,
  dinner_meal_id UUID,

  guide_required BOOLEAN DEFAULT false,
  guide_id UUID,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, day_number)
);

CREATE INDEX idx_tour_days_tenant ON tour_days(tenant_id);
CREATE INDEX idx_tour_days_template ON tour_days(template_id);

-- 1.8: Tour Day Activities (DEPENDS ON: tour_templates, tour_days, content_library)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_day_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES tour_templates(id) ON DELETE CASCADE,
  tour_day_id UUID REFERENCES tour_days(id) ON DELETE CASCADE,

  day_number INTEGER,
  sequence_order INTEGER DEFAULT 1,

  content_id UUID REFERENCES content_library(id) ON DELETE SET NULL,
  activity_type VARCHAR(50),
  activity_name VARCHAR(255),
  city VARCHAR(100),

  duration_hours DECIMAL(4,2),
  start_time TIME,

  entrance_id UUID,
  transportation_id UUID,

  is_optional BOOLEAN DEFAULT false,
  is_included BOOLEAN DEFAULT true,
  requires_guide BOOLEAN DEFAULT true,

  notes TEXT,
  activity_notes TEXT,
  internal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tour_day_activities_tenant ON tour_day_activities(tenant_id);
CREATE INDEX idx_tour_day_activities_template ON tour_day_activities(template_id);
CREATE INDEX idx_tour_day_activities_day ON tour_day_activities(tour_day_id);
CREATE INDEX idx_tour_day_activities_content ON tour_day_activities(content_id);

-- 1.9: Variation Daily Itinerary (DEPENDS ON: tour_variations)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS variation_daily_itinerary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,

  day_number INTEGER NOT NULL,
  title VARCHAR(255),
  day_title VARCHAR(255),
  description TEXT,
  day_description TEXT,

  city VARCHAR(100),
  overnight_city VARCHAR(100),

  breakfast_included BOOLEAN DEFAULT true,
  lunch_included BOOLEAN DEFAULT false,
  dinner_included BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(variation_id, day_number)
);

CREATE INDEX idx_variation_daily_itinerary_tenant ON variation_daily_itinerary(tenant_id);
CREATE INDEX idx_variation_daily_itinerary_variation ON variation_daily_itinerary(variation_id);

-- ============================================
-- PART 2: TOURS TABLE (for saved tours)
-- ============================================

CREATE TABLE IF NOT EXISTS tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  tour_code VARCHAR(50) UNIQUE NOT NULL,
  tour_name VARCHAR(255) NOT NULL,
  duration_days INTEGER NOT NULL,
  cities TEXT[],
  tour_type VARCHAR(50),
  is_template BOOLEAN DEFAULT false,
  description TEXT,
  created_by VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tours_tenant ON tours(tenant_id);
CREATE INDEX idx_tours_code ON tours(tour_code);

-- ============================================
-- PART 3: PRICING & SERVICES TABLES
-- ============================================

-- 3.1: Tour Pricing (DEPENDS ON: tours)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,

  pax INTEGER NOT NULL,
  is_euro_passport BOOLEAN DEFAULT true,

  total_accommodation DECIMAL(10,2) DEFAULT 0,
  total_meals DECIMAL(10,2) DEFAULT 0,
  total_guides DECIMAL(10,2) DEFAULT 0,
  total_transportation DECIMAL(10,2) DEFAULT 0,
  total_entrances DECIMAL(10,2) DEFAULT 0,

  grand_total DECIMAL(10,2) NOT NULL,
  per_person_total DECIMAL(10,2) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tour_pricing_tenant ON tour_pricing(tenant_id);
CREATE INDEX idx_tour_pricing_tour ON tour_pricing(tour_id);

-- 3.2: Variation Pricing (DEPENDS ON: tour_variations)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS variation_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,

  pax_count INTEGER NOT NULL,
  price_per_person DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,

  season VARCHAR(50),
  valid_from DATE,
  valid_until DATE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variation_pricing_tenant ON variation_pricing(tenant_id);
CREATE INDEX idx_variation_pricing_variation ON variation_pricing(variation_id);

-- 3.3: Variation Services - Legacy (DEPENDS ON: tour_variations)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS variation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,

  service_category VARCHAR(50),
  service_name VARCHAR(255),
  quantity_type VARCHAR(20) DEFAULT 'per_pax',
  cost_per_unit DECIMAL(10,2) DEFAULT 0,
  applies_to_day INTEGER,
  is_mandatory BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_variation_services_tenant ON variation_services(tenant_id);
CREATE INDEX idx_variation_services_variation ON variation_services(variation_id);

-- 3.4: Tour Variation Services - New System (DEPENDS ON: tour_variations)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS tour_variation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES tour_variations(id) ON DELETE CASCADE,

  service_name VARCHAR(255) NOT NULL,
  service_category VARCHAR(50),

  rate_type VARCHAR(50),
  rate_id UUID,

  quantity_mode VARCHAR(20) DEFAULT 'per_pax' CHECK (quantity_mode IN ('per_pax', 'per_trip', 'per_day')),
  quantity_value INTEGER DEFAULT 1,
  cost_per_unit DECIMAL(10,2) DEFAULT 0,

  day_number INTEGER,
  sequence_order INTEGER DEFAULT 1,

  is_optional BOOLEAN DEFAULT false,
  optional_price_override DECIMAL(10,2),

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tour_variation_services_tenant ON tour_variation_services(tenant_id);
CREATE INDEX idx_tour_variation_services_variation ON tour_variation_services(variation_id);

-- ============================================
-- PART 4: RATE TABLES
-- ============================================

-- 4.1: Accommodation Rates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS accommodation_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  hotel_name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  room_type VARCHAR(100),
  tier VARCHAR(20) DEFAULT 'standard',

  rate_low_season_sgl DECIMAL(10,2),
  rate_high_season_sgl DECIMAL(10,2),
  rate_peak_season_sgl DECIMAL(10,2),

  rate_low_season_dbl DECIMAL(10,2),
  rate_high_season_dbl DECIMAL(10,2),
  rate_peak_season_dbl DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accommodation_rates_tenant ON accommodation_rates(tenant_id);
CREATE INDEX idx_accommodation_rates_city ON accommodation_rates(city);

-- 4.2: Activity Rates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS activity_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  activity_name VARCHAR(255) NOT NULL,
  activity_category VARCHAR(100),
  city VARCHAR(100),

  base_rate_eur DECIMAL(10,2),
  base_rate_non_eur DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_rates_tenant ON activity_rates(tenant_id);
CREATE INDEX idx_activity_rates_city ON activity_rates(city);

-- 4.3: Guide Rates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS guide_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  guide_type VARCHAR(100),
  city VARCHAR(100),

  half_day_rate DECIMAL(10,2),
  full_day_rate DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guide_rates_tenant ON guide_rates(tenant_id);
CREATE INDEX idx_guide_rates_city ON guide_rates(city);

-- 4.4: Meal Rates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS meal_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  restaurant_name VARCHAR(255),
  meal_type VARCHAR(50),
  tier VARCHAR(20),
  city VARCHAR(100),

  base_rate_eur DECIMAL(10,2),
  base_rate_non_eur DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_rates_tenant ON meal_rates(tenant_id);
CREATE INDEX idx_meal_rates_city ON meal_rates(city);

-- 4.5: Nile Cruises
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS nile_cruises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  ship_name VARCHAR(255) NOT NULL,
  cabin_type VARCHAR(100),

  rate_low_season DECIMAL(10,2),
  rate_high_season DECIMAL(10,2),
  rate_peak_season DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nile_cruises_tenant ON nile_cruises(tenant_id);

-- 4.6: Transportation Rates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS transportation_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  service_type VARCHAR(100),
  vehicle_type VARCHAR(100),
  origin_city VARCHAR(100),
  destination_city VARCHAR(100),
  city VARCHAR(100),

  base_rate_eur DECIMAL(10,2),
  base_rate_non_eur DECIMAL(10,2),
  rate_per_day DECIMAL(10,2),

  capacity INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transportation_rates_tenant ON transportation_rates(tenant_id);
CREATE INDEX idx_transportation_rates_cities ON transportation_rates(origin_city, destination_city);

-- ============================================
-- PART 5: TEMPLATES MODULE
-- ============================================

-- 5.1: Message Templates
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  template_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  channel VARCHAR(20) CHECK (channel IN ('email', 'whatsapp', 'sms')),

  subject VARCHAR(255),
  body TEXT NOT NULL,

  variables JSONB,

  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_templates_tenant ON message_templates(tenant_id);
CREATE INDEX idx_message_templates_category ON message_templates(category);

-- 5.2: Template Placeholders
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS template_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  placeholder VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  category VARCHAR(50),
  example_value TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, placeholder)
);

CREATE INDEX idx_template_placeholders_tenant ON template_placeholders(tenant_id);

-- 5.3: Template Send Log
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS template_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  client_id UUID,
  recipient_id UUID,
  recipient_type VARCHAR(50),

  channel VARCHAR(20),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),

  subject VARCHAR(255),
  body_preview TEXT,

  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  error_message TEXT,

  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_template_send_log_tenant ON template_send_log(tenant_id);
CREATE INDEX idx_template_send_log_template ON template_send_log(template_id);
CREATE INDEX idx_template_send_log_recipient ON template_send_log(recipient_id, recipient_type);

-- 5.4: Gmail Tokens
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,

  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50),
  expiry_date TIMESTAMPTZ,

  email_address VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gmail_tokens_tenant ON gmail_tokens(tenant_id);
CREATE INDEX idx_gmail_tokens_user ON gmail_tokens(user_id);

-- ============================================
-- PART 6: ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE tour_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_day_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_daily_itinerary ENABLE ROW LEVEL SECURITY;
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_variation_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nile_cruises ENABLE ROW LEVEL SECURITY;
ALTER TABLE transportation_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_placeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables (using a DO block to avoid repetition)
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'tour_categories', 'destinations', 'content_categories', 'content_library',
      'tour_templates', 'tour_variations', 'tour_days', 'tour_day_activities',
      'variation_daily_itinerary', 'tours', 'tour_pricing', 'variation_pricing',
      'variation_services', 'tour_variation_services', 'accommodation_rates',
      'activity_rates', 'guide_rates', 'meal_rates', 'nile_cruises',
      'transportation_rates', 'message_templates', 'template_placeholders',
      'template_send_log', 'gmail_tokens'
    ])
  LOOP
    -- SELECT policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can view own tenant %s" ON %I;
      CREATE POLICY "Users can view own tenant %s"
        ON %I FOR SELECT
        USING (tenant_id = get_user_tenant_id());
    ', table_name, table_name, table_name, table_name);

    -- INSERT policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can insert own tenant %s" ON %I;
      CREATE POLICY "Users can insert own tenant %s"
        ON %I FOR INSERT
        WITH CHECK (tenant_id = get_user_tenant_id());
    ', table_name, table_name, table_name, table_name);

    -- UPDATE policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can update own tenant %s" ON %I;
      CREATE POLICY "Users can update own tenant %s"
        ON %I FOR UPDATE
        USING (tenant_id = get_user_tenant_id())
        WITH CHECK (tenant_id = get_user_tenant_id());
    ', table_name, table_name, table_name, table_name);

    -- DELETE policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can delete own tenant %s" ON %I;
      CREATE POLICY "Users can delete own tenant %s"
        ON %I FOR DELETE
        USING (tenant_id = get_user_tenant_id());
    ', table_name, table_name, table_name, table_name);
  END LOOP;
END $$;

-- ============================================
-- PART 7: AUTO-POPULATE TRIGGERS
-- ============================================

-- Create a single function for all triggers
CREATE OR REPLACE FUNCTION auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for all tables
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'tour_categories', 'destinations', 'content_categories', 'content_library',
      'tour_templates', 'tour_variations', 'tour_days', 'tour_day_activities',
      'variation_daily_itinerary', 'tours', 'tour_pricing', 'variation_pricing',
      'variation_services', 'tour_variation_services', 'accommodation_rates',
      'activity_rates', 'guide_rates', 'meal_rates', 'nile_cruises',
      'transportation_rates', 'message_templates', 'template_placeholders',
      'template_send_log', 'gmail_tokens'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_tenant_id_%s ON %I;
      CREATE TRIGGER set_tenant_id_%s
        BEFORE INSERT ON %I
        FOR EACH ROW
        EXECUTE FUNCTION auto_set_tenant_id();
    ', replace(table_name, '-', '_'), table_name, replace(table_name, '-', '_'), table_name);
  END LOOP;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 007 completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Created tables with multi-tenancy:';
  RAISE NOTICE '  TOURS MODULE:';
  RAISE NOTICE '    - Core: tour_categories, destinations, tour_templates, tour_variations';
  RAISE NOTICE '    - Days: tour_days, tour_day_activities, variation_daily_itinerary';
  RAISE NOTICE '    - Pricing: tour_pricing, variation_pricing, variation_services, tour_variation_services';
  RAISE NOTICE '    - Rates: accommodation_rates, activity_rates, guide_rates, meal_rates';
  RAISE NOTICE '    - Transport: nile_cruises, transportation_rates';
  RAISE NOTICE '    - Content: content_categories, content_library';
  RAISE NOTICE '    - Tours: tours (saved tours)';
  RAISE NOTICE '';
  RAISE NOTICE '  TEMPLATES MODULE:';
  RAISE NOTICE '    - message_templates, template_placeholders';
  RAISE NOTICE '    - template_send_log, gmail_tokens';
  RAISE NOTICE '';
  RAISE NOTICE 'Total tables: 24';
  RAISE NOTICE 'Total RLS policies: ~96 (4 per table)';
  RAISE NOTICE 'Total triggers: 24';
  RAISE NOTICE '';
  RAISE NOTICE 'All tables have tenant_id and RLS enabled from the start!';
END $$;
