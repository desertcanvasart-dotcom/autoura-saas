// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

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

    let data = []
    let error = null

    switch (type) {
      case 'accommodation':
        // ✅ Pull from hotel_contacts table
        const accommodationQuery = supabase
          .from('hotel_contacts')
          .select('*')
          .eq('is_active', true)
        
        if (city) {
          accommodationQuery.ilike('city', city)
        }
        
        const accommodationResult = await accommodationQuery
        
        // Transform hotel data to match rates format
        data = (accommodationResult.data || []).map((hotel: any) => ({
          service_code: hotel.id,
          property_name: hotel.name,
          property_type: hotel.property_type,
          star_rating: hotel.star_rating,
          city: hotel.city,
          address: hotel.address,
          supplier_name: hotel.contact_person,
          notes: hotel.notes,
          base_rate_eur: 0,
          base_rate_non_eur: 0
        }))
        error = accommodationResult.error
        break

      case 'meal':
        // ✅ Pull from restaurant_contacts table
        const mealQuery = supabase
          .from('restaurant_contacts')
          .select('*')
          .eq('is_active', true)
        
        if (city) {
          mealQuery.ilike('city', city)
        }
        
        const mealResult = await mealQuery
        
        // Transform restaurant data to match rates format
        data = (mealResult.data || []).map((restaurant: any) => ({
          service_code: restaurant.id,
          restaurant_name: restaurant.name,
          meal_type: restaurant.meal_types?.[0] || 'lunch',
          cuisine_type: restaurant.cuisine_type,
          restaurant_type: restaurant.restaurant_type,
          city: restaurant.city,
          supplier_name: restaurant.contact_person,
          notes: restaurant.notes,
          base_rate_eur: 0,
          base_rate_non_eur: 0,
          eur_rate: 0,
          non_eur_rate: 0
        }))
        error = mealResult.error
        break

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
          non_eur_rate: rate.base_rate_non_eur || rate.base_rate_eur || 0
        }))
        error = transportResult.error
        break

      case 'guide':
        // ✅ Pull from guides table
        const guideQuery = supabase
          .from('guides')
          .select('*')
          .eq('is_active', true)
        
        const guideResult = await guideQuery
        
        // Transform guide data to match rates format
        data = (guideResult.data || []).map((guide: any) => ({
          service_code: guide.id,
          guide_language: guide.languages?.[0] || 'English',
          guide_type: guide.specialties?.[0] || 'General',
          city: 'Cairo',
          tour_duration: 'full_day',
          notes: `${guide.name} - ${guide.certification_number || ''}`,
          base_rate_eur: guide.daily_rate_eur || guide.daily_rate || 0,
          base_rate_non_eur: guide.daily_rate_eur || guide.daily_rate || 0,
          eur_rate: guide.daily_rate_eur || guide.daily_rate || 0,
          non_eur_rate: guide.daily_rate_eur || guide.daily_rate || 0
        }))
        error = guideResult.error
        break

      case 'service':
      case 'service_fee':
        // Keep service_fees table if it exists
        const serviceQuery = supabase
          .from('service_fees')
          .select('*')
          .eq('is_active', true)
        
        const serviceResult = await serviceQuery
        data = serviceResult.data || []
        error = serviceResult.error
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

    return NextResponse.json({
      success: true,
      data: data,
      count: data.length
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