import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

// ============================================
// TOUR DETAIL API - WITH VARIATION_ID
// File: app/api/tours/[code]/route.ts
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const VARIATION_SELECT = `
        *,
        tour_templates (
          id,
          template_code,
          template_name,
          short_description,
          long_description,
          highlights,
          main_attractions,
          duration_days,
          duration_nights,
          tour_categories (category_name),
          destinations (destination_name)
        )
      `

    // Fetch variation with all related data (removed tour_days - doesn't exist)
    let { data: variation, error: varError } = await supabase
      .from('tour_variations')
      .select(VARIATION_SELECT)
      .eq('variation_code', code)
      .maybeSingle()

    // Legacy links (and old bookmarks) carried the TEMPLATE UUID instead of a
    // variation code — resolve those to the template's first active variation
    // rather than dead-ending them.
    if (!variation && !varError && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
      const fallback = await supabase
        .from('tour_variations')
        .select(VARIATION_SELECT)
        .eq('template_id', code)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      variation = fallback.data
      varError = fallback.error
    }

    if (varError) {
      console.error('Variation fetch error:', varError)
      throw varError
    }

    if (!variation) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }

    // Fetch services from tour_variation_services (for B2B pricing)
    const { data: variationServices } = await supabase
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', variation.id)
      .order('sequence_order')

    // Also fetch legacy services if they exist
    const { data: legacyServices } = await supabase
      .from('variation_services')
      .select('service_category, service_name, quantity_type, cost_per_unit, applies_to_day')
      .eq('variation_id', variation.id)
      .eq('is_mandatory', true)
      .order('service_category')

    // Fetch daily itinerary from variation_daily_itinerary
    const { data: varItinerary } = await supabase
      .from('variation_daily_itinerary')
      .select('*')
      .eq('variation_id', variation.id)
      .order('day_number', { ascending: true })

    const dailyItinerary = (varItinerary || []).map((day: any) => ({
      day_number: day.day_number,
      day_title: day.day_title || day.title,
      day_description: day.day_description || day.description,
      city: day.city,
      overnight_city: day.overnight_city,
      breakfast_included: day.breakfast_included,
      lunch_included: day.lunch_included,
      dinner_included: day.dinner_included
    }))

    // Combine services - prefer new system, fall back to legacy
    const services = variationServices && variationServices.length > 0
      ? variationServices.map((s: any) => ({
          service_category: s.service_category,
          service_name: s.service_name,
          quantity_type: s.quantity_mode,
          cost_per_unit: s.cost_per_unit
        }))
      : legacyServices || []

    // The variation's OPTIONAL SERVICE lines (is_optional — the priced options
    // it sells, migration 320) are the source of truth for the "Optional
    // Extras" list; the legacy optional_extras names are kept only for anything
    // never migrated into a service row. Read through the same client as the
    // variation so visibility matches; an empty result simply falls back.
    const { data: optionRows } = await supabase
      .from('tour_variation_services')
      .select('service_name')
      .eq('variation_id', variation.id)
      .eq('is_optional', true)
      .order('sequence_order', { ascending: true })
    const optionNames = (optionRows || []).map((o: { service_name: string }) => o.service_name)
    const legacyNames = Array.isArray(variation.optional_extras)
      ? (variation.optional_extras as unknown[]).filter((n): n is string => typeof n === 'string')
      : []
    const optionalExtraNames = [
      ...optionNames,
      ...legacyNames.filter((n) => !optionNames.includes(n)),
    ]

    // Format response - INCLUDE variation_id for dynamic pricing
    const tourDetail = {
      variation_id: variation.id,  // <-- KEY ADDITION FOR DYNAMIC PRICING
      template_id: variation.tour_templates?.id,
      template_name: variation.tour_templates?.template_name,
      template_code: variation.tour_templates?.template_code,
      category_name: variation.tour_templates?.tour_categories?.category_name || 'Uncategorized',
      destination_name: variation.tour_templates?.destinations?.destination_name || 'Various',
      duration_days: variation.tour_templates?.duration_days,
      duration_nights: variation.tour_templates?.duration_nights || 0,
      short_description: variation.tour_templates?.short_description,
      long_description: variation.tour_templates?.long_description,
      highlights: variation.tour_templates?.highlights || [],
      main_attractions: variation.tour_templates?.main_attractions || [],
      variation_name: variation.variation_name,
      variation_code: variation.variation_code,
      tier: variation.tier,
      group_type: variation.group_type,
      min_pax: variation.min_pax,
      max_pax: variation.max_pax,
      inclusions: variation.inclusions || [],
      exclusions: variation.exclusions || [],
      optional_extras: optionalExtraNames,
      guide_type: variation.guide_type,
      guide_languages: variation.guide_languages || ['English', 'Arabic'],
      vehicle_type: variation.vehicle_type,
      services: services,
      daily_itinerary: dailyItinerary,
      // Flag to indicate if dynamic pricing is available
      has_dynamic_pricing: variationServices && variationServices.length > 0
    }

    // The operator's PUBLIC contact details, for the page's "Need Help?" card.
    // This page is public and previously hardcoded one operator's email/phone —
    // on every tenant's tours. Name/email/phone/website only; nothing sensitive.
    let operator = null
    if (variation.tenant_id) {
      const { data: t } = await supabase
        .from('tenants')
        .select('company_name, contact_email, company_phone, company_website')
        .eq('id', variation.tenant_id)
        .maybeSingle()
      if (t) operator = t
    }

    return NextResponse.json({
      success: true,
      data: tourDetail,
      operator
    })

  } catch (error) {
    console.error('Error fetching tour detail:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tour details',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}