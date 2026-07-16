-- =====================================================================
-- Migration 233: schema_migrations tracker
-- =====================================================================
-- The 2026-07 audit found seven merged migrations that never reached
-- production (and four tables with no DDL anywhere) — because migrations
-- are applied by hand in the SQL editor, "what has been applied" was
-- unknowable without archaeology. This table makes it a query.
--
-- CONVENTION FROM NOW ON: every new migration file ends with
--   INSERT INTO schema_migrations (name) VALUES ('<its filename>')
--   ON CONFLICT (name) DO NOTHING;
-- so applying it via the SQL editor self-records. Auditing becomes:
-- compare SELECT name FROM schema_migrations against the repo's files.
--
-- The backfill below records every migration in the repo as applied —
-- true as of 2026-07-16, after the audit brought prod and repo into
-- agreement.
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migrations_service ON schema_migrations;
CREATE POLICY schema_migrations_service ON schema_migrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO schema_migrations (name) VALUES
  ('000_foundation_tables'),
  ('001_phase1_core_tables'),
  ('002_phase1b_multi_tenancy'),
  ('003_quote_versioning'),
  ('004_quote_pdf_storage'),
  ('005_create_itinerary_resources'),
  ('006_financial_tables_multi_tenancy'),
  ('007_create_tours_templates_tables'),
  ('008_team_tasks_multi_tenancy'),
  ('009_suppliers_multi_tenancy'),
  ('010_suppliers_missing_columns'),
  ('011_user_tables_rls'),
  ('012_restaurant_contacts_rls'),
  ('013_accommodation_rates_rls'),
  ('017_create_staff_tables_with_rls'),
  ('018_invoice_reminders_with_rls'),
  ('019_client_related_tables'),
  ('020_fix_message_templates_schema'),
  ('020_itinerary_related_tables_rls'),
  ('021_add_template_versioning'),
  ('022_add_template_languages'),
  ('023_add_scheduled_sends'),
  ('024_seed_message_templates'),
  ('025_fix_supplier_sync_triggers'),
  ('030_admin_billing'),
  ('030_admin_billing_fixed'),
  ('031_fix_user_rls_policies'),
  ('032_add_tenant_to_guides_vehicles'),
  ('034_create_supplier_documents'),
  ('035_create_client_followups'),
  ('036_auto_create_tenant_on_signup'),
  ('037_onboarding_tracking'),
  ('038_tenant_logos_storage'),
  ('039_fix_signup_trigger'),
  ('040_diagnostic_and_fix'),
  ('041_enhanced_error_logging'),
  ('100_create_bookings'),
  ('101_add_pricing_tier_column'),
  ('102_fix_tenant_features_rls'),
  ('103_add_missing_accommodation_columns'),
  ('104_ppd_pricing_model'),
  ('105_nile_cruises_supplier_fk'),
  ('106_nile_cruises_complete_schema'),
  ('107_create_sleeping_train_rates'),
  ('108_create_train_rates'),
  ('109_create_entrance_fees'),
  ('110_create_airport_staff_rates'),
  ('111_create_tipping_rates'),
  ('112_create_hotel_staff_rates'),
  ('113_create_flight_rates'),
  ('114_add_meal_rates_columns'),
  ('115_update_supplier_type_constraint'),
  ('116_add_activity_rates_columns'),
  ('117_add_guide_rates_columns'),
  ('118_add_content_categories_is_active'),
  ('119_add_content_library_columns'),
  ('120_create_writing_rules_table'),
  ('121_fix_writing_rules_schema'),
  ('122_create_exchange_rates'),
  ('123_exchange_rates_api_support'),
  ('124_fix_tour_categories_schema'),
  ('125_unified_conversations'),
  ('126_whatsapp_ai_settings'),
  ('127_create_operator_capacity'),
  ('128_create_tour_departures'),
  ('129_clients_schema_update'),
  ('130_itineraries_schema_update'),
  ('131_itinerary_days_schema_update'),
  ('132_itinerary_services_schema_update'),
  ('133_fix_content_library_categories'),
  ('134_fix_content_tenant_id'),
  ('135_add_primary_tenant_flag'),
  ('136_add_4day_aswan_luxor_cruise'),
  ('137_rewrite_4day_cruise_descriptive'),
  ('138_add_8day_luxor_cruise'),
  ('139_add_5day_luxor_aswan_cruise'),
  ('140_add_5day_lake_nasser_cruise'),
  ('141_add_4day_lake_nasser_abu_simbel'),
  ('142_add_cairo_day_tour'),
  ('143_add_memphis_saqqara_dahshur_tour'),
  ('144_add_grand_old_cairo_tour'),
  ('145_add_grand_west_bank_tour'),
  ('146_add_karnak_luxor_temple_tour'),
  ('147_add_luxor_east_west_bank_tour'),
  ('148_add_abu_simbel_bus_tour'),
  ('149_add_abu_simbel_flight_tour'),
  ('150_add_aswan_city_day_tour'),
  ('151_add_kom_ombo_edfu_temples_tour'),
  ('152_add_itinerary_nationality_language'),
  ('153_commissions_table'),
  ('154_agent_memory_and_ai_metering'),
  ('200_align_schema_with_source'),
  ('201_create_booking_supplier_status'),
  ('202_create_email_tables'),
  ('203_communication_copilot'),
  ('204_align_whatsapp_messages'),
  ('205_copilot_knowledge_vector'),
  ('206_email_signatures'),
  ('207_copilot_pregenerate_flag'),
  ('208_communication_threads_unified_fk'),
  ('209_add_cached_pricing_columns'),
  ('210_add_email_settings_to_user_settings'),
  ('211_create_fixed_daily_costs'),
  ('212_import_sibling_message_templates'),
  ('213_import_b2b_landoperator_templates'),
  ('214_create_departments'),
  ('215_concierge_briefs'),
  ('216_supplier_invoices'),
  ('217_concierge_chain_wiring'),
  ('218_fix_rls_write_policies'),
  ('219_tenant_stripe_customer_id'),
  ('220_reconcile_accommodation_rate_columns'),
  ('221_fix_supplier_sync_triggers_on_insert'),
  ('222_reconcile_gmail_tokens_schema'),
  ('223_add_tenant_to_legacy_b2b_tables'),
  ('224_concierge_brand_routing'),
  ('225_tenant_fk_cascade_sweep'),
  ('226_auth_user_fk_sweep'),
  ('227_signup_owner_admin_role'),
  ('228_signup_trigger_search_path'),
  ('229_tenant_locale'),
  ('230_departure_mirror'),
  ('232_create_legacy_b2b_tables'),
  ('233_schema_migrations_tracker')
ON CONFLICT (name) DO NOTHING;
