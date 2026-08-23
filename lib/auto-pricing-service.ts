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
import { resolveEntranceRate } from '@/lib/pricing/entrance-rate'
import type { RateSource, PricingHole } from './pricing-types'
import { getCatalogScope, catalogOrExpr, type CatalogScope } from '@/lib/catalog-scope'
import { getFixedDailyCosts } from '@/lib/fixed-costs'
import { parseDateOnly } from '@/lib/date-utils'
// The shared multi-pax rate-sheet primitive — the ONE engine both the pricing
// grid and this service feed. See lib/pricing/pax-range.ts and STEP 10 below.
import { priceAcrossPax } from '@/lib/pricing/pax-range'

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
    // ---- Service levels (optional) ----
    // The booleans say WHETHER a service is wanted; these say WHICH LEVEL.
    // Both rate tables carry levels the itinerary had no way to ask for — 7
    // rows in hotel_staff_rates (full_service, concierge) and 14 in
    // airport_staff_rates (customs_assist, full_service, vip_service) were
    // priced and permanently unreachable.
    //
    // Optional, and each falls back to the level that has always been charged,
    // so every existing itinerary prices exactly as before.
    /** Defaults to 'meet_greet'. Applies to both arrival and departure. */
    airport_service_level?: AirportServiceType
    /** Defaults to 'checkin_assist'. */
    hotel_checkin_level?: HotelServiceType
    /** Defaults to 'porter'. */
    hotel_checkout_level?: HotelServiceType
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
  /** Whose rates to price from. Scopes every rate lookup to this tenant's
   * rows (merged with the global catalog when the tenant's
   * use_global_catalog flag is on — see lib/catalog-scope.ts). */
  tenantId: string
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

  // Correctness (harness Layer 1): a price is deliverable ONLY when complete.
  // complete === true  ⇔  holes.length === 0 (every component traced to a real
  // exact DB rate). When false, the numbers in paxPricing are partial and must
  // NOT be sent to a customer — resolve the holes first.
  complete: boolean
  holes: PricingHole[]

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

// NOTE: DEFAULT_RATES (hardcoded per-tier fallback prices) was REMOVED in the
// pricing harness (Layer 1). Per policy — "never fabricate or invent rates" —
// a missing or fuzzy-matched rate now produces a PricingHole and marks the
// result `complete: false`, instead of silently substituting a guessed number.
// See docs/PRICING-HARNESS-PLAN.md.

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
    // Canonical outputs MUST be substrings of entrance_fees.attraction_name
    // (the lookup is ilike '%name%'). 'Great Sphinx' and 'Saladin Citadel'
    // matched nothing — the catalog rows are 'Sphinx Area' and
    // 'Citadel of Saladin' — so both attractions always priced as holes.
    'sphinx': 'Sphinx Area',
    'great sphinx': 'Sphinx Area',
    'egyptian museum': 'Egyptian Museum',
    'cairo museum': 'Egyptian Museum',
    'grand egyptian museum': 'Grand Egyptian Museum',
    'gem': 'Grand Egyptian Museum',
    'citadel': 'Citadel of Saladin',
    'saladin citadel': 'Citadel of Saladin',
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
 * Detect the cruise season (peak | high | low) for a travel date from the
 * ship's season-boundary columns. Seasons recur annually, so dates are compared
 * by month/day (the stored year is ignored). Defaults to 'low'.
 */
export function detectCruiseSeason(cruise: any, startDate: string): 'low' | 'high' | 'peak' {
  // parseDateOnly avoids the UTC off-by-one: a bare YYYY-MM-DD must yield the
  // literal month/day, not the previous day in a negative-offset timezone.
  const d = parseDateOnly(startDate)
  if (!d) return 'low'
  const mmdd = (d.getMonth() + 1) * 100 + d.getDate()
  const toMmdd = (s: string | null | undefined): number | null => {
    const x = parseDateOnly(s)
    if (!x) return null
    return (x.getMonth() + 1) * 100 + x.getDate()
  }
  const inRange = (start: number | null, end: number | null): boolean => {
    if (start == null || end == null) return false
    return start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)
  }
  if (inRange(toMmdd(cruise.peak_season_1_start), toMmdd(cruise.peak_season_1_end))) return 'peak'
  if (inRange(toMmdd(cruise.peak_season_2_start), toMmdd(cruise.peak_season_2_end))) return 'peak'
  if (inRange(toMmdd(cruise.high_season_start), toMmdd(cruise.high_season_end))) return 'high'
  return 'low'
}

/**
 * Get cruise rates for a tier (season-aware PPD model).
 * Picks the seasonal PPD for the travel date's season (low = ppd_eur,
 * high = high_season_ppd_eur, peak = peak_season_ppd_eur) + single supplement +
 * triple reduction. Falls back to the base (low) PPD when a seasonal column is
 * unset, then to legacy rates. No travelDate => low season (prior behaviour).
 */
export async function getCruiseRates(
  scope: CatalogScope,
  tier: ServiceTier,
  embarkCity?: string,
  travelDate?: string
): Promise<{
  shipName: string
  ppdNight: number
  singleSuppNight: number
  tripleRedNight: number
  durationNights: number
  season: 'low' | 'high' | 'peak'
  source: RateSource
} | null> {
  try {
    let query = getSupabaseAdmin()
      .from('nile_cruises')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('tier', tier)
      .eq('is_active', true)

    if (embarkCity) {
      query = query.ilike('embark_city', `%${embarkCity}%`)
    }

    const { data: cruises, error } = await query.limit(1)

    if (error || !cruises || cruises.length === 0) {
      // No exact cruise rate for this tier — flag a hole, never guess.
      return null
    }

    const cruise = cruises[0] as any
    const durationNights = cruise.duration_nights || 4

    // Use new PPD fields if available, otherwise derive from legacy fields
    let ppdNight: number
    let singleSuppNight: number
    let tripleRedNight: number
    let season: 'low' | 'high' | 'peak' = 'low'

    if (cruise.ppd_eur !== null && cruise.ppd_eur !== undefined) {
      // PPD model — pick the seasonal PPD for the travel date, falling back to
      // the base (low) PPD when a seasonal rate isn't set. No travelDate => low.
      season = travelDate ? detectCruiseSeason(cruise, travelDate) : 'low'
      if (season === 'peak') {
        ppdNight = cruise.peak_season_ppd_eur ?? cruise.ppd_eur
        singleSuppNight = cruise.peak_season_single_supplement_eur ?? cruise.single_supplement_eur ?? 0
        tripleRedNight = cruise.peak_season_triple_reduction_eur ?? cruise.triple_reduction_eur ?? 0
      } else if (season === 'high') {
        ppdNight = cruise.high_season_ppd_eur ?? cruise.ppd_eur
        singleSuppNight = cruise.high_season_single_supplement_eur ?? cruise.single_supplement_eur ?? 0
        tripleRedNight = cruise.high_season_triple_reduction_eur ?? cruise.triple_reduction_eur ?? 0
      } else {
        ppdNight = cruise.ppd_eur
        singleSuppNight = cruise.single_supplement_eur ?? 0
        tripleRedNight = cruise.triple_reduction_eur ?? 0
      }
    } else {
      // Legacy model - derive from trip rates
      const ppdTrip = cruise.rate_double_eur / 2
      ppdNight = ppdTrip / durationNights
      const singleSuppTrip = (cruise.rate_single_eur || cruise.rate_double_eur) - ppdTrip
      singleSuppNight = Math.max(0, singleSuppTrip / durationNights)
      tripleRedNight = 0
    }



    return {
      shipName: cruise.ship_name,
      ppdNight,
      singleSuppNight,
      tripleRedNight: Math.max(0, tripleRedNight),
      durationNights,
      season,
      source: 'db'
    }
  } catch (err) {
    console.error('Error fetching cruise rates:', err)
    return null
  }
}

/**
 * Detect the hotel season (peak | high | low) for a travel date from the
 * accommodation row's season-boundary columns (migration 103). Seasons recur
 * annually, so dates are compared by month/day (the stored year is ignored).
 * Defaults to 'low' — mirrors detectCruiseSeason.
 */
export function detectHotelSeason(hotel: any, startDate: string): 'low' | 'high' | 'peak' {
  // parseDateOnly avoids the UTC off-by-one (see detectCruiseSeason).
  const d = parseDateOnly(startDate)
  if (!d) return 'low'
  const mmdd = (d.getMonth() + 1) * 100 + d.getDate()
  const toMmdd = (s: string | null | undefined): number | null => {
    const x = parseDateOnly(s)
    if (!x) return null
    return (x.getMonth() + 1) * 100 + x.getDate()
  }
  const inRange = (start: number | null, end: number | null): boolean => {
    if (start == null || end == null) return false
    return start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)
  }
  if (inRange(toMmdd(hotel.peak_season_from), toMmdd(hotel.peak_season_to))) return 'peak'
  if (inRange(toMmdd(hotel.peak_season_2_from), toMmdd(hotel.peak_season_2_to))) return 'peak'
  if (inRange(toMmdd(hotel.high_season_from), toMmdd(hotel.high_season_to))) return 'high'
  return 'low'
}

/**
 * Get hotel rates for a city and tier (season-aware PPD model, mirrors
 * getCruiseRates). Picks the seasonal PPD for the travel date's season
 * (low = ppd_eur, high = high_season_ppd_eur, peak = peak_season_ppd_eur)
 * + matching single supplement + triple reduction. Falls back to the base
 * (low) PPD when a seasonal column is unset, then to legacy rates.
 * No travelDate => low season (prior behaviour).
 */
export async function getHotelRates(
  scope: CatalogScope,
  city: string,
  tier: ServiceTier,
  travelDate?: string
): Promise<{
  hotelName: string
  ppdNight: number
  singleSuppNight: number
  tripleRedNight: number
  season: 'low' | 'high' | 'peak'
  source: RateSource
} | null> {
  const cityNorm = city.trim().toLowerCase()

  const mapRow = (hotel: any, source: RateSource) => {
    const season = travelDate ? detectHotelSeason(hotel, travelDate) : 'low'

    // Base (low season) PPD; legacy fields as last resort
    const basePpd = hotel.ppd_eur ?? (hotel.double_rate_eur ? hotel.double_rate_eur / 2 : 0)
    const baseSupp = hotel.single_supplement_eur ?? Math.max(0, (hotel.single_rate_eur || 0) - basePpd)
    const baseRed = hotel.triple_reduction_eur ?? 0

    // Seasonal columns; unset seasonal column falls back to the base rate
    const ppd = (season === 'peak' ? hotel.peak_season_ppd_eur
      : season === 'high' ? hotel.high_season_ppd_eur
      : null) ?? basePpd
    const singleSupp = (season === 'peak' ? hotel.peak_season_single_supplement_eur
      : season === 'high' ? hotel.high_season_single_supplement_eur
      : null) ?? baseSupp
    const tripleRed = (season === 'peak' ? hotel.peak_season_triple_reduction_eur
      : season === 'high' ? hotel.high_season_triple_reduction_eur
      : null) ?? baseRed

    return {
      hotelName: hotel.property_name || hotel.name,
      ppdNight: ppd,
      singleSuppNight: Math.max(0, singleSupp),
      tripleRedNight: Math.max(0, tripleRed),
      season,
      source,
    }
  }

  try {
    // Primary: exact tier; city matched by ilike (substring).
    const { data: hotels, error } = await getSupabaseAdmin()
      .from('accommodation_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1)

    if (!error && hotels && hotels.length > 0) {
      const hotel = hotels[0] as any
      // ilike can match a DIFFERENT city ("Cairo" ~ "New Cairo"). Only an exact
      // city name (case-insensitive) counts as a definite 'db' match; otherwise
      // it is a fuzzy match and must be confirmed (treated as a hole).
      const exactCity = String(hotel.city ?? '').trim().toLowerCase() === cityNorm
      return mapRow(hotel, exactCity ? 'db' : 'fuzzy')
    }

    // Fallback: any tier for this city — wrong tier ⇒ fuzzy, never deliverable.
    const { data: anyHotel } = await getSupabaseAdmin()
      .from('accommodation_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1)

    if (anyHotel && anyHotel.length > 0) {
      return mapRow(anyHotel[0], 'fuzzy')
    }

    // No rate at all.
    return null
  } catch (err) {
    console.error('Error fetching hotel rates:', err)
    return null
  }
}

/**
 * Get entrance fee for an attraction
 */
export async function getEntranceFee(
  scope: CatalogScope,
  attractionName: string,
  isEurPassport: boolean
): Promise<{ id: string; name: string; rate: number; source: RateSource } | null> {
  try {
    let { data: fees, error } = await getSupabaseAdmin()
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .ilike('attraction_name', `%${attractionName}%`)
      .limit(1)

    // A full-name match is definite; a keyword fallback is approximate.
    let matchSource: RateSource = 'db'

    if (error || !fees || fees.length === 0) {
      matchSource = 'fuzzy'
      const keywords = attractionName.toLowerCase().split(/\s+/).filter(k => k.length > 3)

      for (const keyword of keywords) {
        const { data: keywordFees } = await getSupabaseAdmin()
          .from('entrance_fees')
          .select('id, attraction_name, eur_rate, non_eur_rate')
          .or(catalogOrExpr(scope))
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
      return null
    }

    const fee = fees[0] as any

    // `??`, not `||`. Since migration 278 the schema distinguishes the two
    // cases that used to collapse into one:
    //
    //   NULL = not priced yet  -> return null, so the caller records an
    //                             `entrance` hole and the quote needs manual
    //                             pricing rather than silently discounting.
    //   0    = genuinely free  -> a real price. Khan el-Khalili and the
    //                             Colossi of Memnon have no entry ticket, and
    //                             flagging them as missing rates sent the
    //                             operator to fix something already correct.
    //
    // `||` treated free as absent, which is exactly the "blank cell read as a
    // price of zero" defect from the other direction.
    const rate = resolveEntranceRate(fee, isEurPassport)

    if (rate === null) {
      return null
    }

    return {
      id: fee.id,
      name: fee.attraction_name,
      rate,
      source: matchSource,
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
  scope: CatalogScope,
  language: string,
  tier: ServiceTier
): Promise<{ id: string; name: string; dailyRate: number; source: RateSource } | null> {
  try {
    const { data: guides, error } = await getSupabaseAdmin()
      .from('guides')
      .select('id, name, daily_rate, languages, tier')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })

    if (!error && guides && guides.length > 0) {
      const tierMatch = (guides as any[]).find((g: any) => g.tier === tier)
      const selected = (tierMatch || guides[0]) as any
      if (!selected.daily_rate) return null
      return {
        id: selected.id,
        name: selected.name,
        dailyRate: selected.daily_rate,
        // Definite only when the chosen guide is actually in the requested tier;
        // falling back to guides[0] (a different tier) is a fuzzy match.
        source: tierMatch ? 'db' : 'fuzzy',
      }
    }

    // Fallback: any guide regardless of language — approximate, never deliverable.
    const { data: anyGuide } = await getSupabaseAdmin()
      .from('guides')
      .select('id, name, daily_rate')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (anyGuide && anyGuide.length > 0) {
      const g = anyGuide[0] as any
      if (!g.daily_rate) return null
      return { id: g.id, name: g.name, dailyRate: g.daily_rate, source: 'fuzzy' }
    }

    return null
  } catch (err) {
    console.error('Error fetching guide rate:', err)
    return null
  }
}

/**
 * Get meal rates
 */
export async function getMealRates(
  scope: CatalogScope,
  tier: ServiceTier
): Promise<{ lunch: number; dinner: number; source: RateSource } | null> {
  try {
    // meal_rates holds one row per meal_type AND tier, with the rate in
    // `base_rate_eur`. This selected `lunch_rate_eur, dinner_rate_eur`, which
    // do not exist on the table — PostgREST returns them as absent, the null
    // check below caught it, and this function has therefore returned null for
    // every call it has ever served. It failed SAFE (the caller records a hole
    // rather than fabricating) but meals could never be priced.
    const { data: mealRows } = await getSupabaseAdmin()
      .from('meal_rates')
      .select('meal_type, base_rate_eur')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .eq('tier', tier)

    const rows = (mealRows ?? []) as Array<{
      meal_type?: string | null
      base_rate_eur?: number | string | null
    }>

    const pick = (kind: 'lunch' | 'dinner'): number | null => {
      const row = rows.find((r) => String(r.meal_type ?? '').toLowerCase().includes(kind))
      const n = Number(row?.base_rate_eur)
      // Zero is bad data, not a free meal.
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const lunch = pick('lunch')
    const dinner = pick('dinner')
    if (lunch === null || dinner === null) {
      return null
    }

    // No tier multiplier: the query is already tier-scoped, so applying one
    // would charge the tier uplift twice.
    return {
      lunch: Math.round(lunch),
      dinner: Math.round(dinner),
      source: 'db',
    }
  } catch (err) {
    return null
  }
}

/**
 * Get airport service rate
 */
/**
 * The airport assistance level an itinerary is priced at.
 *
 * The rate table also carries `customs_assist`, `full_service` and
 * `vip_service`, but the itinerary model has only a boolean
 * (`day.services.airport_arrival` / `airport_departure`) and no way to say
 * WHICH level is wanted — so nothing can currently request them. Expressing
 * service levels is a product decision, not something this lookup should
 * invent; until then `meet_greet` is the baseline and is what the engine has
 * de-facto been charging.
 */
export type AirportServiceType = 'meet_greet' | 'customs_assist' | 'full_service' | 'vip_service'

/**
 * The hotel assistance level an itinerary is priced at.
 *
 * `checkin_assist` and `porter` are the defaults the two booleans have always
 * mapped to. `full_service` bundles both (its rates sit at roughly the sum of
 * the two) and `concierge` is a separate premium service — 7 priced rows that
 * nothing could request until day.services gained a level.
 */
export type HotelServiceType = 'checkin_assist' | 'porter' | 'full_service' | 'concierge'

/** Human labels for the service levels, used on line items and holes. */
const AIRPORT_LEVEL_LABEL: Record<AirportServiceType, string> = {
  meet_greet: 'Meet & Greet',
  customs_assist: 'Customs Assistance',
  full_service: 'Full Service',
  vip_service: 'VIP Service',
}
const HOTEL_LEVEL_LABEL: Record<HotelServiceType, string> = {
  checkin_assist: 'Check-in Assistance',
  porter: 'Check-out & Porter',
  full_service: 'Full Service',
  concierge: 'Concierge',
}


/**
 * Get the airport assistance rate.
 *
 * NOTE: deliberately takes no `tier`. It used to, and silently ignored it —
 * `airport_staff_rates` has no tier or category column, so there is nothing to
 * filter on. A parameter that looks like it selects a price and does not is
 * worse than its absence: every call site read as though airport assistance
 * were tier-aware, and it never has been.
 */
export async function getAirportServiceRate(
  scope: CatalogScope,
  airportCode: string,
  direction: 'arrival' | 'departure',
  serviceType: AirportServiceType = 'meet_greet'
): Promise<number | null> {
  try {
    const { data: rates } = await getSupabaseAdmin()
      .from('airport_staff_rates')
      .select('rate_eur')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .eq('airport_code', airportCode)
      // Without this the query matched EVERY service level for the airport and
      // took `.limit(1)` off an unordered result. Cairo arrival has four
      // candidates — meet_greet €15, customs_assist €25, full_service €40,
      // vip_service €75 — so the same trip could be priced anywhere across a
      // 5x spread. It returned €15 only because that row happened to sit first
      // on disk; a row rewrite or a different query plan would have changed the
      // price with no code change and nothing to notice.
      .eq('service_type', serviceType)
      .or(`direction.eq.${direction},direction.eq.both`)
      // Belt and braces: if a tenant ever holds two rows for the same airport,
      // direction and service level, price the cheaper rather than an
      // arbitrary one. Deterministic beats incidental.
      .order('rate_eur', { ascending: true })
      .limit(1)

    if (!rates || rates.length === 0) {
      return null
    }

    const rate = (rates[0] as any).rate_eur
    return typeof rate === 'number' ? rate : null
  } catch (err) {
    return null
  }
}

/**
 * Get hotel service rate
 */
export async function getHotelServiceRate(
  scope: CatalogScope,
  serviceType: HotelServiceType,
  tier: ServiceTier
): Promise<number | null> {
  try {
    const category = getTierCategory(tier)

    const { data: rates } = await getSupabaseAdmin()
      .from('hotel_staff_rates')
      .select('rate_eur')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .eq('service_type', serviceType)
      .or(`hotel_category.eq.${category},hotel_category.eq.all`)
      // Unambiguous on today's data (service_type + category resolves to one
      // row), but ordered anyway so it cannot become arbitrary the day a
      // second row is added.
      .order('rate_eur', { ascending: true })
      .limit(1)

    if (!rates || rates.length === 0) {
      return null
    }

    const rate = (rates[0] as any).rate_eur
    return typeof rate === 'number' ? rate : null
  } catch (err) {
    return null
  }
}

/**
 * Get tipping rate per day
 */
export async function getTippingRate(scope: CatalogScope, tier: ServiceTier): Promise<number | null> {
  try {
    const { data: rates } = await getSupabaseAdmin()
      .from('tipping_rates')
      .select('rate_eur, rate_unit')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)

    if (!rates || rates.length === 0) {
      return null
    }

    const dailyTotal = (rates as any[]).reduce((sum: number, r: any) =>
      r.rate_unit === 'per_day' ? sum + (r.rate_eur || 0) : sum, 0
    )

    const multipliers: Record<ServiceTier, number> = {
      budget: 0.8,
      standard: 1.0,
      deluxe: 1.2,
      luxury: 1.5
    }

    // 0 means there were rows but no per_day tipping rate — treat as a hole.
    return Math.round(dailyTotal * multipliers[tier]) || null
  } catch (err) {
    return null
  }
}

// ============================================
// SMART TRANSPORT RATE LOOKUP
// ============================================

/**
 * Build transport cache from database
 * Key format: "service_type|city|duration|area|vehicle_type"
 */
// The bulk importer (lib/bulk-rate-service.ts, migration 200) writes a WIDE
// transportation_rates row: no per-row vehicle_type/base_rate_eur, but one rate
// column per vehicle class (sedan_rate_eur ... bus_rate_eur, each with a
// _non_eur and capacity_min/max). The engine matches per vehicle_type with a
// single base_rate_eur, so a wide row is invisible / prices at €0. We expand
// each wide row into one synthetic tall rate per vehicle class that actually
// has a rate — reading only real columns (no fabricated defaults).
const WIDE_VEHICLE_CLASSES: { name: VehicleType; prefix: string }[] = [
  { name: 'Sedan', prefix: 'sedan' },
  { name: 'Minivan', prefix: 'minivan' },
  { name: 'Van', prefix: 'van' },
  { name: 'Minibus', prefix: 'minibus' },
  { name: 'Bus', prefix: 'bus' },
]

function expandWideTransportRow(row: any): any[] {
  const out: any[] = []
  for (const { name, prefix } of WIDE_VEHICLE_CLASSES) {
    const rateEur = Number(row[`${prefix}_rate_eur`]) || 0
    if (rateEur <= 0) continue // no rate for this class → not a usable option
    out.push({
      ...row,
      vehicle_type: name,
      base_rate_eur: rateEur,
      base_rate_non_eur: Number(row[`${prefix}_rate_non_eur`]) || 0,
      capacity_min: row[`${prefix}_capacity_min`] ?? VEHICLE_CAPACITY[name].min,
      capacity_max: row[`${prefix}_capacity_max`] ?? VEHICLE_CAPACITY[name].max,
    })
  }
  return out
}

export async function buildTransportCache(scope: CatalogScope): Promise<Map<string, TransportRate>> {
  const { data: allRates } = await getSupabaseAdmin()
    .from('transportation_rates')
    .select('*')
    .or(catalogOrExpr(scope))
    .eq('is_active', true)

  const cache = new Map<string, TransportRate>()

  if (!allRates) return cache

  for (const row of allRates) {
    const wideRow = row as any
    // A wide bulk-imported row has no vehicle_type but carries per-class rate
    // columns; expand it. Normal (tall) rows pass through unchanged.
    const isWide = !wideRow.vehicle_type &&
      (wideRow.sedan_rate_eur || wideRow.minivan_rate_eur || wideRow.van_rate_eur ||
       wideRow.minibus_rate_eur || wideRow.bus_rate_eur)
    const expandedRates = isWide ? expandWideTransportRow(wideRow) : [wideRow]

    for (const r of expandedRates) {
    const rate = r as any
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
  }


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
): { rate: TransportRate; source: 'db' | 'fuzzy' } | null {
  const { serviceType, city, duration, area, vehicleType, originCity, destinationCity } = params
  const cityLower = city.toLowerCase()

  // Priority 1: Exact match (service_type + city + duration + area + vehicle) — definite.
  const exactKey = [serviceType, cityLower, duration, area || '', vehicleType].join('|')
  if (cache.has(exactKey)) {
    return { rate: cache.get(exactKey)!, source: 'db' }
  }

  // Priority 2: Match without area — still definite (area is optional metadata).
  const noAreaKey = [serviceType, cityLower, duration, '', vehicleType].join('|')
  if (cache.has(noAreaKey)) {
    return { rate: cache.get(noAreaKey)!, source: 'db' }
  }

  // Priority 4: Intercity route match (origin→destination) — definite for transfers.
  if (serviceType === 'intercity_transfer' && originCity && destinationCity) {
    const intercityKey = ['intercity_transfer', originCity.toLowerCase(), destinationCity.toLowerCase(), vehicleType].join('|')
    if (cache.has(intercityKey)) {
      return { rate: cache.get(intercityKey)!, source: 'db' }
    }
  }

  // Priority 3: Match without duration — APPROXIMATE (different trip length).
  const noDurationKey = [serviceType, cityLower, '', '', vehicleType].join('|')
  if (cache.has(noDurationKey)) {
    return { rate: cache.get(noDurationKey)!, source: 'fuzzy' }
  }

  // Priority 5: Nearby-city substitution (e.g. Luxor for Edfu) — APPROXIMATE.
  const fallbackCities = ['luxor', 'aswan', 'cairo']
  for (const fallbackCity of fallbackCities) {
    if (fallbackCity === cityLower) continue

    const fallbackKey = [serviceType, fallbackCity, duration, '', vehicleType].join('|')
    if (cache.has(fallbackKey)) {
      return { rate: cache.get(fallbackKey)!, source: 'fuzzy' }
    }
  }

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
    tenantId,
    tier,
    isEurPassport,
    language = 'English',
    travelDate,
    marginPercent = 25
  } = params

  // Resolved once per calculation; every rate lookup below is scoped by it.
  const catalogScope = await getCatalogScope(getSupabaseAdmin(), tenantId)

  const warnings: string[] = []
  const services: PricedService[] = []

  // Harness Layer 1: collect rate-data gaps instead of fabricating defaults.
  const holes: PricingHole[] = []
  const seenHoleKeys = new Set<string>()
  const addHole = (h: PricingHole) => {
    const key = `${h.kind}|${h.dayNumber ?? ''}|${h.lookupAttempted}`
    if (seenHoleKeys.has(key)) return
    seenHoleKeys.add(key)
    holes.push(h)
  }

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
      complete: false,
      holes: [],
      currency: 'EUR',
      marginPercent,
      warnings: ['Template not found']
    }
  }

  const t = template as any


  const itinerary = parseItinerary(t.itinerary)
  const totalDays = itinerary.length || t.duration_days || 1

  if (itinerary.length === 0) {
    warnings.push('No itinerary data found - using defaults')
  }



  // ============================================
  // STEP 2: Analyze accommodation types
  // ============================================

  const hotelDays = itinerary.filter(d => d.accommodation_type === 'hotel')
  const cruiseDays = itinerary.filter(d => d.accommodation_type === 'cruise')
  const hotelNights = hotelDays.length
  const cruiseNights = cruiseDays.length



  // ============================================
  // STEP 3: Build transport cache
  // ============================================

  const transportCache = await buildTransportCache(catalogScope)

  // ============================================
  // STEP 4: Fetch all required rates
  // ============================================

  let cruiseRates: NonNullable<Awaited<ReturnType<typeof getCruiseRates>>> | null = null
  if (cruiseNights > 0) {
    const firstCruiseDay = cruiseDays[0]
    const cr = await getCruiseRates(catalogScope, tier, firstCruiseDay?.city, travelDate)
    if (cr && cr.source === 'db') {
      cruiseRates = cr
    } else {
      addHole({
        kind: 'cruise',
        reason: cr ? 'fuzzy' : 'missing',
        tier,
        city: firstCruiseDay?.city,
        lookupAttempted: `cruise rate (${tier})`,
        message: `No exact ${tier} cruise rate. Add it in Rates → Cruises.`,
      })
    }
  }

  // Fetch per-city hotel rates concurrently (deduped cities), then apply in
  // deterministic order so results/holes match the previous serial version.
  const hotelCities = [...new Set(hotelDays.map(d => d.city))]
  const hotelRatesMap = new Map<string, NonNullable<Awaited<ReturnType<typeof getHotelRates>>>>()
  const hotelResults = await Promise.all(
    hotelCities.map(city => getHotelRates(catalogScope, city, tier, travelDate))
  )
  hotelCities.forEach((city, i) => {
    const rates = hotelResults[i]
    if (rates && rates.source === 'db') {
      hotelRatesMap.set(city, rates)
    } else {
      addHole({
        kind: 'hotel',
        reason: rates ? 'fuzzy' : 'missing',
        tier,
        city,
        lookupAttempted: `hotel rate (${city}, ${tier})`,
        message: `No exact ${tier} hotel rate for ${city}. Add it in Rates → Hotels.`,
      })
    }
  })

  // These four are independent — fetch concurrently. Water cost is
  // admin-configurable via Rates → Fixed Costs (fixed_daily_costs); falls back
  // to €2 (the previous hardcoded value) if the table is empty.
  const [guideRate, mealRates, tippingRate, fixedDailyCosts] = await Promise.all([
    getGuideRate(catalogScope, language, tier),
    getMealRates(catalogScope, tier),
    getTippingRate(catalogScope, tier),
    getFixedDailyCosts(),
  ])
  const waterCostPerPax = fixedDailyCosts.waterPerPersonPerDay

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
    }
    // Missing/fuzzy hotel rate already recorded as a hole in STEP 4 — add nothing.
  }

  if (cruiseRates && cruiseNights > 0) {
    singleSupplement += cruiseRates.singleSuppNight * cruiseNights
    tripleReduction += (cruiseRates.tripleRedNight || 0) * cruiseNights
  }




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
    if (hasSightseeing) {
      if (guideRate && guideRate.source === 'db') {
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
      } else {
        addHole({
          kind: 'guide',
          reason: guideRate ? 'fuzzy' : 'missing',
          tier,
          lookupAttempted: `${language} guide (${tier})`,
          message: `No exact ${tier} ${language}-speaking guide rate. Add it in Rates → Guides.`,
        })
      }
    }

    // ----- TIPPING (fixed per day, when guide present) -----
    if (hasSightseeing) {
      if (tippingRate != null) {
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
      } else {
        addHole({
          kind: 'tipping',
          reason: 'missing',
          tier,
          lookupAttempted: `tipping rate (${tier})`,
          message: `No per-day tipping rate. Add it in Rates → Tipping.`,
        })
      }
    }

    // ----- SERVICE LEVELS -----
    // Each defaults to the level that has always been charged, so an itinerary
    // that does not specify one prices exactly as it did before.
    const airportLevel: AirportServiceType = day.services.airport_service_level ?? 'meet_greet'
    const checkinLevel: HotelServiceType = day.services.hotel_checkin_level ?? 'checkin_assist'
    const checkoutLevel: HotelServiceType = day.services.hotel_checkout_level ?? 'porter'

    // ----- AIRPORT SERVICES (fixed per service) -----
    if (day.services.airport_arrival) {
      const airportCode = getAirportCode(day.city)
      const rate = await getAirportServiceRate(catalogScope, airportCode, 'arrival', airportLevel)
      if (rate != null) {
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
      } else {
        addHole({
          kind: 'airport_service',
          reason: 'missing',
          tier,
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `airport arrival ${airportLevel} (${airportCode})`,
          message: `No airport meet & greet rate for ${airportCode}. Add it in Rates → Airport Services.`,
        })
      }
    }

    if (day.services.airport_departure) {
      const airportCode = getAirportCode(day.city)
      const rate = await getAirportServiceRate(catalogScope, airportCode, 'departure', airportLevel)
      if (rate != null) {
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
      } else {
        addHole({
          kind: 'airport_service',
          reason: 'missing',
          tier,
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `airport departure ${airportLevel} (${airportCode})`,
          message: `No ${AIRPORT_LEVEL_LABEL[airportLevel]} departure rate for ${airportCode}. Add it in Rates → Airport Services.`,
        })
      }
    }

    // ----- HOTEL SERVICES (fixed per service) -----
    if (day.services.hotel_checkin) {
      const rate = await getHotelServiceRate(catalogScope, checkinLevel, tier)
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-hotel-checkin`,
          dayNumber: day.day,
          serviceType: 'hotel_service',
          serviceName: `Hotel ${HOTEL_LEVEL_LABEL[checkinLevel]}`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'hotel_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'hotel_service',
          reason: 'missing',
          tier,
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel ${checkinLevel} (${tier})`,
          message: `No hotel ${HOTEL_LEVEL_LABEL[checkinLevel]} rate for ${tier}. Add it in Rates → Hotel Services.`,
        })
      }
    }

    if (day.services.hotel_checkout) {
      const rate = await getHotelServiceRate(catalogScope, checkoutLevel, tier)
      if (rate != null) {
        fixedCosts += rate
        services.push({
          id: `day${day.day}-hotel-checkout`,
          dayNumber: day.day,
          serviceType: 'hotel_service',
          serviceName: `Hotel ${HOTEL_LEVEL_LABEL[checkoutLevel]}`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'hotel_staff_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'hotel_service',
          reason: 'missing',
          tier,
          dayNumber: day.day,
          city: day.city,
          lookupAttempted: `hotel ${checkoutLevel} (${tier})`,
          message: `No hotel ${HOTEL_LEVEL_LABEL[checkoutLevel]} rate for ${tier}. Add it in Rates → Hotel Services.`,
        })
      }
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
    }
    // Missing/fuzzy hotel rate already recorded as a hole in STEP 4 — add nothing.
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
  // Collect unique attractions in first-seen order, fetch all concurrently
  // (was one serial round-trip per attraction — the main N+1), then apply in
  // order so the accumulated fee, service list, and holes are unchanged.
  let entranceFeesPerPax = 0
  const processedAttractions = new Set<string>()
  const entranceLookups: { attraction: string; day: any }[] = []
  for (const day of itinerary) {
    for (const attraction of day.attractions) {
      const key = attraction.toLowerCase()
      if (processedAttractions.has(key)) continue
      processedAttractions.add(key)
      entranceLookups.push({ attraction, day })
    }
  }

  const entranceFees = await Promise.all(
    entranceLookups.map(l => getEntranceFee(catalogScope, l.attraction, isEurPassport))
  )

  entranceLookups.forEach(({ attraction, day }, i) => {
    const fee = entranceFees[i]
    // `>= 0`, not `> 0`: getEntranceFee now returns null for an unpriced
    // attraction, so anything arriving here has a real price — and 0 is a
    // real price for an attraction with no entry ticket. Requiring `> 0`
    // reported those as missing rates.
    if (fee && fee.source === 'db' && fee.rate >= 0) {
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
      addHole({
        kind: 'entrance',
        reason: fee ? 'fuzzy' : 'missing',
        tier,
        dayNumber: day.day,
        attraction,
        lookupAttempted: `entrance fee "${attraction}"`,
        message: `No exact entrance fee for "${attraction}". Add it in Rates → Attractions.`,
      })
    }
  })

  // ----- External Meals (per pax) -----
  let externalMealsPerPax = 0

  for (const day of itinerary) {
    if (day.meals.lunch === 'external') {
      if (mealRates) {
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
      } else {
        addHole({
          kind: 'meal',
          reason: 'missing',
          tier,
          lookupAttempted: 'meal rates (lunch/dinner)',
          message: 'No meal rate. Add lunch/dinner rates in Rates → Meals.',
        })
      }
    }

    if (day.meals.dinner === 'external') {
      if (mealRates) {
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
      } else {
        addHole({
          kind: 'meal',
          reason: 'missing',
          tier,
          lookupAttempted: 'meal rates (lunch/dinner)',
          message: 'No meal rate. Add lunch/dinner rates in Rates → Meals.',
        })
      }
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
    const match = findTransportRate(transportCache, {
      serviceType: needs.serviceType,
      city: info.city,
      duration: needs.duration,
      area: needs.area,
      vehicleType,
      originCity: itinerary[info.day - 2]?.city, // Previous day city for intercity
      destinationCity: info.city
    })

    if (match && match.source === 'db') {
      baseTransportCost += match.rate.base_rate_eur
      services.push({
        id: `day${info.day}-transport`,
        dayNumber: info.day,
        serviceType: 'transportation',
        serviceName: match.rate.route_name || `${vehicleType} - ${info.city}`,
        quantity: 1,
        quantityMode: 'fixed',
        unitCost: match.rate.base_rate_eur,
        lineTotal: match.rate.base_rate_eur,
        rateSource: 'transportation_rates',
        isPerPax: false,
        isOptional: false,
        notes: `${needs.serviceType} | ${needs.duration}${needs.area ? ` | ${needs.area}` : ''}`
      })
    } else {
      // No exact transport rate — record a hole, never substitute a default.
      addHole({
        kind: 'transport',
        reason: match ? 'fuzzy' : 'missing',
        tier,
        dayNumber: info.day,
        city: info.city,
        vehicleType,
        lookupAttempted: `${needs.serviceType}/${needs.duration} ${vehicleType} in ${info.city}`,
        message: `No exact transport rate for ${vehicleType} (${needs.serviceType}/${needs.duration}) in ${info.city}. Add it in Rates → Transportation.`,
      })
    }
  }



  // ============================================
  // STEP 10: Calculate for each pax count
  // ============================================

  // Transport is the only pax-dependent cost — the vehicle tier is re-selected
  // by group size. Factor it into a callback and feed the SHARED core primitive
  // (lib/pricing/pax-range.ts), the same engine the pricing grid feeds, so the
  // B2B rate sheet is ONE engine rather than a parallel inline copy. This is
  // behaviour-preserving: identical decomposition (fixedCosts + transport(pax) +
  // perPaxCosts×pax), identical margin/rounding, and the same tour-leader cost.
  // The core calls transportAtPax(pax) for +0 and transportAtPax(pax+1) for +1,
  // reproducing the original two inline loops (and their hole-recording) exactly.
  const transportAtPax = (pax: number): number => {
    let transportCost = 0
    for (const info of transportInfoByDay) {
      if (!info.requiresTransport) continue

      const { needs } = info

      // Determine vehicle type for this pax count
      let vehicleType: VehicleType
      if (needs.useSpecialVehicle && needs.specialVehicleType) {
        vehicleType = needs.specialVehicleType
      } else {
        vehicleType = getVehicleTypeByPax(pax, info.city)
      }

      const match = findTransportRate(transportCache, {
        serviceType: needs.serviceType,
        city: info.city,
        duration: needs.duration,
        area: needs.area,
        vehicleType,
        originCity: itinerary[info.day - 2]?.city,
        destinationCity: info.city
      })

      if (match && match.source === 'db') {
        transportCost += match.rate.base_rate_eur
      } else {
        // No exact rate for THIS pax's vehicle size — record a hole, add nothing.
        addHole({
          kind: 'transport',
          reason: match ? 'fuzzy' : 'missing',
          tier,
          dayNumber: info.day,
          city: info.city,
          vehicleType,
          lookupAttempted: `${needs.serviceType}/${needs.duration} ${vehicleType} in ${info.city}`,
          message: `No exact transport rate for ${vehicleType} (${needs.serviceType}/${needs.duration}) in ${info.city}. Add it in Rates → Transportation.`,
        })
      }
    }
    return transportCost
  }

  const paxPricing: PaxPricingResult[] = priceAcrossPax({
    groupFixed: fixedCosts,
    perPerson: perPaxCosts,
    marginPercent,
    transportAt: transportAtPax,
    // Tour leader: single room (PPD + single supplement) + their own per-pax costs
    tourLeaderCost: accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax,
    paxFrom: PAX_COUNTS[0],
    paxTo: PAX_COUNTS[PAX_COUNTS.length - 1],
  })

  // ============================================
  // STEP 11: Return result
  // ============================================








  return {
    success: true,
    templateId,
    templateName: t.template_name,
    tier,
    totalDays,
    hotelNights,
    cruiseNights,
    singleSupplement: Math.round(singleSupplement * 100) / 100,
    tripleReduction: Math.round(tripleReduction * 100) / 100,
    services,
    paxPricing,
    complete: holes.length === 0,
    holes,
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
  /** Whose rates to price from — see DayPricingParams.tenantId. */
  tenantId: string
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
  // Harness Layer 1: deliverable ONLY when complete (no holes). See pricing-types.ts.
  complete: boolean
  holes: PricingHole[]
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





  const dayResult = await calculateDayBasedPricing({
    templateId,
    tenantId: params.tenantId,
    tier,
    isEurPassport,
    language,
    travelDate: params.travelDate,
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
      warnings: dayResult.warnings,
      complete: false,
      holes: dayResult.holes,
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




  if (tourLeaderIncluded) {

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
    tripleReduction: dayResult.tripleReduction,
    complete: dayResult.complete,
    holes: dayResult.holes,
  }
}

/**
 * HELPER: Calculate for multiple tiers (backward compatible)
 */
export async function calculateMultiTierPricing(
  templateId: string,
  tenantId: string,
  tiers: ServiceTier[],
  numPax: number,
  isEurPassport: boolean,
  options?: Partial<PricingParams>
): Promise<Map<ServiceTier, PricingResult>> {
  const results = new Map<ServiceTier, PricingResult>()

  for (const tier of tiers) {
    const result = await calculateAutoPricing({
      templateId,
      tenantId,
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
  tenantId: string,
  isEurPassport: boolean = true
): Promise<{ minPrice: number; maxPrice: number; tier: ServiceTier } | null> {
  const tiers: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

  const results = await calculateMultiTierPricing(
    templateId,
    tenantId,
    tiers,
    2,
    isEurPassport
  )

  let minPrice = Infinity
  let minTier: ServiceTier = 'standard'
  let maxPrice = 0

  for (const [tier, result] of results) {
    // Only definite (complete) prices feed the browse range — never an estimate
    // built on missing/fuzzy rates. Incomplete tiers are skipped.
    if (result.complete && result.success && result.pricePerPerson > 0) {
      if (result.pricePerPerson < minPrice) {
        minPrice = result.pricePerPerson
        minTier = tier
      }
      if (result.pricePerPerson > maxPrice) {
        maxPrice = result.pricePerPerson
      }
    }
  }

  // No tier is fully priced → "price unavailable" (caller shows that), never a guess.
  if (minPrice === Infinity) return null

  return { minPrice, maxPrice, tier: minTier }
}

export type MealPlan = 'none' | 'breakfast_only' | 'lunch_only' | 'dinner_only' | 'half_board' | 'full_board'