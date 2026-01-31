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

    // Fetch variation with all related data (removed tour_days - doesn't exist)
    const { data: variation, error: varError } = await supabase
      .from('tour_variations')
      .select(`
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
      `)
      .eq('variation_code', code)
      .single()

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
      optional_extras: variation.optional_extras || [],
      guide_type: variation.guide_type,
      guide_languages: variation.guide_languages || ['English', 'Arabic'],
      vehicle_type: variation.vehicle_type,
      services: services,
      daily_itinerary: dailyItinerary,
      // Flag to indicate if dynamic pricing is available
      has_dynamic_pricing: variationServices && variationServices.length > 0
    }

    return NextResponse.json({
      success: true,
      data: tourDetail
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