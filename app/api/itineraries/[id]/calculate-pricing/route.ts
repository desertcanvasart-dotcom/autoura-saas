// ============================================
// CALCULATE PRICING API
// File: app/api/itineraries/[id]/calculate-pricing/route.ts
// 
// Recalculates pricing for an existing itinerary
// after edits in the Editor page.
// NOW USES USER PREFERENCES for margin, tier, etc.
// UPDATED: Respects is_addon flag for attractions
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

// ============================================
// TYPES
// ============================================

interface DayService {
  guide: boolean
  lunch: boolean
  dinner: boolean
  hotel: boolean
  water: boolean
  tips: boolean
}

interface DayInput {
  day_number: number
  city: string
  attractions: string[]
  services: DayService
  overnight_city: string | null
}

interface PricingRequest {
  tier: string
  package_type: string
  days: DayInput[]
  num_adults: number
  num_children: number
  nationality_type: 'eur' | 'non-eur'
  include_addons?: boolean // NEW: Whether to include add-on attractions
}

interface UserPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

// ============================================
// DEFAULT VALUES (fallback if no user prefs)
// ============================================

const DEFAULT_MARGIN_PERCENT = 25
const DEFAULT_TIER = 'standard'
const DEFAULT_CURRENCY = 'EUR'

// ============================================
// GET USER PREFERENCES
// ============================================

async function getUserPreferences(supabase: any, userId: string): Promise<UserPreferences | null> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      console.log('[Pricing] No user preferences found, using defaults')
      return null
    }

    console.log('[Pricing] User preferences loaded:', {
      margin: data.default_margin_percent,
      tier: data.default_tier,
      cost_mode: data.default_cost_mode
    })

    return {
      default_cost_mode: data.default_cost_mode || 'auto',
      default_tier: data.default_tier || DEFAULT_TIER,
      default_margin_percent: data.default_margin_percent ?? DEFAULT_MARGIN_PERCENT,
      default_currency: data.default_currency || DEFAULT_CURRENCY
    }
  } catch (error) {
    console.error('[Pricing] Error fetching user preferences:', error)
    return null
  }
}

// ============================================
// GET CURRENT USER FROM SESSION
// ============================================

async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
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

    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch (error) {
    console.error('[Pricing] Error getting current user:', error)
    return null
  }
}

// ============================================
// MARKUP FUNCTION
// ============================================

function applyMarkup(cost: number, marginPercent: number): number {
  return cost * (1 + marginPercent / 100)
}

// ============================================
// RATE FETCHING
// ============================================

async function getTransportationRate(supabase: any, city: string, tier: string, pax: number) {
  let vehicleType = 'sedan'
  if (pax > 3) vehicleType = 'minivan'
  if (pax > 7) vehicleType = 'minibus'
  if (pax > 15) vehicleType = 'bus'

  // Try transportation_rates table first
  const { data: rate } = await supabase
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .gte('capacity_max', pax)
    .order('capacity_min', { ascending: true })
    .limit(1)
    .single()

  if (rate) {
    return {
      rate: rate.base_rate_eur || 50,
      supplier_id: rate.supplier_id || null,
      supplier_name: rate.supplier_name || null,
      name: `${rate.vehicle_type || vehicleType} - ${city}`,
      code: rate.service_code || `TRANS-${city.substring(0,3).toUpperCase()}`
    }
  }

  // Try vehicles table
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('is_active', true)
    .gte('capacity_max', pax)
    .order('capacity_min', { ascending: true })
    .limit(1)
    .single()

  if (vehicle) {
    return {
      rate: vehicle.daily_rate_eur || 50,
      supplier_id: vehicle.id,
      supplier_name: vehicle.company_name || null,
      name: `${vehicle.vehicle_type} - ${city}`,
      code: vehicle.id || `TRANS-${city.substring(0,3).toUpperCase()}`
    }
  }

  // Fallback
  const fallback: Record<string, number> = {
    'Cairo': 52, 'Giza': 52, 'Luxor': 45, 'Aswan': 45,
    'Alexandria': 60, 'Hurghada': 55
  }
  
  return {
    rate: fallback[city] || 50,
    supplier_id: null,
    supplier_name: null,
    name: `${vehicleType} - ${city}`,
    code: `TRANS-${city.substring(0,3).toUpperCase()}`
  }
}

async function getGuideRate(supabase: any, city: string, tier: string, language: string = 'English') {
  // Try guide_rates table
  const { data: rate } = await supabase
    .from('guide_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('guide_language', `%${language}%`)
    .limit(1)
    .single()

  if (rate) {
    return {
      rate: rate.base_rate_eur || rate.full_day_rate_eur || 50,
      supplier_id: rate.supplier_id || null,
      supplier_name: rate.guide_name || null,
      name: `${language} Speaking Guide - ${city}`,
      code: rate.service_code || `GUIDE-${language.substring(0,2).toUpperCase()}`
    }
  }

  // Try guides table
  const { data: guide } = await supabase
    .from('guides')
    .select('*')
    .eq('is_active', true)
    .contains('languages', [language])
    .limit(1)
    .single()

  if (guide) {
    return {
      rate: guide.daily_rate_eur || 55,
      supplier_id: guide.id,
      supplier_name: guide.name || null,
      name: `${language} Speaking Guide - ${city}`,
      code: guide.id || `GUIDE-${language.substring(0,2).toUpperCase()}`
    }
  }

  // Fallback
  return {
    rate: 50,
    supplier_id: null,
    supplier_name: null,
    name: `${language} Speaking Guide - ${city}`,
    code: `GUIDE-${language.substring(0,2).toUpperCase()}`
  }
}

// ============================================
// UPDATED: getEntranceFee with is_addon support
// ============================================

interface EntranceFeeResult {
  rate: number
  rateEur: number
  rateNonEur: number
  name: string
  code: string
  isAddon: boolean  // NEW: Flag to indicate if this is an add-on
  addonNote?: string // NEW: Optional note about the add-on
}

async function getEntranceFee(supabase: any, attractionName: string, isEuroPassport: boolean): Promise<EntranceFeeResult> {
  // Try entrance_fees table first (PRIMARY TABLE)
  // Use exact match first, then fall back to fuzzy match
  let fee = null
  
  // First try exact match
  const { data: exactFee } = await supabase
    .from('entrance_fees')
    .select('*')
    .eq('is_active', true)
    .eq('attraction_name', attractionName)
    .limit(1)
    .single()
  
  if (exactFee) {
    fee = exactFee
  } else {
    // Fall back to fuzzy match
    const { data: fuzzyFee } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)
      .single()
    fee = fuzzyFee
  }

  if (fee) {
    const rateEur = fee.eur_rate || 0
    const rateNonEur = fee.non_eur_rate || fee.eur_rate || 0
    return {
      rate: isEuroPassport ? rateEur : rateNonEur,
      rateEur,
      rateNonEur,
      name: fee.attraction_name,
      code: fee.service_code || `ENT-${fee.attraction_name.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
      isAddon: fee.is_addon || false,
      addonNote: fee.addon_note || undefined
    }
  }

  // Try activity_rates table as secondary
  const { data: activity } = await supabase
    .from('activity_rates')
    .select('*')
    .eq('is_active', true)
    .ilike('activity_name', `%${attractionName}%`)
    .limit(1)
    .single()

  if (activity) {
    const rateEur = activity.base_rate_eur || 0
    const rateNonEur = activity.base_rate_non_eur || activity.base_rate_eur || 0
    return {
      rate: isEuroPassport ? rateEur : rateNonEur,
      rateEur,
      rateNonEur,
      name: activity.activity_name,
      code: activity.activity_code || `ENT-${activity.activity_name.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
      isAddon: activity.is_addon || false,
      addonNote: activity.addon_note || undefined
    }
  }

  // Fallback - unknown attractions are NOT add-ons
  console.log(`[Pricing] ⚠️ No rate found for "${attractionName}", using fallback €15`)
  return {
    rate: 15,
    rateEur: 15,
    rateNonEur: 15,
    name: attractionName,
    code: `ENT-${attractionName.substring(0,5).toUpperCase().replace(/\s/g, '')}`,
    isAddon: false
  }
}

async function getMealRate(supabase: any, city: string, mealType: 'lunch' | 'dinner', tier: string) {
  const { data: rate } = await supabase
    .from('meal_rates')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single()

  const tierMultiplier: Record<string, number> = {
    'budget': 0.8, 'standard': 1.0, 'deluxe': 1.3, 'luxury': 1.6
  }

  if (rate) {
    const baseRate = mealType === 'lunch' 
      ? (rate.lunch_rate_eur || 12) 
      : (rate.dinner_rate_eur || 18)
    return {
      rate: Math.round(baseRate * (tierMultiplier[tier] || 1)),
      supplier_name: null,
      name: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} - ${city}`,
      code: mealType === 'lunch' ? 'LUNCH' : 'DINNER'
    }
  }

  const fallback = mealType === 'lunch' ? 12 : 18
  return {
    rate: Math.round(fallback * (tierMultiplier[tier] || 1)),
    supplier_name: null,
    name: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} - ${city}`,
    code: mealType === 'lunch' ? 'LUNCH' : 'DINNER'
  }
}

async function getHotelRate(supabase: any, city: string, tier: string) {
  const { data: hotel } = await supabase
    .from('hotel_contacts')
    .select('*')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('is_preferred', { ascending: false })
    .limit(1)
    .single()

  if (hotel) {
    return {
      rate: hotel.rate_double_eur || 80,
      supplier_id: hotel.id,
      supplier_name: hotel.name,
      name: `${hotel.name} - Double Room`,
      code: hotel.id || `HTL-${city.substring(0,3).toUpperCase()}`
    }
  }

  // Fallback without tier filter
  const { data: anyHotel } = await supabase
    .from('hotel_contacts')
    .select('*')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .order('is_preferred', { ascending: false })
    .limit(1)
    .single()

  if (anyHotel) {
    return {
      rate: anyHotel.rate_double_eur || 80,
      supplier_id: anyHotel.id,
      supplier_name: anyHotel.name,
      name: `${anyHotel.name} - Double Room`,
      code: anyHotel.id || `HTL-${city.substring(0,3).toUpperCase()}`
    }
  }

  const fallbackRates: Record<string, number> = {
    'budget': 45, 'standard': 80, 'deluxe': 120, 'luxury': 180
  }

  return {
    rate: fallbackRates[tier] || 80,
    supplier_id: null,
    supplier_name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Hotel`,
    name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Hotel - ${city}`,
    code: `HTL-${city.substring(0,3).toUpperCase()}`
  }
}

async function getTippingRate(supabase: any, tier: string) {
  const { data: rates } = await supabase
    .from('tipping_rates')
    .select('*')
    .eq('is_active', true)

  let dailyTips = 15
  if (rates && rates.length > 0) {
    dailyTips = rates.reduce((sum, t) => {
      if (t.rate_unit === 'per_day') {
        return sum + (t.rate_eur || 0)
      }
      return sum
    }, 0)
    if (dailyTips === 0) dailyTips = 15
  }

  const tierMultiplier: Record<string, number> = {
    'budget': 0.8, 'standard': 1.0, 'deluxe': 1.2, 'luxury': 1.5
  }

  return {
    rate: Math.round(dailyTips * (tierMultiplier[tier] || 1)),
    name: 'Daily Tips',
    code: 'DAILY-TIPS'
  }
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase: supabase } = authResult // Use authenticated client

    // Next.js 15: params is now a Promise
    const { id: itineraryId } = await params
    const body: PricingRequest = await request.json()
    
    const { 
      tier, 
      package_type, 
      days, 
      num_adults, 
      num_children, 
      nationality_type,
      include_addons = false  // NEW: Default to NOT including add-ons
    } = body
    
    const totalPax = num_adults + num_children
    const isEuroPassport = nationality_type === 'eur'

    console.log(`[Pricing] Starting for itinerary ${itineraryId}`)
    console.log(`[Pricing] ${days.length} days, ${totalPax} pax, tier: ${tier}, package: ${package_type}`)
    console.log(`[Pricing] Include add-ons: ${include_addons}`)

    // ============================================
    // GET USER PREFERENCES
    // ============================================
    const userId = await getCurrentUserId()
    let userPrefs: UserPreferences | null = null
    
    if (userId) {
      userPrefs = await getUserPreferences(supabase, userId)
    }

    // ============================================
    // GET ITINERARY & DETERMINE MARGIN
    // ============================================
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('margin_percent, currency, created_by')
      .eq('id', itineraryId)
      .single()

    // Priority: 1) Itinerary-specific margin, 2) User preferences, 3) Default
    let marginPercent: number
    if (itinerary?.margin_percent !== null && itinerary?.margin_percent !== undefined) {
      marginPercent = itinerary.margin_percent
      console.log(`[Pricing] Using itinerary margin: ${marginPercent}%`)
    } else if (userPrefs?.default_margin_percent !== null && userPrefs?.default_margin_percent !== undefined) {
      marginPercent = userPrefs.default_margin_percent
      console.log(`[Pricing] Using user preference margin: ${marginPercent}%`)
      
      // Also save this margin to the itinerary for future reference
      await supabase
        .from('itineraries')
        .update({ margin_percent: marginPercent })
        .eq('id', itineraryId)
    } else {
      marginPercent = DEFAULT_MARGIN_PERCENT
      console.log(`[Pricing] Using default margin: ${marginPercent}%`)
    }

    const currency = itinerary?.currency || userPrefs?.default_currency || DEFAULT_CURRENCY

    // Get existing days (to get their IDs)
    const { data: existingDays, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id, day_number')
      .eq('itinerary_id', itineraryId)
      .order('day_number')

    if (daysError || !existingDays?.length) {
      throw new Error('No itinerary days found. Save the draft first.')
    }

    const dayIdMap = new Map<number, string>()
    existingDays.forEach(day => dayIdMap.set(day.day_number, day.id))

    // Delete existing services
    const dayIds = existingDays.map(d => d.id)
    await supabase
      .from('itinerary_services')
      .delete()
      .in('itinerary_day_id', dayIds)

    // Calculate services
    const allServices: any[] = []
    let totalSupplierCost = 0
    let totalClientPrice = 0
    
    // NEW: Track skipped add-ons for reporting
    const skippedAddons: string[] = []

    const tipping = await getTippingRate(supabase, tier)
    const waterRate = 2
    const roomsNeeded = Math.ceil(totalPax / 2)

    // Determine what to include based on package type
    let includeAccommodation = true
    if (package_type === 'day-trips' || package_type === 'tours-only') {
      includeAccommodation = false
    }

    for (const day of days) {
      const dayId = dayIdMap.get(day.day_number)
      if (!dayId) continue

      const { city, attractions, services, overnight_city } = day

      // TRANSPORTATION
      const transport = await getTransportationRate(supabase, city, tier, totalPax)
      const transportClient = applyMarkup(transport.rate, marginPercent)
      allServices.push({
        itinerary_day_id: dayId,
        service_type: 'transportation',
        service_code: transport.code,
        service_name: transport.name,
        supplier_name: transport.supplier_name,
        quantity: 1,
        rate_eur: transport.rate,
        rate_non_eur: transport.rate,
        total_cost: transport.rate,
        client_price: transportClient,
        notes: `Full day - ${city}`
      })
      totalSupplierCost += transport.rate
      totalClientPrice += transportClient

      // GUIDE
      if (services.guide) {
        const guide = await getGuideRate(supabase, city, tier)
        const guideClient = applyMarkup(guide.rate, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'guide',
          service_code: guide.code,
          service_name: guide.name,
          supplier_name: guide.supplier_name,
          quantity: 1,
          rate_eur: guide.rate,
          rate_non_eur: guide.rate,
          total_cost: guide.rate,
          client_price: guideClient,
          notes: `Full day - ${city}`
        })
        totalSupplierCost += guide.rate
        totalClientPrice += guideClient
      }

      // ENTRANCE FEES - NOW WITH ADD-ON CHECK
      for (const attraction of attractions) {
        const entrance = await getEntranceFee(supabase, attraction, isEuroPassport)
        
        // NEW: Skip add-ons if not explicitly included
        if (entrance.isAddon && !include_addons) {
          console.log(`[Pricing] ⏭️ Skipping add-on: ${entrance.name} (${entrance.addonNote || 'optional extra'})`)
          skippedAddons.push(entrance.name)
          continue
        }
        
        const entranceTotal = entrance.rate * totalPax
        // No markup on entrance fees typically
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'entrance',
          service_code: entrance.code,
          service_name: entrance.name,
          quantity: totalPax,
          rate_eur: entrance.rateEur,
          rate_non_eur: entrance.rateNonEur,
          total_cost: entranceTotal,
          client_price: entranceTotal,
          notes: entrance.isAddon 
            ? `${isEuroPassport ? 'EUR' : 'non-EUR'} rate (Optional Add-on)` 
            : `${isEuroPassport ? 'EUR' : 'non-EUR'} rate`
        })
        totalSupplierCost += entranceTotal
        totalClientPrice += entranceTotal
      }

      // LUNCH
      if (services.lunch) {
        const meal = await getMealRate(supabase, city, 'lunch', tier)
        const mealTotal = meal.rate * totalPax
        const mealClient = applyMarkup(mealTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'meal',
          service_code: meal.code,
          service_name: meal.name,
          supplier_name: meal.supplier_name,
          quantity: totalPax,
          rate_eur: meal.rate,
          rate_non_eur: meal.rate,
          total_cost: mealTotal,
          client_price: mealClient,
          notes: 'Lunch'
        })
        totalSupplierCost += mealTotal
        totalClientPrice += mealClient
      }

      // DINNER
      if (services.dinner) {
        const meal = await getMealRate(supabase, city, 'dinner', tier)
        const mealTotal = meal.rate * totalPax
        const mealClient = applyMarkup(mealTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'meal',
          service_code: `${meal.code}-DINNER`,
          service_name: meal.name.replace('Lunch', 'Dinner'),
          supplier_name: meal.supplier_name,
          quantity: totalPax,
          rate_eur: meal.rate,
          rate_non_eur: meal.rate,
          total_cost: mealTotal,
          client_price: mealClient,
          notes: 'Dinner'
        })
        totalSupplierCost += mealTotal
        totalClientPrice += mealClient
      }

      // WATER (standard inclusion)
      const waterTotal = waterRate * totalPax
      allServices.push({
        itinerary_day_id: dayId,
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterRate,
        rate_non_eur: waterRate,
        total_cost: waterTotal,
        client_price: waterTotal,
        notes: 'Bottled water'
      })
      totalSupplierCost += waterTotal
      totalClientPrice += waterTotal

      // TIPS (standard inclusion)
      const tipsClient = applyMarkup(tipping.rate, marginPercent)
      allServices.push({
        itinerary_day_id: dayId,
        service_type: 'tips',
        service_code: tipping.code,
        service_name: tipping.name,
        quantity: 1,
        rate_eur: tipping.rate,
        rate_non_eur: tipping.rate,
        total_cost: tipping.rate,
        client_price: tipsClient,
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += tipping.rate
      totalClientPrice += tipsClient

      // HOTEL
      const isLastDay = day.day_number === days.length
      if (services.hotel && overnight_city && includeAccommodation && !isLastDay) {
        const hotel = await getHotelRate(supabase, overnight_city, tier)
        const hotelTotal = hotel.rate * roomsNeeded
        const hotelClient = applyMarkup(hotelTotal, marginPercent)
        allServices.push({
          itinerary_day_id: dayId,
          service_type: 'accommodation',
          service_code: hotel.code,
          service_name: `${hotel.supplier_name} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          supplier_name: hotel.supplier_name,
          quantity: roomsNeeded,
          rate_eur: hotel.rate,
          rate_non_eur: hotel.rate,
          total_cost: hotelTotal,
          client_price: hotelClient,
          notes: `Overnight at ${overnight_city}`
        })
        totalSupplierCost += hotelTotal
        totalClientPrice += hotelClient
      }
    }

    // Insert services
    if (allServices.length > 0) {
      const { error: insertError } = await supabase
        .from('itinerary_services')
        .insert(allServices)

      if (insertError) {
        console.error('[Pricing] Insert error:', insertError)
        throw insertError
      }
    }

    // Calculate profit
    const profit = totalClientPrice - totalSupplierCost
    const actualMarginPercent = totalSupplierCost > 0 
      ? ((profit / totalSupplierCost) * 100).toFixed(1) 
      : '0'

    // Update itinerary totals
    await supabase
      .from('itineraries')
      .update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        supplier_cost: totalSupplierCost,
        profit: profit,
        margin_percent: marginPercent,
        tier: tier,
        package_type: package_type,
        currency: currency,
        status: 'quoted',
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    console.log(`[Pricing] Complete: Cost €${totalSupplierCost.toFixed(2)} → Client €${totalClientPrice.toFixed(2)} (${marginPercent}% margin = €${profit.toFixed(2)} profit)`)
    
    if (skippedAddons.length > 0) {
      console.log(`[Pricing] Skipped ${skippedAddons.length} add-ons: ${skippedAddons.join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      itinerary_id: itineraryId,
      supplier_cost: totalSupplierCost,
      total_cost: totalClientPrice,
      profit: profit,
      margin: profit,
      margin_percent: marginPercent,
      actual_margin_percent: actualMarginPercent,
      currency,
      services_count: allServices.length,
      per_person: Math.round(totalClientPrice / totalPax * 100) / 100,
      preferences_used: !!userPrefs,
      // NEW: Report skipped add-ons
      skipped_addons: skippedAddons,
      skipped_addons_count: skippedAddons.length
    })

  } catch (error: any) {
    console.error('[Pricing] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Pricing calculation failed' },
      { status: 500 }
    )
  }
}