// ============================================
// AUTO-PRICING SERVICE - v3 (Day-Based Engine)
// File: lib/auto-pricing-service.ts
//
// Holistic B2B pricing engine that processes
// tour_templates.itinerary JSONB day-by-day
//
// Features:
// - PPD (Per Person Double) + Single Supplement model
// - Mixed itineraries (Hotel + Cruise)
// - Tour Leader (+0/+1) support
// - Multi-pax calculation (2-30)
// - All service types (accommodation, meals, entrances, transport, guide, airport, hotel services)
//
// BACKWARD COMPATIBLE:
// - Exports calculateAutoPricing() with same interface as v2
// - New: calculateDayBasedPricing() returns full pricing table
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
export type AccommodationType = 'hotel' | 'cruise' | 'none'
export type MealStatus = 'included' | 'external' | 'none'

// Enhanced Itinerary Day Structure
export interface ItineraryDay {
  day: number
  title: string
  description?: string
  city: string
  accommodation_type: AccommodationType
  meals: {
    breakfast: MealStatus
    lunch: MealStatus
    dinner: MealStatus
  }
  attractions: string[]
  services: {
    airport_arrival: boolean
    airport_departure: boolean
    hotel_checkin: boolean
    hotel_checkout: boolean
    guide_required: boolean
  }
}

// Pricing parameters
export interface DayPricingParams {
  templateId: string
  tier: ServiceTier
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
}

// Single pax calculation result
export interface PaxPricingResult {
  numPax: number
  withoutLeader: {
    totalCost: number
    marginAmount: number
    sellingPrice: number
    pricePerPerson: number
  }
  withLeader: {
    totalCost: number
    tourLeaderCost: number
    marginAmount: number
    sellingPrice: number
    pricePerPerson: number
  }
}

// Service line item
export interface PricedService {
  id: string
  dayNumber: number
  serviceType: string
  serviceName: string
  quantity: number
  quantityMode: 'fixed' | 'per_pax' | 'per_room' | 'per_day'
  unitCost: number
  lineTotal: number
  rateSource: string
  isPerPax: boolean  // true = scales with pax, false = fixed cost
  notes?: string
}

// Complete pricing result
export interface DayPricingResult {
  success: boolean
  templateId: string
  templateName: string
  tier: ServiceTier
  totalDays: number
  
  // Accommodation breakdown
  hotelNights: number
  cruiseNights: number
  
  // Single supplement (one number for whole tour)
  singleSupplement: number
  
  // Services detail (for 2 pax reference)
  services: PricedService[]
  
  // Multi-pax pricing table
  paxPricing: PaxPricingResult[]
  
  // Metadata
  currency: string
  marginPercent: number
  warnings: string[]
}

// ============================================
// CONSTANTS
// ============================================

// Pax counts to calculate
export const PAX_COUNTS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]

// Vehicle capacity tiers
export const VEHICLE_CAPACITY = {
  Sedan: { min: 1, max: 2 },
  Minivan: { min: 3, max: 7 },
  Van: { min: 8, max: 14 },
  Minibus: { min: 15, max: 20 },
  Bus: { min: 21, max: 45 }
} as const

export type VehicleType = keyof typeof VEHICLE_CAPACITY

// Default rates (fallback)
const DEFAULT_RATES: Record<ServiceTier, {
  hotelPPD: number
  hotelSingleSupp: number
  cruisePPDNight: number
  cruiseSingleSuppNight: number
  guide: number
  lunch: number
  dinner: number
  tips: number
  airportService: number
  hotelService: number
  vehicle: number
}> = {
  budget: {
    hotelPPD: 35,
    hotelSingleSupp: 25,
    cruisePPDNight: 80,
    cruiseSingleSuppNight: 60,
    guide: 45,
    lunch: 10,
    dinner: 15,
    tips: 12,
    airportService: 20,
    hotelService: 10,
    vehicle: 40
  },
  standard: {
    hotelPPD: 50,
    hotelSingleSupp: 40,
    cruisePPDNight: 120,
    cruiseSingleSuppNight: 96,
    guide: 55,
    lunch: 12,
    dinner: 18,
    tips: 15,
    airportService: 25,
    hotelService: 15,
    vehicle: 55
  },
  deluxe: {
    hotelPPD: 80,
    hotelSingleSupp: 60,
    cruisePPDNight: 180,
    cruiseSingleSuppNight: 120,
    guide: 70,
    lunch: 16,
    dinner: 24,
    tips: 18,
    airportService: 35,
    hotelService: 20,
    vehicle: 75
  },
  luxury: {
    hotelPPD: 120,
    hotelSingleSupp: 100,
    cruisePPDNight: 300,
    cruiseSingleSuppNight: 200,
    guide: 90,
    lunch: 20,
    dinner: 30,
    tips: 22,
    airportService: 50,
    hotelService: 30,
    vehicle: 100
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get vehicle type based on pax count (including tour leader if applicable)
 */
export function getVehicleTypeByPax(totalPax: number): VehicleType {
  if (totalPax <= 2) return 'Sedan'
  if (totalPax <= 7) return 'Minivan'
  if (totalPax <= 14) return 'Van'
  if (totalPax <= 20) return 'Minibus'
  return 'Bus'
}

/**
 * Get airport code from city name
 */
export function getAirportCode(city: string): string {
  const cityMap: Record<string, string> = {
    'cairo': 'CAI',
    'luxor': 'LXR',
    'aswan': 'ASW',
    'hurghada': 'HRG',
    'sharm el-sheikh': 'SSH',
    'sharm': 'SSH',
    'alexandria': 'ALY'
  }
  return cityMap[city.toLowerCase()] || 'CAI'
}

/**
 * Map tier to hotel category for hotel_staff_rates
 */
export function getTierCategory(tier: ServiceTier): string {
  if (tier === 'budget') return 'budget'
  if (tier === 'luxury') return 'luxury'
  return 'standard'  // standard and deluxe both map to standard
}

/**
 * Parse itinerary JSONB - handles both old and new formats
 */
export function parseItinerary(itineraryData: any): ItineraryDay[] {
  if (!itineraryData || !Array.isArray(itineraryData)) {
    return []
  }

  return itineraryData.map((day: any, index: number) => {
    // Handle old format (simple meals array)
    let meals = {
      breakfast: 'none' as MealStatus,
      lunch: 'none' as MealStatus,
      dinner: 'none' as MealStatus
    }

    if (day.meals) {
      if (Array.isArray(day.meals)) {
        // Old format: ["Breakfast", "Lunch", "Dinner"]
        const mealArray = day.meals.map((m: string) => m.toLowerCase())
        meals.breakfast = mealArray.includes('breakfast') ? 'included' : 'none'
        meals.lunch = mealArray.includes('lunch') ? 'included' : 'none'
        meals.dinner = mealArray.includes('dinner') ? 'included' : 'none'
      } else {
        // New format: { breakfast: 'included', lunch: 'external', dinner: 'none' }
        meals = {
          breakfast: day.meals.breakfast || 'none',
          lunch: day.meals.lunch || 'none',
          dinner: day.meals.dinner || 'none'
        }
      }
    }

    // Handle services - default based on day position
    const isFirstDay = index === 0
    const isLastDay = index === itineraryData.length - 1
    const hasAttractions = (day.attractions && day.attractions.length > 0) ||
                          (day.title && /temple|pyramid|museum|valley|tomb/i.test(day.title))

    const services = day.services || {
      airport_arrival: isFirstDay,
      airport_departure: isLastDay,
      hotel_checkin: false,
      hotel_checkout: false,
      guide_required: hasAttractions
    }

    // Extract attractions from title if not provided
    let attractions = day.attractions || []
    if (attractions.length === 0 && day.title) {
      // Try to extract from title
      attractions = extractAttractionsFromTitle(day.title)
    }

    return {
      day: day.day || index + 1,
      title: day.title || `Day ${index + 1}`,
      description: day.description || '',
      city: day.city || inferCityFromTitle(day.title || ''),
      accommodation_type: day.accommodation_type || inferAccommodationType(day, itineraryData),
      meals,
      attractions,
      services
    }
  })
}

/**
 * Extract attraction names from day title
 */
function extractAttractionsFromTitle(title: string): string[] {
  const attractions: string[] = []
  const patterns = [
    /karnak/i,
    /luxor temple/i,
    /valley of (the )?kings/i,
    /hatshepsut/i,
    /colossi of memnon/i,
    /edfu/i,
    /kom[- ]?ombo/i,
    /philae/i,
    /high dam/i,
    /aswan dam/i,
    /unfinished obelisk/i,
    /pyramid/i,
    /sphinx/i,
    /egyptian museum/i,
    /cairo museum/i,
    /citadel/i,
    /khan el[- ]?khalili/i,
    /abu simbel/i
  ]

  for (const pattern of patterns) {
    if (pattern.test(title)) {
      // Get the matched attraction name
      const match = title.match(pattern)
      if (match) {
        attractions.push(normalizeAttractionName(match[0]))
      }
    }
  }

  return attractions
}

/**
 * Normalize attraction names for database lookup
 */
function normalizeAttractionName(name: string): string {
  const normalized = name.toLowerCase()
    .replace(/^the /, '')
    .replace(/temple$/i, 'Temple')
    .trim()

  // Map common variations
  const nameMap: Record<string, string> = {
    'karnak': 'Karnak Temple',
    'luxor temple': 'Luxor Temple',
    'valley of kings': 'Valley of the Kings',
    'valley of the kings': 'Valley of the Kings',
    'hatshepsut': 'Hatshepsut Temple',
    'colossi of memnon': 'Colossi of Memnon',
    'edfu': 'Edfu Temple',
    'kom ombo': 'Kom Ombo Temple',
    'kom-ombo': 'Kom Ombo Temple',
    'komombo': 'Kom Ombo Temple',
    'philae': 'Philae Temple',
    'high dam': 'Aswan High Dam',
    'aswan dam': 'Aswan High Dam',
    'unfinished obelisk': 'Unfinished Obelisk',
    'pyramid': 'Pyramids of Giza',
    'pyramids': 'Pyramids of Giza',
    'sphinx': 'Great Sphinx',
    'egyptian museum': 'Egyptian Museum',
    'cairo museum': 'Egyptian Museum',
    'citadel': 'Saladin Citadel',
    'khan el khalili': 'Khan El Khalili',
    'khan el-khalili': 'Khan El Khalili',
    'abu simbel': 'Abu Simbel'
  }

  return nameMap[normalized] || name
}

/**
 * Infer city from day title
 */
function inferCityFromTitle(title: string): string {
  const lower = title.toLowerCase()
  
  if (lower.includes('cairo') || lower.includes('pyramid') || lower.includes('sphinx') || lower.includes('giza')) {
    return 'Cairo'
  }
  if (lower.includes('luxor') || lower.includes('karnak') || lower.includes('valley of')) {
    return 'Luxor'
  }
  if (lower.includes('aswan') || lower.includes('philae') || lower.includes('high dam')) {
    return 'Aswan'
  }
  if (lower.includes('edfu')) {
    return 'Edfu'
  }
  if (lower.includes('kom ombo') || lower.includes('komombo')) {
    return 'Kom Ombo'
  }
  if (lower.includes('hurghada')) {
    return 'Hurghada'
  }
  if (lower.includes('sharm')) {
    return 'Sharm El-Sheikh'
  }
  if (lower.includes('alexandria')) {
    return 'Alexandria'
  }
  if (lower.includes('abu simbel')) {
    return 'Abu Simbel'
  }

  return 'Cairo'  // Default
}

/**
 * Infer accommodation type from day data and context
 */
function inferAccommodationType(day: any, allDays: any[]): AccommodationType {
  // If explicitly set, use it
  if (day.accommodation_type) {
    return day.accommodation_type
  }

  const title = (day.title || '').toLowerCase()
  const description = (day.description || '').toLowerCase()
  const combined = title + ' ' + description

  // Check for cruise indicators
  if (combined.includes('cruise') || combined.includes('cruiser') || 
      combined.includes('sail') || combined.includes('aboard') ||
      combined.includes('on board') || combined.includes('nile')) {
    return 'cruise'
  }

  // Check if it's a departure day (usually last day)
  if (combined.includes('departure') || combined.includes('fly out') ||
      combined.includes('transfer to airport')) {
    return 'none'
  }

  // Default based on tour theme (check all days for cruise mentions)
  const hasCruiseDays = allDays.some((d: any) => 
    ((d.title || '') + ' ' + (d.description || '')).toLowerCase().includes('cruise')
  )

  if (hasCruiseDays) {
    // If this tour has cruise days, assume cruise unless it's arrival/departure
    const isArrival = title.includes('arrival')
    const isDeparture = title.includes('departure')
    if (isDeparture) return 'none'
    return 'cruise'
  }

  // Default to hotel for multi-day tours
  return 'hotel'
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

/**
 * Get cruise rates for a tier
 * Returns PPD per night and Single Supplement per night
 */
export async function getCruiseRates(
  tier: ServiceTier,
  embarkCity?: string
): Promise<{
  shipName: string
  ppdNight: number  // Per Person Double per night
  singleSuppNight: number  // Single Supplement per night
  durationNights: number
} | null> {
  try {
    let query = supabaseAdmin
      .from('nile_cruises')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)

    if (embarkCity) {
      query = query.ilike('embark_city', `%${embarkCity}%`)
    }

    const { data: cruises, error } = await query.limit(1)

    if (error || !cruises || cruises.length === 0) {
      console.log(`⚠️ No cruise found for tier ${tier}, using defaults`)
      return {
        shipName: 'Default Cruise',
        ppdNight: DEFAULT_RATES[tier].cruisePPDNight,
        singleSuppNight: DEFAULT_RATES[tier].cruiseSingleSuppNight,
        durationNights: 4
      }
    }

    const cruise = cruises[0]
    
    // Calculate PPD and Single Supplement
    const ppdTrip = cruise.rate_double_eur / 2
    const ppdNight = ppdTrip / cruise.duration_nights
    
    const singleSuppTrip = cruise.rate_single_eur - ppdTrip
    const singleSuppNight = singleSuppTrip / cruise.duration_nights

    console.log(`✅ Cruise: ${cruise.ship_name} | PPD/night: €${ppdNight.toFixed(2)} | SingleSupp/night: €${singleSuppNight.toFixed(2)}`)

    return {
      shipName: cruise.ship_name,
      ppdNight,
      singleSuppNight,
      durationNights: cruise.duration_nights
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return null
  }
}

/**
 * Get hotel rates for a city and tier
 * Returns PPD per night and Single Supplement per night
 */
export async function getHotelRates(
  city: string,
  tier: ServiceTier
): Promise<{
  hotelName: string
  ppdNight: number  // Per Person Double per night
  singleSuppNight: number  // Single Supplement per night
} | null> {
  try {
    const { data: hotels, error } = await supabaseAdmin
      .from('hotel_contacts')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (error || !hotels || hotels.length === 0) {
      // Try without tier filter
      const { data: anyHotel } = await supabaseAdmin
        .from('hotel_contacts')
        .select('*')
        .eq('is_active', true)
        .ilike('city', `%${city}%`)
        .order('is_preferred', { ascending: false })
        .limit(1)

      if (!anyHotel || anyHotel.length === 0) {
        console.log(`⚠️ No hotel found for ${city} (${tier}), using defaults`)
        return {
          hotelName: `${city} Hotel`,
          ppdNight: DEFAULT_RATES[tier].hotelPPD,
          singleSuppNight: DEFAULT_RATES[tier].hotelSingleSupp
        }
      }

      const hotel = anyHotel[0]
      const ppd = hotel.rate_double_eur / 2
      const singleSupp = (hotel.rate_single_eur || hotel.rate_double_eur) - ppd

      return {
        hotelName: hotel.name,
        ppdNight: ppd,
        singleSuppNight: Math.max(0, singleSupp)
      }
    }

    const hotel = hotels[0]
    const ppd = hotel.rate_double_eur / 2
    const singleSupp = (hotel.rate_single_eur || hotel.rate_double_eur) - ppd

    console.log(`✅ Hotel: ${hotel.name} | PPD/night: €${ppd.toFixed(2)} | SingleSupp/night: €${singleSupp.toFixed(2)}`)

    return {
      hotelName: hotel.name,
      ppdNight: ppd,
      singleSuppNight: Math.max(0, singleSupp)
    }
  } catch (err) {
    console.error('Error fetching hotel rates:', err)
    return null
  }
}

/**
 * Get entrance fee for an attraction
 */
export async function getEntranceFee(
  attractionName: string,
  isEurPassport: boolean
): Promise<{ id: string; name: string; rate: number } | null> {
  try {
    // Try exact match first
    let { data: fees, error } = await supabaseAdmin
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)

    if (error || !fees || fees.length === 0) {
      // Try fuzzy match with keywords
      const keywords = attractionName.toLowerCase().split(/\s+/).filter(k => k.length > 3)
      
      for (const keyword of keywords) {
        const { data: keywordFees } = await supabaseAdmin
          .from('entrance_fees')
          .select('id, attraction_name, eur_rate, non_eur_rate')
          .eq('is_active', true)
          .ilike('attraction_name', `%${keyword}%`)
          .limit(1)

        if (keywordFees && keywordFees.length > 0) {
          fees = keywordFees
          break
        }
      }
    }

    if (!fees || fees.length === 0) {
      console.log(`⚠️ No entrance fee found for "${attractionName}"`)
      return null
    }

    const fee = fees[0]
    const rate = isEurPassport 
      ? (fee.eur_rate || 0) 
      : (fee.non_eur_rate || fee.eur_rate || 0)

    console.log(`✅ Entrance: ${fee.attraction_name} | €${rate} (${isEurPassport ? 'EUR' : 'non-EUR'})`)

    return {
      id: fee.id,
      name: fee.attraction_name,
      rate
    }
  } catch (err) {
    console.error('Error fetching entrance fee:', err)
    return null
  }
}

/**
 * Get guide rate
 */
export async function getGuideRate(
  language: string,
  tier: ServiceTier
): Promise<{ id: string; name: string; dailyRate: number } | null> {
  try {
    const { data: guides, error } = await supabaseAdmin
      .from('guides')
      .select('id, name, daily_rate, languages, tier')
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (error || !guides || guides.length === 0) {
      // Fallback to any guide
      const { data: anyGuide } = await supabaseAdmin
        .from('guides')
        .select('id, name, daily_rate')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(1)

      if (!anyGuide || anyGuide.length === 0) {
        return {
          id: 'default',
          name: 'Guide',
          dailyRate: DEFAULT_RATES[tier].guide
        }
      }

      return {
        id: anyGuide[0].id,
        name: anyGuide[0].name,
        dailyRate: anyGuide[0].daily_rate || DEFAULT_RATES[tier].guide
      }
    }

    // Prefer matching tier
    const selected = guides.find(g => g.tier === tier) || guides[0]

    console.log(`✅ Guide: ${selected.name} | €${selected.daily_rate}/day`)

    return {
      id: selected.id,
      name: selected.name,
      dailyRate: selected.daily_rate || DEFAULT_RATES[tier].guide
    }
  } catch (err) {
    console.error('Error fetching guide rate:', err)
    return {
      id: 'default',
      name: 'Guide',
      dailyRate: DEFAULT_RATES[tier].guide
    }
  }
}

/**
 * Get meal rates
 */
export async function getMealRates(
  tier: ServiceTier
): Promise<{ lunch: number; dinner: number }> {
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

    // Apply tier multiplier
    const multipliers: Record<ServiceTier, number> = {
      budget: 0.8,
      standard: 1.0,
      deluxe: 1.3,
      luxury: 1.6
    }

    return {
      lunch: Math.round((mealRate.lunch_rate_eur || 12) * multipliers[tier]),
      dinner: Math.round((mealRate.dinner_rate_eur || 18) * multipliers[tier])
    }
  } catch (err) {
    return {
      lunch: DEFAULT_RATES[tier].lunch,
      dinner: DEFAULT_RATES[tier].dinner
    }
  }
}

/**
 * Get transportation rate
 */
export async function getTransportRate(
  vehicleType: VehicleType,
  city: string,
  serviceType: string = 'day_tour'
): Promise<{ id: string; rate: number; routeName: string } | null> {
  try {
    const { data: rates, error } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('vehicle_type', vehicleType)
      .ilike('city', `%${city}%`)
      .limit(1)

    if (error || !rates || rates.length === 0) {
      // Fallback: any rate for this vehicle type
      const { data: fallback } = await supabaseAdmin
        .from('transportation_rates')
        .select('*')
        .eq('is_active', true)
        .eq('vehicle_type', vehicleType)
        .limit(1)

      if (!fallback || fallback.length === 0) {
        return null
      }

      return {
        id: fallback[0].id,
        rate: fallback[0].base_rate_eur || 0,
        routeName: `${vehicleType} - ${city}`
      }
    }

    const rate = rates[0]
    return {
      id: rate.id,
      rate: rate.base_rate_eur || 0,
      routeName: rate.service_code || `${vehicleType} - ${city}`
    }
  } catch (err) {
    console.error('Error fetching transport rate:', err)
    return null
  }
}

/**
 * Get airport service rate
 */
export async function getAirportServiceRate(
  airportCode: string,
  direction: 'arrival' | 'departure',
  tier: ServiceTier
): Promise<number> {
  try {
    const { data: rates } = await supabaseAdmin
      .from('airport_staff_rates')
      .select('rate_eur')
      .eq('is_active', true)
      .eq('airport_code', airportCode)
      .or(`direction.eq.${direction},direction.eq.both`)
      .limit(1)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].airportService
    }

    return rates[0].rate_eur || DEFAULT_RATES[tier].airportService
  } catch (err) {
    return DEFAULT_RATES[tier].airportService
  }
}

/**
 * Get hotel service rate
 */
export async function getHotelServiceRate(
  serviceType: 'checkin_assist' | 'porter' | 'full_service',
  tier: ServiceTier
): Promise<number> {
  try {
    const category = getTierCategory(tier)
    
    const { data: rates } = await supabaseAdmin
      .from('hotel_staff_rates')
      .select('rate_eur')
      .eq('is_active', true)
      .eq('service_type', serviceType)
      .or(`hotel_category.eq.${category},hotel_category.eq.all`)
      .limit(1)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].hotelService
    }

    return rates[0].rate_eur || DEFAULT_RATES[tier].hotelService
  } catch (err) {
    return DEFAULT_RATES[tier].hotelService
  }
}

/**
 * Get tipping rate per day
 */
export async function getTippingRate(tier: ServiceTier): Promise<number> {
  try {
    const { data: rates } = await supabaseAdmin
      .from('tipping_rates')
      .select('rate_eur, rate_unit')
      .eq('is_active', true)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].tips
    }

    // Sum daily tips
    const dailyTotal = rates.reduce((sum, r) => 
      r.rate_unit === 'per_day' ? sum + (r.rate_eur || 0) : sum, 0
    )

    // Apply tier multiplier
    const multipliers: Record<ServiceTier, number> = {
      budget: 0.8,
      standard: 1.0,
      deluxe: 1.2,
      luxury: 1.5
    }

    return Math.round(dailyTotal * multipliers[tier]) || DEFAULT_RATES[tier].tips
  } catch (err) {
    return DEFAULT_RATES[tier].tips
  }
}

// ============================================
// MAIN PRICING CALCULATION
// ============================================

/**
 * Calculate B2B pricing for a tour template
 * Returns pricing for all pax counts (2-30) with +0 and +1 options
 */
export async function calculateDayBasedPricing(
  params: DayPricingParams
): Promise<DayPricingResult> {
  const {
    templateId,
    tier,
    isEurPassport,
    language = 'English',
    marginPercent = 25
  } = params

  console.log('🚀 Starting day-based pricing calculation:', { templateId, tier, isEurPassport })

  const warnings: string[] = []
  const services: PricedService[] = []

  // ============================================
  // STEP 1: Fetch template and parse itinerary
  // ============================================

  const { data: template, error: templateError } = await supabaseAdmin
    .from('tour_templates')
    .select(`
      id,
      template_name,
      template_code,
      duration_days,
      tour_type,
      category_id,
      itinerary,
      tour_categories (
        id,
        category_name
      )
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
      totalDays: 0,
      hotelNights: 0,
      cruiseNights: 0,
      singleSupplement: 0,
      services: [],
      paxPricing: [],
      currency: 'EUR',
      marginPercent,
      warnings: ['Template not found']
    }
  }

  console.log('📋 Template found:', template.template_name)

  // Parse itinerary
  const itinerary = parseItinerary(template.itinerary)
  const totalDays = itinerary.length || template.duration_days || 1

  if (itinerary.length === 0) {
    warnings.push('No itinerary data found - using defaults')
  }

  console.log(`📅 Parsed ${itinerary.length} days from itinerary`)

  // ============================================
  // STEP 2: Analyze accommodation types
  // ============================================

  const hotelDays = itinerary.filter(d => d.accommodation_type === 'hotel')
  const cruiseDays = itinerary.filter(d => d.accommodation_type === 'cruise')
  const hotelNights = hotelDays.length
  const cruiseNights = cruiseDays.length

  console.log(`🏨 Hotel nights: ${hotelNights} | 🚢 Cruise nights: ${cruiseNights}`)

  // ============================================
  // STEP 3: Fetch all required rates
  // ============================================

  // Cruise rates (if applicable)
  let cruiseRates: Awaited<ReturnType<typeof getCruiseRates>> = null
  if (cruiseNights > 0) {
    const firstCruiseDay = cruiseDays[0]
    cruiseRates = await getCruiseRates(tier, firstCruiseDay?.city)
  }

  // Hotel rates (group by city)
  const hotelCities = [...new Set(hotelDays.map(d => d.city))]
  const hotelRatesMap = new Map<string, Awaited<ReturnType<typeof getHotelRates>>>()
  for (const city of hotelCities) {
    const rates = await getHotelRates(city, tier)
    if (rates) {
      hotelRatesMap.set(city, rates)
    }
  }

  // Guide rate
  const guideRate = await getGuideRate(language, tier)

  // Meal rates
  const mealRates = await getMealRates(tier)

  // Tipping rate
  const tippingRate = await getTippingRate(tier)

  // Water cost (fixed)
  const waterCostPerPax = 2

  // ============================================
  // STEP 4: Calculate Single Supplement (whole tour)
  // ============================================

  let singleSupplement = 0

  // Hotel single supplement
  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      singleSupplement += hotelRate.singleSuppNight
    } else {
      singleSupplement += DEFAULT_RATES[tier].hotelSingleSupp
    }
  }

  // Cruise single supplement
  if (cruiseRates && cruiseNights > 0) {
    singleSupplement += cruiseRates.singleSuppNight * cruiseNights
  }

  console.log(`💰 Total Single Supplement: €${singleSupplement.toFixed(2)}`)

  // ============================================
  // STEP 5: Calculate FIXED costs (don't scale with pax)
  // ============================================

  let fixedCosts = 0
  let serviceIndex = 0

  // Process each day for fixed costs
  for (const day of itinerary) {
    const isLastDay = day.day === totalDays
    const hasSightseeing = day.services.guide_required || day.attractions.length > 0

    // ----- GUIDE (fixed per day) -----
    if (hasSightseeing && guideRate) {
      fixedCosts += guideRate.dailyRate
      services.push({
        id: `day${day.day}-guide`,
        dayNumber: day.day,
        serviceType: 'guide',
        serviceName: `${language} Speaking Guide`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: guideRate.dailyRate,
        lineTotal: guideRate.dailyRate,
        rateSource: 'guides',
        isPerPax: false
      })
    }

    // ----- TIPPING (fixed per day, when guide present) -----
    if (hasSightseeing) {
      fixedCosts += tippingRate
      services.push({
        id: `day${day.day}-tips`,
        dayNumber: day.day,
        serviceType: 'tips',
        serviceName: 'Daily Tips',
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: tippingRate,
        lineTotal: tippingRate,
        rateSource: 'tipping_rates',
        isPerPax: false
      })
    }

    // ----- AIRPORT SERVICES (fixed per service) -----
    if (day.services.airport_arrival) {
      const airportCode = getAirportCode(day.city)
      const rate = await getAirportServiceRate(airportCode, 'arrival', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-airport-arrival`,
        dayNumber: day.day,
        serviceType: 'airport_service',
        serviceName: `Airport Meet & Greet (${airportCode})`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'airport_staff_rates',
        isPerPax: false
      })
    }

    if (day.services.airport_departure) {
      const airportCode = getAirportCode(day.city)
      const rate = await getAirportServiceRate(airportCode, 'departure', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-airport-departure`,
        dayNumber: day.day,
        serviceType: 'airport_service',
        serviceName: `Airport Departure Assist (${airportCode})`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'airport_staff_rates',
        isPerPax: false
      })
    }

    // ----- HOTEL SERVICES (fixed per service) -----
    if (day.services.hotel_checkin) {
      const rate = await getHotelServiceRate('checkin_assist', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-hotel-checkin`,
        dayNumber: day.day,
        serviceType: 'hotel_service',
        serviceName: 'Hotel Check-in Assistance',
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'hotel_staff_rates',
        isPerPax: false
      })
    }

    if (day.services.hotel_checkout) {
      const rate = await getHotelServiceRate('porter', tier)
      fixedCosts += rate
      services.push({
        id: `day${day.day}-hotel-checkout`,
        dayNumber: day.day,
        serviceType: 'hotel_service',
        serviceName: 'Hotel Check-out & Porter',
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate,
        lineTotal: rate,
        rateSource: 'hotel_staff_rates',
        isPerPax: false
      })
    }
  }

  // ============================================
  // STEP 6: Calculate PER-PAX costs (base rates)
  // ============================================

  // These are the per-person costs that scale with pax count

  // ----- Accommodation PPD -----
  let accommodationPPD = 0

  // Hotel PPD
  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      accommodationPPD += hotelRate.ppdNight
    } else {
      accommodationPPD += DEFAULT_RATES[tier].hotelPPD
    }
  }

  // Cruise PPD
  if (cruiseRates && cruiseNights > 0) {
    accommodationPPD += cruiseRates.ppdNight * cruiseNights
  }

  // ----- Entrance Fees (per pax) -----
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()

  for (const day of itinerary) {
    for (const attraction of day.attractions) {
      // Avoid duplicate charges for same attraction
      if (processedAttractions.has(attraction.toLowerCase())) continue
      processedAttractions.add(attraction.toLowerCase())

      const fee = await getEntranceFee(attraction, isEurPassport)
      if (fee && fee.rate > 0) {
        entranceFeesPerPax += fee.rate
        services.push({
          id: `entrance-${fee.id}`,
          dayNumber: day.day,
          serviceType: 'entrance',
          serviceName: fee.name,
          quantity: 1,  // Will be multiplied by pax
          quantityMode: 'per_pax',
          unitCost: fee.rate,
          lineTotal: fee.rate,  // Per pax
          rateSource: 'entrance_fees',
          isPerPax: true,
          notes: isEurPassport ? 'EUR rate' : 'non-EUR rate'
        })
      } else {
        warnings.push(`No entrance fee found for "${attraction}"`)
      }
    }
  }

  // ----- External Meals (per pax) -----
  let externalMealsPerPax = 0

  for (const day of itinerary) {
    if (day.meals.lunch === 'external') {
      externalMealsPerPax += mealRates.lunch
      services.push({
        id: `day${day.day}-lunch`,
        dayNumber: day.day,
        serviceType: 'meal',
        serviceName: 'Lunch',
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: mealRates.lunch,
        lineTotal: mealRates.lunch,
        rateSource: 'meal_rates',
        isPerPax: true
      })
    }

    if (day.meals.dinner === 'external') {
      externalMealsPerPax += mealRates.dinner
      services.push({
        id: `day${day.day}-dinner`,
        dayNumber: day.day,
        serviceType: 'meal',
        serviceName: 'Dinner',
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: mealRates.dinner,
        lineTotal: mealRates.dinner,
        rateSource: 'meal_rates',
        isPerPax: true
      })
    }
  }

  // ----- Water (per pax per sightseeing day) -----
  const sightseeingDays = itinerary.filter(d => d.services.guide_required || d.attractions.length > 0).length
  const waterPerPax = waterCostPerPax * sightseeingDays

  // ----- Total per-pax costs -----
  const perPaxCosts = accommodationPPD + entranceFeesPerPax + externalMealsPerPax + waterPerPax

  console.log(`📊 Fixed costs: €${fixedCosts.toFixed(2)} | Per-pax costs: €${perPaxCosts.toFixed(2)}`)

  // ============================================
  // STEP 7: Calculate for each pax count
  // ============================================

  const paxPricing: PaxPricingResult[] = []

  for (const numPax of PAX_COUNTS) {
    // ----- Transport cost (varies with vehicle size) -----
    let transportCost = 0
    
    for (const day of itinerary) {
      const hasSightseeing = day.services.guide_required || day.attractions.length > 0
      if (!hasSightseeing) continue  // No transport needed for pure transfer/departure days

      // Get vehicle for this pax count (without tour leader for +0)
      const vehicleType = getVehicleTypeByPax(numPax)
      const transport = await getTransportRate(vehicleType, day.city)
      
      if (transport) {
        transportCost += transport.rate
      } else {
        transportCost += DEFAULT_RATES[tier].vehicle
        warnings.push(`No transport rate found for ${vehicleType} in ${day.city}`)
      }
    }

    // ----- WITHOUT Tour Leader (+0) -----
    const totalCostWithoutLeader = fixedCosts + transportCost + (perPaxCosts * numPax)
    const marginWithoutLeader = totalCostWithoutLeader * (marginPercent / 100)
    const sellingWithoutLeader = totalCostWithoutLeader + marginWithoutLeader
    const perPersonWithoutLeader = sellingWithoutLeader / numPax

    // ----- WITH Tour Leader (+1) -----
    // Vehicle needs to fit numPax + 1 tour leader
    const vehicleTypeWithLeader = getVehicleTypeByPax(numPax + 1)
    let transportCostWithLeader = 0
    
    for (const day of itinerary) {
      const hasSightseeing = day.services.guide_required || day.attractions.length > 0
      if (!hasSightseeing) continue

      const transport = await getTransportRate(vehicleTypeWithLeader, day.city)
      if (transport) {
        transportCostWithLeader += transport.rate
      } else {
        transportCostWithLeader += DEFAULT_RATES[tier].vehicle
      }
    }

    // Tour leader costs (single supplement + their own per-pax costs)
    const tourLeaderCost = singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax

    const totalCostWithLeader = fixedCosts + transportCostWithLeader + (perPaxCosts * numPax) + tourLeaderCost
    const marginWithLeader = totalCostWithLeader * (marginPercent / 100)
    const sellingWithLeader = totalCostWithLeader + marginWithLeader
    // Price per person: divide by PAYING pax only (tour leader doesn't pay)
    const perPersonWithLeader = sellingWithLeader / numPax

    paxPricing.push({
      numPax,
      withoutLeader: {
        totalCost: Math.round(totalCostWithoutLeader * 100) / 100,
        marginAmount: Math.round(marginWithoutLeader * 100) / 100,
        sellingPrice: Math.round(sellingWithoutLeader * 100) / 100,
        pricePerPerson: Math.round(perPersonWithoutLeader * 100) / 100
      },
      withLeader: {
        totalCost: Math.round(totalCostWithLeader * 100) / 100,
        tourLeaderCost: Math.round(tourLeaderCost * 100) / 100,
        marginAmount: Math.round(marginWithLeader * 100) / 100,
        sellingPrice: Math.round(sellingWithLeader * 100) / 100,
        pricePerPerson: Math.round(perPersonWithLeader * 100) / 100
      }
    })
  }

  // ============================================
  // STEP 8: Return result
  // ============================================

  console.log('✅ Day-based pricing complete')
  console.log(`   Template: ${template.template_name}`)
  console.log(`   Single Supplement: €${singleSupplement.toFixed(2)}`)
  console.log(`   Sample (2 pax +0): €${paxPricing[0]?.withoutLeader.pricePerPerson}/person`)
  console.log(`   Sample (2 pax +1): €${paxPricing[0]?.withLeader.pricePerPerson}/person`)

  return {
    success: true,
    templateId,
    templateName: template.template_name,
    tier,
    totalDays,
    hotelNights,
    cruiseNights,
    singleSupplement: Math.round(singleSupplement * 100) / 100,
    services,
    paxPricing,
    currency: 'EUR',
    marginPercent,
    warnings
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Calculate pricing for a single pax count (for backward compatibility)
 */
export async function calculateSinglePaxPricing(
  params: DayPricingParams & { numPax: number; tourLeaderIncluded: boolean }
): Promise<{
  success: boolean
  totalCost: number
  tourLeaderCost: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
  singleSupplement: number
  services: PricedService[]
  warnings: string[]
}> {
  const result = await calculateDayBasedPricing(params)

  if (!result.success) {
    return {
      success: false,
      totalCost: 0,
      tourLeaderCost: 0,
      marginAmount: 0,
      sellingPrice: 0,
      pricePerPerson: 0,
      singleSupplement: 0,
      services: [],
      warnings: result.warnings
    }
  }

  // Find the matching pax count
  const paxResult = result.paxPricing.find(p => p.numPax === params.numPax)
  
  if (!paxResult) {
    // Calculate for custom pax count if not in standard list
    // For now, return closest match
    const closest = result.paxPricing.reduce((prev, curr) => 
      Math.abs(curr.numPax - params.numPax) < Math.abs(prev.numPax - params.numPax) ? curr : prev
    )

    const pricing = params.tourLeaderIncluded ? closest.withLeader : closest.withoutLeader

    return {
      success: true,
      totalCost: pricing.totalCost,
      tourLeaderCost: params.tourLeaderIncluded ? closest.withLeader.tourLeaderCost : 0,
      marginAmount: pricing.marginAmount,
      sellingPrice: pricing.sellingPrice,
      pricePerPerson: pricing.pricePerPerson,
      singleSupplement: result.singleSupplement,
      services: result.services,
      warnings: [...result.warnings, `Pax count ${params.numPax} not in standard list, using ${closest.numPax}`]
    }
  }

  const pricing = params.tourLeaderIncluded ? paxResult.withLeader : paxResult.withoutLeader

  return {
    success: true,
    totalCost: pricing.totalCost,
    tourLeaderCost: params.tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0,
    marginAmount: pricing.marginAmount,
    sellingPrice: pricing.sellingPrice,
    pricePerPerson: pricing.pricePerPerson,
    singleSupplement: result.singleSupplement,
    services: result.services,
    warnings: result.warnings
  }
}

/**
 * Get pricing table for CSV export
 */
export function formatPricingTable(result: DayPricingResult): string[][] {
  const headers = ['NO OF PAX', '+0 (Per Person DBL)', '+1 (Per Person DBL)', 'SINGLE SUPPLEMENT']
  
  const rows: string[][] = [headers]

  for (const pax of result.paxPricing) {
    rows.push([
      pax.numPax.toString(),
      `€${pax.withoutLeader.pricePerPerson.toFixed(0)}`,
      `€${pax.withLeader.pricePerPerson.toFixed(0)}`,
      pax.numPax === 2 ? `€${result.singleSupplement.toFixed(0)}` : ''  // Only show on first row
    ])
  }

  return rows
}

// ============================================
// BACKWARD COMPATIBILITY LAYER
// ============================================
// These exports maintain compatibility with the existing
// calculate-price/route.ts API that imports from this file

/**
 * Legacy PricingParams interface (for backward compatibility)
 */
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
  mealPlan?: 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'
  includeAccommodation?: boolean
  tourLeaderIncluded?: boolean
}

/**
 * Legacy PricingResult interface (for backward compatibility)
 */
export interface PricingResult {
  success: boolean
  templateId: string
  templateName: string
  tier: ServiceTier
  numPax: number
  numPayingPax: number
  tourLeaderIncluded: boolean
  totalDays: number
  services: PricedService[]
  optionalServices: PricedService[]
  subtotalCost: number
  optionalTotal: number
  totalCost: number
  tourLeaderCost: number
  marginPercent: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
  currency: string
  ratesUsed: {
    vehicle?: { type: string; route: string; rate: number }
    guide?: { name: string; rate: number }
    hotel?: { name: string; rate: number }
    cruise?: { name: string; ppdNight: number; singleSuppNight: number }
  }
  warnings: string[]
  // NEW: Include full pricing table for B2B display
  paxPricingTable?: PaxPricingResult[]
  singleSupplement?: number
}

/**
 * BACKWARD COMPATIBLE FUNCTION
 * 
 * This maintains the same interface as the old calculateAutoPricing
 * but uses the new day-based pricing logic internally.
 * 
 * Called by: app/api/b2b/calculate-price/route.ts
 */
export async function calculateAutoPricing(params: PricingParams): Promise<PricingResult> {
  const {
    templateId,
    tier,
    numPax,
    isEurPassport,
    language = 'English',
    marginPercent = 25,
    tourLeaderIncluded = false
  } = params

  console.log('🔄 calculateAutoPricing called (using new day-based engine)')

  // Call the new day-based pricing engine
  const dayResult = await calculateDayBasedPricing({
    templateId,
    tier,
    isEurPassport,
    language,
    marginPercent
  })

  if (!dayResult.success) {
    return {
      success: false,
      templateId,
      templateName: 'Unknown',
      tier,
      numPax,
      numPayingPax: numPax,
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
      warnings: dayResult.warnings
    }
  }

  // Find the matching pax count in the results
  let paxResult = dayResult.paxPricing.find(p => p.numPax === numPax)

  // If exact match not found, calculate for this specific pax count
  if (!paxResult) {
    // Find closest match for now
    paxResult = dayResult.paxPricing.reduce((prev, curr) =>
      Math.abs(curr.numPax - numPax) < Math.abs(prev.numPax - numPax) ? curr : prev
    )
    dayResult.warnings.push(`Pax count ${numPax} not in standard list, using closest match ${paxResult.numPax}`)
  }

  // Select +0 or +1 pricing based on tourLeaderIncluded
  const pricing = tourLeaderIncluded ? paxResult.withLeader : paxResult.withoutLeader

  // Build ratesUsed object for display
  const ratesUsed: PricingResult['ratesUsed'] = {}
  
  // Extract vehicle info from services
  const vehicleService = dayResult.services.find(s => s.serviceType === 'transportation')
  if (vehicleService) {
    ratesUsed.vehicle = {
      type: vehicleService.serviceName.split(' - ')[0] || 'Vehicle',
      route: vehicleService.serviceName.split(' - ')[1] || '',
      rate: vehicleService.unitCost
    }
  }

  // Extract guide info
  const guideService = dayResult.services.find(s => s.serviceType === 'guide')
  if (guideService) {
    ratesUsed.guide = {
      name: guideService.serviceName,
      rate: guideService.unitCost
    }
  }

  // Extract hotel info
  const hotelService = dayResult.services.find(s => s.serviceType === 'accommodation' && s.serviceName.toLowerCase().includes('hotel'))
  if (hotelService) {
    ratesUsed.hotel = {
      name: hotelService.serviceName,
      rate: hotelService.unitCost
    }
  }

  // Add cruise info if applicable
  if (dayResult.cruiseNights > 0) {
    const cruiseService = dayResult.services.find(s => s.serviceType === 'cruise')
    ratesUsed.cruise = {
      name: cruiseService?.serviceName || 'Nile Cruise',
      ppdNight: 0, // Would need to track this
      singleSuppNight: dayResult.singleSupplement / dayResult.cruiseNights
    }
  }

  return {
    success: true,
    templateId: dayResult.templateId,
    templateName: dayResult.templateName,
    tier: dayResult.tier,
    numPax,
    numPayingPax: numPax,
    tourLeaderIncluded,
    totalDays: dayResult.totalDays,
    services: dayResult.services.filter(s => !s.notes?.includes('optional')),
    optionalServices: dayResult.services.filter(s => s.notes?.includes('optional')),
    subtotalCost: pricing.totalCost - (tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0),
    optionalTotal: 0,
    totalCost: pricing.totalCost,
    tourLeaderCost: tourLeaderIncluded ? paxResult.withLeader.tourLeaderCost : 0,
    marginPercent: dayResult.marginPercent,
    marginAmount: pricing.marginAmount,
    sellingPrice: pricing.sellingPrice,
    pricePerPerson: pricing.pricePerPerson,
    currency: dayResult.currency,
    ratesUsed,
    warnings: dayResult.warnings,
    // NEW: Include full pricing table for B2B display
    paxPricingTable: dayResult.paxPricing,
    singleSupplement: dayResult.singleSupplement
  }
}

/**
 * HELPER: Calculate for multiple tiers (backward compatible)
 */
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

/**
 * HELPER: Get price range for browse display (backward compatible)
 */
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

// ============================================
// VEHICLE HELPER (backward compatible export)
// ============================================

export { getVehicleTypeByPax }

export type MealPlan = 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'