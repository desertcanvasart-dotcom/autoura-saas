// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { attachPropertyNames } from '@/lib/suppliers/attach-property-names'
import { displayPpd } from '@/lib/rates/rate-seasons'

export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    let supabase
    try {
      supabase = await createAuthenticatedClient()
    } catch (authError) {
      console.error('Auth error creating client:', authError)
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const city = searchParams.get('city')

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Type parameter is required' },
        { status: 400 }
      )
    }

    let data: unknown[] = []
    let error = null

    switch (type) {
      case 'accommodation': {
        // The RATE table, not hotel_contacts. This tab used to read the
        // contacts view and hardcode base_rate_eur: 0, so the overview showed
        // every hotel at zero while accommodation_rates held the real data —
        // the third instance of the wrong-table class (see A-item 15).
        const accommodationQuery = supabase
          .from('accommodation_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          accommodationQuery.ilike('city', city)
        }

        const accommodationResult = await accommodationQuery

        // Price: per-person-in-double resolved from the row's rate periods
        // (today's, else the first), never the dead double_rate columns —
        // rows saved through the periods editor leave those NULL (A-item 16).
        data = (accommodationResult.data || []).map((hotel: any) => {
          const ppd = displayPpd(hotel, 'accommodation')
          return {
            id: hotel.id,
            service_code: hotel.service_code || hotel.id,
            property_name: hotel.property_name || hotel.hotel_name,
            star_rating: hotel.star_rating,
            tier: hotel.tier,
            city: hotel.city,
            supplier_name: hotel.supplier_name,
            notes: hotel.notes,
            rate_currency: hotel.rate_currency,
            base_rate_eur: ppd.current,
            base_rate_non_eur: ppd.current,
          }
        })
        error = accommodationResult.error
        break
      }

      case 'meal': {
        // The RATE table, not restaurant_contacts (whose price columns were
        // hardcoded to 0 here) — same wrong-table class as accommodation.
        const mealQuery = supabase
          .from('meal_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          mealQuery.ilike('city', city)
        }

        const mealResult = await mealQuery

        data = (mealResult.data || []).map((meal: any) => ({
          id: meal.id,
          service_code: meal.service_code || meal.id,
          restaurant_name: meal.restaurant_name,
          meal_type: meal.meal_type,
          cuisine_type: meal.cuisine_type,
          restaurant_type: meal.restaurant_type,
          tier: meal.tier,
          city: meal.city,
          supplier_name: meal.supplier_name,
          notes: meal.notes,
          rate_currency: meal.rate_currency,
          base_rate_eur: meal.base_rate_eur,
          base_rate_non_eur: meal.base_rate_non_eur,
          eur_rate: meal.base_rate_eur,
          non_eur_rate: meal.base_rate_non_eur
        }))
        error = mealResult.error
        break
      }

      case 'entrance':
        // ✅ Keep entrance_fees table (already correct)
        const entranceQuery = supabase
          .from('entrance_fees')
          .select('*')
        
        if (city) {
          entranceQuery.eq('city', city)
        }
        
        const entranceResult = await entranceQuery
        data = entranceResult.data || []
        error = entranceResult.error
        break

      case 'transportation':
        // ✅ Pull from transportation_rates table
        const transportQuery = supabase
          .from('transportation_rates')
          .select('*')
          .eq('is_active', true)
        
        if (city) {
          transportQuery.eq('city', city)
        }
        
        const transportResult = await transportQuery.order('city').order('service_type')
        
        data = (transportResult.data || []).map((rate: any) => ({
          service_code: rate.service_code || rate.id,
          service_type: rate.service_type,
          vehicle_type: rate.vehicle_type,
          city: rate.city,
          origin_city: rate.origin_city,
          destination_city: rate.destination_city,
          capacity_min: rate.capacity_min,
          capacity_max: rate.capacity_max,
          supplier_name: rate.supplier_name,
          notes: rate.notes,
          base_rate_eur: rate.base_rate_eur || 0,
          base_rate_non_eur: rate.base_rate_non_eur || rate.base_rate_eur || 0,
          eur_rate: rate.base_rate_eur || 0,
          non_eur_rate: rate.base_rate_non_eur || rate.base_rate_eur || 0,
          // The overview formats each row in ITS currency; the other
          // hand-built shapes here already carry it, this one did not.
          rate_currency: rate.rate_currency ?? null
        }))
        error = transportResult.error
        break

      case 'guide': {
        // The RATE table, not the guides roster. This tab used to read
        // `guides.daily_rate_eur` — a column that does not exist — so every
        // guide showed the fallback while guide_rates (the table the engine
        // prices from) was never consulted (A-item 15).
        const guideQuery = supabase
          .from('guide_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          guideQuery.ilike('city', city)
        }

        const guideResult = await guideQuery

        data = (guideResult.data || []).map((rate: any) => ({
          id: rate.id,
          service_code: rate.service_code || rate.id,
          guide_language: rate.guide_language,
          guide_type: rate.guide_type,
          city: rate.city,
          tour_duration: rate.tour_duration,
          notes: rate.notes,
          rate_currency: rate.rate_currency,
          base_rate_eur: rate.full_day_rate ?? rate.base_rate_eur,
          base_rate_non_eur: rate.full_day_rate ?? rate.base_rate_non_eur,
          eur_rate: rate.full_day_rate ?? rate.base_rate_eur,
          non_eur_rate: rate.full_day_rate ?? rate.base_rate_non_eur
        }))
        error = guideResult.error
        break
      }

      case 'service':
      case 'service_fee':
        // `service_fees` does not exist in the schema, so the query always
        // came back with PGRST205 and we returned an empty list. Skip the
        // round-trip and return the empty list directly.
        data = []
        error = null
        break

      // ============================================
      // NEW RATE TYPES
      // ============================================

      case 'airport_staff':
        // ✅ Pull from airport_staff_rates table
        const airportStaffQuery = supabase
          .from('airport_staff_rates')
          .select('*')
          .eq('is_active', true)
          .order('airport_code')
          .order('service_type')
        
        const airportStaffResult = await airportStaffQuery
        data = airportStaffResult.data || []
        error = airportStaffResult.error
        break

      case 'hotel_staff':
        // ✅ Pull from hotel_staff_rates table
        const hotelStaffQuery = supabase
          .from('hotel_staff_rates')
          .select('*')
          .eq('is_active', true)
          .order('service_type')
          .order('hotel_category')
        
        const hotelStaffResult = await hotelStaffQuery
        data = hotelStaffResult.data || []
        error = hotelStaffResult.error
        break

      case 'cruises':
        // ✅ Pull from nile_cruises table
        const cruisesQuery = supabase
          .from('nile_cruises')
          .select('*')
          .eq('is_active', true)
          .order('ship_name')
          .order('cabin_type')
        
        const cruisesResult = await cruisesQuery
        data = cruisesResult.data || []
        error = cruisesResult.error
        break

      case 'sleeping_trains':
        // ✅ Pull from sleeping_train_rates table
        const sleepingTrainsQuery = supabase
          .from('sleeping_train_rates')
          .select('*')
          .eq('is_active', true)
          .order('origin_city')
          .order('destination_city')
        
        const sleepingTrainsResult = await sleepingTrainsQuery
        data = sleepingTrainsResult.data || []
        error = sleepingTrainsResult.error
        break

      case 'trains':
        // ✅ Pull from train_rates table
        const trainsQuery = supabase
          .from('train_rates')
          .select('*')
          .eq('is_active', true)
          .order('origin_city')
          .order('destination_city')
        
        const trainsResult = await trainsQuery
        data = trainsResult.data || []
        error = trainsResult.error
        break

      case 'tipping':
        // ✅ Pull from tipping_rates table
        const tippingQuery = supabase
          .from('tipping_rates')
          .select('*')
          .eq('is_active', true)
          .order('role_type')
          .order('context')
        
        const tippingResult = await tippingQuery
        data = tippingResult.data || []
        error = tippingResult.error
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        )
    }

    if (error) {
      console.error('Supabase error:', error)
      // Return empty array instead of error for missing tables
      return NextResponse.json({
        success: true,
        data: [],
        count: 0
      })
    }

    // A train rate names WHICH train it prices; the hub showed only the
    // operator. Resolved with one extra query rather than a PostgREST embed —
    // a missing FK fails the whole query, and "no train name" must not become
    // "no rates". Cheap no-op for every other rate type.
    const withNames =
      type === 'trains' || type === 'sleeping_trains'
        ? await attachPropertyNames(supabase, data as { property_id?: string | null }[])
        : data

    return NextResponse.json({
      success: true,
      data: withNames,
      count: withNames.length
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch rates' 
      },
      { status: 500 }
    )
  }
}