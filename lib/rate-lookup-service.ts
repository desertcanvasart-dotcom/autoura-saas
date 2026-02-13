import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// ENHANCED RATE LOOKUP SERVICE
// With Tier System, Preferred Supplier Support,
// and B2B/B2C Pricing Rules
// ============================================

// ============================================
// TIER SYSTEM TYPES
// ============================================

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type PricingMode = 'b2b' | 'b2c'

const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

// Tier-based rate multipliers for fallback calculations
const TIER_MULTIPLIERS: Record<ServiceTier, number> = {
  'budget': 0.8,
  'standard': 1.0,
  'deluxe': 1.3,
  'luxury': 1.6
}

// ============================================
// INTERFACES
// ============================================

export interface RateLookupParams {
  // Basic Info
  pax: number
  num_adults: number
  num_children: number
  duration_days: number
  language: string
  is_euro_passport: boolean
  
  // Service Tier
  tier?: ServiceTier
  
  // NEW: Pricing Mode & Rules
  mode?: PricingMode           // 'b2b' or 'b2c' - defaults to 'b2c'
  checkPricingRules?: boolean  // Whether to apply pricing rules - defaults to false
  marginPercent?: number       // For B2C retail markup - defaults to 25
  
  // Transportation
  city?: string
  service_type?: 'day_tour' | 'half_day_tour' | 'airport_transfer' | 'intercity_transfer' | 'dinner_transfer' | 'sound_light_transfer'
  origin_city?: string
  destination_city?: string
  
  // Attractions
  attractions?: string[]
  
  // Meals
  include_lunch?: boolean
  include_dinner?: boolean
  
  // Accommodation
  include_accommodation?: boolean
  hotel_standard?: 'budget' | 'standard' | 'luxury'
  num_hotel_stays?: number
  
  // Airport
  include_airport_service?: boolean
  airport_code?: string
  airport_service_type?: 'meet_greet' | 'customs_assist' | 'full_service'
  num_arrivals?: number
  num_departures?: number
  
  // Nile Cruise
  include_cruise?: boolean
  cruise_ship?: string
  cruise_cabin_type?: 'standard' | 'deluxe' | 'suite'
  cruise_embark_city?: string
  cruise_disembark_city?: string
  cruise_nights?: number
  
  // Sleeping Train
  include_sleeping_train?: boolean
  sleeping_train_origin?: string
  sleeping_train_destination?: string
  sleeping_train_cabin?: 'single' | 'double'
  sleeping_train_roundtrip?: boolean
  
  // Regular Train
  include_train?: boolean
  train_origin?: string
  train_destination?: string
  train_class?: 'first_class' | 'second_class'
  
  // Tipping
  include_tips?: boolean
  tip_context?: 'day_tour' | 'half_day_tour' | 'cruise' | 'transfer'
  
  // Other
  include_water?: boolean
}

// Rate Result Interfaces
export interface VehicleRate {
  id: string
  service_code: string
  vehicle_type: string
  service_type: string
  city: string | null
  origin_city: string | null
  destination_city: string | null
  rate_per_day: number
  capacity_min: number
  capacity_max: number
  tier: string | null
  is_preferred: boolean
}

export interface GuideRate {
  id: string
  name: string
  languages: string[]
  daily_rate_eur: number
  city?: string
  tier: string | null
  is_preferred: boolean
}

export interface AttractionRate {
  id: string
  name: string
  city: string
  entrance_fee_eur: number
  entrance_fee_non_eur: number
  child_rate_eur?: number
  child_rate_non_eur?: number
}

export interface RestaurantRate {
  id: string
  name: string
  city: string
  lunch_rate_eur: number
  dinner_rate_eur: number
  tier: string | null
  is_preferred: boolean
}

export interface HotelRate {
  id: string
  name: string
  city: string
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number
  star_rating?: number
  tier: string | null
  is_preferred: boolean
}

export interface AirportStaffRate {
  id: string
  service_code: string
  airport_code: string
  airport_name: string
  service_type: string
  direction: string
  rate_eur: number
  tier: string | null
  is_preferred: boolean
}

export interface HotelStaffRate {
  id: string
  service_code: string
  service_type: string
  hotel_category: string
  rate_eur: number
  tier: string | null
  is_preferred: boolean
}

export interface CruiseRate {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: string
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: string
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number | null
  tier: string | null
  is_preferred: boolean
}

export interface SleepingTrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  cabin_type: string
  rate_oneway_eur: number
  rate_roundtrip_eur: number | null
}

export interface TrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  class_type: string
  rate_eur: number
  duration_hours: number | null
}

export interface TippingRate {
  id: string
  service_code: string
  role_type: string
  rate_unit: string
  rate_eur: number
  context: string | null
}

export interface RatesUsed {
  success: boolean
  tier_used: ServiceTier
  vehicle: VehicleRate | null
  guide: GuideRate | null
  attractions: AttractionRate[]
  restaurant: RestaurantRate | null
  hotel: HotelRate | null
  airport_staff: AirportStaffRate | null
  hotel_staff: HotelStaffRate | null
  cruise: CruiseRate | null
  sleeping_train: SleepingTrainRate | null
  train: TrainRate | null
  tipping: TippingRate[]
}

export interface PricingBreakdown {
  transportation: {
    total: number
    per_day: number
    vehicle_type: string
    service_type: string
    is_preferred: boolean
  }
  guide: {
    total: number
    per_day: number
    language: string
    is_preferred: boolean
  }
  entrances: {
    total: number
    per_person: number
    count: number
    passport_type: string
  }
  meals: {
    lunch_total: number
    dinner_total: number
    per_person_lunch: number
    per_person_dinner: number
    is_preferred: boolean
  }
  accommodation: {
    total: number
    per_night: number
    rooms: number
    nights: number
    is_preferred: boolean
  }
  airport_staff: {
    total: number
    arrivals: number
    departures: number
    service_type: string
    is_preferred: boolean
  }
  hotel_staff: {
    total: number
    per_stay: number
    num_stays: number
    is_preferred: boolean
  }
  cruise: {
    total: number
    per_person: number
    ship_name: string
    cabin_type: string
    nights: number
    is_preferred: boolean
  }
  sleeping_train: {
    total: number
    per_person: number
    cabin_type: string
    is_roundtrip: boolean
  }
  train: {
    total: number
    per_person: number
    class_type: string
  }
  tips: {
    total: number
    per_day: number
    breakdown: { role: string; amount: number }[]
  }
  water: {
    total: number
    per_person: number
  }
}

// NEW: Pricing Rule Applied
export interface PricingRuleApplied {
  rule_id: string
  rule_name: string
  service_name: string
  pricing_model: string
  original_cost: number
  adjusted_cost: number
  savings: number
  note: string
}

export interface PricingCalculation {
  success: boolean
  total_cost: number
  per_person_cost: number
  tier_used: ServiceTier
  preferred_suppliers_count: number
  breakdown: PricingBreakdown
  rates_used: RatesUsed
  // NEW: Pricing rules info
  mode?: PricingMode
  rules_applied?: PricingRuleApplied[]
  supplier_cost?: number      // Cost before margin
  margin_percent?: number
  margin_amount?: number
  error?: string
}

// ============================================
// HELPER: Safe number conversion
// ============================================
function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

// ============================================
// HELPER: Normalize tier value
// ============================================
function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  if (VALID_TIERS.includes(normalized as ServiceTier)) {
    return normalized as ServiceTier
  }
  // Map legacy values
  const tierMap: Record<string, ServiceTier> = {
    'budget': 'budget',
    'economy': 'budget',
    'standard': 'standard',
    'mid-range': 'standard',
    'deluxe': 'deluxe',
    'superior': 'deluxe',
    'luxury': 'luxury',
    'premium': 'luxury',
    'vip': 'luxury'
  }
  return tierMap[normalized] || 'standard'
}

// ============================================
// NEW: PRICING RULES LOOKUP & APPLICATION
// ============================================

interface PricingRule {
  id: string
  service_name: string
  service_category: string
  pricing_model: 'per_unit' | 'tiered' | 'per_person'
  unit_type: string | null
  tier1_min_pax: number
  tier1_max_pax: number | null
  tier1_rate_eur: number
  tier1_label: string | null
  tier2_min_pax: number | null
  tier2_max_pax: number | null
  tier2_rate_eur: number | null
  tier2_label: string | null
  tier3_min_pax: number | null
  tier3_max_pax: number | null
  tier3_rate_eur: number | null
  tier3_label: string | null
  tier4_min_pax: number | null
  tier4_max_pax: number | null
  tier4_rate_eur: number | null
  tier4_label: string | null
  applies_to: 'b2b_only' | 'b2c_only' | 'both'
  is_active: boolean
}

/**
 * Look up applicable pricing rules based on mode (B2B/B2C)
 */
export async function getPricingRules(
  supabase: SupabaseClient,
  mode: PricingMode = 'b2c'
): Promise<PricingRule[]> {
  try {
    const applicableTo = mode === 'b2b' 
      ? ['b2b_only', 'both'] 
      : ['b2c_only', 'both']

    const { data, error } = await supabase
      .from('b2b_pricing_rules')
      .select('*')
      .eq('is_active', true)
      .in('applies_to', applicableTo)

    if (error) {
      console.error('Error fetching pricing rules:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Error in getPricingRules:', err)
    return []
  }
}

/**
 * Find matching pricing rule for a service
 */
function findMatchingRule(
  serviceName: string,
  rules: PricingRule[]
): PricingRule | null {
  if (!serviceName || rules.length === 0) return null
  
  const serviceNameLower = serviceName.toLowerCase()
  
  // Try exact match first
  let match = rules.find(r => 
    r.service_name.toLowerCase() === serviceNameLower
  )
  
  // Try partial match (first word)
  if (!match) {
    const firstWord = serviceNameLower.split(' ')[0]
    match = rules.find(r => 
      r.service_name.toLowerCase().includes(firstWord) ||
      firstWord.includes(r.service_name.toLowerCase().split(' ')[0])
    )
  }
  
  return match || null
}

/**
 * Apply pricing rule to calculate adjusted cost
 */
function applyPricingRule(
  rule: PricingRule,
  numPax: number,
  originalCost: number
): { adjustedCost: number; note: string } {
  const model = rule.pricing_model

  switch (model) {
    case 'per_unit': {
      // Per boat, per vehicle - select tier based on group size
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 999)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || 'Small'
      } else if (rule.tier2_max_pax && numPax <= rule.tier2_max_pax) {
        rate = rule.tier2_rate_eur || rule.tier1_rate_eur
        label = rule.tier2_label || 'Large'
      } else {
        // Need multiple units
        const largeCapacity = rule.tier2_max_pax || rule.tier1_max_pax || 8
        const largeRate = rule.tier2_rate_eur || rule.tier1_rate_eur
        const unitsNeeded = Math.ceil(numPax / largeCapacity)
        const totalCost = largeRate * unitsNeeded

        return {
          adjustedCost: totalCost,
          note: `${unitsNeeded}x ${rule.tier2_label || rule.unit_type || 'unit'} @ €${largeRate}`
        }
      }

      return {
        adjustedCost: rate,
        note: `${label}: €${rate} flat (${rule.unit_type || 'per unit'})`
      }
    }

    case 'tiered': {
      // Volume discounts - per person rate based on group size
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 2)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || `1-${rule.tier1_max_pax}`
      } else if (numPax <= (rule.tier2_max_pax || 10)) {
        rate = rule.tier2_rate_eur || rule.tier1_rate_eur
        label = rule.tier2_label || `${(rule.tier1_max_pax || 2) + 1}-${rule.tier2_max_pax}`
      } else if (numPax <= (rule.tier3_max_pax || 20)) {
        rate = rule.tier3_rate_eur || rule.tier2_rate_eur || rule.tier1_rate_eur
        label = rule.tier3_label || `${(rule.tier2_max_pax || 10) + 1}-${rule.tier3_max_pax}`
      } else {
        rate = rule.tier4_rate_eur || rule.tier3_rate_eur || rule.tier2_rate_eur || rule.tier1_rate_eur
        label = rule.tier4_label || `${(rule.tier3_max_pax || 20) + 1}+`
      }

      const totalCost = rate * numPax
      return {
        adjustedCost: totalCost,
        note: `${label}: €${rate}/pax × ${numPax} = €${totalCost}`
      }
    }

    case 'per_person':
    default: {
      // Simple per person pricing
      const rate = rule.tier1_rate_eur
      const totalCost = rate * numPax
      return {
        adjustedCost: totalCost,
        note: `€${rate}/person × ${numPax}`
      }
    }
  }
}

// ============================================
// MAIN LOOKUP FUNCTION
// ============================================

export async function lookupRates(
  supabase: SupabaseClient,
  params: RateLookupParams
): Promise<RatesUsed> {
  
  // Normalize the tier
  const tier = normalizeTier(params.tier)
  
  const result: RatesUsed = {
    success: false,
    tier_used: tier,
    vehicle: null,
    guide: null,
    attractions: [],
    restaurant: null,
    hotel: null,
    airport_staff: null,
    hotel_staff: null,
    cruise: null,
    sleeping_train: null,
    train: null,
    tipping: []
  }

  try {
    console.log(`🎯 Looking up rates for tier: ${tier.toUpperCase()}`)
    
    // ============================================
    // 1. VEHICLE RATES (from vehicles table with tier)
    // ============================================
    const serviceType = params.service_type || 'day_tour'
    
    console.log(`🚗 Looking up vehicles: city=${params.city}, tier=${tier}, pax=${params.pax}`)
    
    // First try: Get vehicles matching tier, ordered by preferred
    let { data: vehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .order('capacity_min', { ascending: true })

    // Fallback: If no vehicles match tier, get any active vehicles
    if (!vehicles || vehicles.length === 0) {
      console.log(`⚠️ No vehicles found for tier ${tier}, falling back to all active vehicles`)
      const { data: fallbackVehicles } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .order('capacity_min', { ascending: true })
      vehicles = fallbackVehicles
    }

    if (vehicles && vehicles.length > 0) {
      // Find vehicle that fits pax count, preferring preferred suppliers
      const suitableVehicle = vehicles.find(v => 
        params.pax >= toNumber(v.capacity_min, 1) && 
        params.pax <= toNumber(v.capacity_max, 99)
      ) || vehicles[vehicles.length - 1]

      if (suitableVehicle) {
        console.log(`✅ Selected vehicle: ${suitableVehicle.vehicle_type} (tier: ${suitableVehicle.tier}, preferred: ${suitableVehicle.is_preferred})`)
        
        // Now get the rate from transportation_rates
        const { data: vehicleRates } = await supabase
          .from('transportation_rates')
          .select('*')
          .eq('is_active', true)
          .eq('service_type', serviceType)
          .eq('city', params.city || 'Cairo')
          .gte('capacity_max', params.pax)
          .order('capacity_min', { ascending: true })
          .limit(1)

        const ratePerDay = vehicleRates && vehicleRates.length > 0 
          ? toNumber(vehicleRates[0].base_rate_eur, 50)
          : toNumber(suitableVehicle.daily_rate_eur, 50)

        result.vehicle = {
          id: suitableVehicle.id,
          service_code: suitableVehicle.id,
          vehicle_type: suitableVehicle.vehicle_type,
          service_type: serviceType,
          city: suitableVehicle.city || params.city || null,
          origin_city: null,
          destination_city: null,
          rate_per_day: ratePerDay,
          capacity_min: toNumber(suitableVehicle.capacity_min, 1),
          capacity_max: toNumber(suitableVehicle.capacity_max, 99),
          tier: suitableVehicle.tier,
          is_preferred: suitableVehicle.is_preferred || false
        }
      }
    }

    // ============================================
    // 2. GUIDE RATES (from guides table with tier)
    // ============================================
    console.log(`🎯 Looking up guides: language=${params.language}, tier=${tier}`)
    
    let { data: guides } = await supabase
      .from('guides')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .contains('languages', [params.language])
      .order('is_preferred', { ascending: false })
      .limit(5)

    if (!guides || guides.length === 0) {
      console.log(`⚠️ No guides found for tier ${tier} with ${params.language}, trying without tier filter`)
      const { data: fallbackGuides } = await supabase
        .from('guides')
        .select('*')
        .eq('is_active', true)
        .contains('languages', [params.language])
        .order('is_preferred', { ascending: false })
        .limit(5)
      guides = fallbackGuides
    }

    if (guides && guides.length > 0) {
      const selectedGuide = guides[0]
      console.log(`✅ Selected guide: ${selectedGuide.name} (tier: ${selectedGuide.tier}, preferred: ${selectedGuide.is_preferred})`)
      
      const { data: guideRates } = await supabase
        .from('guide_rates')
        .select('*')
        .eq('is_active', true)
        .eq('guide_language', params.language)
        .limit(1)

      const dailyRate = guideRates && guideRates.length > 0
        ? toNumber(guideRates[0].base_rate_eur, 55)
        : toNumber(selectedGuide.daily_rate_eur, 55)

      result.guide = {
        id: selectedGuide.id,
        name: selectedGuide.name,
        languages: selectedGuide.languages || [params.language],
        daily_rate_eur: dailyRate,
        city: selectedGuide.city,
        tier: selectedGuide.tier,
        is_preferred: selectedGuide.is_preferred || false
      }
    } else {
      const { data: guideRates } = await supabase
        .from('guide_rates')
        .select('*')
        .eq('is_active', true)
        .eq('guide_language', params.language)
        .limit(1)

      if (guideRates && guideRates.length > 0) {
        const rate = guideRates[0]
        result.guide = {
          id: rate.id,
          name: `${params.language} Speaking Guide`,
          languages: [params.language],
          daily_rate_eur: toNumber(rate.base_rate_eur, 55),
          tier: 'standard',
          is_preferred: false
        }
      }
    }

    // ============================================
    // 3. ATTRACTION RATES (Entrance Fees - no tier)
    // ============================================
    console.log(`🏛️ Looking up entrance fees: city=${params.city}, attractions=${params.attractions?.join(', ') || 'default'}`)
    
    if (params.attractions && params.attractions.length > 0) {
      const { data: attractions, error: attractionError } = await supabase
        .from('entrance_fees')
        .select('*')
        .eq('is_active', true)
        .or(params.attractions.map(a => `attraction_name.ilike.%${a}%`).join(','))
        .limit(20)

      if (!attractionError && attractions && attractions.length > 0) {
        console.log(`✅ Found ${attractions.length} attractions by name`)
        result.attractions = attractions.map(a => ({
          id: a.id,
          name: a.attraction_name,
          city: a.city,
          entrance_fee_eur: toNumber(a.eur_rate, 0),
          entrance_fee_non_eur: toNumber(a.non_eur_rate, a.eur_rate || 0),
          child_rate_eur: toNumber(a.child_rate_eur, 0),
          child_rate_non_eur: toNumber(a.child_rate_non_eur, 0)
        }))
      }
    } else if (params.city) {
      const { data: attractions } = await supabase
        .from('entrance_fees')
        .select('*')
        .eq('is_active', true)
        .eq('city', params.city)
        .limit(10)

      if (attractions && attractions.length > 0) {
        console.log(`✅ Found ${attractions.length} attractions for ${params.city}`)
        result.attractions = attractions.map(a => ({
          id: a.id,
          name: a.attraction_name,
          city: a.city,
          entrance_fee_eur: toNumber(a.eur_rate, 0),
          entrance_fee_non_eur: toNumber(a.non_eur_rate, a.eur_rate || 0),
          child_rate_eur: toNumber(a.child_rate_eur, 0),
          child_rate_non_eur: toNumber(a.child_rate_non_eur, 0)
        }))
      }
    }

    // ============================================
    // 4. RESTAURANT RATES (with tier)
    // ============================================
    if (params.include_lunch || params.include_dinner) {
      console.log(`🍽️ Looking up restaurants: city=${params.city}, tier=${tier}`)
      
      let { data: restaurants } = await supabase
        .from('restaurant_contacts')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .eq('city', params.city || 'Cairo')
        .order('is_preferred', { ascending: false })
        .limit(5)

      if (!restaurants || restaurants.length === 0) {
        const { data: fallbackRestaurants } = await supabase
          .from('restaurant_contacts')
          .select('*')
          .eq('is_active', true)
          .eq('city', params.city || 'Cairo')
          .order('is_preferred', { ascending: false })
          .limit(5)
        restaurants = fallbackRestaurants
      }

      if (restaurants && restaurants.length > 0) {
        const restaurant = restaurants[0]
        console.log(`✅ Selected restaurant: ${restaurant.name} (tier: ${restaurant.tier}, preferred: ${restaurant.is_preferred})`)
        
        const tierMultiplier = TIER_MULTIPLIERS[tier]
        
        result.restaurant = {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          lunch_rate_eur: Math.round(toNumber(restaurant.lunch_rate_eur, 12) * tierMultiplier),
          dinner_rate_eur: Math.round(toNumber(restaurant.dinner_rate_eur, 18) * tierMultiplier),
          tier: restaurant.tier,
          is_preferred: restaurant.is_preferred || false
        }
      } else {
        const { data: mealRates } = await supabase
          .from('meal_rates')
          .select('*')
          .eq('is_active', true)
          .limit(1)

        if (mealRates && mealRates.length > 0) {
          const meal = mealRates[0]
          const tierMultiplier = TIER_MULTIPLIERS[tier]
          result.restaurant = {
            id: meal.id,
            name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Restaurant`,
            city: params.city || 'Cairo',
            lunch_rate_eur: Math.round(toNumber(meal.lunch_rate_eur, 12) * tierMultiplier),
            dinner_rate_eur: Math.round(toNumber(meal.dinner_rate_eur, 18) * tierMultiplier),
            tier: tier,
            is_preferred: false
          }
        }
      }
    }

    // ============================================
    // 5. HOTEL RATES (with tier)
    // ============================================
    if (params.include_accommodation) {
      console.log(`🏨 Looking up hotels: city=${params.city}, tier=${tier}`)
      
      let { data: hotels } = await supabase
        .from('hotel_contacts')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .ilike('city', params.city || 'Cairo')
        .order('is_preferred', { ascending: false })
        .order('star_rating', { ascending: false })
        .limit(5)

      if (!hotels || hotels.length === 0) {
        console.log(`⚠️ No hotels found for tier ${tier}, falling back`)
        const { data: fallbackHotels } = await supabase
          .from('hotel_contacts')
          .select('*')
          .eq('is_active', true)
          .ilike('city', params.city || 'Cairo')
          .order('is_preferred', { ascending: false })
          .order('star_rating', { ascending: tier === 'luxury' ? false : true })
          .limit(5)
        hotels = fallbackHotels
      }

      if (hotels && hotels.length > 0) {
        const hotel = hotels[0]
        console.log(`✅ Selected hotel: ${hotel.name} (tier: ${hotel.tier}, preferred: ${hotel.is_preferred}, ${hotel.star_rating}⭐)`)
        
        result.hotel = {
          id: hotel.id,
          name: hotel.name,
          city: hotel.city,
          rate_single_eur: toNumber(hotel.rate_single_eur, 0),
          rate_double_eur: toNumber(hotel.rate_double_eur, 0),
          rate_triple_eur: toNumber(hotel.rate_triple_eur, 0),
          star_rating: toNumber(hotel.star_rating, 4),
          tier: hotel.tier,
          is_preferred: hotel.is_preferred || false
        }
      } else {
        const defaultRates: Record<ServiceTier, number> = {
          'budget': 45,
          'standard': 80,
          'deluxe': 120,
          'luxury': 180
        }
        result.hotel = {
          id: 'default',
          name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Hotel`,
          city: params.city || 'Cairo',
          rate_single_eur: defaultRates[tier] * 0.8,
          rate_double_eur: defaultRates[tier],
          rate_triple_eur: defaultRates[tier] * 1.2,
          star_rating: tier === 'luxury' ? 5 : tier === 'deluxe' ? 4 : tier === 'standard' ? 4 : 3,
          tier: tier,
          is_preferred: false
        }
      }
    }

    // ============================================
    // 6. AIRPORT STAFF RATES (with tier)
    // ============================================
    if (params.include_airport_service && params.airport_code) {
      console.log(`✈️ Looking up airport staff: airport=${params.airport_code}, tier=${tier}`)
      
      let { data: airportStaff } = await supabase
        .from('airport_staff')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false })
        .limit(5)

      if (!airportStaff || airportStaff.length === 0) {
        const { data: fallbackStaff } = await supabase
          .from('airport_staff')
          .select('*')
          .eq('is_active', true)
          .order('is_preferred', { ascending: false })
          .limit(5)
        airportStaff = fallbackStaff
      }

      const { data: staffRates } = await supabase
        .from('airport_staff_rates')
        .select('*')
        .eq('is_active', true)
        .eq('airport_code', params.airport_code)
        .limit(1)

      if (airportStaff && airportStaff.length > 0) {
        const staff = airportStaff[0]
        const rate = staffRates && staffRates.length > 0 ? staffRates[0] : null
        
        result.airport_staff = {
          id: staff.id,
          service_code: staff.id,
          airport_code: params.airport_code,
          airport_name: rate?.airport_name || params.airport_code,
          service_type: params.airport_service_type || 'meet_greet',
          direction: 'both',
          rate_eur: rate ? toNumber(rate.rate_eur, 25) : 25,
          tier: staff.tier,
          is_preferred: staff.is_preferred || false
        }
      }
    }

    // ============================================
    // 7. HOTEL STAFF RATES (with tier)
    // ============================================
    if (params.include_accommodation && params.num_hotel_stays && params.num_hotel_stays > 0) {
      console.log(`🛎️ Looking up hotel staff: tier=${tier}`)
      
      let { data: hotelStaff } = await supabase
        .from('hotel_staff')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false })
        .limit(5)

      if (!hotelStaff || hotelStaff.length === 0) {
        const { data: fallbackStaff } = await supabase
          .from('hotel_staff')
          .select('*')
          .eq('is_active', true)
          .order('is_preferred', { ascending: false })
          .limit(5)
        hotelStaff = fallbackStaff
      }

      const { data: staffRates } = await supabase
        .from('hotel_staff_rates')
        .select('*')
        .eq('is_active', true)
        .limit(1)

      if (hotelStaff && hotelStaff.length > 0) {
        const staff = hotelStaff[0]
        const rate = staffRates && staffRates.length > 0 ? staffRates[0] : null
        
        result.hotel_staff = {
          id: staff.id,
          service_code: staff.id,
          service_type: 'full_service',
          hotel_category: tier,
          rate_eur: rate ? toNumber(rate.rate_eur, 15) : 15,
          tier: staff.tier,
          is_preferred: staff.is_preferred || false
        }
      }
    }

    // ============================================
    // 8. NILE CRUISE RATES (with tier)
    // ============================================
    if (params.include_cruise && params.cruise_embark_city && params.cruise_disembark_city) {
      console.log(`🚢 Looking up cruises: ${params.cruise_embark_city} → ${params.cruise_disembark_city}, tier=${tier}`)

      // Query nile_cruises directly — it has tier, is_preferred, rates, and route info all in one table
      let cruiseQuery = supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .eq('embark_city', params.cruise_embark_city)
        .eq('disembark_city', params.cruise_disembark_city)
        .eq('tier', tier)

      if (params.cruise_cabin_type) {
        cruiseQuery = cruiseQuery.eq('cabin_type', params.cruise_cabin_type)
      }
      if (params.cruise_nights) {
        cruiseQuery = cruiseQuery.eq('duration_nights', params.cruise_nights)
      }

      let { data: cruiseRates } = await cruiseQuery
        .order('is_preferred', { ascending: false })
        .order('rate_double_eur', { ascending: tier === 'budget' })
        .limit(5)

      // Fallback: if no cruises match tier, get any active cruise on this route
      if (!cruiseRates || cruiseRates.length === 0) {
        console.log(`⚠️ No cruises found for tier ${tier}, falling back to all active cruises`)
        let fallbackQuery = supabase
          .from('nile_cruises')
          .select('*')
          .eq('is_active', true)
          .eq('embark_city', params.cruise_embark_city)
          .eq('disembark_city', params.cruise_disembark_city)

        if (params.cruise_cabin_type) {
          fallbackQuery = fallbackQuery.eq('cabin_type', params.cruise_cabin_type)
        }
        if (params.cruise_nights) {
          fallbackQuery = fallbackQuery.eq('duration_nights', params.cruise_nights)
        }

        const { data: fallbackCruises } = await fallbackQuery
          .order('is_preferred', { ascending: false })
          .order('rate_double_eur', { ascending: tier === 'budget' })
          .limit(5)
        cruiseRates = fallbackCruises
      }

      if (cruiseRates && cruiseRates.length > 0) {
        const cruise = cruiseRates[0]
        console.log(`✅ Selected cruise: ${cruise.ship_name} (tier: ${cruise.tier}, preferred: ${cruise.is_preferred})`)

        result.cruise = {
          id: cruise.id,
          cruise_code: cruise.cruise_code,
          ship_name: cruise.ship_name,
          ship_category: cruise.ship_category,
          route_name: cruise.route_name,
          embark_city: cruise.embark_city,
          disembark_city: cruise.disembark_city,
          duration_nights: toNumber(cruise.duration_nights, 0),
          cabin_type: cruise.cabin_type,
          rate_single_eur: toNumber(cruise.rate_single_eur, 0),
          rate_double_eur: toNumber(cruise.rate_double_eur, 0),
          rate_triple_eur: toNumber(cruise.rate_triple_eur, 0),
          tier: cruise.tier || tier,
          is_preferred: cruise.is_preferred || false
        }
      }
    }

    // ============================================
    // 9. SLEEPING TRAIN RATES (no tier - fixed pricing)
    // ============================================
    if (params.include_sleeping_train && params.sleeping_train_origin && params.sleeping_train_destination) {
      const { data: sleepTrains } = await supabase
        .from('sleeping_train_rates')
        .select('*')
        .eq('is_active', true)
        .eq('origin_city', params.sleeping_train_origin)
        .eq('destination_city', params.sleeping_train_destination)
        .limit(1)

      if (sleepTrains && sleepTrains.length > 0) {
        const train = sleepTrains[0]
        result.sleeping_train = {
          id: train.id,
          service_code: train.service_code,
          origin_city: train.origin_city,
          destination_city: train.destination_city,
          cabin_type: train.cabin_type || 'double',
          rate_oneway_eur: toNumber(train.rate_oneway_eur, 0),
          rate_roundtrip_eur: toNumber(train.rate_roundtrip_eur, 0)
        }
      }
    }

    // ============================================
    // 10. REGULAR TRAIN RATES (no tier - fixed pricing)
    // ============================================
    if (params.include_train && params.train_origin && params.train_destination) {
      const { data: trains } = await supabase
        .from('train_rates')
        .select('*')
        .eq('is_active', true)
        .eq('origin_city', params.train_origin)
        .eq('destination_city', params.train_destination)
        .limit(1)

      if (trains && trains.length > 0) {
        const train = trains[0]
        result.train = {
          id: train.id,
          service_code: train.service_code,
          origin_city: train.origin_city,
          destination_city: train.destination_city,
          class_type: train.class_type || 'first_class',
          rate_eur: toNumber(train.rate_eur, 0),
          duration_hours: toNumber(train.duration_hours, 0)
        }
      }
    }

    // ============================================
    // 11. TIPPING RATES (adjusted by tier)
    // ============================================
    if (params.include_tips !== false) {
      console.log(`💰 Looking up tipping rates (tier multiplier: ${TIER_MULTIPLIERS[tier]}x)`)
      
      const { data: tips } = await supabase
        .from('tipping_rates')
        .select('*')
        .eq('is_active', true)

      if (tips && tips.length > 0) {
        const tierMultiplier = TIER_MULTIPLIERS[tier]
        result.tipping = tips.map(t => ({
          id: t.id,
          service_code: t.service_code,
          role_type: t.role_type,
          rate_unit: t.rate_unit || 'per_day',
          rate_eur: Math.round(toNumber(t.rate_eur, 0) * tierMultiplier),
          context: t.context
        }))
        console.log(`✅ Found ${tips.length} tipping rates (adjusted for ${tier} tier)`)
      }
    }

    result.success = true
    
    const preferredCount = [
      result.vehicle?.is_preferred,
      result.guide?.is_preferred,
      result.restaurant?.is_preferred,
      result.hotel?.is_preferred,
      result.airport_staff?.is_preferred,
      result.hotel_staff?.is_preferred,
      result.cruise?.is_preferred
    ].filter(Boolean).length
    
    console.log(`⭐ Preferred suppliers selected: ${preferredCount}`)
    
    return result

  } catch (error: any) {
    console.error('❌ Error in lookupRates:', error)
    return result
  }
}

// ============================================
// CALCULATE PRICING FROM RATES
// ============================================

export async function calculatePricingFromRates(
  supabase: SupabaseClient,
  params: RateLookupParams
): Promise<PricingCalculation> {
  
  const { pax, num_adults, num_children, duration_days } = params
  const tier = normalizeTier(params.tier)
  const mode = params.mode || 'b2c'
  const marginPercent = params.marginPercent ?? 25

  // Get rates from database
  const rates = await lookupRates(supabase, params)

  // Get pricing rules if enabled
  let pricingRules: PricingRule[] = []
  if (params.checkPricingRules) {
    pricingRules = await getPricingRules(supabase, mode)
    console.log(`📋 Loaded ${pricingRules.length} pricing rules for ${mode.toUpperCase()} mode`)
  }

  const result: PricingCalculation = {
    success: false,
    total_cost: 0,
    per_person_cost: 0,
    tier_used: tier,
    preferred_suppliers_count: 0,
    breakdown: {
      transportation: { total: 0, per_day: 0, vehicle_type: 'Unknown', service_type: 'day_tour', is_preferred: false },
      guide: { total: 0, per_day: 0, language: params.language, is_preferred: false },
      entrances: { total: 0, per_person: 0, count: 0, passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR' },
      meals: { lunch_total: 0, dinner_total: 0, per_person_lunch: 0, per_person_dinner: 0, is_preferred: false },
      accommodation: { total: 0, per_night: 0, rooms: 0, nights: 0, is_preferred: false },
      airport_staff: { total: 0, arrivals: 0, departures: 0, service_type: '', is_preferred: false },
      hotel_staff: { total: 0, per_stay: 0, num_stays: 0, is_preferred: false },
      cruise: { total: 0, per_person: 0, ship_name: '', cabin_type: '', nights: 0, is_preferred: false },
      sleeping_train: { total: 0, per_person: 0, cabin_type: '', is_roundtrip: false },
      train: { total: 0, per_person: 0, class_type: '' },
      tips: { total: 0, per_day: 0, breakdown: [] },
      water: { total: 0, per_person: 0 }
    },
    rates_used: rates,
    mode,
    rules_applied: []
  }

  let preferredCount = 0
  const rulesApplied: PricingRuleApplied[] = []

  // ============================================
  // 1. TRANSPORTATION (Per Group)
  // ============================================
  if (rates.vehicle) {
    const transportPerDay = toNumber(rates.vehicle.rate_per_day, 0)
    const isTransfer = ['intercity_transfer', 'airport_transfer', 'dinner_transfer', 'sound_light_transfer'].includes(rates.vehicle.service_type)
    const transportTotal = isTransfer ? transportPerDay : transportPerDay * duration_days
    
    result.breakdown.transportation = {
      total: transportTotal,
      per_day: transportPerDay,
      vehicle_type: rates.vehicle.vehicle_type,
      service_type: rates.vehicle.service_type,
      is_preferred: rates.vehicle.is_preferred
    }
    if (rates.vehicle.is_preferred) preferredCount++
  }

  // ============================================
  // 2. GUIDE (Per Group)
  // ============================================
  if (rates.guide) {
    const guidePerDay = toNumber(rates.guide.daily_rate_eur, 0)
    const guideTotal = guidePerDay * duration_days
    
    result.breakdown.guide = {
      total: guideTotal,
      per_day: guidePerDay,
      language: params.language,
      is_preferred: rates.guide.is_preferred
    }
    if (rates.guide.is_preferred) preferredCount++
  }

  // ============================================
  // 3. ENTRANCES (Per Person) - With Pricing Rules
  // ============================================
  if (rates.attractions.length > 0) {
    let totalEntrancePerPerson = 0
    
    for (const attraction of rates.attractions) {
      const adultFee = params.is_euro_passport 
        ? toNumber(attraction.entrance_fee_eur, 0) 
        : toNumber(attraction.entrance_fee_non_eur, attraction.entrance_fee_eur || 0)
      
      // Check for pricing rule override
      if (params.checkPricingRules && pricingRules.length > 0) {
        const rule = findMatchingRule(attraction.name, pricingRules)
        if (rule) {
          const originalCost = adultFee * pax
          const { adjustedCost, note } = applyPricingRule(rule, pax, originalCost)
          
          rulesApplied.push({
            rule_id: rule.id,
            rule_name: rule.service_name,
            service_name: attraction.name,
            pricing_model: rule.pricing_model,
            original_cost: originalCost,
            adjusted_cost: adjustedCost,
            savings: originalCost - adjustedCost,
            note
          })
          
          // Add adjusted cost instead of standard calculation
          totalEntrancePerPerson += adjustedCost / pax
          continue
        }
      }
      
      totalEntrancePerPerson += adultFee
    }
    
    const entranceTotal = totalEntrancePerPerson * pax * duration_days
    
    result.breakdown.entrances = {
      total: entranceTotal,
      per_person: totalEntrancePerPerson * duration_days,
      count: rates.attractions.length,
      passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR'
    }
  }

  // ============================================
  // 4. MEALS (Per Person)
  // ============================================
  if (rates.restaurant) {
    const lunchPerPerson = params.include_lunch ? toNumber(rates.restaurant.lunch_rate_eur, 0) : 0
    const dinnerPerPerson = params.include_dinner ? toNumber(rates.restaurant.dinner_rate_eur, 0) : 0
    
    result.breakdown.meals = {
      lunch_total: lunchPerPerson * pax * duration_days,
      dinner_total: dinnerPerPerson * pax * duration_days,
      per_person_lunch: lunchPerPerson * duration_days,
      per_person_dinner: dinnerPerPerson * duration_days,
      is_preferred: rates.restaurant.is_preferred
    }
    if (rates.restaurant.is_preferred) preferredCount++
  }

  // ============================================
  // 5. ACCOMMODATION (Per Room Per Night)
  // ============================================
  if (rates.hotel && params.include_accommodation) {
    const nights = duration_days > 1 ? duration_days - 1 : 0
    const roomsNeeded = Math.ceil(pax / 2)
    const ratePerNight = toNumber(rates.hotel.rate_double_eur, 0)
    
    result.breakdown.accommodation = {
      total: ratePerNight * roomsNeeded * nights,
      per_night: ratePerNight,
      rooms: roomsNeeded,
      nights: nights,
      is_preferred: rates.hotel.is_preferred
    }
    if (rates.hotel.is_preferred) preferredCount++
  }

  // ============================================
  // 6. AIRPORT STAFF (Per Service)
  // ============================================
  if (rates.airport_staff && params.include_airport_service) {
    const arrivals = params.num_arrivals || 0
    const departures = params.num_departures || 0
    const ratePerService = toNumber(rates.airport_staff.rate_eur, 0)
    
    result.breakdown.airport_staff = {
      total: ratePerService * (arrivals + departures),
      arrivals: arrivals,
      departures: departures,
      service_type: rates.airport_staff.service_type,
      is_preferred: rates.airport_staff.is_preferred
    }
    if (rates.airport_staff.is_preferred) preferredCount++
  }

  // ============================================
  // 7. HOTEL STAFF (Per Hotel Stay)
  // ============================================
  if (rates.hotel_staff && params.num_hotel_stays) {
    const perStay = toNumber(rates.hotel_staff.rate_eur, 0)
    
    result.breakdown.hotel_staff = {
      total: perStay * params.num_hotel_stays,
      per_stay: perStay,
      num_stays: params.num_hotel_stays,
      is_preferred: rates.hotel_staff.is_preferred
    }
    if (rates.hotel_staff.is_preferred) preferredCount++
  }

  // ============================================
  // 8. NILE CRUISE (Per Person)
  // ============================================
  if (rates.cruise && params.include_cruise) {
    let perPerson = toNumber(rates.cruise.rate_double_eur, 0)
    
    if (pax === 1) {
      perPerson = toNumber(rates.cruise.rate_single_eur, 0)
    } else if (pax >= 3 && rates.cruise.rate_triple_eur) {
      perPerson = toNumber(rates.cruise.rate_triple_eur, 0)
    }
    
    result.breakdown.cruise = {
      total: perPerson * pax,
      per_person: perPerson,
      ship_name: rates.cruise.ship_name,
      cabin_type: rates.cruise.cabin_type,
      nights: rates.cruise.duration_nights,
      is_preferred: rates.cruise.is_preferred
    }
    if (rates.cruise.is_preferred) preferredCount++
  }

  // ============================================
  // 9. SLEEPING TRAIN (Per Person)
  // ============================================
  if (rates.sleeping_train && params.include_sleeping_train) {
    const isRoundtrip = params.sleeping_train_roundtrip || false
    const perPerson = isRoundtrip && rates.sleeping_train.rate_roundtrip_eur
      ? toNumber(rates.sleeping_train.rate_roundtrip_eur, 0)
      : toNumber(rates.sleeping_train.rate_oneway_eur, 0)
    
    result.breakdown.sleeping_train = {
      total: perPerson * pax,
      per_person: perPerson,
      cabin_type: rates.sleeping_train.cabin_type,
      is_roundtrip: isRoundtrip
    }
  }

  // ============================================
  // 10. REGULAR TRAIN (Per Person)
  // ============================================
  if (rates.train && params.include_train) {
    const perPerson = toNumber(rates.train.rate_eur, 0)
    
    result.breakdown.train = {
      total: perPerson * pax,
      per_person: perPerson,
      class_type: rates.train.class_type
    }
  }

  // ============================================
  // 11. TIPPING
  // ============================================
  let tipsTotal = 0
  const tipsBreakdown: { role: string; amount: number }[] = []
  
  if (rates.tipping.length > 0 && params.include_tips !== false) {
    for (const tip of rates.tipping) {
      let tipAmount = 0
      const tipRate = toNumber(tip.rate_eur, 0)
      
      if (tip.rate_unit === 'per_day') {
        tipAmount = tipRate * duration_days
      } else if (tip.rate_unit === 'per_service') {
        tipAmount = tipRate
      } else if (tip.rate_unit === 'per_night' && params.include_cruise) {
        tipAmount = tipRate * (params.cruise_nights || 0)
      } else if (tip.rate_unit === 'per_cruise' && params.include_cruise) {
        tipAmount = tipRate
      } else {
        tipAmount = tipRate * duration_days
      }
      
      if (tipAmount > 0) {
        tipsTotal += tipAmount
        tipsBreakdown.push({ role: tip.role_type, amount: tipAmount })
      }
    }
  }
  
  result.breakdown.tips = {
    total: tipsTotal,
    per_day: duration_days > 0 ? tipsTotal / duration_days : 0,
    breakdown: tipsBreakdown
  }

  // ============================================
  // 12. WATER (Per Person)
  // ============================================
  if (params.include_water !== false) {
    const waterPerPersonPerDay = 2
    const waterTotal = waterPerPersonPerDay * pax * duration_days
    
    result.breakdown.water = {
      total: waterTotal,
      per_person: waterPerPersonPerDay * duration_days
    }
  }

  // ============================================
  // CALCULATE TOTALS
  // ============================================
  const supplierCost = 
    result.breakdown.transportation.total +
    result.breakdown.guide.total +
    result.breakdown.entrances.total +
    result.breakdown.meals.lunch_total +
    result.breakdown.meals.dinner_total +
    result.breakdown.accommodation.total +
    result.breakdown.airport_staff.total +
    result.breakdown.hotel_staff.total +
    result.breakdown.cruise.total +
    result.breakdown.sleeping_train.total +
    result.breakdown.train.total +
    result.breakdown.tips.total +
    result.breakdown.water.total

  // Apply margin for B2C mode
  let totalCost = supplierCost
  let marginAmount = 0
  
  if (mode === 'b2c' && marginPercent > 0) {
    marginAmount = supplierCost * (marginPercent / 100)
    totalCost = supplierCost + marginAmount
  }

  result.total_cost = Math.round(totalCost * 100) / 100
  result.per_person_cost = pax > 0 ? Math.round((totalCost / pax) * 100) / 100 : 0
  result.preferred_suppliers_count = preferredCount
  result.supplier_cost = Math.round(supplierCost * 100) / 100
  result.margin_percent = marginPercent
  result.margin_amount = Math.round(marginAmount * 100) / 100
  result.rules_applied = rulesApplied

  result.success = true
  
  console.log(`💰 PRICING SUMMARY (Tier: ${tier.toUpperCase()}, Mode: ${mode.toUpperCase()}):`)
  console.log(`   Transportation: €${result.breakdown.transportation.total}`)
  console.log(`   Guide: €${result.breakdown.guide.total}`)
  console.log(`   Entrances: €${result.breakdown.entrances.total} (${result.breakdown.entrances.count} sites)`)
  console.log(`   Meals: €${result.breakdown.meals.lunch_total + result.breakdown.meals.dinner_total}`)
  console.log(`   Accommodation: €${result.breakdown.accommodation.total}`)
  console.log(`   Tips: €${result.breakdown.tips.total}`)
  console.log(`   Water: €${result.breakdown.water.total}`)
  console.log(`   ⭐ Preferred Suppliers: ${preferredCount}`)
  console.log(`   📋 Pricing Rules Applied: ${rulesApplied.length}`)
  if (mode === 'b2c') {
    console.log(`   💵 Supplier Cost: €${result.supplier_cost}`)
    console.log(`   📈 Margin (${marginPercent}%): €${result.margin_amount}`)
  }
  console.log(`   TOTAL: €${result.total_cost}`)
  
  return result
}

// ============================================
// FALLBACK RATES (when database is empty)
// ============================================

export function getFallbackRates(params: {
  pax: number
  duration_days: number
  language: string
  is_euro_passport: boolean
  tier?: ServiceTier
  mode?: PricingMode
  marginPercent?: number
}): PricingCalculation {
  const { pax, duration_days } = params
  const tier = normalizeTier(params.tier)
  const mode = params.mode || 'b2c'
  const marginPercent = params.marginPercent ?? 25
  const tierMultiplier = TIER_MULTIPLIERS[tier]

  // Base rates adjusted by tier
  const vehiclePerDay = Math.round((pax <= 2 ? 50 : pax <= 6 ? 110 : pax <= 10 ? 150 : 200) * tierMultiplier)
  const guidePerDay = Math.round((params.language === 'English' ? 50 : 90) * tierMultiplier)
  const entrancePerPerson = params.is_euro_passport ? 18 : 25
  const lunchPerPerson = Math.round(12 * tierMultiplier)
  const tipPerDay = Math.round(15 * tierMultiplier)
  const waterPerPerson = 2

  const transportTotal = vehiclePerDay * duration_days
  const guideTotal = guidePerDay * duration_days
  const entranceTotal = entrancePerPerson * pax * duration_days
  const lunchTotal = lunchPerPerson * pax * duration_days
  const tipsTotal = tipPerDay * duration_days
  const waterTotal = waterPerPerson * pax * duration_days

  const supplierCost = transportTotal + guideTotal + entranceTotal + lunchTotal + tipsTotal + waterTotal
  
  // Apply margin for B2C
  let totalCost = supplierCost
  let marginAmount = 0
  if (mode === 'b2c' && marginPercent > 0) {
    marginAmount = supplierCost * (marginPercent / 100)
    totalCost = supplierCost + marginAmount
  }

  return {
    success: true,
    total_cost: totalCost,
    per_person_cost: totalCost / pax,
    tier_used: tier,
    preferred_suppliers_count: 0,
    mode,
    supplier_cost: supplierCost,
    margin_percent: marginPercent,
    margin_amount: marginAmount,
    rules_applied: [],
    breakdown: {
      transportation: { 
        total: transportTotal, 
        per_day: vehiclePerDay, 
        vehicle_type: pax <= 2 ? 'Sedan' : pax <= 6 ? 'Minivan' : pax <= 10 ? 'Van' : 'Bus',
        service_type: 'day_tour',
        is_preferred: false
      },
      guide: { 
        total: guideTotal, 
        per_day: guidePerDay, 
        language: params.language,
        is_preferred: false 
      },
      entrances: { 
        total: entranceTotal, 
        per_person: entrancePerPerson * duration_days, 
        count: 3, 
        passport_type: params.is_euro_passport ? 'EUR' : 'non-EUR' 
      },
      meals: { 
        lunch_total: lunchTotal, 
        dinner_total: 0, 
        per_person_lunch: lunchPerPerson * duration_days,
        per_person_dinner: 0,
        is_preferred: false
      },
      accommodation: { total: 0, per_night: 0, rooms: 0, nights: 0, is_preferred: false },
      airport_staff: { total: 0, arrivals: 0, departures: 0, service_type: '', is_preferred: false },
      hotel_staff: { total: 0, per_stay: 0, num_stays: 0, is_preferred: false },
      cruise: { total: 0, per_person: 0, ship_name: '', cabin_type: '', nights: 0, is_preferred: false },
      sleeping_train: { total: 0, per_person: 0, cabin_type: '', is_roundtrip: false },
      train: { total: 0, per_person: 0, class_type: '' },
      tips: { 
        total: tipsTotal, 
        per_day: tipPerDay,
        breakdown: [
          { role: 'guide', amount: tipPerDay * duration_days * 0.67 }, 
          { role: 'driver', amount: tipPerDay * duration_days * 0.33 }
        ] 
      },
      water: { total: waterTotal, per_person: waterPerPerson * duration_days }
    },
    rates_used: {
      success: false,
      tier_used: tier,
      vehicle: null,
      guide: null,
      attractions: [],
      restaurant: null,
      hotel: null,
      airport_staff: null,
      hotel_staff: null,
      cruise: null,
      sleeping_train: null,
      train: null,
      tipping: []
    }
  }
}