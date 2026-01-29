// ============================================
// AUTO-PRICING SERVICE - v4 (Smart Transport)
// File: lib/auto-pricing-service.ts
//
// Holistic B2B pricing engine that processes
// tour_templates.itinerary JSONB day-by-day
//
// Features:
// - PPD (Per Person Double) + Single Supplement model
// - Mixed itineraries (Hotel + Cruise)
// - Tour Leader (+0/+1) support
// - Multi-pax calculation (1-40)
// - Smart transportation selection (duration, area)
// - All service types (accommodation, meals, entrances, transport, guide, airport, hotel services)
//
// v4 Changes:
// - Smart transport type detection (airport, intercity, day_tour)
// - Duration detection (full_day, half_day)
// - Area-based transport matching (east_bank, west_bank, etc.)
// - Special vehicle handling (Horse Carriage for Edfu)
// - Itinerary-level transport overrides
//
// BACKWARD COMPATIBLE:
// - Exports calculateAutoPricing() with same interface as v2/v3
// - New: calculateDayBasedPricing() returns full pricing table
// ============================================

import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
    }
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// ============================================
// TYPES
// ============================================

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type AccommodationType = 'hotel' | 'cruise' | 'none'
export type MealStatus = 'included' | 'external' | 'none'

// Transport service types (normalized)
export type TransportServiceType = 
  | 'airport_transfer'
  | 'city_transfer'
  | 'day_tour'
  | 'dinner_transfer'
  | 'intercity_transfer'
  | 'sound_light_transfer'

export type TransportDuration = 'full_day' | 'half_day' | 'one_way'

export type TransportArea = 
  | 'east_bank'
  | 'west_bank'
  | 'pyramids'
  | 'islamic_cairo'
  | 'old_cairo'
  | 'temple_visit'
  | 'nubian_village'
  | null

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
  // NEW: Transport overrides (optional)
  transport?: {
    service_type?: TransportServiceType
    duration?: TransportDuration
    area?: TransportArea
    vehicle_type?: string // e.g., 'Horse Carriage' for Edfu
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
  isOptional: boolean  // true = optional add-on service
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

  // Triple reduction (one number for whole tour) - PPD model
  tripleReduction: number

  // Services detail (for 2 pax reference)
  services: PricedService[]

  // Multi-pax pricing table
  paxPricing: PaxPricingResult[]

  // Metadata
  currency: string
  marginPercent: number
  warnings: string[]
}

// Transport rate from database
interface TransportRate {
  id: string
  service_code: string
  service_type: string
  vehicle_type: string
  city: string | null
  origin_city: string | null
  destination_city: string | null
  duration: string | null
  area: string | null
  route_name: string | null
  base_rate_eur: number
  base_rate_non_eur: number
  capacity_min: number | null
  capacity_max: number | null
  is_active: boolean
}

// ============================================
// CONSTANTS
// ============================================

// Generate pax counts 1-40 (supports solo travelers through large groups)
export const PAX_COUNTS = Array.from({ length: 40 }, (_, i) => i + 1)

// Vehicle capacity tiers
export const VEHICLE_CAPACITY = {
  'Sedan': { min: 1, max: 2 },
  'Minivan': { min: 3, max: 7 },
  'Van': { min: 8, max: 14 },
  'Minibus': { min: 15, max: 20 },
  'Bus': { min: 21, max: 45 },
  'Horse Carriage': { min: 1, max: 4 }  // Special for Edfu
} as const

export type VehicleType = keyof typeof VEHICLE_CAPACITY

// Area to attractions mapping (for auto-detection)
const AREA_ATTRACTIONS: Record<string, string[]> = {
  'east_bank': [
    'karnak', 'karnak temple', 'luxor temple'
  ],
  'west_bank': [
    'valley of the kings', 'valley of kings', 'hatshepsut', 'hatshepsut temple',
    'colossi of memnon', 'medinet habu', 'valley of the queens',
    'deir el-medina', 'ramesseum'
  ],
  'pyramids': [
    'pyramids', 'pyramid', 'giza', 'sphinx', 'great sphinx',
    'solar boat', 'khufu', 'khafre', 'menkaure'
  ],
  'islamic_cairo': [
    'citadel', 'saladin citadel', 'khan el khalili', 'khan el-khalili',
    'al-azhar', 'hussein mosque', 'old cairo bazaar'
  ],
  'old_cairo': [
    'coptic cairo', 'hanging church', 'ben ezra', 'coptic museum',
    'st. sergius', 'church of st. george'
  ],
  'temple_visit': [
    'edfu', 'edfu temple', 'kom ombo', 'kom ombo temple',
    'horus temple', 'sobek temple'
  ],
  'nubian_village': [
    'nubian', 'nubian village', 'elephantine', 'elephantine island'
  ]
}

// Cities that use special vehicles
const SPECIAL_VEHICLE_CITIES: Record<string, VehicleType> = {
  'edfu': 'Horse Carriage'
}

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
export function getVehicleTypeByPax(totalPax: number, city?: string): VehicleType {
  // Check for special vehicle cities first
  if (city && SPECIAL_VEHICLE_CITIES[city.toLowerCase()]) {
    return SPECIAL_VEHICLE_CITIES[city.toLowerCase()]
  }
  
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
    'alexandria': 'ALY',
    'abu simbel': 'ABS'
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
 * Detect area from attractions list
 */
export function detectAreaFromAttractions(attractions: string[]): TransportArea {
  if (!attractions || attractions.length === 0) return null
  
  const attractionsLower = attractions.map(a => a.toLowerCase())
  
  for (const [area, keywords] of Object.entries(AREA_ATTRACTIONS)) {
    for (const keyword of keywords) {
      for (const attraction of attractionsLower) {
        if (attraction.includes(keyword)) {
          return area as TransportArea
        }
      }
    }
  }
  
  return null
}

/**
 * Detect duration from number of attractions
 */
export function detectDurationFromAttractions(attractions: string[]): TransportDuration {
  if (!attractions || attractions.length === 0) return 'half_day'
  if (attractions.length >= 3) return 'full_day'
  return 'half_day'
}

/**
 * Determine transport requirements for a day
 */
export function determineTransportNeeds(
  day: ItineraryDay,
  previousDay: ItineraryDay | null,
  nextDay: ItineraryDay | null
): {
  serviceType: TransportServiceType
  duration: TransportDuration
  area: TransportArea
  useSpecialVehicle: boolean
  specialVehicleType?: VehicleType
} {
  // Check for explicit overrides first
  if (day.transport?.service_type) {
    return {
      serviceType: day.transport.service_type,
      duration: day.transport.duration || 'full_day',
      area: day.transport.area || null,
      useSpecialVehicle: !!day.transport.vehicle_type,
      specialVehicleType: day.transport.vehicle_type as VehicleType
    }
  }
  
  const cityLower = day.city.toLowerCase()
  
  // Check for special vehicle cities (e.g., Edfu → Horse Carriage)
  const useSpecialVehicle = !!SPECIAL_VEHICLE_CITIES[cityLower]
  const specialVehicleType = SPECIAL_VEHICLE_CITIES[cityLower]
  
  // Airport arrival
  if (day.services.airport_arrival) {
    return {
      serviceType: 'airport_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Airport departure
  if (day.services.airport_departure) {
    return {
      serviceType: 'airport_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Intercity transfer (city changed from previous day, and not a cruise)
  if (previousDay && 
      previousDay.city.toLowerCase() !== cityLower &&
      day.accommodation_type !== 'cruise' &&
      previousDay.accommodation_type !== 'cruise') {
    return {
      serviceType: 'intercity_transfer',
      duration: 'one_way',
      area: null,
      useSpecialVehicle: false
    }
  }
  
  // Regular sightseeing day
  const hasAttractions = day.attractions && day.attractions.length > 0
  const guideRequired = day.services.guide_required
  
  if (hasAttractions || guideRequired) {
    const area = detectAreaFromAttractions(day.attractions)
    const duration = detectDurationFromAttractions(day.attractions)
    
    return {
      serviceType: 'day_tour',
      duration,
      area,
      useSpecialVehicle,
      specialVehicleType
    }
  }
  
  // Default: day tour full day
  return {
    serviceType: 'day_tour',
    duration: 'full_day',
    area: null,
    useSpecialVehicle,
    specialVehicleType
  }
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
      hotel_checkin: isFirstDay,
      hotel_checkout: isLastDay,
      guide_required: hasAttractions
    }

    // Extract attractions from title if not provided
    let attractions = day.attractions || []
    if (attractions.length === 0 && day.title) {
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
      services,
      // Parse transport overrides if present
      transport: day.transport || undefined
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
    /grand egyptian museum/i,
    /gem/i,
    /citadel/i,
    /khan el[- ]?khalili/i,
    /abu simbel/i
  ]

  for (const pattern of patterns) {
    if (pattern.test(title)) {
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
    'grand egyptian museum': 'Grand Egyptian Museum',
    'gem': 'Grand Egyptian Museum',
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
  if (day.accommodation_type) {
    return day.accommodation_type
  }

  const title = (day.title || '').toLowerCase()
  const description = (day.description || '').toLowerCase()
  const combined = title + ' ' + description

  // Check for cruise indicators
  if (combined.includes('cruise') || combined.includes('cruiser') || 
      combined.includes('sail') || combined.includes('aboard') ||
      combined.includes('on board') || combined.includes('embark')) {
    return 'cruise'
  }

  // Check if it's a departure day (usually last day)
  if (combined.includes('departure') || combined.includes('fly out') ||
      combined.includes('transfer to airport') || combined.includes('end of')) {
    return 'none'
  }

  // Default based on tour theme (check all days for cruise mentions)
  const hasCruiseDays = allDays.some((d: any) => 
    ((d.title || '') + ' ' + (d.description || '')).toLowerCase().includes('cruise')
  )

  if (hasCruiseDays) {
    const isArrival = title.includes('arrival')
    const isDeparture = title.includes('departure')
    if (isDeparture) return 'none'
    return 'cruise'
  }

  return 'hotel'
}

// ============================================
// RATE LOOKUP FUNCTIONS
// ============================================

/**
 * Get cruise rates for a tier
 * Uses PPD model: ppd_eur (Per Person Double) + single_supplement_eur
 * Falls back to legacy calculation if PPD fields not available
 */
export async function getCruiseRates(
  tier: ServiceTier,
  embarkCity?: string
): Promise<{
  shipName: string
  ppdNight: number
  singleSuppNight: number
  tripleRedNight: number
  durationNights: number
} | null> {
  try {
    let query = getSupabaseAdmin()
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
        tripleRedNight: 0,
        durationNights: 4
      }
    }

    const cruise = cruises[0] as any
    const durationNights = cruise.duration_nights || 4

    // Use new PPD fields if available, otherwise derive from legacy fields
    let ppdNight: number
    let singleSuppNight: number
    let tripleRedNight: number

    if (cruise.ppd_eur !== null && cruise.ppd_eur !== undefined) {
      // New PPD model - ppd_eur is per night already
      ppdNight = cruise.ppd_eur
      singleSuppNight = cruise.single_supplement_eur ?? 0
      tripleRedNight = cruise.triple_reduction_eur ?? 0
    } else {
      // Legacy model - derive from trip rates
      const ppdTrip = cruise.rate_double_eur / 2
      ppdNight = ppdTrip / durationNights
      const singleSuppTrip = (cruise.rate_single_eur || cruise.rate_double_eur) - ppdTrip
      singleSuppNight = Math.max(0, singleSuppTrip / durationNights)
      tripleRedNight = 0
    }

    console.log(`✅ Cruise: ${cruise.ship_name} | PPD/night: €${ppdNight.toFixed(2)} | SingleSupp/night: €${singleSuppNight.toFixed(2)} | TripleRed/night: €${tripleRedNight.toFixed(2)}`)

    return {
      shipName: cruise.ship_name,
      ppdNight,
      singleSuppNight,
      tripleRedNight: Math.max(0, tripleRedNight),
      durationNights
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return null
  }
}

/**
 * Get hotel rates for a city and tier
 * Uses PPD model: ppd_eur (Per Person Double) + single_supplement_eur
 * Falls back to legacy calculation if PPD fields not available
 */
export async function getHotelRates(
  city: string,
  tier: ServiceTier
): Promise<{
  hotelName: string
  ppdNight: number
  singleSuppNight: number
  tripleRedNight: number
} | null> {
  try {
    // Query accommodation_rates table (not hotel_contacts)
    const { data: hotels, error } = await getSupabaseAdmin()
      .from('accommodation_rates')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1)

    if (error || !hotels || hotels.length === 0) {
      // Fallback: try any tier for this city
      const { data: anyHotel } = await getSupabaseAdmin()
        .from('accommodation_rates')
        .select('*')
        .eq('is_active', true)
        .ilike('city', `%${city}%`)
        .limit(1)

      if (!anyHotel || anyHotel.length === 0) {
        console.log(`⚠️ No hotel found for ${city} (${tier}), using defaults`)
        return {
          hotelName: `${city} Hotel`,
          ppdNight: DEFAULT_RATES[tier].hotelPPD,
          singleSuppNight: DEFAULT_RATES[tier].hotelSingleSupp,
          tripleRedNight: 0
        }
      }

      const hotel = anyHotel[0]
      // Use new PPD fields if available, otherwise derive from legacy fields
      const ppd = hotel.ppd_eur ?? (hotel.double_rate_eur ? hotel.double_rate_eur / 2 : 0)
      const singleSupp = hotel.single_supplement_eur ?? Math.max(0, (hotel.single_rate_eur || 0) - ppd)
      const tripleRed = hotel.triple_reduction_eur ?? 0

      return {
        hotelName: hotel.property_name || hotel.name,
        ppdNight: ppd,
        singleSuppNight: Math.max(0, singleSupp),
        tripleRedNight: Math.max(0, tripleRed)
      }
    }

    const hotel = hotels[0]
    // Use new PPD fields if available, otherwise derive from legacy fields
    const ppd = hotel.ppd_eur ?? (hotel.double_rate_eur ? hotel.double_rate_eur / 2 : 0)
    const singleSupp = hotel.single_supplement_eur ?? Math.max(0, (hotel.single_rate_eur || 0) - ppd)
    const tripleRed = hotel.triple_reduction_eur ?? 0

    console.log(`✅ Hotel: ${hotel.property_name || hotel.name} | PPD/night: €${ppd.toFixed(2)} | SingleSupp/night: €${singleSupp.toFixed(2)} | TripleRed/night: €${tripleRed.toFixed(2)}`)

    return {
      hotelName: hotel.property_name || hotel.name,
      ppdNight: ppd,
      singleSuppNight: Math.max(0, singleSupp),
      tripleRedNight: Math.max(0, tripleRed)
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
    let { data: fees, error } = await getSupabaseAdmin()
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate')
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)

    if (error || !fees || fees.length === 0) {
      const keywords = attractionName.toLowerCase().split(/\s+/).filter(k => k.length > 3)
      
      for (const keyword of keywords) {
        const { data: keywordFees } = await getSupabaseAdmin()
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
    const { data: guides, error } = await getSupabaseAdmin()
      .from('guides')
      .select('id, name, daily_rate, languages, tier')
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (error || !guides || guides.length === 0) {
      const { data: anyGuide } = await getSupabaseAdmin()
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
    const { data: mealRate } = await getSupabaseAdmin()
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
 * Get airport service rate
 */
export async function getAirportServiceRate(
  airportCode: string,
  direction: 'arrival' | 'departure',
  tier: ServiceTier
): Promise<number> {
  try {
    const { data: rates } = await getSupabaseAdmin()
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
    
    const { data: rates } = await getSupabaseAdmin()
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
    const { data: rates } = await getSupabaseAdmin()
      .from('tipping_rates')
      .select('rate_eur, rate_unit')
      .eq('is_active', true)

    if (!rates || rates.length === 0) {
      return DEFAULT_RATES[tier].tips
    }

    const dailyTotal = rates.reduce((sum, r) => 
      r.rate_unit === 'per_day' ? sum + (r.rate_eur || 0) : sum, 0
    )

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
// SMART TRANSPORT RATE LOOKUP
// ============================================

/**
 * Build transport cache from database
 * Key format: "service_type|city|duration|area|vehicle_type"
 */
export async function buildTransportCache(): Promise<Map<string, TransportRate>> {
  const { data: allRates } = await getSupabaseAdmin()
    .from('transportation_rates')
    .select('*')
    .eq('is_active', true)

  const cache = new Map<string, TransportRate>()
  
  if (!allRates) return cache

  for (const rate of allRates) {
    // Build multiple keys for flexible lookup
    const baseKey = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      rate.area || '',
      rate.vehicle_type || ''
    ].join('|')
    
    cache.set(baseKey, rate)
    
    // Also cache without area for fallback
    const keyNoArea = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      '',
      rate.vehicle_type || ''
    ].join('|')
    
    if (!cache.has(keyNoArea)) {
      cache.set(keyNoArea, rate)
    }
    
    // For intercity, also cache by origin-destination
    if (rate.service_type === 'intercity_transfer' && rate.origin_city && rate.destination_city) {
      const intercityKey = [
        'intercity_transfer',
        (rate.origin_city || '').toLowerCase(),
        (rate.destination_city || '').toLowerCase(),
        rate.vehicle_type || ''
      ].join('|')
      cache.set(intercityKey, rate)
    }
  }

  console.log(`📦 Built transport cache with ${cache.size} entries`)
  return cache
}

/**
 * Smart transport rate lookup with fallbacks
 */
export function findTransportRate(
  cache: Map<string, TransportRate>,
  params: {
    serviceType: TransportServiceType
    city: string
    duration: TransportDuration
    area: TransportArea
    vehicleType: VehicleType
    originCity?: string
    destinationCity?: string
  }
): TransportRate | null {
  const { serviceType, city, duration, area, vehicleType, originCity, destinationCity } = params
  const cityLower = city.toLowerCase()

  // Priority 1: Exact match (service_type + city + duration + area + vehicle)
  const exactKey = [serviceType, cityLower, duration, area || '', vehicleType].join('|')
  if (cache.has(exactKey)) {
    console.log(`✅ Transport exact match: ${exactKey}`)
    return cache.get(exactKey)!
  }

  // Priority 2: Match without area
  const noAreaKey = [serviceType, cityLower, duration, '', vehicleType].join('|')
  if (cache.has(noAreaKey)) {
    console.log(`✅ Transport match (no area): ${noAreaKey}`)
    return cache.get(noAreaKey)!
  }

  // Priority 3: Match without duration (for cities with only one duration option)
  const noDurationKey = [serviceType, cityLower, '', '', vehicleType].join('|')
  if (cache.has(noDurationKey)) {
    console.log(`⚠️ Transport fallback (no duration): ${noDurationKey}`)
    return cache.get(noDurationKey)!
  }

  // Priority 4: Intercity lookup
  if (serviceType === 'intercity_transfer' && originCity && destinationCity) {
    const intercityKey = ['intercity_transfer', originCity.toLowerCase(), destinationCity.toLowerCase(), vehicleType].join('|')
    if (cache.has(intercityKey)) {
      console.log(`✅ Transport intercity match: ${intercityKey}`)
      return cache.get(intercityKey)!
    }
  }

  // Priority 5: Fallback to nearby cities (Luxor for Edfu/Kom Ombo)
  const fallbackCities = ['luxor', 'aswan', 'cairo']
  for (const fallbackCity of fallbackCities) {
    if (fallbackCity === cityLower) continue
    
    const fallbackKey = [serviceType, fallbackCity, duration, '', vehicleType].join('|')
    if (cache.has(fallbackKey)) {
      console.log(`⚠️ Transport fallback city: ${fallbackCity} for ${city}`)
      return cache.get(fallbackKey)!
    }
  }

  console.log(`❌ No transport rate found for: ${serviceType} | ${city} | ${duration} | ${area} | ${vehicleType}`)
  return null
}

// ============================================
// MAIN PRICING CALCULATION
// ============================================

/**
 * Calculate B2B pricing for a tour template
 * Returns pricing for all pax counts (1-40) with +0 and +1 options
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

  console.log('🚀 Starting day-based pricing calculation (v4):', { templateId, tier, isEurPassport })

  const warnings: string[] = []
  const services: PricedService[] = []

  // ============================================
  // STEP 1: Fetch template and parse itinerary
  // ============================================

  const { data: template, error: templateError } = await getSupabaseAdmin()
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
      tripleReduction: 0,
      services: [],
      paxPricing: [],
      currency: 'EUR',
      marginPercent,
      warnings: ['Template not found']
    }
  }

  console.log('📋 Template found:', template.template_name)

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
  // STEP 3: Build transport cache
  // ============================================

  const transportCache = await buildTransportCache()

  // ============================================
  // STEP 4: Fetch all required rates
  // ============================================

  let cruiseRates: Awaited<ReturnType<typeof getCruiseRates>> = null
  if (cruiseNights > 0) {
    const firstCruiseDay = cruiseDays[0]
    cruiseRates = await getCruiseRates(tier, firstCruiseDay?.city)
  }

  const hotelCities = [...new Set(hotelDays.map(d => d.city))]
  const hotelRatesMap = new Map<string, Awaited<ReturnType<typeof getHotelRates>>>()
  for (const city of hotelCities) {
    const rates = await getHotelRates(city, tier)
    if (rates) {
      hotelRatesMap.set(city, rates)
    }
  }

  const guideRate = await getGuideRate(language, tier)
  const mealRates = await getMealRates(tier)
  const tippingRate = await getTippingRate(tier)
  const waterCostPerPax = 2

  // ============================================
  // STEP 5: Calculate Single Supplement & Triple Reduction (whole tour)
  // ============================================

  let singleSupplement = 0
  let tripleReduction = 0

  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      singleSupplement += hotelRate.singleSuppNight
      tripleReduction += hotelRate.tripleRedNight || 0
    } else {
      singleSupplement += DEFAULT_RATES[tier].hotelSingleSupp
      // No triple reduction for defaults
    }
  }

  if (cruiseRates && cruiseNights > 0) {
    singleSupplement += cruiseRates.singleSuppNight * cruiseNights
    tripleReduction += (cruiseRates.tripleRedNight || 0) * cruiseNights
  }

  console.log(`💰 Total Single Supplement: €${singleSupplement.toFixed(2)}`)
  console.log(`💰 Total Triple Reduction: €${tripleReduction.toFixed(2)}`)

  // ============================================
  // STEP 6: Calculate FIXED costs (don't scale with pax)
  // ============================================

  let fixedCosts = 0

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null
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
        isPerPax: false,
        isOptional: false
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
        isPerPax: false,
        isOptional: false
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
        isPerPax: false,
        isOptional: false
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
        isPerPax: false,
        isOptional: false
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
        isPerPax: false,
        isOptional: false
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
        isPerPax: false,
        isOptional: false
      })
    }
  }

  // ============================================
  // STEP 7: Calculate PER-PAX costs (base rates)
  // ============================================

  let accommodationPPD = 0

  // Hotel PPD
  for (const day of hotelDays) {
    const hotelRate = hotelRatesMap.get(day.city)
    if (hotelRate) {
      accommodationPPD += hotelRate.ppdNight
      services.push({
        id: `day${day.day}-hotel`,
        dayNumber: day.day,
        serviceType: 'accommodation',
        serviceName: `Hotel - ${hotelRate.hotelName} (${day.city})`,
        quantity: 1,
        quantityMode: 'per_pax',
        unitCost: hotelRate.ppdNight,
        lineTotal: hotelRate.ppdNight,
        rateSource: 'hotel_contacts',
        isPerPax: true,
        isOptional: false,
        notes: 'PPD (Per Person Double)'
      })
    } else {
      accommodationPPD += DEFAULT_RATES[tier].hotelPPD
    }
  }

  // Cruise PPD
  if (cruiseRates && cruiseNights > 0) {
    accommodationPPD += cruiseRates.ppdNight * cruiseNights
    services.push({
      id: `cruise-accommodation`,
      dayNumber: cruiseDays[0]?.day || 1,
      serviceType: 'cruise',
      serviceName: `Nile Cruise - ${cruiseRates.shipName} (${cruiseNights} nights)`,
      quantity: cruiseNights,
      quantityMode: 'per_pax',
      unitCost: cruiseRates.ppdNight,
      lineTotal: cruiseRates.ppdNight * cruiseNights,
      rateSource: 'nile_cruises',
      isPerPax: true,
      isOptional: false,
      notes: `PPD €${cruiseRates.ppdNight.toFixed(2)}/night × ${cruiseNights} nights`
    })
  }

  // ----- Entrance Fees (per pax) -----
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()

  for (const day of itinerary) {
    for (const attraction of day.attractions) {
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
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: fee.rate,
          lineTotal: fee.rate,
          rateSource: 'entrance_fees',
          isPerPax: true,
          isOptional: false,
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
        isPerPax: true,
        isOptional: false
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
        isPerPax: true,
        isOptional: false
      })
    }
  }

  // ----- Water (per pax per sightseeing day) -----
  const sightseeingDaysList = itinerary.filter(d => d.services.guide_required || d.attractions.length > 0)
  const sightseeingDays = sightseeingDaysList.length
  const waterPerPax = waterCostPerPax * sightseeingDays

  if (sightseeingDays > 0) {
    services.push({
      id: `water-all-days`,
      dayNumber: 1,
      serviceType: 'water',
      serviceName: `Bottled Water (${sightseeingDays} sightseeing days)`,
      quantity: sightseeingDays,
      quantityMode: 'per_pax',
      unitCost: waterCostPerPax,
      lineTotal: waterPerPax,
      rateSource: 'fixed',
      isPerPax: true,
      isOptional: false,
      notes: `€${waterCostPerPax}/day × ${sightseeingDays} days`
    })
  }

  const perPaxCosts = accommodationPPD + entranceFeesPerPax + externalMealsPerPax + waterPerPax

  console.log(`📊 Fixed costs: €${fixedCosts.toFixed(2)} | Per-pax costs: €${perPaxCosts.toFixed(2)}`)

  // ============================================
  // STEP 8: Analyze transport needs per day
  // ============================================

  interface DayTransportInfo {
    day: number
    city: string
    needs: ReturnType<typeof determineTransportNeeds>
    requiresTransport: boolean
  }

  const transportInfoByDay: DayTransportInfo[] = []

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null
    
    const hasSightseeing = day.services.guide_required || day.attractions.length > 0
    const hasAirportService = day.services.airport_arrival || day.services.airport_departure
    const isIntercityDay = previousDay && 
                           previousDay.city.toLowerCase() !== day.city.toLowerCase() &&
                           day.accommodation_type !== 'cruise' &&
                           previousDay.accommodation_type !== 'cruise'
    
    // Determine if this day requires transport
    const requiresTransport = hasSightseeing || hasAirportService || isIntercityDay

    if (requiresTransport) {
      const needs = determineTransportNeeds(day, previousDay, nextDay)
      transportInfoByDay.push({
        day: day.day,
        city: day.city,
        needs,
        requiresTransport: true
      })

      console.log(`🚗 Day ${day.day} (${day.city}): ${needs.serviceType} | ${needs.duration} | area: ${needs.area || 'none'} | special: ${needs.useSpecialVehicle ? needs.specialVehicleType : 'no'}`)
    } else {
      transportInfoByDay.push({
        day: day.day,
        city: day.city,
        needs: determineTransportNeeds(day, previousDay, nextDay),
        requiresTransport: false
      })
    }
  }

  // ============================================
  // STEP 9: Add transport services (for 2 pax baseline)
  // ============================================

  const baseVehicleType = getVehicleTypeByPax(2)
  let baseTransportCost = 0

  for (const info of transportInfoByDay) {
    if (!info.requiresTransport) continue

    const { needs } = info
    
    // Determine vehicle type
    let vehicleType: VehicleType = baseVehicleType
    if (needs.useSpecialVehicle && needs.specialVehicleType) {
      vehicleType = needs.specialVehicleType
    }

    // Find transport rate
    const rate = findTransportRate(transportCache, {
      serviceType: needs.serviceType,
      city: info.city,
      duration: needs.duration,
      area: needs.area,
      vehicleType,
      originCity: itinerary[info.day - 2]?.city, // Previous day city for intercity
      destinationCity: info.city
    })

    if (rate) {
      baseTransportCost += rate.base_rate_eur
      services.push({
        id: `day${info.day}-transport`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: rate.route_name || `${vehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: rate.base_rate_eur,
        lineTotal: rate.base_rate_eur,
        rateSource: 'transportation_rates',
        isPerPax: false,
        isOptional: false,
        notes: `${needs.serviceType} | ${needs.duration}${needs.area ? ` | ${needs.area}` : ''}`
      })
    } else {
      baseTransportCost += DEFAULT_RATES[tier].vehicle
      services.push({
        id: `day${info.day}-transport`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: `${vehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: DEFAULT_RATES[tier].vehicle,
        lineTotal: DEFAULT_RATES[tier].vehicle,
        rateSource: 'default',
        isPerPax: false,
        isOptional: false,
        notes: `Default rate (no match found)`
      })
      warnings.push(`No transport rate for ${vehicleType} in ${info.city} (${needs.serviceType}/${needs.duration})`)
    }
  }

  console.log(`🚗 Base transport cost (2 pax): €${baseTransportCost.toFixed(2)}`)

  // ============================================
  // STEP 10: Calculate for each pax count
  // ============================================

  const paxPricing: PaxPricingResult[] = []

  for (const numPax of PAX_COUNTS) {
    // ----- Transport cost (varies with vehicle size) -----
    let transportCost = 0
    
    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue

      const { needs } = info
      
      // Determine vehicle type for this pax count
      let vehicleType: VehicleType
      if (needs.useSpecialVehicle && needs.specialVehicleType) {
        vehicleType = needs.specialVehicleType
      } else {
        vehicleType = getVehicleTypeByPax(numPax, info.city)
      }

      const rate = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        vehicleType,
        originCity: itinerary[info.day - 2]?.city,
        destinationCity: info.city
      })
      
      if (rate) {
        transportCost += rate.base_rate_eur
      } else {
        transportCost += DEFAULT_RATES[tier].vehicle
      }
    }

    // ----- WITHOUT Tour Leader (+0) -----
    const totalCostWithoutLeader = fixedCosts + transportCost + (perPaxCosts * numPax)
    const marginWithoutLeader = totalCostWithoutLeader * (marginPercent / 100)
    const sellingWithoutLeader = totalCostWithoutLeader + marginWithoutLeader
    const perPersonWithoutLeader = sellingWithoutLeader / numPax

    // ----- WITH Tour Leader (+1) -----
    let transportCostWithLeader = 0
    
    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue

      const { needs } = info
      
      let vehicleType: VehicleType
      if (needs.useSpecialVehicle && needs.specialVehicleType) {
        vehicleType = needs.specialVehicleType
      } else {
        vehicleType = getVehicleTypeByPax(numPax + 1, info.city) // +1 for tour leader
      }

      const rate = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        vehicleType,
        originCity: itinerary[info.day - 2]?.city,
        destinationCity: info.city
      })
      
      if (rate) {
        transportCostWithLeader += rate.base_rate_eur
      } else {
        transportCostWithLeader += DEFAULT_RATES[tier].vehicle
      }
    }

    // Tour leader costs: single room (PPD + single supplement) + their own per-pax costs
    const tourLeaderCost = accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax

    const totalCostWithLeader = fixedCosts + transportCostWithLeader + (perPaxCosts * numPax) + tourLeaderCost
    const marginWithLeader = totalCostWithLeader * (marginPercent / 100)
    const sellingWithLeader = totalCostWithLeader + marginWithLeader
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
  // STEP 11: Return result
  // ============================================

  console.log('✅ Day-based pricing complete (v4)')
  console.log(`   Template: ${template.template_name}`)
  console.log(`   Single Supplement: €${singleSupplement.toFixed(2)}`)
  console.log(`   Triple Reduction: €${tripleReduction.toFixed(2)}`)
  console.log(`   Sample (2 pax +0): €${paxPricing[1]?.withoutLeader.pricePerPerson}/person`)
  console.log(`   Sample (2 pax +1): €${paxPricing[1]?.withLeader.pricePerPerson}/person`)

  return {
    success: true,
    templateId,
    templateName: template.template_name,
    tier,
    totalDays,
    hotelNights,
    cruiseNights,
    singleSupplement: Math.round(singleSupplement * 100) / 100,
    tripleReduction: Math.round(tripleReduction * 100) / 100,
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
  tripleReduction: number
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
      tripleReduction: 0,
      services: [],
      warnings: result.warnings
    }
  }

  const paxResult = result.paxPricing.find(p => p.numPax === params.numPax)
  
  if (!paxResult) {
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
      tripleReduction: result.tripleReduction,
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
    tripleReduction: result.tripleReduction,
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
      pax.numPax === 2 ? `€${result.singleSupplement.toFixed(0)}` : ''
    ])
  }

  return rows
}

// ============================================
// BACKWARD COMPATIBILITY LAYER
// ============================================

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
  paxPricingTable?: PaxPricingResult[]
  singleSupplement?: number
  tripleReduction?: number
}

/**
 * BACKWARD COMPATIBLE FUNCTION
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

  console.log('🔄 calculateAutoPricing called (v4 - smart transport)')
  console.log(`   tourLeaderIncluded: ${tourLeaderIncluded}`)
  console.log(`   numPax: ${numPax}`)

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

  let paxResult = dayResult.paxPricing.find(p => p.numPax === numPax)

  if (!paxResult) {
    paxResult = dayResult.paxPricing.reduce((prev, curr) =>
      Math.abs(curr.numPax - numPax) < Math.abs(prev.numPax - numPax) ? curr : prev
    )
    dayResult.warnings.push(`Pax count ${numPax} not in standard list, using closest match ${paxResult.numPax}`)
  }

  const pricing = tourLeaderIncluded ? paxResult.withLeader : paxResult.withoutLeader
  
  console.log(`   Selected pricing: ${tourLeaderIncluded ? '+1 (withLeader)' : '+0 (withoutLeader)'}`)
  console.log(`   totalCost: €${pricing.totalCost}`)
  console.log(`   pricePerPerson: €${pricing.pricePerPerson}`)
  if (tourLeaderIncluded) {
    console.log(`   tourLeaderCost: €${paxResult.withLeader.tourLeaderCost}`)
  }

  const ratesUsed: PricingResult['ratesUsed'] = {}
  
  const vehicleService = dayResult.services.find(s => s.serviceType === 'transportation')
  if (vehicleService) {
    ratesUsed.vehicle = {
      type: vehicleService.serviceName.split(' - ')[0] || 'Vehicle',
      route: vehicleService.serviceName.split(' - ')[1] || '',
      rate: vehicleService.unitCost
    }
  }

  const guideService = dayResult.services.find(s => s.serviceType === 'guide')
  if (guideService) {
    ratesUsed.guide = {
      name: guideService.serviceName,
      rate: guideService.unitCost
    }
  }

  const hotelService = dayResult.services.find(s => s.serviceType === 'accommodation' && s.serviceName.toLowerCase().includes('hotel'))
  if (hotelService) {
    ratesUsed.hotel = {
      name: hotelService.serviceName,
      rate: hotelService.unitCost
    }
  }

  if (dayResult.cruiseNights > 0) {
    const cruiseService = dayResult.services.find(s => s.serviceType === 'cruise')
    ratesUsed.cruise = {
      name: cruiseService?.serviceName || 'Nile Cruise',
      ppdNight: 0,
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
    services: dayResult.services
      .filter(s => !s.notes?.includes('optional'))
      .sort((a, b) => {
        if (a.isPerPax === b.isPerPax) {
          return a.dayNumber - b.dayNumber
        }
        return a.isPerPax ? 1 : -1
      }),
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
    paxPricingTable: dayResult.paxPricing,
    singleSupplement: dayResult.singleSupplement,
    tripleReduction: dayResult.tripleReduction
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
    2,
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

export type MealPlan = 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'