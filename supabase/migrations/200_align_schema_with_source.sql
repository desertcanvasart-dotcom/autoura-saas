-- ============================================
-- Migration 200: Align schema with source (travel-ops-pro)
-- Adds missing columns from the single-tenant source project
-- All new columns are NULLABLE to avoid breaking existing data
-- ============================================

-- 1. hotel_contacts
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_single_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_double_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_triple_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_single_non_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_double_non_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_triple_non_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_suite_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_suite_non_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS high_season_markup_percent DECIMAL(5,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS peak_season_markup_percent DECIMAL(5,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN DEFAULT FALSE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS breakfast_rate_eur DECIMAL(10,2);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_valid_from DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS rate_valid_to DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS meal_plan VARCHAR(50);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS child_policy TEXT;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS low_season_from DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS low_season_to DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS high_season_from DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS high_season_to DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS peak_season_from DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS peak_season_to DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS peak_season_2_from DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS peak_season_2_to DATE;
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS reservations_email VARCHAR(255);
ALTER TABLE hotel_contacts ADD COLUMN IF NOT EXISTS reservations_phone VARCHAR(50);

-- 2. clients — relax NOT NULL + add missing columns
ALTER TABLE clients ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE clients ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS alternative_phone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_contact_method VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS best_time_to_contact VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_accommodation_level VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS accessibility_needs TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS special_interests TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_travel_agent BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agent_commission_rate DECIMAL(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by_client_id UUID;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS newsletter_subscribed BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_bookings_count INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_revenue_generated DECIMAL(12,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS currency_preference VARCHAR(3) DEFAULT 'EUR';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS average_booking_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 3. itineraries — relax NOT NULL + add missing columns
ALTER TABLE itineraries ALTER COLUMN trip_name DROP NOT NULL;
ALTER TABLE itineraries ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE itineraries ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS num_infants INTEGER DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS balance_due DECIMAL(12,2);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_guide_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_vehicle_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS guide_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS vehicle_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS pickup_location TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS pickup_time VARCHAR(10);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS destinations TEXT[];
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS num_travelers INTEGER;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_hotel_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_restaurant_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_airport_staff_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS assigned_hotel_staff_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS hotel_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS restaurant_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS airport_staff_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS hotel_staff_notes TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS partner_id UUID;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS partner_commission_percent DECIMAL(5,2);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS partner_commission_amount DECIMAL(12,2);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS inclusions TEXT[];
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS exclusions TEXT[];
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS generation_warnings JSONB;

-- 4. itinerary_days
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS attractions TEXT[];
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS lunch_included BOOLEAN;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS dinner_included BOOLEAN;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_included BOOLEAN;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS flight_from VARCHAR(255);
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS is_cruise_day BOOLEAN DEFAULT FALSE;

-- 5. itinerary_services
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS supplier_currency TEXT DEFAULT 'EUR';
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS supplier_cost_original DECIMAL(12,2);
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(12,6);
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE itinerary_services ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(10,2);

-- 6. transportation_rates
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS includes TEXT;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS area VARCHAR(255);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS duration VARCHAR(100);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS sedan_rate_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS sedan_rate_non_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS sedan_capacity_min INTEGER DEFAULT 1;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS sedan_capacity_max INTEGER DEFAULT 2;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minivan_rate_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minivan_rate_non_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minivan_capacity_min INTEGER DEFAULT 3;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minivan_capacity_max INTEGER DEFAULT 7;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS van_rate_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS van_rate_non_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS van_capacity_min INTEGER DEFAULT 8;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS van_capacity_max INTEGER DEFAULT 12;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minibus_rate_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minibus_rate_non_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minibus_capacity_min INTEGER DEFAULT 13;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS minibus_capacity_max INTEGER DEFAULT 20;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS bus_rate_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS bus_rate_non_eur DECIMAL(10,2);
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS bus_capacity_min INTEGER DEFAULT 21;
ALTER TABLE transportation_rates ADD COLUMN IF NOT EXISTS bus_capacity_max INTEGER DEFAULT 45;

-- 7. accommodation_rates
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS hotel_id UUID;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS property_type VARCHAR(50);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS star_rating INTEGER;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS base_rate_eur DECIMAL(10,2);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS base_rate_non_eur DECIMAL(10,2);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS pp_double_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS single_supp_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS triple_red_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS pp_double_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS single_supp_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS triple_red_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_pp_double_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_single_supp_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_triple_red_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_pp_double_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_single_supp_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_triple_red_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_pp_double_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_single_supp_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_triple_red_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_pp_double_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_single_supp_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS peak_triple_red_non_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_season_rate_eur DECIMAL(10,2);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS high_season_rate_non_eur DECIMAL(10,2);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS low_season_rate_eur DECIMAL(10,2);
ALTER TABLE accommodation_rates ADD COLUMN IF NOT EXISTS low_season_rate_non_eur DECIMAL(10,2);

-- 8. nile_cruises
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS season_start DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS season_end DATE;
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_double_eur_low DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_double_eur_high DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_double_eur_peak DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_single_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_double_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_triple_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_suite_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_single_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_double_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_triple_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_low_suite_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_single_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_double_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_triple_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_suite_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_single_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_double_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_triple_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_high_suite_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_single_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_double_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_triple_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_suite_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_single_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_double_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_triple_non_eur DECIMAL(10,2);
ALTER TABLE nile_cruises ADD COLUMN IF NOT EXISTS rate_peak_suite_non_eur DECIMAL(10,2);

-- 9. guides
ALTER TABLE guides ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS specialties TEXT[];
ALTER TABLE guides ADD COLUMN IF NOT EXISTS certification_number VARCHAR(100);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS max_group_size INTEGER;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS tier VARCHAR(20);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT FALSE;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- 10. vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_ac BOOLEAN DEFAULT TRUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_wifi BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_luxury BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_mileage INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_service_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rate_per_km DECIMAL(10,2);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS default_driver_name VARCHAR(255);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS default_driver_phone VARCHAR(50);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS tier VARCHAR(20);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- 11. tour_categories
ALTER TABLE tour_categories ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE tour_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 12. tour_days
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS accommodation_id UUID;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS lunch_meal_id UUID;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS dinner_meal_id UUID;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS guide_id UUID;
ALTER TABLE tour_days ADD COLUMN IF NOT EXISTS notes TEXT;

-- 13. tour_variations
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS variation_code VARCHAR(100);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS group_type VARCHAR(30);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS min_pax INTEGER;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS max_pax INTEGER;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS optimal_pax INTEGER;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS inclusions TEXT[];
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS exclusions TEXT[];
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS optional_extras TEXT[];
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS guide_type VARCHAR(100);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS guide_languages TEXT[];
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(100);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS accommodation_standard VARCHAR(100);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS meal_quality VARCHAR(50);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS private_experience BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS skip_line_access BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS vip_treatment BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS flexible_itinerary BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS typical_start_time VARCHAR(10);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS typical_end_time VARCHAR(10);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS pickup_time_range VARCHAR(50);
ALTER TABLE tour_variations ADD COLUMN IF NOT EXISTS available_seasons TEXT[];

-- 14. content_library
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS start_city VARCHAR(255);
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS end_city VARCHAR(255);

-- 15. airport_staff_rates
ALTER TABLE airport_staff_rates ADD COLUMN IF NOT EXISTS airport_name VARCHAR(255);
ALTER TABLE airport_staff_rates ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);

-- 16. hotel_staff_rates
ALTER TABLE hotel_staff_rates ADD COLUMN IF NOT EXISTS destination VARCHAR(255);

-- 17. meal_rates
ALTER TABLE meal_rates ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT FALSE;

-- 18. activity_rates
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_rates ADD COLUMN IF NOT EXISTS addon_note TEXT;

-- 19. b2b_partners
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS show_net_rates BOOLEAN DEFAULT FALSE;
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS show_cost_breakdown BOOLEAN DEFAULT FALSE;
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(50);
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2);
ALTER TABLE b2b_partners ADD COLUMN IF NOT EXISTS created_by UUID;

-- 20. message_templates
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS created_by UUID;

-- 21. tour_templates
ALTER TABLE tour_templates ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(50);

-- ============================================
-- Relax constraints for data import
-- ============================================

-- tour_days: template_id may be referenced as tour_id in source
-- tour_categories: slug already has a default, just ensure name is usable

-- Done
SELECT 'Migration 200 complete: schema aligned with source project' AS status;
