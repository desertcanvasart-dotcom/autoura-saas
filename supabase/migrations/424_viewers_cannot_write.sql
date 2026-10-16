-- ============================================
-- 424: viewers read; they do not write
-- ============================================
-- The write policies on the business tables only check the company
-- (tenant_id = get_user_tenant_id()), never the role. The API refuses a
-- viewer (lib/api-role-gate.ts), but the browser holds the user's own
-- Supabase session, so a viewer could insert, edit or delete invoices,
-- payments, clients, itineraries, passport records… straight through
-- PostgREST.
--
-- Rather than rewrite a hundred permissive policies, each business table gets
-- three RESTRICTIVE policies. Postgres ANDs a restrictive policy with the
-- permissive ones, so every existing rule still applies and this one adds:
-- the writer must be an active owner, admin, manager or member of the ROW's
-- company (the API's "staff" level). Reads are untouched. The service role
-- bypasses RLS, so server jobs and admin-client routes are unaffected.
--
-- Left out on purpose — rows a viewer legitimately writes for themselves, or
-- logs written as a side effect of reading: their own mailbox (email_*,
-- gmail_tokens, scheduled sends), messaging inboxes, notifications-style
-- dismissals, push subscriptions, support tickets, activity/audit logs, the
-- assistant's own memory; and the tenant_* administration tables, which have
-- their own owner/admin rules (423, 425).

BEGIN;

CREATE OR REPLACE FUNCTION public.member_can_write(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant
      AND status = 'active'
      AND role IN ('owner', 'admin', 'manager', 'member')
  )
$$;

COMMENT ON FUNCTION public.member_can_write(UUID) IS
  'True when the caller is an active non-viewer member of the given company (migration 424).';

REVOKE ALL ON FUNCTION public.member_can_write(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_can_write(UUID) TO authenticated;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'accommodation_rates', 'activity_rates', 'airport_staff',
    'airport_staff_rates', 'attraction_aliases', 'b2b_partner_pricing',
    'b2b_partners', 'b2b_quotes', 'b2b_transport_packages', 'b2c_quotes',
    'booking_change_requests', 'booking_extras',
    'booking_passenger_documents', 'booking_passengers', 'booking_payments',
    'booking_portal_links', 'booking_supplier_status', 'bookings',
    'client_followups', 'client_notes', 'client_preferences', 'clients',
    'commissions', 'communication_drafts', 'concierge_brand_mappings',
    'concierge_brief_revisions', 'concierge_briefs', 'content_categories',
    'content_library', 'copilot_knowledge', 'copilot_settings', 'day_blocks',
    'departments', 'departure_bookings', 'destinations', 'entrance_fees',
    'exchange_rates', 'expenses', 'extras_catalogue', 'fixed_daily_costs',
    'flight_rates', 'follow_ups', 'guide_rates', 'guides', 'hotel_contacts',
    'hotel_staff', 'hotel_staff_rates', 'invoice_payments',
    'invoice_reminders', 'invoices', 'itineraries', 'itinerary_days',
    'itinerary_resources', 'itinerary_services', 'itinerary_shares',
    'meal_rates', 'message_templates', 'nile_cruises', 'operator_capacity',
    'payments', 'pricing_season_dates', 'pricing_seasons',
    'prompt_templates', 'quote_versions', 'restaurant_contacts',
    'sleeping_train_rates', 'staff_links', 'supplier_contracts',
    'supplier_documents', 'supplier_invoice_expenses', 'supplier_invoices',
    'supplier_properties', 'suppliers', 'tasks', 'team_members',
    'template_placeholders', 'tenant_destinations', 'tenant_vocabularies',
    'tipping_rates', 'tour_day_activities', 'tour_days', 'tour_departures',
    'tour_pricing', 'tour_quotes', 'tour_templates',
    'tour_variation_services', 'tour_variations', 'tours', 'train_rates',
    'transportation_rates', 'trip_events', 'trip_messages',
    'variation_daily_itinerary', 'variation_pricing', 'variation_services',
    'vehicles', 'writing_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Tables that do not exist in this database (or have no tenant_id) are
    -- skipped, not failed: older databases lack some later features.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'tenant_id'
        AND tb.table_type = 'BASE TABLE'
    ) THEN
      RAISE NOTICE '424: skipping %, no tenant_id column', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "Viewers cannot insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Viewers cannot update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Viewers cannot delete" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Viewers cannot insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK (public.member_can_write(tenant_id))', t);
    EXECUTE format(
      'CREATE POLICY "Viewers cannot update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (public.member_can_write(tenant_id)) WITH CHECK (public.member_can_write(tenant_id))', t);
    EXECUTE format(
      'CREATE POLICY "Viewers cannot delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING (public.member_can_write(tenant_id))', t);
  END LOOP;
END $$;

COMMIT;
