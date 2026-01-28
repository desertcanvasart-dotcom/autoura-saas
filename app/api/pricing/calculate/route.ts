import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create authenticated client to get user preferences
async function createAuthClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication - accesses rate tables and pricing data
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      num_adults,
      num_children = 0,
      duration_days,
      tour_type, // 'day_tour' or 'package'
      city = 'Cairo', // City where tour takes place
      transportation_service = 'day_tour', // Type of transportation service
      override_transportation = null, // Override with specific service_code
      language = 'English',
      entrance_fees_per_person = 0,
      includes_lunch = false,
      includes_dinner = false,
      outside_cairo = false,
      airport_transfers = 0,
      hotel_checkins = 0,
      // NEW: Allow explicit margin override from frontend
      margin_percent = null,
      // NEW: User ID for fetching preferences (optional)
      userId = null,
    } = body

    const total_travelers = num_adults + num_children

    console.log('🚗 Vehicle Selection:', { 
      city, 
      service: transportation_service, 
      travelers: total_travelers,
      override: override_transportation 
    })

    // ============================================
    // STEP 1: GET VEHICLE (HYBRID SELECTION)
    // ============================================
    let vehicle
    
    if (override_transportation) {
      // Manual override - use specific service code
      console.log('🔧 Using override:', override_transportation)
      
      const { data: overrideVehicle } = await supabase
        .from('transportation_rates')
        .select('*')
        .eq('service_code', override_transportation)
        .eq('is_active', true)
        .single()

      if (!overrideVehicle) {
        throw new Error(`Override vehicle not found: ${override_transportation}`)
      }

      // Verify capacity
      if (total_travelers < overrideVehicle.capacity_min || total_travelers > overrideVehicle.capacity_max) {
        throw new Error(`Vehicle ${overrideVehicle.vehicle_type} cannot accommodate ${total_travelers} passengers (capacity: ${overrideVehicle.capacity_min}-${overrideVehicle.capacity_max})`)
      }

      vehicle = overrideVehicle
    } else {
      // Auto-select based on city, service type, and group size
      console.log('🤖 Auto-selecting vehicle...')
      
      const { data: vehicles } = await supabase
        .from('transportation_rates')
        .select('*')
        .eq('city', city)
        .eq('service_type', transportation_service)
        .lte('capacity_min', total_travelers)
        .gte('capacity_max', total_travelers)
        .eq('is_active', true)
        .order('base_rate_eur', { ascending: true })

      if (!vehicles || vehicles.length === 0) {
        throw new Error(`No vehicle available for ${total_travelers} passengers in ${city} (${transportation_service})`)
      }

      vehicle = vehicles[0] // Pick cheapest option that fits
    }

    console.log('✅ Selected vehicle:', vehicle.vehicle_type, '€', vehicle.base_rate_eur)

    const vehicle_cost_per_day = vehicle.base_rate_eur

    // ============================================
    // STEP 2: GET GUIDE COST
    // ============================================
    const { data: guides } = await supabase
      .from('guide_rates')
      .select('*')
      .eq('guide_language', language)
      .eq('is_active', true)
      .limit(1)

    if (!guides || guides.length === 0) {
      throw new Error(`No guide available for language: ${language}`)
    }

    const guide = guides[0]
    const guide_cost_per_day = guide.base_rate_eur

    // ============================================
    // STEP 3: GET FIXED DAILY COSTS
    // ============================================
    const { data: fixedCosts } = await supabase
      .from('fixed_daily_costs')
      .select('*')
      .eq('is_active', true)

    const tips_per_day = fixedCosts?.find((c: any) => c.cost_type === 'Daily Tips')?.cost_per_person_per_day || 5
    const water_per_day = fixedCosts?.find((c: any) => c.cost_type === 'Water Bottle')?.cost_per_person_per_day || 2

    // ============================================
    // STEP 4: CALCULATE GROUP COSTS
    // ============================================
    const group_costs_per_day = vehicle_cost_per_day + guide_cost_per_day + tips_per_day
    const total_group_costs = group_costs_per_day * duration_days

    // ============================================
    // STEP 5: CALCULATE PER-PERSON COSTS
    // ============================================
    const { data: meals } = await supabase
      .from('meal_costs')
      .select('*')
      .eq('is_active', true)

    const lunch_cost = meals?.find((m: any) => m.meal_type === 'Lunch')?.cost_per_person || 10
    const dinner_cost = meals?.find((m: any) => m.meal_type === 'Dinner')?.cost_per_person || 10

    let per_person_per_day = water_per_day + entrance_fees_per_person
    if (includes_lunch) per_person_per_day += lunch_cost
    if (includes_dinner) per_person_per_day += dinner_cost

    // ============================================
    // STEP 6: APPLY CHILD DISCOUNTS
    // ============================================
    const { data: discounts } = await supabase
      .from('discount_rules')
      .select('*')
      .eq('is_active', true)

    let total_per_person_costs = 0
    total_per_person_costs += num_adults * per_person_per_day * duration_days

    const child_discount = discounts?.find((d: any) => d.rule_type === 'Child Discount')?.discount_percentage || 50
    const child_multiplier = 1 - (child_discount / 100)
    total_per_person_costs += num_children * per_person_per_day * duration_days * child_multiplier

    // ============================================
    // STEP 7: ADD OUTSIDE CAIRO FEE
    // ============================================
    let outside_cairo_fee = 0
    if (outside_cairo) {
      const { data: outFee } = await supabase
        .from('outside_cairo_fees')
        .select('*')
        .eq('is_active', true)
        .limit(1)

      outside_cairo_fee = (outFee?.[0]?.fee_per_person || 10) * total_travelers
    }

    // ============================================
    // STEP 8: ADD ASSISTANT COSTS
    // ============================================
    const { data: assistants } = await supabase
      .from('assistant_rates')
      .select('*')
      .eq('is_active', true)

    const airport_assistant_cost = assistants?.find((a: any) => a.assistant_type === 'Airport Assistant')?.cost_per_service || 18
    const hotel_assistant_cost = assistants?.find((a: any) => a.assistant_type === 'Hotel Assistant')?.cost_per_service || 12

    const total_assistant_costs = 
      (airport_transfers * airport_assistant_cost) + 
      (hotel_checkins * hotel_assistant_cost)

    // ============================================
    // STEP 9: CALCULATE BASE PRICE
    // ============================================
    const base_total_cost = 
      total_group_costs + 
      total_per_person_costs + 
      outside_cairo_fee + 
      total_assistant_costs

    const base_price_per_person = base_total_cost / total_travelers

    // ============================================
    // STEP 10: APPLY PROFIT MARGIN (FIXED!)
    // Priority: 1) Explicit param → 2) User prefs → 3) profit_margins table → 4) Default 25%
    // ============================================
    let profit_margin: number
    let margin_source: string

    if (margin_percent !== null && margin_percent !== undefined) {
      // 1. Explicit parameter passed - use it directly
      profit_margin = margin_percent
      margin_source = 'explicit_parameter'
      console.log('💰 Using explicit margin:', profit_margin + '%')
    } else if (userId) {
      // 2. Try to get user preferences
      const { data: userPrefs } = await supabase
        .from('user_preferences')
        .select('default_margin_percent')
        .eq('user_id', userId)
        .single()

      if (userPrefs?.default_margin_percent !== null && userPrefs?.default_margin_percent !== undefined) {
        profit_margin = userPrefs.default_margin_percent
        margin_source = 'user_preferences'
        console.log('💰 Using user preference margin:', profit_margin + '%')
      } else {
        // Fall back to profit_margins table
        const { data: margins } = await supabase
          .from('profit_margins')
          .select('*')
          .eq('tour_type', tour_type)
          .eq('is_active', true)
          .limit(1)

        profit_margin = margins?.[0]?.margin_percentage || 25
        margin_source = margins?.[0] ? 'profit_margins_table' : 'default'
        console.log('💰 Using table/default margin:', profit_margin + '%')
      }
    } else {
      // 3. No userId - try to get from authenticated session
      try {
        const authClient = await createAuthClient()
        const { data: { user } } = await authClient.auth.getUser()
        
        if (user) {
          const { data: userPrefs } = await supabase
            .from('user_preferences')
            .select('default_margin_percent')
            .eq('user_id', user.id)
            .single()

          if (userPrefs?.default_margin_percent !== null && userPrefs?.default_margin_percent !== undefined) {
            profit_margin = userPrefs.default_margin_percent
            margin_source = 'user_preferences_session'
            console.log('💰 Using session user preference margin:', profit_margin + '%')
          } else {
            // Fall back to profit_margins table
            const { data: margins } = await supabase
              .from('profit_margins')
              .select('*')
              .eq('tour_type', tour_type)
              .eq('is_active', true)
              .limit(1)

            profit_margin = margins?.[0]?.margin_percentage || 25
            margin_source = margins?.[0] ? 'profit_margins_table' : 'default'
          }
        } else {
          // No user session - use profit_margins table
          const { data: margins } = await supabase
            .from('profit_margins')
            .select('*')
            .eq('tour_type', tour_type)
            .eq('is_active', true)
            .limit(1)

          profit_margin = margins?.[0]?.margin_percentage || 25
          margin_source = margins?.[0] ? 'profit_margins_table' : 'default'
        }
      } catch {
        // Session check failed - use profit_margins table
        const { data: margins } = await supabase
          .from('profit_margins')
          .select('*')
          .eq('tour_type', tour_type)
          .eq('is_active', true)
          .limit(1)

        profit_margin = margins?.[0]?.margin_percentage || 25
        margin_source = margins?.[0] ? 'profit_margins_table' : 'default'
      }
    }

    const profit_multiplier = 1 + (profit_margin / 100)

    const final_price_per_person = base_price_per_person * profit_multiplier
    const final_total_price = final_price_per_person * total_travelers

    // ============================================
    // STEP 11: APPLY MINIMUM BOOKING FEE
    // ============================================
    const { data: bookingRules } = await supabase
      .from('booking_rules')
      .select('*')
      .eq('rule_type', 'Minimum Booking')
      .eq('is_active', true)
      .limit(1)

    const minimum_booking = bookingRules?.[0]?.minimum_amount || 100
    const actual_total_price = Math.max(final_total_price, minimum_booking)
    const actual_price_per_person = actual_total_price / total_travelers

    // ============================================
    // GET ALTERNATIVE VEHICLES (for UI)
    // ============================================
    const { data: alternativeVehicles } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('city', city)
      .eq('service_type', transportation_service)
      .lte('capacity_min', total_travelers)
      .gte('capacity_max', total_travelers)
      .eq('is_active', true)
      .order('base_rate_eur', { ascending: true })

    // ============================================
    // RESPONSE WITH BREAKDOWN
    // ============================================
    return NextResponse.json({
      success: true,
      pricing: {
        price_per_person: Math.round(actual_price_per_person * 100) / 100,
        total_price: Math.round(actual_total_price * 100) / 100,
        currency: 'EUR',
        breakdown: {
          group_costs: {
            vehicle: vehicle_cost_per_day * duration_days,
            guide: guide_cost_per_day * duration_days,
            tips: tips_per_day * duration_days,
            total: total_group_costs
          },
          per_person_costs: {
            entrance_fees: entrance_fees_per_person * duration_days,
            water: water_per_day * duration_days,
            lunch: includes_lunch ? lunch_cost * duration_days : 0,
            dinner: includes_dinner ? dinner_cost * duration_days : 0,
            adults_total: num_adults * per_person_per_day * duration_days,
            children_total: num_children * per_person_per_day * duration_days * child_multiplier,
            total: total_per_person_costs
          },
          additional_costs: {
            outside_cairo: outside_cairo_fee,
            assistants: total_assistant_costs
          },
          base_cost: base_total_cost,
          // UPDATED: Include margin source for transparency
          profit_margin: `${profit_margin}%`,
          profit_margin_source: margin_source,
          profit_amount: final_total_price - base_total_cost,
          minimum_booking_applied: final_total_price < minimum_booking
        },
        travelers: {
          adults: num_adults,
          children: num_children,
          total: total_travelers
        },
        vehicle: {
          selected: {
            service_code: vehicle.service_code,
            type: vehicle.vehicle_type,
            capacity: `${vehicle.capacity_min}-${vehicle.capacity_max} pax`,
            cost_per_day: vehicle_cost_per_day,
            was_overridden: override_transportation !== null
          },
          alternatives: alternativeVehicles?.map((v: any) => ({
            service_code: v.service_code,
            type: v.vehicle_type,
            capacity: `${v.capacity_min}-${v.capacity_max} pax`,
            cost_per_day: v.base_rate_eur,
            is_selected: v.service_code === vehicle.service_code
          })) || []
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Pricing calculation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to calculate pricing'
      },
      { status: 500 }
    )
  }
}