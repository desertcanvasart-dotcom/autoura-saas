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
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'
import { normalizeRateRows } from '@/lib/rates/rate-currency'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { seasonForDate, computeUplift, type SeasonWindow } from '@/lib/pricing/season-uplift'
import { resolveTravelDateRates } from '@/lib/rates/rate-seasons'
import { resolveEntranceRate } from '@/lib/pricing/entrance-rate'
import { loadAttractionAliasIndex, resolveAttractionAlias } from '@/lib/pricing/attraction-aliases'
import {
  collectTicketLegs, rowServesRoute, selectTicketRow,
  groupSleeperTrains, trainForNamedRow,
} from '@/lib/pricing/ticket-legs'
import type { RateSource, PricingHole } from './pricing-types'
import { getCatalogScope, catalogOrExpr, type CatalogScope } from '@/lib/catalog-scope'
import { presetTierFor, tierMultiplier, defaultTierKey, vehicleForPax, slugifyKey, type VehicleBand } from '@/lib/vocabulary'
import { tierLadderForTenant, vehicleBandsForTenant, vocabularyLabelsForTenant } from '@/lib/vocabulary-server'
import type { VocabularyKind } from '@/lib/vocabulary'
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

/** A key from the tenant's tier vocabulary (Settings → Your vocabulary); the
 *  four preset words are the Egypt default. Where the engine needs a notion of
 *  low / mid / high it maps the tenant's ladder onto the preset by POSITION
 *  (lib/vocabulary: presetTierFor). */
export type ServiceTier = string
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
  /** Explicit entrance_fees ids picked on the day editor (A-item 13). When
   *  present they WIN and silence the free-text `attractions` wording —
   *  an id is a decision, wording is a guess. */
  attraction_ids?: string[]
  /** How this day travels (B-item 2). Absent = road, exactly as before.
   *  flight/train legs run PREVIOUS day's city → this day's city; a
   *  sleeping train runs THIS day's city → the NEXT day's (board tonight,
   *  wake there) and forces no hotel bed that night — the ticket IS the
   *  bed. */
  transport_type?: 'flight' | 'train' | 'sleeping_train'
  /** The EXACT ticket row when several serve the route; named rows win. */
  transport_rate_id?: string
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
  /** What the customer is buying (lib/package-types.ts). Templates carry no
   *  package column yet, so callers usually omit this — full-package, the
   *  historical assumption. */
  packageType?: string
  /** Whose rates to price from. Scopes every rate lookup to this tenant's
   * rows (merged with the global catalog when the tenant's
   * use_global_catalog flag is on — see lib/catalog-scope.ts). */
  tenantId: string
  tier: ServiceTier
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
  // ---- Guide grades + the throughout guide (B-item 1) ----
  /** 'egyptologist' (default) or 'senior'. The default ask keeps the
   *  historical roster fallback; a non-default ask must match a real
   *  guide_rates row — hole, never a guess. */
  guideGrade?: GuideGrade
  /** 'spot' (default, historical: per-city guide on sightseeing days) or
   *  'throughout' (+1: one guide travels day 1 → end — a fee every day, a
   *  bed each night at the property's period guide rate, meals at group
   *  rates for small parties, one extra vehicle seat). */
  guideMode?: GuideMode
  /** The pax count the quote is FOR. Used only by the throughout guide's
   *  meal rule (guide eats at group rates when the party is ≤ 3); the
   *  multi-pax sheet keeps the line at all counts — a documented
   *  approximation, exactly as in the sibling. */
  requestedPax?: number
}

export type GuideGrade = 'egyptologist' | 'senior'
export type GuideMode = 'spot' | 'throughout'
export const DEFAULT_GUIDE_GRADE: GuideGrade = 'egyptologist'
/** The party size at and below which the throughout guide eats at group rates. */
export const GUIDE_MEALS_MAX_PAX = 3

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
export const VEHICLE_CAPACITY: Record<string, { min: number; max: number }> = {
  'Sedan': { min: 1, max: 2 },
  'Minivan': { min: 3, max: 7 },
  'Van': { min: 8, max: 14 },
  'Minibus': { min: 15, max: 20 },
  'Bus': { min: 21, max: 45 },
  'Horse Carriage': { min: 1, max: 4 }  // Special for Edfu
}

/** A vehicle key from the tenant's vocabulary ('sedan'); the built-in names
 *  above are the Egypt default. Matching is by slug, so 'Sedan' and 'sedan'
 *  are one vehicle. */
export type VehicleType = string

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

/** Vehicle types compare as slugs: a row saying 'Sedan' and a vocabulary key
 *  'sedan' are the same vehicle. */
const vehicleKey = (v: unknown) => slugifyKey(String(v ?? ''))

// The tenant's tier ladder and vehicle bands (Settings → Your vocabulary),
// memoised for a minute — a pricing run asks for them several times.
const VOCAB_TTL_MS = 60_000
const ladderMemo = new Map<string, { at: number; value: string[] }>()
const vehicleMemo = new Map<string, { at: number; value: VehicleBand[] }>()
const labelMemo = new Map<string, { at: number; value: Map<string, string> }>()
type VocabClient = Parameters<typeof tierLadderForTenant>[0]

async function tenantTierLadder(tenantId: string): Promise<string[]> {
  const hit = ladderMemo.get(tenantId)
  if (hit && Date.now() - hit.at < VOCAB_TTL_MS) return hit.value
  const value = await tierLadderForTenant(getSupabaseAdmin() as unknown as VocabClient, tenantId)
  ladderMemo.set(tenantId, { at: Date.now(), value })
  return value
}

async function tenantVehicleBands(tenantId: string): Promise<VehicleBand[]> {
  const hit = vehicleMemo.get(tenantId)
  if (hit && Date.now() - hit.at < VOCAB_TTL_MS) return hit.value
  const value = await vehicleBandsForTenant(getSupabaseAdmin() as unknown as VocabClient, tenantId)
  vehicleMemo.set(tenantId, { at: Date.now(), value })
  return value
}

/** The agency's word for a stored key of `kind`, for service names and
 *  hole messages ("Train ENR First Class", not "Train ENR first_class").
 *  A key the vocabulary does not know reads as itself. */
async function tenantVocabularyLabels(tenantId: string, kind: VocabularyKind): Promise<Map<string, string>> {
  const memoKey = `${tenantId}:${kind}`
  const hit = labelMemo.get(memoKey)
  if (hit && Date.now() - hit.at < VOCAB_TTL_MS) return hit.value
  const labels = await vocabularyLabelsForTenant(getSupabaseAdmin() as unknown as VocabClient, tenantId, kind)
  labelMemo.set(memoKey, { at: Date.now(), value: labels })
  return labels
}

async function tenantVocabularyLabeller(tenantId: string, kind: VocabularyKind): Promise<(key: string | null | undefined) => string> {
  const labels = await tenantVocabularyLabels(tenantId, kind)
  return key => (key ? (labels.get(key) ?? key) : '')
}

/** The stored KEY a request means. A quote says "English" (or "english",
 *  or whatever the agency renamed it to); rate rows store the key. Matches
 *  a key, a label, or the slug of either; falls back to the slug so a
 *  tenant without the vocabulary behaves as before. */
async function tenantVocabularyKey(tenantId: string, kind: VocabularyKind, value: string | null | undefined): Promise<string> {
  const raw = String(value ?? '').trim()
  if (!raw) return raw
  const labels = await tenantVocabularyLabels(tenantId, kind)
  if (labels.has(raw)) return raw
  const lower = raw.toLowerCase()
  for (const [k, l] of labels) if (l.toLowerCase() === lower) return k
  const slug = slugifyKey(raw)
  if (labels.has(slug)) return slug
  for (const [k, l] of labels) if (slugifyKey(l) === slug) return k
  return slug
}

/** Test seam: forget memoised vocabularies. */
export function clearVocabularyMemo() { ladderMemo.clear(); vehicleMemo.clear(); labelMemo.clear() }

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
export function getVehicleTypeByPax(totalPax: number, city?: string, bands?: VehicleBand[]): VehicleType {
  // Check for special vehicle cities first
  if (city && SPECIAL_VEHICLE_CITIES[city.toLowerCase()]) {
    return SPECIAL_VEHICLE_CITIES[city.toLowerCase()]
  }
  // The tenant's own vehicles, when it has defined their passenger bands.
  if (bands && bands.length > 0) {
    const key = vehicleForPax(bands, totalPax)
    if (key) return key
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
export function getTierCategory(tier: ServiceTier, ladder?: readonly string[]): string {
  const preset = ladder ? presetTierFor(ladder, tier) : tier
  if (preset === 'budget') return 'budget'
  if (preset === 'luxury') return 'luxury'
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
export function parseItinerary(itineraryData: any, opts?: {
  /** What the customer is buying. Gates the DEFAULT service flags below the
   *  same way the grid's completeness mask does (lib/package-types.ts): a
   *  product with no airport transfers must not default them onto days, and
   *  a product with no accommodation has no hotel check-ins to price.
   *  EXPLICIT day.services always win — same precedence as the grid.
   *  Omitted = full-package, the engine's historical assumption. */
  packageType?: string
}): ItineraryDay[] {
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

    // The defaults describe a FULL PACKAGE, so they are gated on what the
    // product actually includes. Two latent bugs lived here: a SINGLE-day
    // template with no explicit services defaulted airport arrival AND
    // departure AND hotel check-in AND check-out onto its one day — a day
    // tour priced like a whole package — and no product ever escaped the
    // full-package assumption. Explicit day.services still win.
    const pkgIncludes = PACKAGE_TYPE_CONFIGS.find(
      p => p.slug === (opts?.packageType ?? 'full-package')
    )?.includes ?? PACKAGE_TYPE_CONFIGS.find(p => p.slug === 'full-package')!.includes
    const isSingleDay = itineraryData.length === 1

    const services = day.services || {
      airport_arrival: pkgIncludes.airportTransfers && isFirstDay,
      airport_departure: pkgIncludes.airportTransfers && isLastDay,
      // A single-day trip has no overnight, so there is no hotel to check
      // into whatever the package says — day-use is an explicit flag.
      hotel_checkin: pkgIncludes.accommodation && !isSingleDay && isFirstDay,
      hotel_checkout: pkgIncludes.accommodation && !isSingleDay && isLastDay,
      guide_required: hasAttractions
    }

    // Extract attractions from title if not provided
    let attractions = day.attractions || []
    if (attractions.length === 0 && day.title) {
      attractions = extractAttractionsFromTitle(day.title)
    }

    // Explicit entrance-fee ids from the day editor (A-item 13).
    const attraction_ids: string[] = Array.isArray(day.attraction_ids)
      ? day.attraction_ids.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
      : []

    // Travel mode (B-item 2). Unknown values read as road — never a guess.
    const transport_type =
      day.transport_type === 'flight' || day.transport_type === 'train' || day.transport_type === 'sleeping_train'
        ? day.transport_type
        : undefined
    const transport_rate_id =
      typeof day.transport_rate_id === 'string' && day.transport_rate_id.length > 0
        ? day.transport_rate_id
        : undefined

    return {
      day: day.day || index + 1,
      title: day.title || `Day ${index + 1}`,
      description: day.description || '',
      city: day.city || inferCityFromTitle(day.title || ''),
      // A sleeping-train night has no hotel bed — the ticket IS the bed
      // (B-item 2); the sleeper night joins the rooming list instead.
      accommodation_type: transport_type === 'sleeping_train'
        ? 'none'
        : (day.accommodation_type || inferAccommodationType(day, itineraryData)),
      meals,
      attractions,
      attraction_ids,
      transport_type,
      transport_rate_id,
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
  /** The throughout guide's cabin for one night, from the resolved period's
   *  guide_rate_eur (B-item 1). Null = no concession on file — a pricing
   *  hole in throughout mode, never a free bed. */
  guideBedNight?: number | null
  /** Set when the row HAS stored contract periods and none covers the travel
   *  date — a pricing hole naming the uncovered night, never a base-column
   *  fallback (the base columns mirror the FIRST period's rate). */
  periodGap?: { propertyName: string; date: string }
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

    const { data: rawCruises, error } = await query.limit(1)
    const cruises = await normalizeRateRows(getSupabaseAdmin(), 'nile_cruises', rawCruises, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
    let guideBedNight: number | null = null
    let season: 'low' | 'high' | 'peak' = 'low'

    // C3.2: dated rate periods first. `seasons` (migration 305) is the
    // operator's real contract windows, WITH years — the low/high/peak
    // detection below compares month-day only, so a window entered for one
    // contract year silently applied to every year after it. Only a row with
    // NO stored periods falls through to the legacy columns: a stored
    // contract whose windows don't cover the night is a GAP — the base
    // columns mirror the FIRST period's rate, so falling through would price
    // an uncovered October night at the summer rate and call it complete.
    const cruisePeriod = resolveTravelDateRates(cruise, 'cruise', travelDate)
    if (cruisePeriod.kind === 'gap') {
      return {
        shipName: cruise.ship_name,
        ppdNight: 0,
        singleSuppNight: 0,
        tripleRedNight: 0,
        durationNights,
        season: 'low',
        source: 'missing',
        periodGap: { propertyName: cruise.ship_name || 'this cruise', date: cruisePeriod.travelDate },
      }
    }
    if (cruisePeriod.kind === 'period') {
      ppdNight = cruisePeriod.rates.ppd_eur
      singleSuppNight = cruisePeriod.rates.single_supplement_eur
      tripleRedNight = cruisePeriod.rates.triple_reduction_eur
      // Guide cabin: 0 in a period means "no concession entered" (the
      // sanitizer stores blanks as 0) — null here, a hole upstream.
      guideBedNight = cruisePeriod.rates.guide_rate_eur > 0 ? cruisePeriod.rates.guide_rate_eur : null
      // The old three-level label is kept for the result shape; a named
      // period is reported as its own name by the caller.
      season = 'low'
    } else if (cruise.ppd_eur !== null && cruise.ppd_eur !== undefined) {
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
      // Legacy model — whole-trip PER-PERSON rates (double occupancy), the
      // sibling's stated semantics and this repo's hotel convention. The
      // old code divided rate_double_eur by 2 as if it were a cabin rate,
      // which HALVED every legacy cruise price.
      const ppdTrip = cruise.rate_double_eur
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
      guideBedNight,
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
  /** The throughout guide's bed for one night, from the resolved period's
   *  guide_rate_eur (B-item 1). Null = no concession on file — a pricing
   *  hole in throughout mode, never a free bed. */
  guideBedNight?: number | null
  /** Set when the row HAS stored contract periods and none covers the travel
   *  date — a pricing hole naming the uncovered night, never a base-column
   *  fallback (the base columns mirror the FIRST period's rate). */
  periodGap?: { propertyName: string; date: string }
} | null> {
  const cityNorm = city.trim().toLowerCase()

  const mapRow = (hotel: any, source: RateSource) => {
    // C3.2: dated rate periods first — real contract windows with years.
    // detectHotelSeason below compares month-day only, so a window entered
    // for one contract year silently applied to every year after it. A row
    // with stored periods that don't cover the night is a GAP, not a
    // fall-through: the base columns mirror the FIRST period's rate, so the
    // old fallback priced an uncovered October night at the summer rate.
    const period = resolveTravelDateRates(hotel, 'accommodation', travelDate)
    if (period.kind === 'gap') {
      const name = hotel.property_name || hotel.name
      return {
        hotelName: name,
        ppdNight: 0,
        singleSuppNight: 0,
        tripleRedNight: 0,
        season: 'low' as const,
        source: 'missing' as RateSource,
        periodGap: { propertyName: name || 'this hotel', date: period.travelDate },
      }
    }
    if (period.kind === 'period') {
      return {
        hotelName: hotel.property_name || hotel.name,
        ppdNight: period.rates.ppd_eur,
        singleSuppNight: Math.max(0, period.rates.single_supplement_eur),
        tripleRedNight: Math.max(0, period.rates.triple_reduction_eur),
        // 0 = blank in the editor (the sanitizer's convention) = no
        // concession — null here, a hole upstream in throughout mode.
        guideBedNight: period.rates.guide_rate_eur > 0 ? period.rates.guide_rate_eur : null,
        season: 'low' as const,
        source,
      }
    }

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
      // Legacy rows carry no guide-bed concession at all.
      guideBedNight: null,
      season,
      source,
    }
  }

  try {
    // Primary: exact tier; city matched by ilike (substring).
    const { data: rawHotels, error } = await getSupabaseAdmin()
      .from('accommodation_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('tier', tier)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1)
    const hotels = await normalizeRateRows(getSupabaseAdmin(), 'accommodation_rates', rawHotels, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

    if (!error && hotels && hotels.length > 0) {
      const hotel = hotels[0] as any
      // ilike can match a DIFFERENT city ("Cairo" ~ "New Cairo"). Only an exact
      // city name (case-insensitive) counts as a definite 'db' match; otherwise
      // it is a fuzzy match and must be confirmed (treated as a hole).
      const exactCity = String(hotel.city ?? '').trim().toLowerCase() === cityNorm
      return mapRow(hotel, exactCity ? 'db' : 'fuzzy')
    }

    // Fallback: any tier for this city — wrong tier ⇒ fuzzy, never deliverable.
    const { data: rawAnyHotel } = await getSupabaseAdmin()
      .from('accommodation_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .limit(1)
    const anyHotel = await normalizeRateRows(getSupabaseAdmin(), 'accommodation_rates', rawAnyHotel, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
 * Get an entrance fee by its ID — the picker's path (A-item 13).
 *
 * An id is a decision: no ilike, no keyword fallback, no alias. A missing
 * or deactivated id returns null so the caller records a hole telling the
 * operator to re-pick — never a guess at what they might have meant.
 * source is always 'db': the row was chosen by hand.
 */
export async function getEntranceFeeById(
  scope: CatalogScope,
  id: string,
  isEurPassport: boolean
): Promise<{ id: string; name: string; rate: number; source: RateSource } | null> {
  try {
    let { data: fees } = await getSupabaseAdmin()
      .from('entrance_fees')
      .select('id, attraction_name, eur_rate, non_eur_rate, egyptian_rate, rate_currency, is_active')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .eq('id', id)
      .limit(1)

    if (!fees || fees.length === 0) return null

    fees = await normalizeRateRows(getSupabaseAdmin(), 'entrance_fees', fees, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))
    const fee = fees[0] as { id: string; attraction_name: string; eur_rate: number | null; non_eur_rate: number | null }
    // NULL = not priced yet (hole); 0 = genuinely free — see getEntranceFee.
    const rate = resolveEntranceRate(fee, isEurPassport)
    if (rate === null) return null

    return { id: fee.id, name: fee.attraction_name, rate, source: 'db' }
  } catch (err) {
    console.error('Error fetching entrance fee by id:', err)
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
      .select('*')
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
          .select('*')
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

    fees = await normalizeRateRows(getSupabaseAdmin(), 'entrance_fees', fees, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))
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
/**
 * Get the guide rate for a language, grade and duration (B-item 1).
 *
 * The RATE table (guide_rates: guide_language + guide_type as the grade
 * axis + tour_duration as the fee kind) is asked FIRST. The critical
 * semantics, ported from the sibling:
 *
 *   - the DEFAULT ask (egyptologist / full_day) keeps the historical
 *     roster fallback below, so ungraded installs price exactly as before;
 *   - a NON-DEFAULT ask (senior, meet_greet) must match a real row —
 *     null (a hole), never a guess from the roster or another grade.
 */
export async function getGuideRate(
  scope: CatalogScope,
  language: string,
  tier: ServiceTier,
  opts?: { grade?: GuideGrade; duration?: 'full_day' | 'half_day' | 'meet_greet' }
): Promise<{ id: string; name: string; dailyRate: number; source: RateSource } | null> {
  const grade = opts?.grade ?? DEFAULT_GUIDE_GRADE
  const duration = opts?.duration ?? 'full_day'
  const isDefaultAsk = grade === DEFAULT_GUIDE_GRADE && duration === 'full_day'
  try {
    // ---- guide_rates: the rate table, matched exactly ----
    // The quote names a language; rows store the vocabulary KEY (346).
    const languageKey = await tenantVocabularyKey(scope.tenantId, 'guide_language', language)
    const { data: rawRateRows } = await getSupabaseAdmin()
      .from('guide_rates')
      .select('id, guide_language, guide_type, tour_duration, full_day_rate, half_day_rate, base_rate_eur, base_rate_non_eur, rate_currency, is_active')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .ilike('guide_language', languageKey)
      .eq('guide_type', grade)
      .eq('tour_duration', duration)
      .order('full_day_rate', { ascending: true })
      .limit(1)
    const rateRows = await normalizeRateRows(getSupabaseAdmin(), 'guide_rates', rawRateRows, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))
    if (rateRows && rateRows.length > 0) {
      const r = rateRows[0] as any
      const rate = r.full_day_rate ?? r.base_rate_eur
      if (typeof rate === 'number' && rate > 0) {
        return {
          id: r.id,
          name: `${language} ${grade === 'senior' ? 'Senior ' : ''}Guide`,
          dailyRate: rate,
          source: 'db',
        }
      }
    }

    // A non-default ask stops here: senior or Meet & Assist without a row
    // is a HOLE naming what to add — pricing an egyptologist as a senior
    // (or a full day as a meet & greet) would be a silent wrong number.
    if (!isDefaultAsk) return null

    const { data: rawGuides, error } = await getSupabaseAdmin()
      .from('guides')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .contains('languages', [language])
      .order('is_preferred', { ascending: false })
    const guides = await normalizeRateRows(getSupabaseAdmin(), 'guides', rawGuides, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
    const { data: rawAnyGuide } = await getSupabaseAdmin()
      .from('guides')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)
    const anyGuide = await normalizeRateRows(getSupabaseAdmin(), 'guides', rawAnyGuide, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
    const { data: rawMealRows } = await getSupabaseAdmin()
      .from('meal_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
      .eq('tier', tier)
    const mealRows = await normalizeRateRows(getSupabaseAdmin(), 'meal_rates', rawMealRows, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
export type HotelServiceType = 'checkin_assist' | 'checkout_assist' | 'porter' | 'full_service' | 'concierge'

/** Human labels for the service levels, used on line items and holes. */
const AIRPORT_LEVEL_LABEL: Record<AirportServiceType, string> = {
  meet_greet: 'Meet & Greet',
  customs_assist: 'Customs Assistance',
  full_service: 'Full Service',
  vip_service: 'VIP Service',
}
const HOTEL_LEVEL_LABEL: Record<HotelServiceType, string> = {
  checkin_assist: 'Check-in Assistance',
  checkout_assist: 'Check-out Assistance',
  porter: 'Porter',
  full_service: 'Full Service',
  concierge: 'Concierge',
}

// Check-out used to be conflated with the porter row (its label read
// "Check-out & Porter" while the data said luggage-only). checkout_assist is
// its own type now; a tenant whose table predates it still prices from the
// legacy rows in this order — the engine asks for the real thing FIRST and
// accepts the historical shapes (A-item 19).
const HOTEL_LEVEL_FALLBACK: Partial<Record<HotelServiceType, HotelServiceType[]>> = {
  checkout_assist: ['porter', 'full_service'],
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
    const { data: rawAirportRates } = await getSupabaseAdmin()
      .from('airport_staff_rates')
      .select('*')
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
    const rates = await normalizeRateRows(getSupabaseAdmin(), 'airport_staff_rates', rawAirportRates, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

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
    const category = getTierCategory(tier, await tenantTierLadder(scope.tenantId))

    const lookup = async (type: HotelServiceType): Promise<number | null> => {
      const { data: rawHotelStaffRates } = await getSupabaseAdmin()
        .from('hotel_staff_rates')
        .select('*')
        .or(catalogOrExpr(scope))
        .eq('is_active', true)
        .eq('service_type', type)
        .or(`hotel_category.eq.${category},hotel_category.eq.all`)
        // Unambiguous on today's data (service_type + category resolves to one
        // row), but ordered anyway so it cannot become arbitrary the day a
        // second row is added.
        .order('rate_eur', { ascending: true })
        .limit(1)
      const rates = await normalizeRateRows(getSupabaseAdmin(), 'hotel_staff_rates', rawHotelStaffRates, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))
      if (!rates || rates.length === 0) return null
      const rate = (rates[0] as any).rate_eur
      return typeof rate === 'number' ? rate : null
    }

    const direct = await lookup(serviceType)
    if (direct != null) return direct
    // The asked type first, then the legacy rows it grew out of — a tenant
    // holding only porter/full_service rows keeps pricing check-out days.
    for (const legacy of HOTEL_LEVEL_FALLBACK[serviceType] ?? []) {
      const rate = await lookup(legacy)
      if (rate != null) return rate
    }
    return null
  } catch (err) {
    return null
  }
}

/**
 * Get tipping rate per day
 */
/** Resolves the daily tip total for one city. */
export interface TippingRateResolver {
  /** Total for a city; null when no rate applies (a hole, never a zero). */
  forCity: (city?: string | null) => number | null
}

/**
 * Get the daily tipping total, resolved PER CITY.
 *
 * Tips are place-specific: what a driver is tipped in Cairo is not what a
 * driver is tipped in Aswan. A row with no city means "anywhere", which is
 * what every row meant before the column existed.
 *
 * The subtlety is that this used to sum EVERY active per-day row. Add cities
 * to that and a trip charges the Cairo driver tip AND the Aswan driver tip on
 * every single day. So rows are grouped by role+context and exactly ONE is
 * charged per group: the city's own rate if it has one, else the country-wide
 * rate, else nothing for that group.
 */
export async function getTippingRates(
  scope: CatalogScope,
  tier: ServiceTier
): Promise<TippingRateResolver | null> {
  try {
    const { data: rawTippingRates } = await getSupabaseAdmin()
      .from('tipping_rates')
      .select('*')
      .or(catalogOrExpr(scope))
      .eq('is_active', true)
    const rates = await normalizeRateRows(getSupabaseAdmin(), 'tipping_rates', rawTippingRates, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

    if (!rates || rates.length === 0) {
      return null
    }

    // By position on the tenant's ladder: lowest tier 0.8 … highest 1.5.
    const multiplier = tierMultiplier(await tenantTierLadder(scope.tenantId), tier)

    const perDay = (rates as any[]).filter(r => r.rate_unit === 'per_day')
    const groups = new Map<string, any[]>()
    for (const r of perDay) {
      const key = `${r.role_type ?? ''}|${r.context ?? ''}`
      groups.set(key, [...(groups.get(key) ?? []), r])
    }

    const norm = (c?: string | null) => (c || '').trim().toLowerCase()

    return {
      forCity: (city?: string | null) => {
        const here = norm(city)
        let dailyTotal = 0
        for (const [, rows] of groups) {
          const match =
            (here !== '' ? rows.find(r => norm(r.city) === here) : undefined) ??
            rows.find(r => !r.city)
          if (match) dailyTotal += match.rate_eur || 0
        }
        // 0 means there were rows but none applied here — a hole, not free.
        return Math.round(dailyTotal * multiplier) || null
      },
    }
  } catch (err) {
    return null
  }
}

/**
 * Country-wide daily tip total. Kept as the canonical single-value lookup
 * (lib/pricing/rate-resolution.ts re-exports it); pricing runs use
 * getTippingRates() so each day resolves against its own city.
 */
export async function getTippingRate(
  scope: CatalogScope,
  tier: ServiceTier,
  city?: string | null
): Promise<number | null> {
  const resolver = await getTippingRates(scope, tier)
  return resolver ? resolver.forCity(city) : null
}

// ============================================
// SMART TRANSPORT RATE LOOKUP
// ============================================

/**
 * Build transport cache from database
 * Key format: "service_type|city|duration|area|vehicle_type"
 */
export async function buildTransportCache(scope: CatalogScope): Promise<Map<string, TransportRate>> {
  const { data: rawAllRates } = await getSupabaseAdmin()
    .from('transportation_rates')
    .select('*')
    .or(catalogOrExpr(scope))
    .eq('is_active', true)
  const allRates = await normalizeRateRows(getSupabaseAdmin(), 'transportation_rates', rawAllRates, await getTenantRunCurrency(getSupabaseAdmin(), scope.tenantId))

  const cache = new Map<string, TransportRate>()

  if (!allRates) return cache

  for (const row of allRates) {
    // One row per (route, vehicle) — migration 337 made the tall shape the
    // only shape. The capacity band is the row's own.
    for (const r of [row]) {
    const rate = r as any
    // Build multiple keys for flexible lookup
    const baseKey = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      rate.area || '',
      vehicleKey(rate.vehicle_type)
    ].join('|')

    cache.set(baseKey, rate)

    // Also cache without area for fallback
    const keyNoArea = [
      rate.service_type || '',
      (rate.city || '').toLowerCase(),
      rate.duration || '',
      '',
      vehicleKey(rate.vehicle_type)
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
        vehicleKey(rate.vehicle_type)
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
  const exactKey = [serviceType, cityLower, duration, area || '', vehicleKey(vehicleType)].join('|')
  if (cache.has(exactKey)) {
    return { rate: cache.get(exactKey)!, source: 'db' }
  }

  // Priority 2: Match without area — still definite (area is optional metadata).
  const noAreaKey = [serviceType, cityLower, duration, '', vehicleKey(vehicleType)].join('|')
  if (cache.has(noAreaKey)) {
    return { rate: cache.get(noAreaKey)!, source: 'db' }
  }

  // Priority 4: Intercity route match (origin→destination) — definite for transfers.
  if (serviceType === 'intercity_transfer' && originCity && destinationCity) {
    const intercityKey = ['intercity_transfer', originCity.toLowerCase(), destinationCity.toLowerCase(), vehicleKey(vehicleType)].join('|')
    if (cache.has(intercityKey)) {
      return { rate: cache.get(intercityKey)!, source: 'db' }
    }
  }

  // Priority 3: Match without duration — APPROXIMATE (different trip length).
  const noDurationKey = [serviceType, cityLower, '', '', vehicleKey(vehicleType)].join('|')
  if (cache.has(noDurationKey)) {
    return { rate: cache.get(noDurationKey)!, source: 'fuzzy' }
  }

  // Priority 5: Nearby-city substitution (e.g. Luxor for Edfu) — APPROXIMATE.
  const fallbackCities = ['luxor', 'aswan', 'cairo']
  for (const fallbackCity of fallbackCities) {
    if (fallbackCity === cityLower) continue

    const fallbackKey = [serviceType, fallbackCity, duration, '', vehicleKey(vehicleType)].join('|')
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
    marginPercent = 25,
    guideGrade = DEFAULT_GUIDE_GRADE,
    guideMode = 'spot',
    requestedPax
  } = params
  const throughoutGuide = guideMode === 'throughout'

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


  // The template's own tour_type is a package signal the engine always
  // SELECTed and never read: a 'day_tour' (or half_day / stopover) is by
  // definition a day trip — no accommodation, no airport transfers sold —
  // yet it priced full-package shaped. An explicit packageType from the
  // caller still wins.
  const SINGLE_DAY_TOUR_TYPES = ['day_tour', 'half_day', 'stopover']
  const effectivePackageType =
    (params as { packageType?: string }).packageType ??
    (SINGLE_DAY_TOUR_TYPES.includes(t.tour_type ?? '') ? 'day-trips' : undefined)

  const itinerary = parseItinerary(t.itinerary, { packageType: effectivePackageType })
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
  const vehicleBands = await tenantVehicleBands(tenantId)

  // ============================================
  // STEP 4: Fetch all required rates
  // ============================================

  let cruiseRates: NonNullable<Awaited<ReturnType<typeof getCruiseRates>>> | null = null
  if (cruiseNights > 0) {
    const firstCruiseDay = cruiseDays[0]
    const cr = await getCruiseRates(catalogScope, tier, firstCruiseDay?.city, travelDate)
    if (cr && cr.source === 'db') {
      cruiseRates = cr
    } else if (cr?.periodGap) {
      // The cruise EXISTS and has contract periods — the travel date falls in
      // a gap between them. One hole naming the uncovered date; never the
      // base columns, which hold the first period's rate.
      addHole({
        kind: 'cruise',
        reason: 'missing',
        tier,
        city: firstCruiseDay?.city,
        lookupAttempted: `cruise rate period covering ${cr.periodGap.date} (${tier})`,
        message: `${cr.periodGap.propertyName} has rate periods, but none covers ${cr.periodGap.date}. Add a period for that date in Rates → Cruises.`,
      })
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
    } else if (rates?.periodGap) {
      // The hotel EXISTS and has contract periods — the travel date falls in
      // a gap between them. One hole per property naming the uncovered date;
      // never the base columns, which hold the first period's rate.
      addHole({
        kind: 'hotel',
        reason: 'missing',
        tier,
        city,
        lookupAttempted: `hotel rate period covering ${rates.periodGap.date} (${city}, ${tier})`,
        message: `${rates.periodGap.propertyName} has rate periods, but none covers ${rates.periodGap.date}. Add a period for that date in Rates → Hotels.`,
      })
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
  const [guideRate, guideMeetRate, mealRates, tippingRates, fixedDailyCosts] = await Promise.all([
    getGuideRate(catalogScope, language, tier, { grade: guideGrade }),
    // The throughout guide's cheaper fee for meet/goodbye/transit days.
    // Only fetched when asked for — and it must be a REAL row: pricing a
    // meet & assist day at the full-day rate would be a silent guess.
    throughoutGuide
      ? getGuideRate(catalogScope, language, tier, { grade: guideGrade, duration: 'meet_greet' })
      : Promise.resolve(null),
    getMealRates(catalogScope, tier),
    getTippingRates(catalogScope, tier),
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

  // ----- THROUGHOUT GUIDE: bed each night (fixed) — B-item 1 -----
  // From that night's period guide_rate ("Guide Bed / Night" on the rate
  // periods). One hole per property when the concession is blank — a
  // missing guide bed is a gap in the contract data, never a free bed.
  let guideBedCosts = 0
  const guideBedLines: PricedService[] = []
  if (throughoutGuide) {
    const holedBedCities = new Set<string>()
    for (const day of hotelDays) {
      const hotelRate = hotelRatesMap.get(day.city)
      if (!hotelRate) continue // the hotel itself is already a hole (STEP 4)
      if (hotelRate.guideBedNight != null) {
        guideBedCosts += hotelRate.guideBedNight
        guideBedLines.push({
          id: `day${day.day}-guide-bed`,
          dayNumber: day.day,
          serviceType: 'accommodation',
          serviceName: `Throughout Guide — bed (${hotelRate.hotelName})`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: hotelRate.guideBedNight,
          lineTotal: hotelRate.guideBedNight,
          rateSource: 'accommodation_rates',
          isPerPax: false,
          isOptional: false,
        })
      } else if (!holedBedCities.has(day.city)) {
        holedBedCities.add(day.city)
        addHole({
          kind: 'hotel',
          reason: 'missing',
          tier,
          city: day.city,
          lookupAttempted: `guide bed rate (${hotelRate.hotelName})`,
          message: `${hotelRate.hotelName} has no "Guide Bed / Night" on its rate periods — the throughout guide's bed cannot be priced. Add it in Rates → Hotels.`,
        })
      }
    }
    if (cruiseRates && cruiseNights > 0) {
      if (cruiseRates.guideBedNight != null) {
        guideBedCosts += cruiseRates.guideBedNight * cruiseNights
        guideBedLines.push({
          id: `cruise-guide-bed`,
          dayNumber: cruiseDays[0]?.day ?? 1,
          serviceType: 'cruise',
          serviceName: `Throughout Guide — cabin (${cruiseRates.shipName})`,
          quantity: cruiseNights,
          quantityMode: 'fixed',
          unitCost: cruiseRates.guideBedNight,
          lineTotal: cruiseRates.guideBedNight * cruiseNights,
          rateSource: 'nile_cruises',
          isPerPax: false,
          isOptional: false,
        })
      } else {
        addHole({
          kind: 'cruise',
          reason: 'missing',
          tier,
          lookupAttempted: `guide cabin rate (${cruiseRates.shipName})`,
          message: `${cruiseRates.shipName} has no "Guide Bed / Night" on its rate periods — the throughout guide's cabin cannot be priced. Add it in Rates → Cruises.`,
        })
      }
    }
  }





  // ============================================
  // TICKET LEGS (B-item 2): flights, day trains, sleeping trains
  // ============================================
  // Legs collected from the parsed days; only the needed catalogues are
  // fetched, currency-normalized. Selection never guesses: named row →
  // exactly one active match → a hole listing the candidates by name.
  // Fares are per-person and sit in per-pax tour cost — so age-based child
  // discounts apply to them (the sibling's documented simplification).
  const ticketLegs = collectTicketLegs(itinerary)
  let ticketFaresPerPax = 0
  let ticketGuideSeatCost = 0
  const ticketGuideLines: PricedService[] = []
  if (ticketLegs.length > 0) {
    const runCurrencyForTickets = await getTenantRunCurrency(getSupabaseAdmin(), catalogScope.tenantId)
    const passengerFare = (eur: unknown, nonEur: unknown): number | null => {
      const v = isEurPassport ? eur : (nonEur ?? eur)
      return typeof v === 'number' && v >= 0 ? v : null
    }
    const validFor = (row: { rate_valid_from?: string | null; rate_valid_to?: string | null }): boolean =>
      !travelDate ||
      ((!row.rate_valid_from || row.rate_valid_from <= travelDate) &&
        (!row.rate_valid_to || row.rate_valid_to >= travelDate))

    const TICKET_COLUMNS = {
      flight_rates:
        'id, airline, flight_number, cabin_class, route_from, route_to, base_rate_eur, tax_eur, base_rate_non_eur, tax_non_eur, guide_rate, rate_valid_from, rate_valid_to, rate_currency, is_active',
      train_rates:
        'id, origin_city, destination_city, operator_name, class_type, rate_eur, guide_rate, rate_valid_from, rate_valid_to, rate_currency, is_active',
      sleeping_train_rates:
        'id, origin_city, destination_city, operator_name, supplier_id, cabin_type, rate_oneway_eur, rate_oneway_non_eur, guide_rate, rate_valid_from, rate_valid_to, rate_currency, is_active',
    } as const
    const fetchMode = async (table: keyof typeof TICKET_COLUMNS) => {
      const { data } = await getSupabaseAdmin()
        .from(table)
        .select(TICKET_COLUMNS[table])
        .or(catalogOrExpr(catalogScope))
        .eq('is_active', true)
      return normalizeRateRows(getSupabaseAdmin(), table, (data ?? []) as unknown as Record<string, unknown>[], runCurrencyForTickets)
    }
    const [flightRows, trainRows, sleeperRows] = await Promise.all([
      ticketLegs.some(l => l.mode === 'flight') ? fetchMode('flight_rates') : Promise.resolve([]),
      ticketLegs.some(l => l.mode === 'train') ? fetchMode('train_rates') : Promise.resolve([]),
      ticketLegs.some(l => l.mode === 'sleeping_train') ? fetchMode('sleeping_train_rates') : Promise.resolve([]),
    ])

    const MODE_RATES_PAGE = { flight: 'Rates → Flights', train: 'Rates → Trains', sleeping_train: 'Rates → Sleeping Trains' } as const

    interface FlightTicketRow {
      id: string; airline: string; flight_number?: string | null; cabin_class?: string | null
      route_from: string; route_to: string
      base_rate_eur: number | null; tax_eur: number | null
      base_rate_non_eur: number | null; tax_non_eur: number | null
      guide_rate?: number | null; rate_valid_from?: string | null; rate_valid_to?: string | null
    }
    interface TrainTicketRow {
      id: string; origin_city: string; destination_city: string
      operator_name?: string | null; class_type?: string | null
      rate_eur: number | null; guide_rate?: number | null
      rate_valid_from?: string | null; rate_valid_to?: string | null
    }

    // Day-train classes in the agency's words (Settings → Your vocabulary).
    const trainClassLabel = ticketLegs.some(l => l.mode === 'train')
      ? await tenantVocabularyLabeller(catalogScope.tenantId, 'train_class')
      : (key: string | null | undefined) => key ?? ''

    for (const leg of ticketLegs) {
      const route = `${leg.from} → ${leg.to}`
      const addLegHole = (message: string, lookup: string) =>
        addHole({
          kind: 'transport',
          reason: 'missing',
          tier,
          dayNumber: leg.dayNumber,
          lookupAttempted: lookup,
          message,
        })

      if (leg.mode === 'flight') {
        // Always the ECONOMY cabin; legacy rows with no cabin_class count
        // as economy — a premium row never auto-resolves.
        const candidates = (flightRows as unknown as FlightTicketRow[]).filter(
          r => rowServesRoute(r, leg) && validFor(r) && (!r.cabin_class || /econom/i.test(r.cabin_class))
        )
        const sel = selectTicketRow(candidates, leg.namedRateId, r => `${r.airline}${r.flight_number ? ` ${r.flight_number}` : ''}${r.cabin_class ? ` (${r.cabin_class})` : ''}`)
        if (sel.kind === 'named_missing') {
          addLegHole(`Day ${leg.dayNumber}'s picked flight is no longer in ${MODE_RATES_PAGE.flight} — re-pick it on the day editor.`, `flight id ${sel.namedId}`)
          continue
        }
        if (sel.kind === 'no_rate') {
          addLegHole(`No economy flight rate for ${route}. Add it in ${MODE_RATES_PAGE.flight}.`, `flight ${route}`)
          continue
        }
        if (sel.kind === 'ambiguous') {
          addLegHole(`Several flights serve ${route}: ${sel.candidates.join(', ')}. Pick the exact flight on day ${leg.dayNumber}.`, `flight ${route}`)
          continue
        }
        const r = sel.row
        const base = passengerFare(r.base_rate_eur, r.base_rate_non_eur)
        if (base === null) {
          addLegHole(`The ${r.airline} flight for ${route} has no fare yet. Price it in ${MODE_RATES_PAGE.flight}.`, `flight ${route}`)
          continue
        }
        const tax = passengerFare(r.tax_eur, r.tax_non_eur) ?? 0
        const farePerPax = base + tax
        ticketFaresPerPax += farePerPax
        services.push({
          id: `day${leg.dayNumber}-flight-${r.id}`,
          dayNumber: leg.dayNumber,
          serviceType: 'flight',
          serviceName: `Flight ${r.airline}${r.flight_number ? ` ${r.flight_number}` : ''} ${route} (economy)`,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: farePerPax,
          lineTotal: farePerPax,
          rateSource: 'flight_rates',
          isPerPax: true,
          isOptional: false,
        })
        if (throughoutGuide) {
          const seat = typeof r.guide_rate === 'number' ? r.guide_rate : farePerPax
          ticketGuideSeatCost += seat
          ticketGuideLines.push({
            id: `day${leg.dayNumber}-guide-flight-${r.id}`,
            dayNumber: leg.dayNumber,
            serviceType: 'flight',
            serviceName: `Throughout Guide — flight seat (${route})`,
            quantity: 1,
            quantityMode: 'fixed',
            unitCost: seat,
            lineTotal: seat,
            rateSource: 'flight_rates',
            isPerPax: false,
            isOptional: false,
          })
        }
      } else if (leg.mode === 'train') {
        const candidates = (trainRows as unknown as TrainTicketRow[]).filter(r => rowServesRoute(r, leg) && validFor(r))
        const sel = selectTicketRow(candidates, leg.namedRateId, r => `${r.operator_name || 'Train'}${r.class_type ? ` ${trainClassLabel(r.class_type)}` : ''}`)
        if (sel.kind === 'named_missing') {
          addLegHole(`Day ${leg.dayNumber}'s picked train is no longer in ${MODE_RATES_PAGE.train} — re-pick it on the day editor.`, `train id ${sel.namedId}`)
          continue
        }
        if (sel.kind === 'no_rate') {
          addLegHole(`No train rate for ${route}. Add it in ${MODE_RATES_PAGE.train}.`, `train ${route}`)
          continue
        }
        if (sel.kind === 'ambiguous') {
          addLegHole(`Several trains serve ${route}: ${sel.candidates.join(', ')}. Pick the exact train on day ${leg.dayNumber}.`, `train ${route}`)
          continue
        }
        const r = sel.row
        const farePerPax = typeof r.rate_eur === 'number' && r.rate_eur >= 0 ? r.rate_eur : null
        if (farePerPax === null) {
          addLegHole(`The ${r.operator_name || 'train'} for ${route} has no fare yet. Price it in ${MODE_RATES_PAGE.train}.`, `train ${route}`)
          continue
        }
        ticketFaresPerPax += farePerPax
        services.push({
          id: `day${leg.dayNumber}-train-${r.id}`,
          dayNumber: leg.dayNumber,
          serviceType: 'transportation',
          serviceName: `Train ${r.operator_name || ''} ${route}${r.class_type ? ` (${trainClassLabel(r.class_type)})` : ''}`.replace(/\s+/g, ' ').trim(),
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: farePerPax,
          lineTotal: farePerPax,
          rateSource: 'train_rates',
          isPerPax: true,
          isOptional: false,
        })
        if (throughoutGuide) {
          const seat = typeof r.guide_rate === 'number' ? r.guide_rate : farePerPax
          ticketGuideSeatCost += seat
          ticketGuideLines.push({
            id: `day${leg.dayNumber}-guide-train-${r.id}`,
            dayNumber: leg.dayNumber,
            serviceType: 'transportation',
            serviceName: `Throughout Guide — train seat (${route})`,
            quantity: 1,
            quantityMode: 'fixed',
            unitCost: seat,
            lineTotal: seat,
            rateSource: 'train_rates',
            isPerPax: false,
            isOptional: false,
          })
        }
      } else {
        // ----- SLEEPING TRAIN: the ticket IS the bed -----
        const routeRows = (sleeperRows as unknown as import('@/lib/pricing/ticket-legs').SleeperCabinRow[]).filter(r => rowServesRoute(r, leg) && validFor(r as { rate_valid_from?: string | null; rate_valid_to?: string | null }))
        const trains = groupSleeperTrains(routeRows)
        let train = null
        if (leg.namedRateId) {
          train = trainForNamedRow(trains, leg.namedRateId)
          if (!train) {
            addLegHole(`Day ${leg.dayNumber}'s picked sleeping train is no longer in ${MODE_RATES_PAGE.sleeping_train} — re-pick it on the day editor.`, `sleeping train id ${leg.namedRateId}`)
            continue
          }
        } else if (trains.length === 0) {
          addLegHole(`No sleeping-train rate for ${route}. Add it in ${MODE_RATES_PAGE.sleeping_train}.`, `sleeping train ${route}`)
          continue
        } else if (trains.length > 1) {
          addLegHole(`Several sleeping trains serve ${route}: ${trains.map(t => t.label).join(', ')}. Pick the exact train on day ${leg.dayNumber}.`, `sleeping train ${route}`)
          continue
        } else {
          train = trains[0]
        }

        const halfTwinFare = train.halfTwin
          ? passengerFare(train.halfTwin.rate_oneway_eur, (train.halfTwin as { rate_oneway_non_eur?: number | null }).rate_oneway_non_eur)
          : null
        if (halfTwinFare === null) {
          addLegHole(`${train.label} (${route}) has no shared/half-twin cabin rate. Add it in ${MODE_RATES_PAGE.sleeping_train}.`, `sleeping train ${route}`)
          continue
        }
        // Everyone prices at half-twin per person; the night joins the
        // rooming list so a solo traveller pays the single-cabin gap.
        ticketFaresPerPax += halfTwinFare
        services.push({
          id: `day${leg.dayNumber}-sleeper-${train.halfTwin!.id}`,
          dayNumber: leg.dayNumber,
          serviceType: 'transportation',
          serviceName: `Sleeping train ${train.label} ${route} (half twin, per person)`,
          quantity: 1,
          quantityMode: 'per_pax',
          unitCost: halfTwinFare,
          lineTotal: halfTwinFare,
          rateSource: 'sleeping_train_rates',
          isPerPax: true,
          isOptional: false,
        })
        const singleFare = train.single
          ? passengerFare(train.single.rate_oneway_eur, (train.single as { rate_oneway_non_eur?: number | null }).rate_oneway_non_eur)
          : null
        if (singleFare !== null) {
          singleSupplement += Math.max(0, singleFare - halfTwinFare)
        } else {
          warnings.push(`${train.label} (${route}) has no single-cabin row — a solo traveller's sleeper supplement is not included.`)
        }
        if (throughoutGuide) {
          // The guide takes a SINGLE cabin: the single row's guide_rate,
          // else the single fare; with no single row on file, his berth
          // falls back to the half-twin fare — flagged, not silent.
          let seat: number
          if (train.single) {
            seat = typeof train.single.guide_rate === 'number' ? train.single.guide_rate : (singleFare ?? halfTwinFare)
          } else {
            seat = halfTwinFare
            warnings.push(`${train.label} (${route}): no single-cabin row — the throughout guide's berth is priced at the half-twin fare.`)
          }
          ticketGuideSeatCost += seat
          ticketGuideLines.push({
            id: `day${leg.dayNumber}-guide-sleeper-${train.rows[0].id}`,
            dayNumber: leg.dayNumber,
            serviceType: 'transportation',
            serviceName: `Throughout Guide — sleeper single cabin (${route})`,
            quantity: 1,
            quantityMode: 'fixed',
            unitCost: seat,
            lineTotal: seat,
            rateSource: 'sleeping_train_rates',
            isPerPax: false,
            isOptional: false,
          })
        }
      }
    }
  }

  // ============================================
  // STEP 6: Calculate FIXED costs (don't scale with pax)
  // ============================================

  let fixedCosts = 0

  // The throughout guide's beds (STEP 5) and ticket seats (B-item 2) are
  // fixed costs too.
  fixedCosts += guideBedCosts + ticketGuideSeatCost
  services.push(...guideBedLines, ...ticketGuideLines)

  for (let i = 0; i < itinerary.length; i++) {
    const day = itinerary[i]
    const previousDay = i > 0 ? itinerary[i - 1] : null
    const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null
    const hasSightseeing = day.services.guide_required || day.attractions.length > 0

    // ----- GUIDE (fixed per day) -----
    // Spot (historical): a fee on sightseeing days only. Throughout
    // (B-item 1): ONE guide travels day 1 → end — the full-day fee on
    // sightseeing days and the cheaper Meet & Assist fee on every other
    // day. A missing meet/assist rate is a hole NAMING the duration to
    // add, never the full-day rate worn as a guess.
    const gradeLabel = guideGrade === 'senior' ? 'Senior ' : ''
    if (throughoutGuide) {
      const dayRate = hasSightseeing ? guideRate : guideMeetRate
      const feeLabel = hasSightseeing
        ? `Throughout Guide (${language}${guideGrade === 'senior' ? ', Senior' : ''})`
        : 'Throughout Guide — Meet & Assist'
      if (dayRate && dayRate.source === 'db') {
        fixedCosts += dayRate.dailyRate
        services.push({
          id: `day${day.day}-guide`,
          dayNumber: day.day,
          serviceType: 'guide',
          serviceName: feeLabel,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: dayRate.dailyRate,
          lineTotal: dayRate.dailyRate,
          rateSource: 'guide_rates',
          isPerPax: false,
          isOptional: false
        })
      } else {
        addHole({
          kind: 'guide',
          reason: dayRate ? 'fuzzy' : 'missing',
          tier,
          dayNumber: day.day,
          lookupAttempted: hasSightseeing
            ? `${language} ${gradeLabel}guide full_day (${tier})`
            : `${language} ${gradeLabel}guide meet_greet (${tier})`,
          message: hasSightseeing
            ? `No ${language} ${gradeLabel.toLowerCase()}guide full-day rate. Add it in Rates → Guides.`
            : `No ${language} ${gradeLabel.toLowerCase()}guide "Meet & Assist" rate for the throughout guide's non-sightseeing days. Add a meet_greet duration row in Rates → Guides.`,
        })
      }
    } else if (hasSightseeing) {
      if (guideRate && guideRate.source === 'db') {
        fixedCosts += guideRate.dailyRate
        services.push({
          id: `day${day.day}-guide`,
          dayNumber: day.day,
          serviceType: 'guide',
          serviceName: `${language} ${gradeLabel}Speaking Guide`,
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
          lookupAttempted: `${language} ${gradeLabel}guide (${tier})`,
          message: `No exact ${tier} ${language}-speaking ${gradeLabel.toLowerCase()}guide rate. Add it in Rates → Guides.`,
        })
      }
    }

    // ----- TIPPING (fixed per day, when guide present) -----
    if (hasSightseeing) {
      // Tips vary by place: this day's city picks the rate, falling back to
      // the country-wide row when the city has none of its own.
      const tippingRate = tippingRates?.forCity(day.city) ?? null
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
    const checkoutLevel: HotelServiceType = day.services.hotel_checkout_level ?? 'checkout_assist'

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
  //
  // Resolution order (A-item 13): a day carrying explicit attraction_ids is
  // priced from THOSE rows and its free-text wording is silenced — an id is
  // a decision, wording is a guess. Worded days resolve through the alias
  // table (tenant rows + global catalogue, migration 323) before the
  // catalogue lookup; a canonical joining several fees with ' + ' (a combo
  // ticket) becomes several lines. The historical hardcoded map and ilike
  // fallback still apply after an alias miss, so nothing regresses.
  let entranceFeesPerPax = 0
  const aliasIndex = await loadAttractionAliasIndex(getSupabaseAdmin(), catalogScope.tenantId)
  const processedAttractions = new Set<string>()
  const entranceLookups: { attraction?: string; feeId?: string; day: any }[] = []
  for (const day of itinerary) {
    if (day.attraction_ids && day.attraction_ids.length > 0) {
      for (const feeId of day.attraction_ids) {
        if (processedAttractions.has(`id:${feeId}`)) continue
        processedAttractions.add(`id:${feeId}`)
        entranceLookups.push({ feeId, day })
      }
      continue
    }
    for (const worded of day.attractions) {
      for (const attraction of resolveAttractionAlias(worded, aliasIndex)) {
        const key = attraction.toLowerCase()
        if (processedAttractions.has(key)) continue
        processedAttractions.add(key)
        entranceLookups.push({ attraction, day })
      }
    }
  }

  const entranceFees = await Promise.all(
    entranceLookups.map(l =>
      l.feeId
        ? getEntranceFeeById(catalogScope, l.feeId, isEurPassport)
        : getEntranceFee(catalogScope, l.attraction as string, isEurPassport)
    )
  )

  entranceLookups.forEach(({ attraction, feeId, day }, i) => {
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
    } else if (feeId) {
      // A picked id that no longer resolves (deleted, deactivated, or its
      // rate blanked) is its own hole: the operator RE-PICKS, the engine
      // never guesses what they might have meant.
      addHole({
        kind: 'entrance',
        reason: 'missing',
        tier,
        dayNumber: day.day,
        lookupAttempted: `entrance fee id ${feeId}`,
        message: `Day ${day.day}'s picked attraction is no longer in Rates → Attractions (or has no price). Re-pick it on the day editor.`,
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

  // ----- THROUGHOUT GUIDE: meals at group rates when the party is small -----
  // Operator's rule (B-item 1): with 4+ guests the restaurants feed the
  // guide free; at ≤ GUIDE_MEALS_MAX_PAX guests his portion is bought at
  // the group rate — one FIXED line per external meal. Priced at the
  // REQUESTED pax; the multi-pax sheet keeps the line at every count — a
  // documented approximation, exactly as in the sibling. (Missing meal
  // rates are already holes above; no second hole for the guide's plate.)
  if (throughoutGuide && requestedPax != null && requestedPax <= GUIDE_MEALS_MAX_PAX && mealRates) {
    for (const day of itinerary) {
      for (const meal of ['lunch', 'dinner'] as const) {
        if (day.meals[meal] !== 'external') continue
        const rate = mealRates[meal]
        fixedCosts += rate
        services.push({
          id: `day${day.day}-guide-${meal}`,
          dayNumber: day.day,
          serviceType: 'meal',
          serviceName: `Throughout Guide — ${meal} (group rate)`,
          quantity: 1,
          quantityMode: 'fixed',
          unitCost: rate,
          lineTotal: rate,
          rateSource: 'meal_rates',
          isPerPax: false,
          isOptional: false,
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

  const perPaxCosts = accommodationPPD + entranceFeesPerPax + externalMealsPerPax + waterPerPax + ticketFaresPerPax



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
    // A day travelling by ticket (B-item 2) is NOT an intercity ROAD day —
    // the ticket is the day's transport (and no station transfers are
    // emitted: the operator's decision). A flight day's airport transfers
    // ride on the airport_arrival/departure services, unaffected here.
    // A sleeper's city change lands on the MORNING AFTER: the previous
    // day's overnight ticket covers this day's arrival too.
    const isIntercityDay = previousDay && 
                           previousDay.city.toLowerCase() !== day.city.toLowerCase() &&
                           !day.transport_type &&
                           previousDay.transport_type !== 'sleeping_train' &&
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

  const baseVehicleType = getVehicleTypeByPax(2, undefined, vehicleBands)
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
        vehicleType = getVehicleTypeByPax(pax, info.city, vehicleBands)
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
    // Throughout guide (B-item 1): one extra seat in EVERY vehicle sizing.
    // Combined with the tour leader, the sheet's +1 rows become pax+2 —
    // the two roles stack, as the operator's model says they can.
    transportAt: throughoutGuide ? (pax: number) => transportAtPax(pax + 1) : transportAtPax,
    // Tour leader: single room (PPD + single supplement) + their own per-pax costs
    // The tour leader pays CUSTOMER fare on tickets (B-item 2).
    tourLeaderCost: accommodationPPD + singleSupplement + entranceFeesPerPax + externalMealsPerPax + waterPerPax + ticketFaresPerPax,
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

// NOTE: this interface once declared numAdults/numChildren/mealPlan/
// includeAccommodation — accepted, forwarded nowhere, read by nothing. A
// parameter that looks like it selects a price and does not is worse than
// its absence (see getAirportServiceRate's tier note): the B2B route passed
// mealPlan/includeAccommodation for months believing they did something.
// The day-based engine decides meals and accommodation from the itinerary
// itself; do not re-add knobs here without wiring them into
// DayPricingParams and the core.
export interface PricingParams {
  templateId: string
  /** What the customer is buying (lib/package-types.ts). Templates carry no
   *  package column yet, so callers usually omit this — full-package, the
   *  historical assumption. */
  packageType?: string
  /** Whose rates to price from — see DayPricingParams.tenantId. */
  tenantId: string
  tier: ServiceTier
  numPax: number
  isEurPassport: boolean
  language?: string
  travelDate?: string
  marginPercent?: number
  tourLeaderIncluded?: boolean
  /** Guide grade/mode (B-item 1) — see DayPricingParams. */
  guideGrade?: GuideGrade
  guideMode?: GuideMode
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
  /** Cost + margin, BEFORE the operator's seasonal premium. Kept so a quote
   *  can show the premium as its own line rather than a price that silently
   *  differs from the rate sheet (C3.1). */
  sellingPriceBeforeSeason: number
  /** The operator's demand premium, already inside `sellingPrice`. Zero on
   *  an ordinary departure. */
  seasonUplift: number
  seasonName: string | null
  seasonPercent: number
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





  // Forward EVERY core option explicitly — a wrapper that forwards only some
  // params is silent pricing corruption: packageType used to be dropped
  // right here, so no caller could ever override the tour_type inference.
  // (travelDate was dropped by the B2B route one layer up — same trap.)
  // If DayPricingParams gains an option, it must be forwarded here.
  const dayResult = await calculateDayBasedPricing({
    templateId,
    packageType: params.packageType,
    tenantId: params.tenantId,
    tier,
    isEurPassport,
    language,
    travelDate: params.travelDate,
    marginPercent,
    guideGrade: params.guideGrade,
    guideMode: params.guideMode,
    // The throughout guide's meal rule prices at the requested party size.
    requestedPax: numPax
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
      sellingPriceBeforeSeason: 0,
      seasonUplift: 0,
      seasonName: null,
      seasonPercent: 0,
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

  // ---------- the operator's seasonal premium (C3.1) ----------
  // AFTER margin, on the selling price, never on supplier cost: the
  // supplier's own seasonality is already inside totalCost — it moved when
  // the hotel's high-season rate was picked up — so applying this to cost as
  // well would charge the customer twice for the same season.
  const seasonWindows = await loadSeasonWindows(params.tenantId, params.travelDate)
  const season = seasonForDate(seasonWindows, params.travelDate ?? null)
  const uplift = computeUplift({ sellingPrice: pricing.sellingPrice, season })
  const upliftAmount = Math.round(uplift.amount * 100) / 100
  const sellingWithSeason = Math.round((pricing.sellingPrice + upliftAmount) * 100) / 100
  const perPersonWithSeason = numPax > 0 ? Math.round((sellingWithSeason / numPax) * 100) / 100 : 0

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
    sellingPriceBeforeSeason: pricing.sellingPrice,
    seasonUplift: upliftAmount,
    seasonName: uplift.seasonName,
    seasonPercent: uplift.percent,
    sellingPrice: sellingWithSeason,
    pricePerPerson: perPersonWithSeason,
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
  const tiers: ServiceTier[] = await tenantTierLadder(tenantId)

  const results = await calculateMultiTierPricing(
    templateId,
    tenantId,
    tiers,
    2,
    isEurPassport
  )

  let minPrice = Infinity
  let minTier: ServiceTier = defaultTierKey(tiers)
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

/**
 * The tenant's season windows that CONTAIN this departure date.
 *
 * Filtered in the query rather than in memory: the answer is at most a couple
 * of rows, and a pricing call should not drag a year of calendar across the
 * wire. A tenant without a calendar simply gets none, and the premium is
 * zero — which is also exactly what happens on a database that does not have
 * migration 304 yet.
 */
export async function loadSeasonWindows(
  tenantId: string | undefined,
  travelDate: string | undefined
): Promise<SeasonWindow[]> {
  if (!tenantId || !travelDate) return []
  const on = travelDate.slice(0, 10)

  // Two plain queries rather than a PostgREST embed: the join is trivial and
  // an embed needs a generated relationship this module's untyped admin
  // client cannot resolve. Dates are filtered in the query — a pricing call
  // should not drag a year of calendar across the wire.
  const { data: rawWindows, error } = await getSupabaseAdmin()
    .from('pricing_season_dates')
    .select('season_id, start_date, end_date')
    .eq('tenant_id', tenantId)
    .lte('start_date', on)
    .gte('end_date', on)

  // No calendar, or no migration 304 yet: no premium. Identical either way.
  if (error || !rawWindows || rawWindows.length === 0) return []

  const windows = rawWindows as unknown as Array<{
    season_id: string
    start_date: string
    end_date: string
  }>

  const seasonIds = [...new Set(windows.map(w => w.season_id))]
  const { data: rawSeasons } = await getSupabaseAdmin()
    .from('pricing_seasons')
    .select('id, name, uplift_percent, is_active')
    .in('id', seasonIds)
    .eq('is_active', true)

  const seasons = (rawSeasons ?? []) as unknown as Array<{
    id: string
    name: string | null
    uplift_percent: number | string | null
  }>
  const byId = new Map(seasons.map(s => [s.id, s]))

  return windows.flatMap(w => {
    const season = byId.get(w.season_id)
    // An inactive season is a window the operator switched off, not a zero.
    if (!season) return []
    return [{
      seasonId: String(w.season_id),
      name: String(season.name ?? ''),
      upliftPercent: Number(season.uplift_percent) || 0,
      startDate: String(w.start_date),
      endDate: String(w.end_date),
    }]
  })
}
