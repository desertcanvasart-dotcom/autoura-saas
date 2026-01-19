// ============================================
// AUTO-PRICING SERVICE - v2
// File: lib/auto-pricing-service.ts
//
// Unified pricing logic for B2B tours
// 
// UPDATES:
// - Uses transportation_rates for route-based vehicle pricing
// - Vehicle selection by pax: Sedan(1-2), Minivan(3-7), Van(8-14), Bus(15-45)
// - Shows Vehicle Type + Route in service name
// - Supports +0/+1 tour leader calculation
// ============================================

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// TYPES
// ============================================

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type MealPlan = 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'

// Vehicle type by passenger count
export const VEHICLE_CAPACITY = {
  Sedan: { min: 1, max: 2 },
  Minivan: { min: 3, max: 7 },
  Van: { min: 8, max: 14 },
  Bus: { min: 15, max: 45 }
} as const

export type VehicleType = keyof typeof VEHICLE_CAPACITY

export interface PricingParams {
  templateId: string
  tier: ServiceTier
  numPax: number
  numAdults?: number
  numChildren?: number
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
  mealPlan?: MealPlan
  includeAccommodation?: boolean
  // NEW: Tour leader support
  tourLeaderIncluded?: boolean  // +1 if true, +0 if false
}

export interface PricedService {
  id: string
  dayNumber: number
  serviceType: string
  serviceName: string
  vehicleType?: string      // NEW: Vehicle type (Sedan, Minivan, etc.)
  routeName?: string        // NEW: Route name (Cairo Airport Transfer, etc.)
  contentId?: string
  quantity: number
  quantityMode: 'fixed' | 'per_pax' | 'per_room' | 'per_day'
  unitCost: number
  lineTotal: number
  rateSource: string
  isOptional: boolean
  notes?: string
}

export interface PricingResult {
  success: boolean
  templateId: string
  templateName: string
  tier: ServiceTier
  numPax: number
  numPayingPax: number        // NEW: Paying passengers (excludes tour leader)
  tourLeaderIncluded: boolean // NEW: +1 or +0
  totalDays: number
  services: PricedService[]
  optionalServices: PricedService[]
  
  // Totals
  subtotalCost: number
  optionalTotal: number
  totalCost: number
  tourLeaderCost: number      // NEW: Tour leader land cost
  marginPercent: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
  currency: string
  
  // Metadata
  ratesUsed: {
    vehicle?: { type: string; route: string; rate: number }
    guide?: { name: string; rate: number }
    hotel?: { name: string; rate: number }
  }
  warnings: string[]
}

// ============================================
// TIER MULTIPLIERS
// ============================================

const TIER_MULTIPLIERS: Record<ServiceTier, number> = {
  budget: 0.8,
  standard: 1.0,
  deluxe: 1.3,
  luxury: 1.6
}

// Default rates when DB lookup fails
const DEFAULT_RATES: Record<ServiceTier, {
  vehicle: number
  guide: number
  hotel: number
  hotelSingle: number
  lunch: number
  dinner: number
  tips: number
}> = {
  budget: { vehicle: 40, guide: 45, hotel: 45, hotelSingle: 55, lunch: 10, dinner: 15, tips: 12 },
  standard: { vehicle: 55, guide: 55, hotel: 80, hotelSingle: 100, lunch: 12, dinner: 18, tips: 15 },
  deluxe: { vehicle: 75, guide: 70, hotel: 120, hotelSingle: 150, lunch: 16, dinner: 24, tips: 18 },
  luxury: { vehicle: 100, guide: 90, hotel: 180, hotelSingle: 220, lunch: 20, dinner: 30, tips: 22 }
}

// ============================================
// HELPER: Get vehicle type by pax count
// ============================================

export function getVehicleTypeByPax(numPax: number): VehicleType {
  if (numPax <= 2) return 'Sedan'
  if (numPax <= 7) return 'Minivan'
  if (numPax <= 14) return 'Van'
  return 'Bus'
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

interface TransportRateResult {
  id: string
  vehicleType: string
  routeName: string
  rate: number
  serviceCode: string
}

/**
 * Select transportation rate from transportation_rates table
 * Matches by: pax count → vehicle type, then by service_type/city/route
 */
async function selectTransportRate(
  numPax: number,
  serviceType: string,  // 'day_tour', 'airport_transfer', 'Intercity Transfer', etc.
  city?: string,
  originCity?: string,
  destinationCity?: string
): Promise<TransportRateResult | null> {
  try {
    const vehicleType = getVehicleTypeByPax(numPax)
    
    console.log(`🚗 Looking for transport: ${vehicleType} for ${numPax} pax, type=${serviceType}, city=${city || originCity}`)

    // Build query
    let query = supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('vehicle_type', vehicleType)
      .gte('capacity_max', numPax)
      .lte('capacity_min', numPax)

    // Match by service type
    if (serviceType) {
      query = query.ilike('service_type', `%${serviceType}%`)
    }

    // Match by city or origin/destination
    if (originCity && destinationCity) {
      query = query
        .ilike('origin_city', `%${originCity}%`)
        .ilike('destination_city', `%${destinationCity}%`)
    } else if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    const { data: rates, error } = await query.limit(1)

    if (error) {
      console.error('Transport rate query error:', error)
      return null
    }

    if (rates && rates.length > 0) {
      const rate = rates[0]
      const routeName = buildRouteName(rate)
      
      console.log(`✅ Found transport: ${rate.vehicle_type} - ${routeName} @ €${rate.base_rate_eur}`)
      
      return {
        id: rate.id,
        vehicleType: rate.vehicle_type,
        routeName,
        rate: rate.base_rate_eur || 0,
        serviceCode: rate.service_code
      }
    }

    // Fallback: try without service type match
    const { data: fallbackRates } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('vehicle_type', vehicleType)
      .gte('capacity_max', numPax)
      .lte('capacity_min', numPax)
      .limit(1)

    if (fallbackRates && fallbackRates.length > 0) {
      const rate = fallbackRates[0]
      const routeName = buildRouteName(rate)
      
      console.log(`✅ Found transport (fallback): ${rate.vehicle_type} - ${routeName} @ €${rate.base_rate_eur}`)
      
      return {
        id: rate.id,
        vehicleType: rate.vehicle_type,
        routeName,
        rate: rate.base_rate_eur || 0,
        serviceCode: rate.service_code
      }
    }

    console.log(`⚠️ No transport rate found for ${vehicleType} in ${city || originCity}`)
    return null
  } catch (err) {
    console.error('Error selecting transport rate:', err)
    return null
  }
}

/**
 * Build human-readable route name from rate record
 */
function buildRouteName(rate: any): string {
  if (rate.origin_city && rate.destination_city) {
    return `${rate.origin_city} → ${rate.destination_city}`
  }
  if (rate.city && rate.service_type) {
    // Convert service_type to readable format
    const typeMap: Record<string, string> = {
      'day_tour': 'Day Tour',
      'airport_transfer': 'Airport Transfer',
      'Sound Light Transfer': 'Sound & Light Transfer'
    }
    const readableType = typeMap[rate.service_type] || rate.service_type.replace(/_/g, ' ')
    return `${rate.city} ${readableType}`
  }
  if (rate.service_code) {
    return rate.service_code.replace(/-/g, ' ')
  }
  return 'Transportation'
}

async function selectGuide(
  language: string, 
  tier: ServiceTier
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    const { data: guides } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, languages, tier, is_preferred')
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (!guides?.length) {
      // Fallback: any guide
      const { data: anyGuide } = await supabaseAdmin
        .from('guides')
        .select('id, name, daily_rate, tier')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(1)

      if (!anyGuide?.length) {
        console.log('⚠️ No guides found, using default rate')
        return {
          id: 'default',
          name: 'Guide',
          rate: DEFAULT_RATES[tier].guide
        }
      }
      
      const g = anyGuide[0]
      console.log(`✅ Selected guide (any): ${g.name} @ €${g.daily_rate}`)
      return {
        id: g.id,
        name: g.name || 'Guide',
        rate: g.daily_rate || DEFAULT_RATES[tier].guide
      }
    }

    // Prefer matching tier
    const selected = guides.find(g => g.tier === tier) || guides[0]

    console.log(`✅ Selected guide: ${selected.name} @ €${selected.daily_rate}`)

    return {
      id: selected.id,
      name: selected.name || 'Guide',
      rate: selected.daily_rate || DEFAULT_RATES[tier].guide
    }
  } catch (err) {
    console.error('Error selecting guide:', err)
    return {
      id: 'default',
      name: 'Guide',
      rate: DEFAULT_RATES[tier].guide
    }
  }
}

async function getEntranceFee(
  attractionName: string, 
  isEurPassport: boolean
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    const { data: fees } = await supabaseAdmin
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate, is_addon')
      .eq('is_active', true)

    if (!fees?.length) {
      console.log('⚠️ No entrance fees in database')
      return null
    }

    // Filter out add-ons
    const mainFees = fees.filter(f => f.is_addon !== true)

    // Better fuzzy matching with keyword overlap
    const searchKeywords = attractionName.toLowerCase().split(/\s+/).filter((k: string) => k.length > 2)
    
    let fee = mainFees.find(f => {
      const feeKeywords = f.attraction_name.toLowerCase().split(/\s+/).filter((k: string) => k.length > 2)
      
      // Exact contains match
      if (f.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
          attractionName.toLowerCase().includes(f.attraction_name.toLowerCase())) {
        return true
      }
      
      // Keyword overlap match
      const overlap = searchKeywords.filter((sk: string) => 
        feeKeywords.some((fk: string) => fk.includes(sk) || sk.includes(fk))
      )
      return overlap.length >= 2
    })

    // Special case matching
    if (!fee) {
      const lowerName = attractionName.toLowerCase()
      if (lowerName.includes('pyramid')) {
        fee = mainFees.find(f => f.attraction_name.toLowerCase().includes('pyramid'))
      } else if (lowerName.includes('sphinx')) {
        fee = mainFees.find(f => f.attraction_name.toLowerCase().includes('sphinx'))
      } else if (lowerName.includes('museum')) {
        fee = mainFees.find(f => f.attraction_name.toLowerCase().includes('museum'))
      } else if (lowerName.includes('temple')) {
        fee = mainFees.find(f => f.attraction_name.toLowerCase().includes('temple'))
      }
    }

    if (!fee) {
      console.log(`⚠️ No entrance fee found for "${attractionName}"`)
      return null
    }

    const rate = isEurPassport 
      ? (fee.eur_rate || 0)
      : (fee.non_eur_rate || fee.eur_rate || 0)

    console.log(`✅ Entrance fee: ${fee.attraction_name} @ €${rate} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

    return {
      id: fee.id,
      name: fee.attraction_name,
      rate
    }
  } catch (err) {
    console.error('Error getting entrance fee:', err)
    return null
  }
}

async function getHotelRate(
  city: string, 
  tier: ServiceTier,
  singleRoom: boolean = false
): Promise<{ id: string; name: string; rate: number; singleRate: number } | null> {
  try {
    const { data: hotels } = await supabaseAdmin
      .from('hotel_contacts')
      .select('id, name, rate_double_eur, rate_single_eur, city, tier, is_preferred')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (hotels?.length) {
      const hotel = hotels[0]
      return {
        id: hotel.id,
        name: hotel.name || 'Hotel',
        rate: hotel.rate_double_eur || DEFAULT_RATES[tier].hotel,
        singleRate: hotel.rate_single_eur || hotel.rate_double_eur || DEFAULT_RATES[tier].hotelSingle
      }
    }

    // Fallback: any hotel in city
    const { data: anyHotel } = await supabaseAdmin
      .from('hotel_contacts')
      .select('id, name, rate_double_eur, rate_single_eur')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (anyHotel?.length) {
      const hotel = anyHotel[0]
      return {
        id: hotel.id,
        name: hotel.name || 'Hotel',
        rate: hotel.rate_double_eur || DEFAULT_RATES[tier].hotel,
        singleRate: hotel.rate_single_eur || hotel.rate_double_eur || DEFAULT_RATES[tier].hotelSingle
      }
    }

    return null
  } catch (err) {
    console.error('Error getting hotel rate:', err)
    return null
  }
}

async function getMealRates(tier: ServiceTier): Promise<{ lunch: number; dinner: number }> {
  try {
    const { data: mealRate } = await supabaseAdmin
      .from('meal_rates')
      .select('lunch_rate_eur, dinner_rate_eur')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!mealRate) {
      return { 
        lunch: DEFAULT_RATES[tier].lunch, 
        dinner: DEFAULT_RATES[tier].dinner 
      }
    }

    const multiplier = TIER_MULTIPLIERS[tier]
    return {
      lunch: Math.round((mealRate.lunch_rate_eur || 12) * multiplier),
      dinner: Math.round((mealRate.dinner_rate_eur || 18) * multiplier)
    }
  } catch (err) {
    return { 
      lunch: DEFAULT_RATES[tier].lunch, 
      dinner: DEFAULT_RATES[tier].dinner 
    }
  }
}

async function getTipsRate(tier: ServiceTier): Promise<number> {
  try {
    const { data: tippingRates } = await supabaseAdmin
      .from('tipping_rates')
      .select('rate_eur, rate_unit')
      .eq('is_active', true)

    if (!tippingRates?.length) {
      return DEFAULT_RATES[tier].tips
    }

    const dailyTips = tippingRates.reduce((sum, t) => 
      t.rate_unit === 'per_day' ? sum + (t.rate_eur || 0) : sum, 0
    )

    return Math.round(dailyTips * TIER_MULTIPLIERS[tier]) || DEFAULT_RATES[tier].tips
  } catch (err) {
    return DEFAULT_RATES[tier].tips
  }
}

// ============================================
// MAIN AUTO-PRICING FUNCTION
// ============================================

export async function calculateAutoPricing(params: PricingParams): Promise<PricingResult> {
  const {
    templateId,
    tier,
    numPax,
    numAdults = numPax,
    numChildren = 0,
    isEurPassport,
    language = 'English',
    marginPercent = 25,
    mealPlan = 'lunch_only',
    includeAccommodation = false,
    tourLeaderIncluded = false  // +0 by default
  } = params

  // Calculate paying passengers (tour leader doesn't pay)
  const numPayingPax = tourLeaderIncluded ? numPax : numPax
  const totalPaxForServices = tourLeaderIncluded ? numPax + 1 : numPax  // +1 for tour leader

  console.log('🚀 Starting auto-pricing:', { 
    templateId, tier, numPax, 
    tourLeader: tourLeaderIncluded ? '+1' : '+0',
    totalPaxForServices,
    isEurPassport 
  })

  const warnings: string[] = []
  const services: PricedService[] = []
  const optionalServices: PricedService[] = []

  // ============================================
  // STEP 1: Fetch template and day activities
  // ============================================
  
  const { data: template, error: templateError } = await supabaseAdmin
    .from('tour_templates')
    .select(`
      id,
      template_name,
      template_code,
      duration_days,
      tour_type,
      pricing_mode,
      uses_day_builder
    `)
    .eq('id', templateId)
    .single()

  if (templateError || !template) {
    console.error('❌ Template not found:', templateId)
    return {
      success: false,
      templateId,
      templateName: 'Unknown',
      tier,
      numPax,
      numPayingPax,
      tourLeaderIncluded,
      totalDays: 0,
      services: [],
      optionalServices: [],
      subtotalCost: 0,
      optionalTotal: 0,
      totalCost: 0,
      tourLeaderCost: 0,
      marginPercent,
      marginAmount: 0,
      sellingPrice: 0,
      pricePerPerson: 0,
      currency: 'EUR',
      ratesUsed: {},
      warnings: ['Template not found']
    }
  }

  console.log('📋 Template found:', template.template_name)

  const totalDays = template.duration_days || 1

  // Fetch day activities
  const { data: dayActivities } = await supabaseAdmin
    .from('tour_day_activities')
    .select(`
      id,
      day_number,
      sequence_order,
      content_id,
      activity_type,
      activity_name,
      city,
      duration_hours,
      is_optional,
      is_included,
      requires_guide,
      notes
    `)
    .eq('template_id', templateId)
    .order('day_number')
    .order('sequence_order')

  console.log(`📅 Found ${dayActivities?.length || 0} activities`)

  // ============================================
  // STEP 2: Fetch template defaults
  // ============================================
  
  const { data: defaults } = await supabaseAdmin
    .from('tour_template_defaults')
    .select('*')
    .eq('template_id', templateId)
    .single()

  const includeTransport = defaults?.include_transport ?? true
  const includeGuide = defaults?.include_guide ?? true
  const includeEntrances = defaults?.include_entrances ?? true
  const includeMeals = defaults?.include_meals ?? true
  const includeTips = defaults?.include_tips ?? true
  const includeWater = defaults?.include_water ?? true

  // ============================================
  // STEP 3: Get base rates
  // ============================================

  const guide = includeGuide ? await selectGuide(language, tier) : null
  const mealRates = includeMeals ? await getMealRates(tier) : { lunch: 0, dinner: 0 }
  const tipsRate = includeTips ? await getTipsRate(tier) : 0
  const waterCostPerPax = includeWater ? 2 : 0

  // Track for response
  const ratesUsed: PricingResult['ratesUsed'] = {}
  if (guide) ratesUsed.guide = { name: guide.name, rate: guide.rate }

  // Group activities by day
  const activitiesByDay = new Map<number, typeof dayActivities>()
  for (let day = 1; day <= totalDays; day++) {
    const dayActs = dayActivities?.filter(a => a.day_number === day) || []
    activitiesByDay.set(day, dayActs)
  }

  // Track tour leader costs separately (for +1 calculation)
  let tourLeaderCost = 0

  // ============================================
  // STEP 4: Process each day
  // ============================================

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayActs = activitiesByDay.get(dayNum) || []
    const isLastDay = dayNum === totalDays
    
    // Determine day type
    const hasAttractions = dayActs.some(a => 
      a.activity_type === 'attraction' || a.activity_type === 'activity'
    )
    const isTransferOnly = dayActs.length === 0 || 
      dayActs.every(a => a.activity_type === 'transfer' || a.activity_type === 'flight')
    const needsGuide = dayActs.some(a => a.requires_guide) || hasAttractions

    // Get primary city for the day
    const dayCity = dayActs[0]?.city || 'Cairo'

    console.log(`📆 Day ${dayNum}: ${dayActs.length} activities in ${dayCity}, hasAttractions=${hasAttractions}`)

    // ============================================
    // Transportation (from transportation_rates)
    // ============================================
    if (includeTransport) {
      // Determine service type based on day activities
      let serviceType = 'day_tour'
      if (isTransferOnly) {
        serviceType = 'airport_transfer'
      }

      // Check if there's an intercity transfer
      const intercityAct = dayActs.find(a => 
        a.activity_type === 'transfer' && 
        a.activity_name?.toLowerCase().includes('transfer')
      )

      const transportRate = await selectTransportRate(
        totalPaxForServices,  // Include tour leader in vehicle capacity
        serviceType,
        dayCity,
        intercityAct ? dayActs[0]?.city : undefined,
        intercityAct ? dayActs[dayActs.length - 1]?.city : undefined
      )

      if (transportRate) {
        const transportCost = isTransferOnly ? transportRate.rate * 0.5 : transportRate.rate
        
        services.push({
          id: `day${dayNum}-transport`,
          dayNumber: dayNum,
          serviceType: 'transportation',
          serviceName: `${transportRate.vehicleType} - ${transportRate.routeName}`,
          vehicleType: transportRate.vehicleType,
          routeName: transportRate.routeName,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: transportCost,
          lineTotal: transportCost,
          rateSource: 'transportation_rates',
          isOptional: false,
          notes: `${totalPaxForServices} pax capacity`
        })

        if (!ratesUsed.vehicle) {
          ratesUsed.vehicle = { 
            type: transportRate.vehicleType, 
            route: transportRate.routeName, 
            rate: transportRate.rate 
          }
        }
      } else {
        // Fallback to default rate
        const vehicleType = getVehicleTypeByPax(totalPaxForServices)
        const defaultRate = DEFAULT_RATES[tier].vehicle
        
        services.push({
          id: `day${dayNum}-transport`,
          dayNumber: dayNum,
          serviceType: 'transportation',
          serviceName: `${vehicleType} - ${dayCity} Day Tour`,
          vehicleType,
          routeName: `${dayCity} Day Tour`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: defaultRate,
          lineTotal: defaultRate,
          rateSource: 'default',
          isOptional: false,
          notes: `Default rate for ${totalPaxForServices} pax`
        })

        warnings.push(`No transport rate found for ${vehicleType} in ${dayCity}, using default`)
      }
    }

    // ============================================
    // Guide (only on sightseeing days)
    // ============================================
    if (guide && needsGuide && !isTransferOnly) {
      services.push({
        id: `day${dayNum}-guide`,
        dayNumber: dayNum,
        serviceType: 'guide',
        serviceName: `${language} Speaking Guide`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: guide.rate,
        lineTotal: guide.rate,
        rateSource: 'guides',
        isOptional: false,
        notes: `Day ${dayNum}`
      })

      // Tips (only when guide is present)
      if (includeTips) {
        services.push({
          id: `day${dayNum}-tips`,
          dayNumber: dayNum,
          serviceType: 'tips',
          serviceName: 'Daily Tips (Driver & Guide)',
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: tipsRate,
          lineTotal: tipsRate,
          rateSource: 'tipping_rates',
          isOptional: false
        })
      }
    }

    // ============================================
    // Entrance Fees (per person including tour leader)
    // ============================================
    if (includeEntrances) {
      for (const activity of dayActs) {
        if (activity.activity_type !== 'attraction' && activity.activity_type !== 'activity') {
          continue
        }

        const attractionName = activity.activity_name
        const entranceFee = await getEntranceFee(attractionName, isEurPassport)
        
        if (entranceFee && entranceFee.rate > 0) {
          // Calculate for paying pax
          const paxTotal = entranceFee.rate * numPax
          // Tour leader entrance fee (added to their cost)
          const leaderEntrance = tourLeaderIncluded ? entranceFee.rate : 0
          tourLeaderCost += leaderEntrance

          const service: PricedService = {
            id: `day${dayNum}-entrance-${activity.id}`,
            dayNumber: dayNum,
            serviceType: 'entrance',
            serviceName: entranceFee.name,
            contentId: activity.content_id || undefined,
            quantity: numPax,
            quantityMode: 'per_pax',
            unitCost: entranceFee.rate,
            lineTotal: paxTotal,
            rateSource: 'entrance_fees',
            isOptional: activity.is_optional || false,
            notes: `${isEurPassport ? 'EUR' : 'non-EUR'} rate${tourLeaderIncluded ? ' (+leader €' + leaderEntrance + ')' : ''}`
          }

          if (activity.is_optional) {
            optionalServices.push(service)
          } else {
            services.push(service)
          }
        } else if (entranceFee && entranceFee.rate === 0) {
          console.log(`ℹ️ ${attractionName} has no entrance fee`)
        } else {
          warnings.push(`No entrance fee found for "${attractionName}"`)
        }
      }
    }

    // ============================================
    // Meals (per person including tour leader)
    // ============================================
    if (includeMeals && !isTransferOnly) {
      const includeLunch = ['lunch_only', 'half_board', 'full_board'].includes(mealPlan)
      const includeDinner = ['dinner_only', 'half_board', 'full_board'].includes(mealPlan)

      if (includeLunch) {
        const paxTotal = mealRates.lunch * numPax
        const leaderMeal = tourLeaderIncluded ? mealRates.lunch : 0
        tourLeaderCost += leaderMeal

        services.push({
          id: `day${dayNum}-lunch`,
          dayNumber: dayNum,
          serviceType: 'meal',
          serviceName: 'Lunch',
          quantity: numPax,
          quantityMode: 'per_pax',
          unitCost: mealRates.lunch,
          lineTotal: paxTotal,
          rateSource: 'meal_rates',
          isOptional: false,
          notes: tourLeaderIncluded ? `+leader €${leaderMeal}` : undefined
        })
      }

      if (includeDinner) {
        const paxTotal = mealRates.dinner * numPax
        const leaderMeal = tourLeaderIncluded ? mealRates.dinner : 0
        tourLeaderCost += leaderMeal

        services.push({
          id: `day${dayNum}-dinner`,
          dayNumber: dayNum,
          serviceType: 'meal',
          serviceName: 'Dinner',
          quantity: numPax,
          quantityMode: 'per_pax',
          unitCost: mealRates.dinner,
          lineTotal: paxTotal,
          rateSource: 'meal_rates',
          isOptional: false,
          notes: tourLeaderIncluded ? `+leader €${leaderMeal}` : undefined
        })
      }
    }

    // ============================================
    // Water (per person including tour leader)
    // ============================================
    if (includeWater && !isTransferOnly) {
      const paxTotal = waterCostPerPax * numPax
      const leaderWater = tourLeaderIncluded ? waterCostPerPax : 0
      tourLeaderCost += leaderWater

      services.push({
        id: `day${dayNum}-water`,
        dayNumber: dayNum,
        serviceType: 'supplies',
        serviceName: 'Bottled Water',
        quantity: numPax,
        quantityMode: 'per_pax',
        unitCost: waterCostPerPax,
        lineTotal: paxTotal,
        rateSource: 'fixed',
        isOptional: false
      })
    }

    // ============================================
    // Accommodation (if included, not on last day)
    // ============================================
    if (includeAccommodation && !isLastDay) {
      const hotel = await getHotelRate(dayCity, tier)

      if (hotel) {
        // Rooms for paying pax (2 per room)
        const roomsNeeded = Math.ceil(numPax / 2)
        const paxTotal = hotel.rate * roomsNeeded
        
        // Tour leader gets single room
        const leaderRoom = tourLeaderIncluded ? hotel.singleRate : 0
        tourLeaderCost += leaderRoom
        
        services.push({
          id: `day${dayNum}-hotel`,
          dayNumber: dayNum,
          serviceType: 'accommodation',
          serviceName: `${hotel.name} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          quantity: roomsNeeded,
          quantityMode: 'per_room',
          unitCost: hotel.rate,
          lineTotal: paxTotal,
          rateSource: 'hotel_contacts',
          isOptional: false,
          notes: `${dayCity}${tourLeaderIncluded ? ' +leader single €' + leaderRoom : ''}`
        })

        if (!ratesUsed.hotel) {
          ratesUsed.hotel = { name: hotel.name, rate: hotel.rate }
        }
      } else {
        warnings.push(`No hotel found for ${dayCity} (${tier} tier)`)
      }
    }
  }

  // ============================================
  // STEP 5: Calculate totals with tour leader cost distribution
  // ============================================

  const subtotalCost = services.reduce((sum, s) => sum + s.lineTotal, 0)
  const optionalTotal = optionalServices.reduce((sum, s) => sum + s.lineTotal, 0)
  
  // Total cost includes tour leader cost
  const totalCost = subtotalCost + tourLeaderCost
  
  const marginAmount = totalCost * (marginPercent / 100)
  const sellingPrice = totalCost + marginAmount
  
  // Price per person divides by PAYING pax only (tour leader doesn't pay)
  const pricePerPerson = sellingPrice / numPax

  console.log('🎯 Auto-pricing complete:', {
    template: template.template_name,
    tier,
    numPax,
    tourLeader: tourLeaderIncluded ? '+1' : '+0',
    tourLeaderCost,
    days: totalDays,
    activities: dayActivities?.length || 0,
    services: services.length,
    subtotal: subtotalCost,
    totalWithLeader: totalCost,
    selling: sellingPrice,
    perPerson: pricePerPerson
  })

  return {
    success: true,
    templateId,
    templateName: template.template_name,
    tier,
    numPax,
    numPayingPax: numPax,
    tourLeaderIncluded,
    totalDays,
    services,
    optionalServices,
    subtotalCost: Math.round(subtotalCost * 100) / 100,
    optionalTotal: Math.round(optionalTotal * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    tourLeaderCost: Math.round(tourLeaderCost * 100) / 100,
    marginPercent,
    marginAmount: Math.round(marginAmount * 100) / 100,
    sellingPrice: Math.round(sellingPrice * 100) / 100,
    pricePerPerson: Math.round(pricePerPerson * 100) / 100,
    currency: 'EUR',
    ratesUsed,
    warnings
  }
}

// ============================================
// HELPER: Calculate for multiple tiers
// ============================================

export async function calculateMultiTierPricing(
  templateId: string,
  tiers: ServiceTier[],
  numPax: number,
  isEurPassport: boolean,
  options?: Partial<PricingParams>
): Promise<Map<ServiceTier, PricingResult>> {
  const results = new Map<ServiceTier, PricingResult>()

  for (const tier of tiers) {
    const result = await calculateAutoPricing({
      templateId,
      tier,
      numPax,
      isEurPassport,
      ...options
    })
    results.set(tier, result)
  }

  return results
}

// ============================================
// HELPER: Get price range for browse display
// ============================================

export async function getTemplatePriceRange(
  templateId: string,
  isEurPassport: boolean = true
): Promise<{ minPrice: number; maxPrice: number; tier: ServiceTier } | null> {
  const tiers: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']
  
  const results = await calculateMultiTierPricing(
    templateId,
    tiers,
    2, // Standard 2 pax for comparison
    isEurPassport
  )

  let minPrice = Infinity
  let minTier: ServiceTier = 'standard'
  let maxPrice = 0

  for (const [tier, result] of results) {
    if (result.success && result.pricePerPerson > 0) {
      if (result.pricePerPerson < minPrice) {
        minPrice = result.pricePerPerson
        minTier = tier
      }
      if (result.pricePerPerson > maxPrice) {
        maxPrice = result.pricePerPerson
      }
    }
  }

  if (minPrice === Infinity) return null

  return { minPrice, maxPrice, tier: minTier }
}