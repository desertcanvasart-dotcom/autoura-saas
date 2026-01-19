// ============================================
// AUTO-PRICING SERVICE
// File: lib/auto-pricing-service.ts
//
// Unified pricing logic for B2B tours
// Automatically calculates prices from:
// - tour_day_activities (Content Library links)
// - Rate tables (vehicles, guides, entrance_fees, etc.)
// - Tier-based defaults
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
}

export interface PricedService {
  id: string
  dayNumber: number
  serviceType: string
  serviceName: string
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
  totalDays: number
  services: PricedService[]
  optionalServices: PricedService[]
  
  // Totals
  subtotalCost: number
  optionalTotal: number
  totalCost: number
  marginPercent: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
  currency: string
  
  // Metadata
  ratesUsed: {
    vehicle?: { name: string; rate: number }
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
  lunch: number
  dinner: number
  tips: number
}> = {
  budget: { vehicle: 40, guide: 45, hotel: 45, lunch: 10, dinner: 15, tips: 12 },
  standard: { vehicle: 55, guide: 55, hotel: 80, lunch: 12, dinner: 18, tips: 15 },
  deluxe: { vehicle: 75, guide: 70, hotel: 120, lunch: 16, dinner: 24, tips: 18 },
  luxury: { vehicle: 100, guide: 90, hotel: 180, lunch: 20, dinner: 30, tips: 22 }
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

async function selectVehicle(
  numPax: number, 
  tier: ServiceTier
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    // FIXED: Use correct column names (daily_rate, passenger_capacity)
    const { data: vehicles } = await supabaseAdmin
      .from('vehicles')
      .select('id, vehicle_type, name, daily_rate, passenger_capacity, tier, is_preferred')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })

    if (!vehicles?.length) {
      console.log('⚠️ No vehicles found, using default rate')
      return {
        id: 'default',
        name: 'Vehicle',
        rate: DEFAULT_RATES[tier].vehicle
      }
    }

    // First: match tier and capacity
    let selected = vehicles.find(v => 
      v.tier === tier && 
      numPax <= (v.passenger_capacity || 99)
    )

    // Fallback: any vehicle that fits
    if (!selected) {
      selected = vehicles.find(v => 
        numPax <= (v.passenger_capacity || 99)
      )
    }

    // Final fallback: largest vehicle
    if (!selected) {
      selected = vehicles.sort((a, b) => 
        (b.passenger_capacity || 0) - (a.passenger_capacity || 0)
      )[0]
    }

    const vehicleName = selected?.vehicle_type || selected?.name || 'Vehicle'
    const rate = selected?.daily_rate || DEFAULT_RATES[tier].vehicle

    console.log(`✅ Selected vehicle: ${vehicleName} @ €${rate}`)

    return {
      id: selected?.id || 'default',
      name: vehicleName,
      rate
    }
  } catch (err) {
    console.error('Error selecting vehicle:', err)
    return {
      id: 'default',
      name: 'Vehicle',
      rate: DEFAULT_RATES[tier].vehicle
    }
  }
}

async function selectGuide(
  language: string, 
  tier: ServiceTier
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    // FIXED: Use correct column name (daily_rate)
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

    // Filter out add-ons (handle null/undefined is_addon)
    const mainFees = fees.filter(f => f.is_addon !== true)

    // IMPROVED: Better fuzzy matching with keyword overlap
    const searchKeywords = attractionName.toLowerCase().split(/\s+/).filter((k: string) => k.length > 2)
    
    let fee = mainFees.find(f => {
      const feeKeywords = f.attraction_name.toLowerCase().split(/\s+/).filter((k: string) => k.length > 2)
      
      // Exact contains match (original logic)
      if (f.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
          attractionName.toLowerCase().includes(f.attraction_name.toLowerCase())) {
        return true
      }
      
      // Keyword overlap match (new logic)
      const overlap = searchKeywords.filter((sk: string) => 
        feeKeywords.some((fk: string) => fk.includes(sk) || sk.includes(fk))
      )
      return overlap.length >= 2
    })

    // Special case: "Pyramids" should match "Giza Pyramids Complex"
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
  tier: ServiceTier
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    const { data: hotels } = await supabaseAdmin
      .from('hotel_contacts')
      .select('id, name, rate_double_eur, city, tier, is_preferred')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (hotels?.length) {
      return {
        id: hotels[0].id,
        name: hotels[0].name || 'Hotel',
        rate: hotels[0].rate_double_eur || DEFAULT_RATES[tier].hotel
      }
    }

    // Fallback: any hotel in city
    const { data: anyHotel } = await supabaseAdmin
      .from('hotel_contacts')
      .select('id, name, rate_double_eur')
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (anyHotel?.length) {
      return {
        id: anyHotel[0].id,
        name: anyHotel[0].name || 'Hotel',
        rate: anyHotel[0].rate_double_eur || DEFAULT_RATES[tier].hotel
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
    includeAccommodation = false
  } = params

  console.log('🚀 Starting auto-pricing:', { templateId, tier, numPax, isEurPassport })

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
      totalDays: 0,
      services: [],
      optionalServices: [],
      subtotalCost: 0,
      optionalTotal: 0,
      totalCost: 0,
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
  const { data: dayActivities, error: activitiesError } = await supabaseAdmin
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
  // STEP 2: Fetch template defaults (or use system defaults)
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
  // STEP 3: Calculate standard services (per day)
  // ============================================

  // Get rates
  const vehicle = includeTransport ? await selectVehicle(numPax, tier) : null
  const guide = includeGuide ? await selectGuide(language, tier) : null
  const mealRates = includeMeals ? await getMealRates(tier) : { lunch: 0, dinner: 0 }
  const tipsRate = includeTips ? await getTipsRate(tier) : 0
  const waterCostPerPax = includeWater ? 2 : 0

  // Track for response
  const ratesUsed: PricingResult['ratesUsed'] = {}
  if (vehicle) ratesUsed.vehicle = { name: vehicle.name, rate: vehicle.rate }
  if (guide) ratesUsed.guide = { name: guide.name, rate: guide.rate }

  // Group activities by day
  const activitiesByDay = new Map<number, typeof dayActivities>()
  for (let day = 1; day <= totalDays; day++) {
    const dayActs = dayActivities?.filter(a => a.day_number === day) || []
    activitiesByDay.set(day, dayActs)
  }

  // ============================================
  // STEP 4: Process each day
  // ============================================

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayActs = activitiesByDay.get(dayNum) || []
    const isLastDay = dayNum === totalDays
    const isFirstDay = dayNum === 1
    
    // Determine day type
    const hasAttractions = dayActs.some(a => 
      a.activity_type === 'attraction' || a.activity_type === 'activity'
    )
    const isTransferOnly = dayActs.length === 0 || 
      dayActs.every(a => a.activity_type === 'transfer' || a.activity_type === 'flight')
    const needsGuide = dayActs.some(a => a.requires_guide) || hasAttractions

    console.log(`📆 Day ${dayNum}: ${dayActs.length} activities, hasAttractions=${hasAttractions}, needsGuide=${needsGuide}`)

    // ============================================
    // Transportation (daily)
    // ============================================
    if (vehicle && includeTransport) {
      const transportRate = isTransferOnly ? vehicle.rate * 0.5 : vehicle.rate
      services.push({
        id: `day${dayNum}-transport`,
        dayNumber: dayNum,
        serviceType: 'transportation',
        serviceName: isTransferOnly ? 'Transfer' : `${vehicle.name} Transportation`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: transportRate,
        lineTotal: transportRate,
        rateSource: 'vehicles',
        isOptional: false,
        notes: `Day ${dayNum}`
      })
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
    // Entrance Fees (from day activities)
    // ============================================
    if (includeEntrances) {
      for (const activity of dayActs) {
        if (activity.activity_type !== 'attraction' && activity.activity_type !== 'activity') {
          continue
        }

        // Get attraction name from activity
        const attractionName = activity.activity_name

        const entranceFee = await getEntranceFee(attractionName, isEurPassport)
        
        if (entranceFee && entranceFee.rate > 0) {
          const service: PricedService = {
            id: `day${dayNum}-entrance-${activity.id}`,
            dayNumber: dayNum,
            serviceType: 'entrance',
            serviceName: entranceFee.name,
            contentId: activity.content_id || undefined,
            quantity: numPax,
            quantityMode: 'per_pax',
            unitCost: entranceFee.rate,
            lineTotal: entranceFee.rate * numPax,
            rateSource: 'entrance_fees',
            isOptional: activity.is_optional || false,
            notes: `${isEurPassport ? 'EUR' : 'non-EUR'} rate`
          }

          if (activity.is_optional) {
            optionalServices.push(service)
          } else {
            services.push(service)
          }
        } else if (entranceFee && entranceFee.rate === 0) {
          // Free entrance, just note it
          console.log(`ℹ️ ${attractionName} has no entrance fee`)
        } else {
          warnings.push(`No entrance fee found for "${attractionName}"`)
        }
      }
    }

    // ============================================
    // Meals (based on meal plan)
    // ============================================
    if (includeMeals && !isTransferOnly) {
      const includeLunch = ['lunch_only', 'half_board', 'full_board'].includes(mealPlan)
      const includeDinner = ['dinner_only', 'half_board', 'full_board'].includes(mealPlan)

      if (includeLunch) {
        services.push({
          id: `day${dayNum}-lunch`,
          dayNumber: dayNum,
          serviceType: 'meal',
          serviceName: 'Lunch',
          quantity: numPax,
          quantityMode: 'per_pax',
          unitCost: mealRates.lunch,
          lineTotal: mealRates.lunch * numPax,
          rateSource: 'meal_rates',
          isOptional: false
        })
      }

      if (includeDinner) {
        services.push({
          id: `day${dayNum}-dinner`,
          dayNumber: dayNum,
          serviceType: 'meal',
          serviceName: 'Dinner',
          quantity: numPax,
          quantityMode: 'per_pax',
          unitCost: mealRates.dinner,
          lineTotal: mealRates.dinner * numPax,
          rateSource: 'meal_rates',
          isOptional: false
        })
      }
    }

    // ============================================
    // Water (on sightseeing days)
    // ============================================
    if (includeWater && !isTransferOnly) {
      services.push({
        id: `day${dayNum}-water`,
        dayNumber: dayNum,
        serviceType: 'supplies',
        serviceName: 'Bottled Water',
        quantity: numPax,
        quantityMode: 'per_pax',
        unitCost: waterCostPerPax,
        lineTotal: waterCostPerPax * numPax,
        rateSource: 'fixed',
        isOptional: false
      })
    }

    // ============================================
    // Accommodation (if included, not on last day)
    // ============================================
    if (includeAccommodation && !isLastDay) {
      // Get city from day activities or default
      const dayCity = dayActs[0]?.city || 'Cairo'
      const hotel = await getHotelRate(dayCity, tier)

      if (hotel) {
        const roomsNeeded = Math.ceil(numPax / 2)
        
        services.push({
          id: `day${dayNum}-hotel`,
          dayNumber: dayNum,
          serviceType: 'accommodation',
          serviceName: `${hotel.name} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          quantity: roomsNeeded,
          quantityMode: 'per_room',
          unitCost: hotel.rate,
          lineTotal: hotel.rate * roomsNeeded,
          rateSource: 'hotel_contacts',
          isOptional: false,
          notes: dayCity
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
  // STEP 5: Calculate totals
  // ============================================

  const subtotalCost = services.reduce((sum, s) => sum + s.lineTotal, 0)
  const optionalTotal = optionalServices.reduce((sum, s) => sum + s.lineTotal, 0)
  const totalCost = subtotalCost
  const marginAmount = totalCost * (marginPercent / 100)
  const sellingPrice = totalCost + marginAmount
  const pricePerPerson = sellingPrice / numPax

  console.log('🎯 Auto-pricing complete:', {
    template: template.template_name,
    tier,
    numPax,
    days: totalDays,
    activities: dayActivities?.length || 0,
    services: services.length,
    subtotal: subtotalCost,
    selling: sellingPrice
  })

  return {
    success: true,
    templateId,
    templateName: template.template_name,
    tier,
    numPax,
    totalDays,
    services,
    optionalServices,
    subtotalCost: Math.round(subtotalCost * 100) / 100,
    optionalTotal: Math.round(optionalTotal * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
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