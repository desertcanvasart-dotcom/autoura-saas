// ============================================
// GET /api/pricing-grid/rates?tier={tier}
// Fetches all rate options from 12 Supabase tables
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

interface RateOption {
  id: string
  label: string
  rateEur: number
  rateNonEur: number
  city?: string
  tier?: string
  category?: string
  details?: Record<string, any>
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'

    // Fetch all 12 rate tables in parallel
    const [
      transportRes,
      guideRes,
      airportRes,
      hotelStaffRes,
      tippingRes,
      activityRes,
      accommodationRes,
      entranceRes,
      flightRes,
      mealRes,
      cruiseRes,
      sleepingTrainRes,
    ] = await Promise.all([
      supabase.from('transportation_rates').select('*').eq('is_active', true),
      supabase.from('guide_rates').select('*'),
      supabase.from('airport_staff_rates').select('*').eq('is_active', true),
      supabase.from('hotel_staff_rates').select('*').eq('is_active', true),
      supabase.from('tipping_rates').select('*').eq('is_active', true),
      supabase.from('activity_rates').select('*'),
      supabase.from('accommodation_rates').select('*').eq('tier', tier),
      supabase.from('entrance_fees').select('*'),
      supabase.from('flight_rates').select('*').eq('is_active', true),
      supabase.from('meal_rates').select('*'),
      supabase.from('nile_cruises').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('sleeping_train_rates').select('*').eq('is_active', true),
    ])

    // --- Transform each table into RateOption[] ---

    // Transport: expand by vehicle tier (capacity ranges)
    const route: RateOption[] = (transportRes.data || [])
      .filter((r: any) => r.service_type !== 'day_tour' || true) // include all types
      .map((r: any) => ({
        id: r.id,
        label: [
          r.service_type?.replace(/_/g, ' '),
          r.vehicle_type,
          r.origin_city || r.city,
          r.destination_city ? `→ ${r.destination_city}` : '',
          r.capacity_min && r.capacity_max ? `(${r.capacity_min}-${r.capacity_max} pax)` : '',
        ].filter(Boolean).join(' | '),
        rateEur: Number(r.base_rate_eur) || 0,
        rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || 0,
        city: r.origin_city || r.city,
        category: r.service_type,
        details: {
          service_type: r.service_type,
          vehicle_type: r.vehicle_type,
          origin_city: r.origin_city || r.city,
          destination_city: r.destination_city,
          capacity_min: r.capacity_min,
          capacity_max: r.capacity_max,
        },
      }))

    // Guide rates
    const guide: RateOption[] = (guideRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        r.guide_language || r.guide_type || 'Guide',
        r.city,
        r.tour_duration === 'half_day' ? '(Half Day)' : '(Full Day)',
      ].filter(Boolean).join(' | '),
      rateEur: Number(r.base_rate_eur) || Number(r.full_day_rate) || 0,
      rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || Number(r.full_day_rate) || 0,
      city: r.city,
      details: {
        guide_type: r.guide_type,
        guide_language: r.guide_language,
        half_day_rate: r.half_day_rate,
        full_day_rate: r.full_day_rate,
      },
    }))

    // Airport services
    const airport_services: RateOption[] = (airportRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        r.service_type?.replace(/_/g, ' '),
        r.airport_code,
        r.direction,
      ].filter(Boolean).join(' | '),
      rateEur: Number(r.rate_eur) || 0,
      rateNonEur: Number(r.rate_eur) || 0,
      city: r.airport_code,
      category: r.service_type,
      details: { direction: r.direction, airport_code: r.airport_code },
    }))

    // Hotel services
    const hotel_services: RateOption[] = (hotelStaffRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        r.service_type?.replace(/_/g, ' '),
        r.hotel_category !== 'all' ? `(${r.hotel_category})` : '',
      ].filter(Boolean).join(' '),
      rateEur: Number(r.rate_eur) || 0,
      rateNonEur: Number(r.rate_eur) || 0,
      category: r.service_type,
      details: { hotel_category: r.hotel_category },
    }))

    // Tipping
    const tipping: RateOption[] = (tippingRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        r.role_type?.replace(/_/g, ' '),
        r.context ? `(${r.context})` : '',
        r.rate_unit ? `per ${r.rate_unit.replace(/_/g, ' ')}` : '',
      ].filter(Boolean).join(' '),
      rateEur: Number(r.rate_eur) || 0,
      rateNonEur: Number(r.rate_eur) || 0,
      category: r.role_type,
      details: { role_type: r.role_type, rate_unit: r.rate_unit, context: r.context },
    }))

    // Boat rides (activity_rates where category is boat-related)
    const boat_rides: RateOption[] = (activityRes.data || [])
      .filter((r: any) => {
        const cat = (r.activity_category || '').toLowerCase()
        const name = (r.activity_name || '').toLowerCase()
        return cat.includes('boat') || cat.includes('felucca') || cat.includes('sail') ||
               name.includes('boat') || name.includes('felucca') || name.includes('sail')
      })
      .map((r: any) => ({
        id: r.id,
        label: `${r.activity_name}${r.city ? ` | ${r.city}` : ''}`,
        rateEur: Number(r.base_rate_eur) || 0,
        rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || 0,
        city: r.city,
        category: 'boat',
      }))

    // Accommodation (filtered by tier already)
    const accommodation: RateOption[] = (accommodationRes.data || []).map((r: any) => ({
      id: r.id,
      label: [r.hotel_name, r.room_type, r.city].filter(Boolean).join(' | '),
      rateEur: Number(r.rate_low_season_dbl) || Number(r.rate_high_season_dbl) || 0,
      rateNonEur: Number(r.rate_low_season_dbl) || Number(r.rate_high_season_dbl) || 0,
      city: r.city,
      tier: r.tier,
      details: {
        hotel_name: r.hotel_name,
        room_type: r.room_type,
        rate_low_season_sgl: Number(r.rate_low_season_sgl) || 0,
        rate_low_season_dbl: Number(r.rate_low_season_dbl) || 0,
        rate_high_season_sgl: Number(r.rate_high_season_sgl) || 0,
        rate_high_season_dbl: Number(r.rate_high_season_dbl) || 0,
        rate_peak_season_sgl: Number(r.rate_peak_season_sgl) || 0,
        rate_peak_season_dbl: Number(r.rate_peak_season_dbl) || 0,
      },
    }))

    // Entrance fees
    const entrance_fees: RateOption[] = (entranceRes.data || []).map((r: any) => ({
      id: r.id,
      label: `${r.attraction_name}${r.city ? ` | ${r.city}` : ''}`,
      rateEur: Number(r.eur_rate) || 0,
      rateNonEur: Number(r.non_eur_rate) || Number(r.eur_rate) || 0,
      city: r.city,
      category: r.category,
      details: { is_addon: r.is_addon, fee_type: r.fee_type },
    }))

    // Flights
    const flights: RateOption[] = (flightRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        r.route_name || `${r.route_from} → ${r.route_to}`,
        r.airline,
        r.cabin_class,
      ].filter(Boolean).join(' | '),
      rateEur: Number(r.base_rate_eur) || 0,
      rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || 0,
      city: r.route_from,
      details: {
        route_from: r.route_from,
        route_to: r.route_to,
        airline: r.airline,
        cabin_class: r.cabin_class,
        tax_eur: Number(r.tax_eur) || 0,
        tax_non_eur: Number(r.tax_non_eur) || 0,
      },
    }))

    // Experiences (non-boat activities)
    const experiences: RateOption[] = (activityRes.data || [])
      .filter((r: any) => {
        const cat = (r.activity_category || '').toLowerCase()
        const name = (r.activity_name || '').toLowerCase()
        return !cat.includes('boat') && !cat.includes('felucca') && !cat.includes('sail') &&
               !name.includes('boat') && !name.includes('felucca') && !name.includes('sail')
      })
      .map((r: any) => ({
        id: r.id,
        label: `${r.activity_name}${r.city ? ` | ${r.city}` : ''}`,
        rateEur: Number(r.base_rate_eur) || 0,
        rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || 0,
        city: r.city,
        category: r.activity_category,
      }))

    // Meals
    const meals: RateOption[] = (mealRes.data || []).map((r: any) => ({
      id: r.id,
      label: [r.restaurant_name, r.meal_type, r.city].filter(Boolean).join(' | '),
      rateEur: Number(r.base_rate_eur) || 0,
      rateNonEur: Number(r.base_rate_non_eur) || Number(r.base_rate_eur) || 0,
      city: r.city,
      tier: r.tier,
      category: r.meal_type,
    }))

    // Nile Cruises (filtered by tier already)
    const cruise: RateOption[] = (cruiseRes.data || []).map((r: any) => ({
      id: r.id,
      label: [r.ship_name, r.cabin_type, r.route_name].filter(Boolean).join(' | '),
      rateEur: Number(r.ppd_eur) || Number(r.rate_double_eur) || 0,
      rateNonEur: Number(r.ppd_non_eur) || Number(r.ppd_eur) || 0,
      tier: r.tier,
      details: {
        ship_name: r.ship_name,
        cabin_type: r.cabin_type,
        ppd_eur: Number(r.ppd_eur) || 0,
        ppd_non_eur: Number(r.ppd_non_eur) || 0,
        single_supplement_eur: Number(r.single_supplement_eur) || 0,
        single_supplement_non_eur: Number(r.single_supplement_non_eur) || 0,
        embark_city: r.embark_city,
        disembark_city: r.disembark_city,
        duration_nights: r.duration_nights,
        meals_included: r.meals_included,
        sightseeing_included: r.sightseeing_included,
      },
    }))

    // Sleeping trains
    const sleeping_trains: RateOption[] = (sleepingTrainRes.data || []).map((r: any) => ({
      id: r.id,
      label: [
        `${r.origin_city} → ${r.destination_city}`,
        r.cabin_type,
        r.operator_name,
      ].filter(Boolean).join(' | '),
      rateEur: Number(r.rate_oneway_eur) || 0,
      rateNonEur: Number(r.rate_oneway_non_eur) || Number(r.rate_oneway_eur) || 0,
      details: {
        origin_city: r.origin_city,
        destination_city: r.destination_city,
        cabin_type: r.cabin_type,
        departure_time: r.departure_time,
        arrival_time: r.arrival_time,
      },
    }))

    return NextResponse.json({
      success: true,
      rates: {
        route,
        guide,
        airport_services,
        hotel_services,
        tipping,
        boat_rides,
        accommodation,
        entrance_fees,
        flights,
        experiences,
        meals,
        cruise,
        sleeping_trains,
      },
    })
  } catch (error: any) {
    console.error('Pricing grid rates error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch rates' },
      { status: 500 }
    )
  }
}
