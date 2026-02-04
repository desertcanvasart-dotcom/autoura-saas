import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

// Lazy-initialized Anthropic client (avoids build-time errors)
let _anthropic: Anthropic | null = null

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })
  }
  return _anthropic
}

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createAdminClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Default margin percentage (used if no user preference)
const DEFAULT_MARGIN_PERCENT = 25

// ============================================
// TIER SYSTEM CONSTANTS
// ============================================
type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
type InputMode = 'creative' | 'structured'

// UPDATED: New package types
type PackageType = 'day-trips' | 'tours-only' | 'land-package' | 'cruise-package' | 'cruise-land'

const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

// Map legacy budget_level values to new tier system
const TIER_MAP: Record<string, ServiceTier> = {
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

const TIER_DESCRIPTIONS: Record<ServiceTier, string> = {
  'budget': 'cost-effective, good value',
  'standard': 'comfortable mid-range',
  'deluxe': 'superior quality, premium',
  'luxury': 'top-tier, VIP treatment'
}

// ============================================
// COMPREHENSIVE EGYPT TRAVEL ABBREVIATIONS
// ============================================

const EGYPT_TRAVEL_GLOSSARY = `
=================================================================
EGYPTIAN TRAVEL INDUSTRY ABBREVIATIONS - COMPREHENSIVE GLOSSARY
=================================================================

CRITICAL: You MUST decode these abbreviations and follow the itinerary EXACTLY as written.
DO NOT add, remove, or reorder any activities. Convert ONLY what is written.

-----------------------------------------------------------------
AIRPORT & CITY CODES (IATA CODES)
-----------------------------------------------------------------
CAI = Cairo (Cairo International Airport)
ALX / ALY = Alexandria (Borg El Arab Airport)
ASW = Aswan (Aswan International Airport)
LXR = Luxor (Luxor International Airport)
HRG = Hurghada (Hurghada International Airport)
SSH = Sharm El Sheikh (Sharm El Sheikh International Airport)
RMF = Marsa Alam (Marsa Alam International Airport)
ABS = Abu Simbel (Abu Simbel Airport)
ATZ = Assiut (Assiut Airport)
MUH = Marsa Matrouh (Marsa Matrouh Airport)
PSD = Port Said (Port Said Airport)
TCP = Taba (Taba International Airport)
SKV = St. Catherine (St. Catherine International Airport)
HMB = Sohag (Sohag International Airport)
SPX = Sphinx/Giza (Sphinx International Airport)
DBB = Dabaa / El Alamein area
DAK = Dakhla Oasis (Dakhla Oasis Airport)
AAC = El Arish (El Arish International Airport)
EGH = El Gora (El Gora Airport)
UVL = El Kharga (El Kharga Airport)

COMMON CITY ABBREVIATIONS (non-IATA):
GZA = Giza
KOM = Kom Ombo
EDU / EDFU = Edfu
ESN = Esna
ABY = Abydos
DEN = Dendera
SAQ = Saqqara / Sakkara
MEM = Memphis
FAY = Fayoum
SIW = Siwa Oasis

-----------------------------------------------------------------
AIRLINE CODES (IATA)
-----------------------------------------------------------------
MS = EgyptAir (Egypt's national carrier)
BA = British Airways
TK = Turkish Airlines
QR = Qatar Airways
EK = Emirates
EY = Etihad Airways
LH = Lufthansa
AF = Air France
KL = KLM Royal Dutch
IB = Iberia
AZ = Alitalia / ITA Airways
SU = Aeroflot
FZ = FlyDubai
G9 = Air Arabia
XY = flynas
SV = Saudia (Saudi Arabian Airlines)
RJ = Royal Jordanian
ME = Middle East Airlines
GF = Gulf Air
WY = Oman Air
KU = Kuwait Airways
OS = Austrian Airlines
LX = Swiss International
SK = Scandinavian Airlines
AY = Finnair
LO = LOT Polish Airlines
NP = Nile Air (Egyptian low-cost)
SM = Air Cairo

-----------------------------------------------------------------
ACCOMMODATION CODES
-----------------------------------------------------------------
NTS = Nights (e.g., "3NTS" = 3 nights stay)
HTL = Hotel
CRZ = Cruise / Nile Cruise
OVN = Overnight
C/IN = Check-in
C/OUT = Check-out (disembarkation from cruise)

MEAL PLANS:
RO = Room Only (no meals)
BB = Bed & Breakfast (breakfast only)
HB = Half Board (breakfast + dinner)
FB = Full Board (breakfast + lunch + dinner)
AI = All Inclusive (all meals + drinks + snacks)
UAI = Ultra All Inclusive (premium AI with top-shelf drinks, room service)
SC = Self Catering

-----------------------------------------------------------------
DAY & TIME NOTATION
-----------------------------------------------------------------
D1, D2, D3... = Day 1, Day 2, Day 3...
"D1 CAI" = Day 1 in Cairo
"D3 CAI/ASW" = Day 3: Travel from Cairo to Aswan
"/" between cities = transfer/travel between those cities
@ = at (time), e.g., "arrive @05:10" = arrive at 05:10

-----------------------------------------------------------------
CRITICAL: ENTRANCE FEE MARKERS
-----------------------------------------------------------------
(INSIDE) = Entrance fee REQUIRED - guests will enter the site
(OUTSIDE) = NO entrance fee - photo stop only, viewing from outside

Examples:
- "Alexandria Library (OUTSIDE)" = Photo stop, NO entrance fee
- "Pompey's Pillar (INSIDE)" = Entrance fee required
- "Pyramids" with no marker = Assume entrance included

-----------------------------------------------------------------
FREE DAYS AND SAILING DAYS
-----------------------------------------------------------------
When a day shows ONLY the location with NO activities:
- "D5 CRZ" = Sailing day on cruise (no tours, relaxing on board)
- "D8 HRG" = Free day in Hurghada (no scheduled activities)

Convert these to:
- Sailing days: title = "Sailing Day" or "Day at Leisure on Nile"
- Free days: title = "Free Day" or "Day at Leisure"

-----------------------------------------------------------------
MEALS IN ITINERARY
-----------------------------------------------------------------
B = Breakfast
L = Lunch
D = Dinner
"L" at end of day = Lunch included
"Chinese Dinner" = Dinner at Chinese restaurant
"Pigeon Lunch" = Lunch featuring Egyptian pigeon dish

-----------------------------------------------------------------
AIRPORT & HOTEL SERVICES (EGYPT TRAVEL INDUSTRY STANDARD)
-----------------------------------------------------------------

AIRPORT SERVICES (add when flights arrive/depart):
- International arrival: Airport meet & assist, visa assistance, luggage help, transfer to vehicle
- Domestic arrival: Airport meet & assist, luggage help, transfer to vehicle
- Departure: Hotel to airport transfer, check-in assistance

HOTEL SERVICES (add when):
- Check-in to hotel (first time in a city)
- Check-out from hotel (leaving city)
- Check-in to cruise (C/IN CRZ, "check in CRZ")
- Check-out from cruise (C/OUT CRZ)
- Moving from one city to another

-----------------------------------------------------------------
COMMON PATTERNS - EXAMPLES
-----------------------------------------------------------------
"2NTS CAI + 3NTS CRZ + 3NTS HRG"
= 2 nights Cairo + 3 nights Cruise + 3 nights Hurghada
= Total: 2+3+3 = 8 nights = 9 DAYS

"D1 CAI/ALX/CAI Arrive MS956@05:10, Pompey's Pillar (INSIDE), Library (OUTSIDE), L, back to CAI"
= Day 1: Arrive Cairo, then FULL DAY TRIP to Alexandria with sites, lunch, return to Cairo
= This is NOT just arrival - it's arrival + full day tour!

"D5 CRZ" (with nothing else)
= Day 5: Sailing day, no activities, relaxing on cruise

"D8 HRG" (with nothing else)
= Day 8: Free day in Hurghada, no scheduled activities

"C/OUT CRZ, LXR/HRG" = Check out of cruise, then travel from Luxor to Hurghada

-----------------------------------------------------------------
IMPORTANT CALCULATION RULE
-----------------------------------------------------------------
Number of DAYS = Number of NIGHTS + 1

Example: "2NTS CAI + 3NTS CRZ + 3NTS HRG"
- Nights: 2 + 3 + 3 = 8 nights
- Days: 8 + 1 = 9 days (D1 through D9)

-----------------------------------------------------------------
CRITICAL RULE: FOLLOW EXACTLY
-----------------------------------------------------------------
DO NOT add attractions not mentioned in the original!
DO NOT reorder days!
DO NOT skip any day!
If Abu Simbel is NOT mentioned, do NOT add it!
If a day just says "CRZ", it's a SAILING day with NO tours!
=================================================================
`

// ============================================
// EXTRACTED DAY STRUCTURE (from parser)
// ============================================
interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string | null
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  activities: string[]
  attractions: string[]
  meals_included: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  overnight_city: string
  notes: string | null
}

// Helper to validate date
function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// Helper to safely convert to number
function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

// Helper to normalize tier value
function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  return TIER_MAP[normalized] || 'standard'
}

// ============================================
// CALCULATE EXPECTED DAYS FROM RAW ITINERARY
// ============================================

function calculateExpectedDays(rawItinerary: string, extractedDays: ExtractedDay[] | null): number {
  // Method 1: Count day markers (D1, D2, D3... or Day 1, Day 2...)
  const dayMarkerPattern = /\b[Dd](?:ay)?\s*(\d+)\b/g
  let maxDayNumber = 0
  let match
  while ((match = dayMarkerPattern.exec(rawItinerary)) !== null) {
    const dayNum = parseInt(match[1])
    if (dayNum > maxDayNumber) {
      maxDayNumber = dayNum
    }
  }

  // Method 2: Sum up NTS (nights) patterns like "2NTS CAI + 3NTS CRZ"
  const ntsPattern = /(\d+)\s*NTS/gi
  let totalNights = 0
  while ((match = ntsPattern.exec(rawItinerary)) !== null) {
    totalNights += parseInt(match[1])
  }
  const daysFromNights = totalNights > 0 ? totalNights + 1 : 0

  // Method 3: Use extracted days array length
  const extractedCount = extractedDays?.length || 0

  // Take the maximum of all methods
  const expectedDays = Math.max(maxDayNumber, daysFromNights, extractedCount)

  console.log(`📊 Day calculation:`, {
    maxDayFromMarkers: maxDayNumber,
    totalNights,
    daysFromNightsFormula: daysFromNights,
    extractedDaysCount: extractedCount,
    finalExpectedDays: expectedDays
  })

  return expectedDays || 1 // Default to 1 if nothing found
}

// ============================================
// CRUISE DETECTION SYSTEM
// ============================================

interface CruiseDetectionResult {
  isCruise: boolean
  cruiseType: 'nile-cruise' | 'lake-nasser' | null
  route: string | null
  detectedDuration: number | null
  startCity: string | null
  endCity: string | null
  keywords: string[]
  includesLand: boolean
  cruiseNights: number
  landNights: number
}

function detectCruiseRequest(
  tourRequested: string,
  interests: string[],
  cities: string[],
  specialRequests: string[],
  durationDays: number,
  rawItinerary?: string
): CruiseDetectionResult {
  const allText = [
    tourRequested || '',
    rawItinerary || '',
    ...(interests || []),
    ...(cities || []),
    ...(specialRequests || [])
  ].join(' ').toLowerCase()

  // Cruise keywords - includes abbreviations
  const cruiseKeywords = [
    'nile cruise', 'cruise', 'river cruise', 'boat cruise',
    'felucca', 'dahabiya', 'sailing', 'cruise ship',
    'lake nasser', 'floating hotel',
    'crz', 'nts crz', 'check in crz', 'c/in crz', 'on board'
  ]

  const matchedKeywords = cruiseKeywords.filter(keyword => allText.includes(keyword))
  const isCruise = matchedKeywords.length > 0

  // Calculate cruise nights from "XNTs CRZ" pattern
  let cruiseNights = 0
  const cruiseNtsMatch = allText.match(/(\d+)\s*nts?\s*crz/i)
  if (cruiseNtsMatch) {
    cruiseNights = parseInt(cruiseNtsMatch[1])
  }

  // Calculate land nights
  let landNights = 0
  const landPatterns = [
    /(\d+)\s*nts?\s*cai/gi,  // Cairo nights
    /(\d+)\s*nts?\s*hrg/gi,  // Hurghada nights
    /(\d+)\s*nts?\s*ssh/gi,  // Sharm nights
    /(\d+)\s*nts?\s*alx/gi,  // Alexandria nights
    /(\d+)\s*nts?\s*htl/gi   // Generic hotel nights
  ]
  
  for (const pattern of landPatterns) {
    let match
    while ((match = pattern.exec(allText)) !== null) {
      landNights += parseInt(match[1])
    }
  }

  if (!isCruise) {
    return {
      isCruise: false,
      cruiseType: null,
      route: null,
      detectedDuration: null,
      startCity: null,
      endCity: null,
      keywords: [],
      includesLand: false,
      cruiseNights: 0,
      landNights: 0
    }
  }

  // Detect cruise type
  let cruiseType: 'nile-cruise' | 'lake-nasser' = 'nile-cruise'
  if (allText.includes('lake nasser') || allText.includes('abu simbel cruise')) {
    cruiseType = 'lake-nasser'
  }

  // Detect route direction
  let route: string | null = null
  let startCity: string | null = null
  let endCity: string | null = null

  // Check various route patterns
  const routePatterns = [
    { pattern: /luxor\s*(?:to|-|\/)\s*aswan|lxr\s*(?:to|-|\/)\s*asw/i, route: 'luxor-aswan', start: 'Luxor', end: 'Aswan' },
    { pattern: /aswan\s*(?:to|-|\/)\s*luxor|asw\s*(?:to|-|\/)\s*lxr/i, route: 'aswan-luxor', start: 'Aswan', end: 'Luxor' },
    { pattern: /round\s*trip/i, route: 'round-trip', start: 'Luxor', end: 'Luxor' }
  ]

  for (const { pattern, route: r, start, end } of routePatterns) {
    if (pattern.test(allText)) {
      route = r
      startCity = start
      endCity = end
      break
    }
  }

  // If no explicit route, infer from cities or default
  if (!route) {
    const citiesLower = (cities || []).map(c => c.toLowerCase())
    if (citiesLower.some(c => c.includes('luxor') || c.includes('lxr'))) {
      route = 'luxor-aswan'
      startCity = 'Luxor'
      endCity = 'Aswan'
    } else if (citiesLower.some(c => c.includes('aswan') || c.includes('asw'))) {
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    } else if (cruiseType === 'lake-nasser') {
      route = 'aswan-abu-simbel'
      startCity = 'Aswan'
      endCity = 'Abu Simbel'
    } else {
      // Default to aswan-luxor (most common)
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    }
  }

  // Detect duration from text
  let detectedDuration: number | null = null
  const durationPatterns = [
    { pattern: /(\d+)\s*night/i, addOne: true },
    { pattern: /(\d+)\s*day/i, addOne: false },
    { pattern: /(\d+)-night/i, addOne: true },
    { pattern: /(\d+)-day/i, addOne: false },
    { pattern: /(\d+)\s*nts?\s*crz/i, addOne: true }
  ]

  for (const { pattern, addOne } of durationPatterns) {
    const match = allText.match(pattern)
    if (match) {
      const num = parseInt(match[1])
      detectedDuration = addOne ? num + 1 : num
      break
    }
  }

  // Detect if trip includes land (hotels)
  const landCities = ['cairo', 'alexandria', 'hurghada', 'sharm', 'giza', 'dahab', 'marsa alam', 
                      'cai', 'alx', 'hrg', 'ssh', 'gza', 'rmf']
  
  const citiesLower = (cities || []).map(c => c.toLowerCase())
  const hasLandCities = citiesLower.some(city => 
    landCities.some(lc => city.includes(lc))
  ) || landCities.some(lc => allText.includes(lc + ' hotel') || allText.includes('nts ' + lc))
  
  const includesLand = hasLandCities || landNights > 0 || (durationDays > (cruiseNights + 1))

  console.log(`🚢 CRUISE DETECTION:`, {
    isCruise: true,
    type: cruiseType,
    route,
    startCity,
    endCity,
    cruiseNights,
    landNights,
    includesLand,
    detectedDuration,
    keywords: matchedKeywords
  })

  return {
    isCruise: true,
    cruiseType,
    route,
    detectedDuration,
    startCity,
    endCity,
    keywords: matchedKeywords,
    includesLand,
    cruiseNights,
    landNights
  }
}

// ============================================
// CONTENT LIBRARY CRUISE LOOKUP
// ============================================

interface CruiseContentMatch {
  found: boolean
  content: any
  variation: any
  dayByDay: any[]
  recommendedSuppliers: string[]
}

async function findCruiseContent(
  cruiseDetection: CruiseDetectionResult,
  tier: ServiceTier,
  requestedDuration: number | null
): Promise<CruiseContentMatch> {
  const noMatch: CruiseContentMatch = {
    found: false,
    content: null,
    variation: null,
    dayByDay: [],
    recommendedSuppliers: []
  }

  if (!cruiseDetection.isCruise) {
    return noMatch
  }

  try {
    // Build query based on detected cruise parameters
    let query = getSupabaseAdmin()
      .from('content_library')
      .select(`
        *,
        content_variations!inner (
          id,
          tier,
          title,
          description,
          highlights,
          inclusions,
          day_by_day,
          recommended_suppliers,
          is_active
        )
      `)
      .eq('is_cruise', true)
      .eq('is_active', true)
      .eq('content_variations.is_active', true)
      .eq('content_variations.tier', tier)

    // Filter by route if detected
    if (cruiseDetection.route) {
      query = query.eq('route', cruiseDetection.route)
    }

    // Filter by cruise type
    if (cruiseDetection.cruiseType) {
      query = query.eq('tour_type', cruiseDetection.cruiseType)
    }

    const { data: cruises, error } = await query

    if (error || !cruises || cruises.length === 0) {
      console.log('⚠️ No cruise content found in Content Library for route:', cruiseDetection.route)
      
      // Try without route filter as fallback
      const { data: fallbackCruises } = await getSupabaseAdmin()
        .from('content_library')
        .select(`
          *,
          content_variations!inner (
            id,
            tier,
            title,
            description,
            highlights,
            inclusions,
            day_by_day,
            recommended_suppliers,
            is_active
          )
        `)
        .eq('is_cruise', true)
        .eq('is_active', true)
        .eq('content_variations.is_active', true)
        .eq('content_variations.tier', tier)
        .limit(1)

      if (!fallbackCruises || fallbackCruises.length === 0) {
        console.log('⚠️ No cruise content found at all in Content Library')
        return noMatch
      }

      const content = fallbackCruises[0] as any
      const variation = content.content_variations[0]

      console.log(`📚 Found fallback cruise: ${content.name} (${variation.tier} tier)`)

      return {
        found: true,
        content,
        variation,
        dayByDay: variation.day_by_day || [],
        recommendedSuppliers: variation.recommended_suppliers || []
      }
    }

    // Find best match based on duration if specified
    let bestMatch = cruises[0] as any
    if (requestedDuration) {
      const durationMatch = (cruises as any[]).find((c: any) => c.duration_days === requestedDuration)
      if (durationMatch) {
        bestMatch = durationMatch
      }
    }

    const variation = bestMatch.content_variations[0]

    console.log(`📚 Found cruise content: ${bestMatch.name} (${variation.tier} tier, ${bestMatch.duration_days} days)`)

    return {
      found: true,
      content: bestMatch,
      variation,
      dayByDay: variation.day_by_day || [],
      recommendedSuppliers: variation.recommended_suppliers || []
    }

  } catch (err) {
    console.error('⚠️ Error querying cruise content:', err)
    return noMatch
  }
}

// ============================================
// CRUISE RATE LOOKUP
// ============================================

interface CruiseRate {
  found: boolean
  perPersonPerNight: number
  shipName: string
  supplierId: string | null
  cabinType: string
}

async function getCruiseRate(
  tier: ServiceTier,
  recommendedSuppliers: string[],
  supabase: any
): Promise<CruiseRate> {
  const defaultRates: Record<ServiceTier, number> = {
    'budget': 150,
    'standard': 200,
    'deluxe': 300,
    'luxury': 500
  }

  const noRate: CruiseRate = {
    found: false,
    perPersonPerNight: defaultRates[tier],
    shipName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Nile Cruise`,
    supplierId: null,
    cabinType: 'Standard Cabin'
  }

  try {
    // If we have recommended suppliers, try to match
    if (recommendedSuppliers && recommendedSuppliers.length > 0) {
      const { data: matchedShips } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .in('ship_name', recommendedSuppliers)
        .limit(1)

      if (matchedShips && matchedShips.length > 0) {
        const ship = matchedShips[0]
        return {
          found: true,
          perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || defaultRates[tier],
          shipName: ship.ship_name,
          supplierId: ship.supplier_id || ship.id,
          cabinType: ship.cabin_type || 'Standard Cabin'
        }
      }
    }

    // Fallback: find any cruise matching tier
    const { data: tierCruises } = await supabase
      .from('nile_cruises')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (tierCruises && tierCruises.length > 0) {
      const ship = tierCruises[0]
      return {
        found: true,
        perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || defaultRates[tier],
        shipName: ship.ship_name,
        supplierId: ship.supplier_id || ship.id,
        cabinType: ship.cabin_type || 'Standard Cabin'
      }
    }

    // Final fallback: any active cruise
    const { data: anyCruise } = await supabase
      .from('nile_cruises')
      .select('*')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (anyCruise && anyCruise.length > 0) {
      const ship = anyCruise[0]
      return {
        found: true,
        perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || defaultRates[tier],
        shipName: ship.ship_name,
        supplierId: ship.supplier_id || ship.id,
        cabinType: ship.cabin_type || 'Standard Cabin'
      }
    }

    return noRate

  } catch (err) {
    console.error('⚠️ Error fetching cruise rate:', err)
    return noRate
  }
}

// ============================================
// CONTENT LIBRARY INTEGRATION (for non-cruise)
// ============================================

interface ContentItem {
  id: string
  name: string
  category_name: string
  category_slug: string
  tier: string
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
}

interface WritingRule {
  id: string
  name: string
  description: string
  category: string
  rule_type: string
  priority: number
  applies_to: string[]
}

async function fetchContentLibrary(
  tier: string,
  cities: string[],
  interests: string[]
): Promise<ContentItem[]> {
  try {
    const searchTags = [
      ...cities.map(c => c.toLowerCase()),
      ...interests.map(i => i.toLowerCase())
    ]

    const { data: variations, error } = await getSupabaseAdmin()
      .from('content_variations')
      .select(`
        id,
        content_id,
        tier,
        title,
        description,
        highlights,
        inclusions,
        content_library!inner (
          id,
          name,
          slug,
          short_description,
          location,
          tags,
          is_cruise,
          content_categories!inner (
            name,
            slug
          )
        )
      `)
      .eq('tier', tier)
      .eq('is_active', true)

    if (error || !variations) {
      console.log('⚠️ No content library items found:', error?.message)
      return []
    }

    // Filter and transform content - exclude cruises for land tours
    const content: ContentItem[] = variations
      .filter((v: any) => {
        const item = v.content_library
        if (!item) return false
        if (item.is_cruise) return false // Exclude cruise content
        
        const itemTags = (item.tags || []).map((t: string) => t.toLowerCase())
        const itemLocation = (item.location || '').toLowerCase()
        const itemName = (item.name || '').toLowerCase()
        
        const matchesSearch = searchTags.length === 0 || searchTags.some(tag => 
          itemTags.includes(tag) ||
          itemLocation.includes(tag) ||
          itemName.includes(tag) ||
          tag.includes(itemLocation)
        )
        
        return matchesSearch
      })
      .map((v: any) => ({
        id: v.content_id,
        name: v.content_library.name,
        category_name: v.content_library.content_categories?.name || 'General',
        category_slug: v.content_library.content_categories?.slug || 'general',
        tier: v.tier,
        title: v.title || v.content_library.name,
        description: v.description || v.content_library.short_description || '',
        highlights: v.highlights || [],
        inclusions: v.inclusions || []
      }))

    console.log(`📚 Found ${content.length} content items for tier ${tier}`)
    return content
  } catch (err) {
    console.error('⚠️ Error fetching content library:', err)
    return []
  }
}

async function fetchWritingRules(): Promise<WritingRule[]> {
  try {
    const { data: rules, error } = await getSupabaseAdmin()
      .from('writing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error || !rules) {
      return []
    }

    return rules
  } catch (err) {
    console.error('⚠️ Error fetching writing rules:', err)
    return []
  }
}

function buildContentContext(content: ContentItem[]): string {
  if (content.length === 0) return ''

  const grouped: Record<string, ContentItem[]> = {}
  content.forEach(item => {
    if (!grouped[item.category_slug]) {
      grouped[item.category_slug] = []
    }
    grouped[item.category_slug].push(item)
  })

  let context = '\n\nCONTENT LIBRARY:\n'

  for (const [category, items] of Object.entries(grouped)) {
    context += `\n[${items[0]?.category_name || category}]\n`
    items.slice(0, 5).forEach(item => {
      context += `• ${item.name}: ${item.description?.substring(0, 200) || ''}...\n`
    })
  }

  return context
}

function buildWritingRulesContext(rules: WritingRule[]): string {
  if (rules.length === 0) return ''

  let context = '\n\nWRITING STYLE:\n'

  // Filter by rule_type (enforce/prefer/avoid)
  const enforceRules = rules.filter(r => r.rule_type === 'enforce').slice(0, 5)
  const preferRules = rules.filter(r => r.rule_type === 'prefer').slice(0, 3)
  const avoidRules = rules.filter(r => r.rule_type === 'avoid').slice(0, 5)

  if (enforceRules.length > 0) {
    context += 'MUST follow:\n'
    enforceRules.forEach(r => context += `- ${r.name}: ${r.description}\n`)
  }

  if (preferRules.length > 0) {
    context += 'PREFER:\n'
    preferRules.forEach(r => context += `- ${r.name}: ${r.description}\n`)
  }

  if (avoidRules.length > 0) {
    context += 'AVOID:\n'
    avoidRules.forEach(r => context += `- ${r.name}: ${r.description}\n`)
  }

  return context
}

// ============================================
// FETCH USER PREFERENCES
// ============================================
async function getUserPreferences(supabase: any): Promise<{
  default_cost_mode: 'auto' | 'manual'
  default_tier: ServiceTier
  default_margin_percent: number
  default_currency: string
}> {
  const defaults = {
    default_cost_mode: 'auto' as const,
    default_tier: 'standard' as ServiceTier,
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: 'EUR'
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return defaults

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) return defaults

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: prefs.default_margin_percent ?? defaults.default_margin_percent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}

// ============================================
// FETCH ATTRACTION NAMES LIST
// ============================================
async function fetchAttractionsList(supabase: any): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('entrance_fees')
      .select('attraction_name')
      .eq('is_active', true)
      .eq('is_addon', false) // Exclude add-ons
    
    return data?.map((a: any) => a.attraction_name) || []
  } catch {
    return []
  }
}

// ============================================
// STRUCTURED MODE: FOLLOW PROVIDED ITINERARY
// ============================================

// ============================================
// PRE-PARSE RAW ITINERARY INTO DAY SEGMENTS
// ============================================
function preParseRawItinerary(rawItinerary: string): { dayNumber: number; rawContent: string }[] {
  const segments: { dayNumber: number; rawContent: string }[] = []
  
  // Split by D1, D2, D3... or Day 1, Day 2... patterns
  const dayPattern = /(?:^|\n)\s*(D(\d+)|Day\s*(\d+))\b/gi
  const matches = [...rawItinerary.matchAll(dayPattern)]
  
  if (matches.length === 0) {
    // No day markers found, return entire content as day 1
    return [{ dayNumber: 1, rawContent: rawItinerary.trim() }]
  }
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const dayNum = parseInt(match[2] || match[3])
    const startIdx = match.index!
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : rawItinerary.length
    
    const content = rawItinerary.substring(startIdx, endIdx).trim()
    segments.push({ dayNumber: dayNum, rawContent: content })
  }
  
  // Sort by day number
  segments.sort((a, b) => a.dayNumber - b.dayNumber)
  
  return segments
}

async function generateFromStructuredInput(
  extractedDays: ExtractedDay[],
  rawItinerary: string,
  params: {
    tier: ServiceTier
    totalPax: number
    language: string
    attractionNames: string[]
    writingRules: WritingRule[]
    packageType?: PackageType
  }
): Promise<any> {
  const { tier, totalPax, language, attractionNames, writingRules, packageType } = params
  const writingContext = buildWritingRulesContext(writingRules)

  // Calculate expected number of days
  const expectedDays = calculateExpectedDays(rawItinerary, extractedDays)

  // PRE-PARSE the raw itinerary into day segments
  const daySegments = preParseRawItinerary(rawItinerary)
  
  console.log(`📋 STRUCTURED MODE: Pre-parsed ${daySegments.length} day segments, expecting ${expectedDays} days`)
  daySegments.forEach(seg => {
    console.log(`  Day ${seg.dayNumber}: ${seg.rawContent.substring(0, 80)}...`)
  })

  // Build the day-by-day mapping section
  const dayMappingSection = daySegments.map(seg => {
    return `
DAY ${seg.dayNumber} INPUT (CONVERT THIS EXACTLY):
───────────────────────────────────────
${seg.rawContent}
───────────────────────────────────────`
  }).join('\n')

  const prompt = `You are a DATA CONVERTER. Your ONLY task is to convert travel agent shorthand into JSON format.

⛔ THIS IS NOT A CREATIVE TASK ⛔
You are NOT designing an itinerary. You are CONVERTING an existing one.

${EGYPT_TRAVEL_GLOSSARY}

═══════════════════════════════════════════════════════════════
⛔ FORBIDDEN ACTIONS - VIOLATING THESE IS A CRITICAL ERROR ⛔
═══════════════════════════════════════════════════════════════

1. FORBIDDEN: Adding attractions NOT in the input
   - If Abu Simbel is not mentioned → DO NOT ADD IT
   - If Unfinished Obelisk is not mentioned → DO NOT ADD IT
   - If Grand Museum is not mentioned → DO NOT ADD IT
   
2. FORBIDDEN: Removing or skipping activities from input
   - If D1 says "Alexandria tour" → Day 1 MUST include Alexandria
   - If D2 says "Pyramids & Museum" → Day 2 MUST include BOTH
   
3. FORBIDDEN: Reordering days or activities
   - D1 content goes in day_number: 1
   - D2 content goes in day_number: 2
   - NEVER put D1 content in day_number: 2
   
4. FORBIDDEN: "Improving" the itinerary
   - Do NOT add sites you think they "should" visit
   - Do NOT rearrange for "better flow"
   - Do NOT combine or split days

═══════════════════════════════════════════════════════════════
📋 EXACT DAY-BY-DAY INPUT TO CONVERT
═══════════════════════════════════════════════════════════════
${dayMappingSection}

═══════════════════════════════════════════════════════════════
📋 FULL RAW ITINERARY (for reference)
═══════════════════════════════════════════════════════════════
${rawItinerary}

═══════════════════════════════════════════════════════════════
🔍 DECODING RULES
═══════════════════════════════════════════════════════════════

CITY CODES:
CAI=Cairo, ALX=Alexandria, ASW=Aswan, LXR=Luxor, HRG=Hurghada, CRZ=Cruise

MULTI-CITY PATTERN:
"D1 CAI/ALX/CAI" = Day trip: Arrive Cairo → Visit Alexandria → Return Cairo
This is NOT just "Arrival" - it's arrival PLUS a FULL DAY TOUR!

ENTRANCE MARKERS:
(INSIDE) = Entrance fee required → add to entrance_included[]
(OUTSIDE) = Photo stop only → add to photo_stops[] (NO entrance fee)

FREE DAYS:
"D5 CRZ" with nothing else = Sailing day → is_free_day: true, is_sailing_day: true
"D8 HRG" with nothing else = Free day → is_free_day: true

MEALS:
L = Lunch included
D = Dinner included
"Chinese Dinner" = Dinner at Chinese restaurant
"Pigeon Lunch" = Lunch with Egyptian pigeon dish

FLIGHTS:
MS956@05:10 = EgyptAir flight 956 at 05:10
"DEPARTED BY MS955@23:20" = Departure flight at 23:20

═══════════════════════════════════════════════════════════════
⚙️ CONFIGURATION
═══════════════════════════════════════════════════════════════
TOTAL DAYS: ${expectedDays}
TIER: ${tier.toUpperCase()}
TRAVELERS: ${totalPax}
LANGUAGE: ${language}
PACKAGE: ${packageType || 'cruise-land'}

═══════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (Return ONLY valid JSON)
═══════════════════════════════════════════════════════════════

{
  "trip_name": "Egypt: Cairo, Nile Cruise & Hurghada",
  "total_days": ${expectedDays},
  "days": [
    {
      "day_number": 1,
      "date": null,
      "title": "Day 1: Arrival & Alexandria Day Trip",
      "description": "2-3 sentences describing ONLY what is in the input",
      "city": "Cairo",
      "cities_visited": ["Cairo", "Alexandria"],
      "overnight_city": "Cairo",
      "accommodation_type": "hotel",
      
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "is_free_day": false,
      "is_cruise_day": false,
      "is_sailing_day": false,
      
      "attractions": ["Pompey's Pillar", "Qaitbay Citadel", "Alexandria Library", "Montazah Park"],
      "entrance_included": ["Pompey's Pillar", "Qaitbay Citadel", "Montazah Park"],
      "photo_stops": ["Alexandria Library"],
      
      "activities": ["Airport arrival", "Transfer to Alexandria", "Visit Pompey's Pillar", "Visit Qaitbay Citadel", "Photo stop at Alexandria Library", "Visit Montazah Park", "Lunch", "Return to Cairo", "Dinner"],
      "guide_required": true,
      
      "includes_lunch": true,
      "includes_dinner": true,
      "meal_notes": null,
      
      "flight_info": "MS956 arriving 05:10",
      "transport_type": "flight",
      
      "needs_airport_service": true,
      "needs_hotel_service": true
    }
  ]
}

═══════════════════════════════════════════════════════════════
✅ VERIFICATION CHECKLIST (Complete before responding)
═══════════════════════════════════════════════════════════════

□ I have exactly ${expectedDays} day objects in my response
□ Day 1 contains ALL activities from D1 input (not just "arrival")
□ Day 2 contains ALL activities from D2 input
□ Each day's content matches ONLY what was in that day's input
□ I did NOT add Abu Simbel, Unfinished Obelisk, or other sites not mentioned
□ Free/sailing days have is_free_day: true
□ INSIDE attractions are in entrance_included (with fee)
□ OUTSIDE attractions are in photo_stops (NO fee)
□ Flight arrivals have needs_airport_service: true
□ The last day with activities includes everything mentioned (not just "departure")

NOW CONVERT THE ITINERARY TO JSON:`

  console.log('🤖 Sending STRICT structured prompt to AI...')

  const message = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  })

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  // Parse JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('❌ Failed to parse AI response:', responseText.substring(0, 500))
    throw new Error('Failed to parse AI response as JSON')
  }

  const result = JSON.parse(jsonMatch[0])
  
  // Validate day count
  if (result.days && result.days.length < expectedDays) {
    console.warn(`⚠️ AI returned ${result.days.length} days but expected ${expectedDays}`)
  } else {
    console.log(`✅ AI successfully generated ${result.days?.length || 0} days`)
  }
  
  // Log first day for debugging
  if (result.days && result.days[0]) {
    console.log('📍 Day 1 generated:', {
      title: result.days[0].title,
      attractions: result.days[0].attractions,
      cities_visited: result.days[0].cities_visited
    })
  }

  return result
}

// ============================================
// CREATIVE MODE: AI GENERATES ITINERARY
// ============================================

async function generateCreativeItinerary(
  params: {
    clientName: string
    tourName: string
    durationDays: number
    tier: ServiceTier
    totalPax: number
    numAdults: number
    numChildren: number
    language: string
    cities: string[]
    interests: string[]
    specialRequests: string[]
    startDate: string
    effectiveCity: string
    attractionNames: string[]
    contentContext: string
    writingContext: string
    includeLunch: boolean
    includeDinner: boolean
    includeAccommodation: boolean
  }
): Promise<any> {
  const {
    clientName, tourName, durationDays, tier, totalPax, numAdults, numChildren,
    language, cities, interests, specialRequests, startDate, effectiveCity,
    attractionNames, contentContext, writingContext, includeLunch, includeDinner, includeAccommodation
  } = params

  const prompt = `Create a ${durationDays}-day Egypt itinerary.

${EGYPT_TRAVEL_GLOSSARY}

CLIENT: ${clientName}
TOUR: ${tourName}
DATE: ${startDate}
TRAVELERS: ${numAdults} adults${numChildren > 0 ? `, ${numChildren} children` : ''}
TIER: ${tier.toUpperCase()} (${TIER_DESCRIPTIONS[tier]})
CITIES: ${cities.length > 0 ? cities.join(', ') : effectiveCity}
${interests.length > 0 ? `INTERESTS: ${interests.join(', ')}` : ''}
${specialRequests.length > 0 ? `SPECIAL REQUESTS: ${specialRequests.join(', ')}` : ''}

AVAILABLE ATTRACTIONS (use EXACT names):
${attractionNames.join(', ')}
${contentContext}
${writingContext}

PACKAGE INCLUDES:
- Transportation: Yes (private vehicle)
- Guide: Yes (${language} speaking)
- Entrance Fees: Yes
- Lunch: ${includeLunch ? 'Yes' : 'No'}
- Dinner: ${includeDinner ? 'Yes' : 'No'}
- Hotels: ${includeAccommodation ? 'Yes (except last day)' : 'No'}

PLANNING GUIDELINES:
1. Create a logical flow between cities (don't jump around)
2. First day typically arrival + lighter activities
3. Last day typically departure transfer
4. Group nearby attractions on the same day
5. Include realistic driving times
6. For ${tier} tier: ${TIER_DESCRIPTIONS[tier]}

Return ONLY valid JSON:
{
  "trip_name": "Descriptive Trip Name",
  "total_days": ${durationDays},
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Arrival in Cairo",
      "description": "Professional 2-3 sentence description of the day",
      "city": "Cairo",
      "overnight_city": "Cairo",
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "attractions": ["Exact Attraction Name"],
      "guide_required": true,
      "includes_lunch": ${includeLunch},
      "includes_dinner": ${includeDinner},
      "includes_hotel": ${includeAccommodation}
    }
  ]
}

Use EXACT attraction names from the provided list. Set includes_hotel to false on the last day.`

  const message = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  })

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON')
  }

  return JSON.parse(jsonMatch[0])
}

// ============================================
// DETERMINE EFFECTIVE PACKAGE TYPE
// ============================================

function determinePackageType(
  requestedPackageType: string,
  cruiseDetection: CruiseDetectionResult
): PackageType {
  // If explicitly requested cruise-land, use it
  if (requestedPackageType === 'cruise-land') {
    return 'cruise-land'
  }

  // If not a cruise detected, use the requested package type (or land-package as default)
  if (!cruiseDetection.isCruise) {
    if (requestedPackageType === 'full-package') {
      return 'land-package'
    }
    return (requestedPackageType as PackageType) || 'land-package'
  }

  // It's a cruise - determine if cruise-only or cruise+land
  if (cruiseDetection.includesLand) {
    return 'cruise-land'
  }
  
  return 'cruise-package'
}

// ============================================
// HELPER: CREATE QUOTES AFTER ITINERARY
// ============================================

async function createQuotesForItinerary(params: {
  itinerary_id: string
  quote_type: 'b2c' | 'b2b' | 'both' | 'none'
  num_travelers: number
  tier: ServiceTier
  margin_percent: number
  currency: string
  client_id?: string | null
  partner_id?: string | null
}) {
  const {
    itinerary_id,
    quote_type,
    num_travelers,
    tier,
    margin_percent,
    currency,
    client_id,
    partner_id
  } = params

  if (quote_type === 'none') {
    return { b2c_quote: null, b2b_quote: null }
  }

  const { data: tenant } = await (getSupabaseAdmin() as any).from('tenants').select('id').single()
  const t = tenant as any
  const tenant_id = t?.id

  if (!tenant_id) {
    console.error('⚠️ No tenant found - cannot create quotes')
    return { b2c_quote: null, b2b_quote: null }
  }

  // Fetch itinerary with services for pricing calculation
  const { data: itineraryData } = await (getSupabaseAdmin() as any)
    .from('itineraries')
    .select(`
      *,
      itinerary_services (*)
    `)
    .eq('id', itinerary_id)
    .single()

  if (!itineraryData) {
    console.error('⚠️ Itinerary not found')
    return { b2c_quote: null, b2b_quote: null }
  }

  const itinerary = itineraryData as any

  let b2c_quote = null
  let b2b_quote = null

  // Create B2C Quote
  if (quote_type === 'b2c' || quote_type === 'both') {
    try {
      // Calculate costs from services
      const services = itinerary.itinerary_services || []
      const costBreakdown: Record<string, number> = {
        accommodation: 0,
        transportation: 0,
        entrance_fees: 0,
        meals: 0,
        guide: 0,
        cruise: 0,
        domestic_flights: 0,
        tips: 0,
        other: 0
      }

      services.forEach((service: any) => {
        const cost = parseFloat(service.total_cost || 0)
        switch (service.service_type) {
          case 'accommodation':
          case 'hotel':
            costBreakdown.accommodation += cost
            break
          case 'transportation':
          case 'vehicle':
          case 'car':
            costBreakdown.transportation += cost
            break
          case 'entrance':
          case 'entrance_fee':
          case 'attraction':
            costBreakdown.entrance_fees += cost
            break
          case 'meal':
          case 'lunch':
          case 'dinner':
          case 'breakfast':
            costBreakdown.meals += cost
            break
          case 'guide':
          case 'tour_guide':
            costBreakdown.guide += cost
            break
          case 'cruise':
          case 'nile_cruise':
            costBreakdown.cruise += cost
            break
          case 'domestic_flight':
          case 'flight':
            costBreakdown.domestic_flights += cost
            break
          case 'tips':
          case 'tipping':
            costBreakdown.tips += cost
            break
          default:
            costBreakdown.other += cost
        }
      })

      const total_cost = Object.values(costBreakdown).reduce((sum, val) => sum + val, 0)
      const selling_price = total_cost + (total_cost * margin_percent / 100)
      const price_per_person = selling_price / num_travelers

      // Generate quote number
      const { data: quoteNumber } = await (getSupabaseAdmin() as any).rpc('generate_b2c_quote_number')

      // Create quote
      const { data: createdQuote, error } = await (getSupabaseAdmin() as any)
        .from('b2c_quotes')
        .insert({
          tenant_id,
          itinerary_id,
          client_id,
          quote_number: quoteNumber,
          num_travelers,
          tier,
          total_cost,
          margin_percent,
          selling_price,
          price_per_person,
          currency,
          cost_breakdown: costBreakdown,
          status: 'draft'
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating B2C quote:', error)
      } else {
        b2c_quote = createdQuote
        console.log(`✅ B2C Quote created: ${b2c_quote?.quote_number}`)
      }
    } catch (error) {
      console.error('Error creating B2C quote:', error)
    }
  }

  // Create B2B Quote
  if (quote_type === 'b2b' || quote_type === 'both') {
    try {
      const services = itinerary.itinerary_services || []
      const pax_counts = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30]
      const tour_leader_included = false

      // Categorize costs
      const fixedCosts = { transport: 0, guide: 0, other: 0 }
      const perPersonCosts = { entrance_fees: 0, meals: 0, tips: 0, domestic_flights: 0 }
      let accommodationCost = 0
      let cruiseCost = 0
      let accommodationNights = 0

      services.forEach((service: any) => {
        const cost = parseFloat(service.total_cost || 0)
        const type = service.service_type

        if (type === 'accommodation' || type === 'hotel') {
          accommodationCost += cost
          accommodationNights++
        } else if (type === 'cruise' || type === 'nile_cruise') {
          cruiseCost += cost
        } else if (type === 'transportation' || type === 'vehicle' || type === 'car') {
          fixedCosts.transport += cost
        } else if (type === 'guide' || type === 'tour_guide') {
          fixedCosts.guide += cost
        } else if (type === 'entrance' || type === 'entrance_fee' || type === 'attraction') {
          perPersonCosts.entrance_fees += cost / num_travelers
        } else if (type === 'meal' || type === 'lunch' || type === 'dinner' || type === 'breakfast') {
          perPersonCosts.meals += cost / num_travelers
        } else if (type === 'tips' || type === 'tipping') {
          perPersonCosts.tips += cost / num_travelers
        } else if (type === 'domestic_flight' || type === 'flight') {
          perPersonCosts.domestic_flights += cost / num_travelers
        } else {
          fixedCosts.other += cost
        }
      })

      // Calculate PPD
      const totalNights = Math.max(accommodationNights, itinerary.total_days - 1)
      const ppd_accommodation = accommodationNights > 0 ? accommodationCost / num_travelers / totalNights : 0
      const ppd_cruise = cruiseCost > 0 ? cruiseCost / num_travelers / totalNights : 0
      const single_supplement = ppd_accommodation * totalNights * 0.7

      // Tour leader cost
      const tour_leader_cost = tour_leader_included
        ? (ppd_accommodation + ppd_cruise) * totalNights + single_supplement +
          perPersonCosts.entrance_fees + perPersonCosts.meals + perPersonCosts.tips + perPersonCosts.domestic_flights
        : 0

      // Generate pricing table
      const pricing_table: Record<string, { pp: number; total: number }> = {}
      for (const pax of pax_counts) {
        const effectivePax = tour_leader_included ? pax + 1 : pax
        const totalAccommodation = (ppd_accommodation + ppd_cruise) * effectivePax * totalNights
        const fixedPerPerson = (fixedCosts.transport + fixedCosts.guide + fixedCosts.other) / pax
        const tlCostPerPerson = tour_leader_included ? tour_leader_cost / pax : 0

        const pricePerPerson =
          (totalAccommodation / pax) +
          fixedPerPerson +
          perPersonCosts.entrance_fees +
          perPersonCosts.meals +
          perPersonCosts.tips +
          perPersonCosts.domestic_flights +
          tlCostPerPerson

        pricing_table[pax.toString()] = {
          pp: Math.ceil(pricePerPerson * 100) / 100,
          total: Math.ceil(pricePerPerson * pax * 100) / 100
        }
      }

      // Generate quote number
      const { data: quoteNumber } = await (getSupabaseAdmin() as any).rpc('generate_b2b_quote_number')

      // Create quote
      const { data: createdQuote, error } = await (getSupabaseAdmin() as any)
        .from('b2b_quotes')
        .insert({
          tenant_id,
          itinerary_id,
          partner_id,
          quote_number: quoteNumber,
          tier,
          tour_leader_included,
          currency,
          ppd_accommodation,
          ppd_cruise,
          single_supplement,
          fixed_transport: fixedCosts.transport,
          fixed_guide: fixedCosts.guide,
          fixed_other: fixedCosts.other,
          pp_entrance_fees: perPersonCosts.entrance_fees,
          pp_meals: perPersonCosts.meals,
          pp_tips: perPersonCosts.tips,
          pp_domestic_flights: perPersonCosts.domestic_flights,
          pricing_table,
          tour_leader_cost,
          status: 'draft'
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating B2B quote:', error)
      } else {
        b2b_quote = createdQuote
        console.log(`✅ B2B Quote created: ${b2b_quote?.quote_number}`)
      }
    } catch (error) {
      console.error('Error creating B2B quote:', error)
    }
  }

  return { b2c_quote, b2b_quote }
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user and tenant
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const userPrefs = await getUserPreferences(supabase)
    
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      tour_name,
      start_date,
      duration_days: raw_duration_days,
      num_adults = 2,
      num_children = 0,
      language = 'English',
      conversation_language,
      interests = [],
      cities = [],
      special_requests = [],
      budget_level = 'standard',
      tier: raw_tier = null,
      hotel_name,
      city = 'Cairo',
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = true,
      margin_percent = userPrefs.default_margin_percent,
      currency = userPrefs.default_currency,
      cost_mode = userPrefs.default_cost_mode,
      package_type: requested_package_type = 'land-package',
      skip_pricing = false,
      
      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null, // 'creative' | 'structured' | null

      // NEW: Quote type for Phase 1B
      quote_type = 'none' // 'b2c' | 'b2b' | 'both' | 'none'
    } = body

    const finalTourName = tour_requested || tour_name || 'Egypt Tour'
    const finalLanguage = language !== 'English' ? language : (conversation_language || 'English')
    const tier: ServiceTier = raw_tier ? normalizeTier(raw_tier) : budget_level !== 'standard' ? normalizeTier(budget_level) : userPrefs.default_tier

    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date' },
        { status: 400 }
      )
    }

    // ============================================
    // DETERMINE INPUT MODE
    // ============================================
    let inputMode: InputMode = 'creative'
    
    if (input_mode_override === 'structured') {
      inputMode = 'structured'
    } else if (input_mode_override === 'creative') {
      inputMode = 'creative'
    } else if (is_structured_input && extracted_days && extracted_days.length > 0) {
      inputMode = 'structured'
    } else if (raw_itinerary) {
      // Auto-detect structured input from raw itinerary patterns
      // D1, D2, D3... OR 2NTS CAI, 3NTS CRZ... OR Day 1:, Day 2:...
      const structuredPatterns = [
        /\bD\d+\b/i,                    // D1, D2, D3...
        /\d+\s*NTS?\s*[A-Z]{2,4}/i,     // 2NTS CAI, 3NTS CRZ
        /\bDay\s*\d+\s*[:\-–]/i,        // Day 1:, Day 2:
        /PROGRAM\s*:/i,                  // PROGRAM: header
        /\b[A-Z]{3}\/[A-Z]{3}\b/        // CAI/ALX, LXR/HRG city transitions
      ]
      
      if (structuredPatterns.some(pattern => pattern.test(raw_itinerary))) {
        inputMode = 'structured'
        console.log('🔍 Auto-detected structured input from patterns in raw_itinerary')
      }
    }

    console.log('🤖 Input Mode:', inputMode, '| Override:', input_mode_override, '| is_structured_input:', is_structured_input)

    let duration_days = parseInt(raw_duration_days) || 1
    
    // For structured mode, calculate days from raw itinerary
    if (inputMode === 'structured' && raw_itinerary) {
      const calculatedDays = calculateExpectedDays(raw_itinerary, extracted_days)
      if (calculatedDays > duration_days) {
        duration_days = calculatedDays
        console.log(`📊 Adjusted duration to ${duration_days} days based on itinerary analysis`)
      }
    } else if (inputMode === 'structured' && extracted_days?.length) {
      duration_days = extracted_days.length
    }

    // ============================================
    // CRUISE DETECTION (for both modes now)
    // ============================================
    const cruiseDetection = detectCruiseRequest(
      finalTourName, 
      interests, 
      cities, 
      special_requests, 
      duration_days,
      raw_itinerary || '' // Pass raw itinerary for better detection
    )

    // Adjust duration for cruise if needed
    if (cruiseDetection.isCruise && duration_days === 1) {
      duration_days = cruiseDetection.detectedDuration || (cruiseDetection.cruiseType === 'lake-nasser' ? 4 : 5)
      console.log(`🚢 Adjusted cruise duration to ${duration_days} days`)
    }

    // UPDATED: Determine effective package type
    const effectivePackageType = determinePackageType(requested_package_type, cruiseDetection)
    console.log(`📦 Package type: ${effectivePackageType}`)

    let effectiveCity = city
    if (cruiseDetection.isCruise && cruiseDetection.startCity) {
      effectiveCity = cruiseDetection.startCity
    } else if (cities.length > 0) {
      effectiveCity = cities[0]
    }

    console.log('🤖 Starting itinerary generation:', {
      client: client_name,
      inputMode,
      isCruise: cruiseDetection.isCruise,
      packageType: effectivePackageType,
      tier,
      duration: duration_days,
      startCity: effectiveCity
    })

    const totalPax = num_adults + num_children

    // Passport type
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland']
      isEuroPassport = euCountries.some(c => nationality.toLowerCase().includes(c))
    }
    isEuroPassport = isEuroPassport ?? false

    // Calculate dates
    const startDateObj = new Date(start_date)
    const endDate = new Date(startDateObj)
    endDate.setDate(startDateObj.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const tierPrefix = tier.charAt(0).toUpperCase()
    const itinerary_code = `ITN-${tierPrefix}-${year}-${randomNum}`

    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

    // ============================================
    // CRUISE-ONLY PATH (creative mode, pure cruise)
    // ============================================
    if (cruiseDetection.isCruise && inputMode === 'creative' && effectivePackageType === 'cruise-package') {
      console.log('🚢 Processing as PURE CRUISE itinerary (creative mode)...')
      
      const cruiseContent = await findCruiseContent(cruiseDetection, tier, duration_days)
      
      if (cruiseContent.found && cruiseContent.dayByDay.length > 0) {
        console.log(`📚 Using Content Library cruise: ${cruiseContent.content.name}`)
        
        // Use Content Library duration if available
        if (cruiseContent.content.duration_days) {
          duration_days = cruiseContent.content.duration_days
        }
        
        const cruiseRate = await getCruiseRate(tier, cruiseContent.recommendedSuppliers, supabase)
        console.log(`💰 Cruise rate: €${cruiseRate.perPersonPerNight}/person/night on ${cruiseRate.shipName}`)

        const nights = duration_days - 1
        
        // Create itinerary - UPDATED: Use effectivePackageType
        const { data: itinerary, error: itineraryError } = await supabase
          .from('itineraries')
          .insert({
            tenant_id,
            itinerary_code,
            client_name,
            client_email: client_email || null,
            client_phone: client_phone || null,
            trip_name: cruiseContent.variation.title || cruiseContent.content.name,
            start_date,
            end_date: endDate.toISOString().split('T')[0],
            total_days: duration_days,
            num_adults,
            num_children,
            currency,
            total_cost: 0,
            total_revenue: 0,
            margin_percent,
            status: skip_pricing ? 'draft' : 'quoted',
            tier,
            package_type: effectivePackageType,
            cost_mode,
            notes: special_requests.length > 0 ? special_requests.join('; ') : null,
            client_id
          })
          .select()
          .single()

        if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)

        console.log('✅ Created cruise itinerary:', itinerary.id)

        let totalSupplierCost = 0
        let totalClientPrice = 0

        // Create days from Content Library
        for (const dayData of cruiseContent.dayByDay) {
          const dayDate = new Date(startDateObj)
          dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

          const { data: day, error: dayError } = await supabase
            .from('itinerary_days')
            .insert({
              itinerary_id: itinerary.id,
              day_number: dayData.day_number,
              date: dayDate.toISOString().split('T')[0],
              title: dayData.title,
              description: dayData.description,
              city: dayData.city || effectiveCity,
              overnight_city: dayData.overnight || `On board - ${dayData.city}`,
              attractions: dayData.attractions || [],
              guide_required: true,
              lunch_included: dayData.meals?.includes('lunch') ?? true,
              dinner_included: dayData.meals?.includes('dinner') ?? true,
              hotel_included: false
            })
            .select()
            .single()

          if (dayError) {
            console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
            continue
          }

          if (skip_pricing) continue

          // Add cruise service (per night)
          const isLastDay = dayData.day_number === duration_days
          if (!isLastDay) {
            const nightCost = cruiseRate.perPersonPerNight * totalPax
            const nightClientPrice = withMargin(nightCost)

            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'cruise',
              service_code: cruiseRate.supplierId || 'CRUISE',
              service_name: `${cruiseRate.shipName} - Full Board`,
              supplier_name: cruiseRate.shipName,
              quantity: totalPax,
              rate_eur: cruiseRate.perPersonPerNight,
              rate_non_eur: cruiseRate.perPersonPerNight,
              total_cost: nightCost,
              client_price: nightClientPrice,
              notes: `Night ${dayData.day_number}: ${dayData.overnight || 'On board'}`
            })

            totalSupplierCost += nightCost
            totalClientPrice += nightClientPrice
          }

          // Add entrance fees
          if (dayData.attractions?.length > 0) {
            const { data: entranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)
            
            let dayEntranceTotal = 0
            const matchedAttractions: string[] = []

            for (const attractionName of dayData.attractions) {
              const fee = entranceFees?.find((ef: any) =>
                ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
                attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
              )

              if (fee) {
                const feePerPerson = isEuroPassport ? toNumber(fee.eur_rate, 0) : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
                dayEntranceTotal += feePerPerson * totalPax
                matchedAttractions.push(fee.attraction_name)
              }
            }

            if (dayEntranceTotal > 0) {
              await supabase.from('itinerary_services').insert({
                itinerary_day_id: day.id,
                service_type: 'entrance',
                service_code: 'ENTRANCE-FEES',
                service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'} rates)`,
                quantity: totalPax,
                rate_eur: dayEntranceTotal / totalPax,
                rate_non_eur: dayEntranceTotal / totalPax,
                total_cost: dayEntranceTotal,
                client_price: withMargin(dayEntranceTotal),
                notes: `Sites: ${matchedAttractions.join(', ')}`
              })

              totalSupplierCost += dayEntranceTotal
              totalClientPrice += withMargin(dayEntranceTotal)
            }
          }
        }

        // Update totals
        if (!skip_pricing) {
          await supabase.from('itineraries').update({
            total_cost: totalClientPrice,
            total_revenue: totalClientPrice,
            supplier_cost: totalSupplierCost,
            profit: totalClientPrice - totalSupplierCost
          }).eq('id', itinerary.id)
        }

        console.log('🎉 Cruise itinerary complete!')

        // Create quotes if requested and not in draft mode
        let cruiseQuotesCreated = { b2c_quote: null, b2b_quote: null }
        if (!skip_pricing && quote_type !== 'none') {
          console.log(`📝 Creating ${quote_type} quote(s) for cruise...`)
          cruiseQuotesCreated = await createQuotesForItinerary({
            itinerary_id: itinerary.id,
            quote_type: quote_type as 'b2c' | 'b2b' | 'both' | 'none',
            num_travelers: totalPax,
            tier,
            margin_percent,
            currency,
            client_id: client_id,
            partner_id: null
          })
        }

        return NextResponse.json({
          success: true,
          data: {
            id: itinerary.id,
            itinerary_id: itinerary.id,
            itinerary_code: itinerary.itinerary_code,
            trip_name: cruiseContent.variation.title || cruiseContent.content.name,
            tier,
            package_type: effectivePackageType,
            is_cruise: true,
            cruise_ship: cruiseRate.shipName,
            generation_mode: 'creative',
            mode: skip_pricing ? 'draft' : 'quoted',
            redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
            currency,
            total_days: duration_days,
            ...(skip_pricing ? {} : {
              supplier_cost: totalSupplierCost,
              total_cost: totalClientPrice,
              margin: totalClientPrice - totalSupplierCost,
              per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
              content_library_used: true,
              cruise_content: cruiseContent.content.name
            }),
            // Include quote information if created
            ...(cruiseQuotesCreated.b2c_quote ? { b2c_quote: cruiseQuotesCreated.b2c_quote } : {}),
            ...(cruiseQuotesCreated.b2b_quote ? { b2b_quote: cruiseQuotesCreated.b2b_quote } : {})
          }
        })
      } else {
        console.log('⚠️ No cruise content in Content Library, falling back to AI generation')
        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR / CRUISE+LAND PATH (STRUCTURED OR CREATIVE)
    // ============================================
    console.log(`🏛️ Processing as ${effectivePackageType} itinerary (${inputMode} mode)...`)

    // Fetch rates and content
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const contentLibrary = await fetchContentLibrary(tier, searchCities, interests)
    const writingRules = await fetchWritingRules()
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)
    const attractionNames = await fetchAttractionsList(supabase)

    // Determine inclusions based on package type
    let includeAccommodationFinal = include_accommodation
    if (effectivePackageType === 'day-trips' || effectivePackageType === 'tours-only') {
      includeAccommodationFinal = false
    }

    // Fetch rates
    const { data: vehicles } = await supabase.from('vehicles').select('*').eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false })
    let selectedVehicle = (vehicles?.find((v: any) => totalPax >= toNumber(v.capacity_min, 1) && totalPax <= toNumber(v.capacity_max, 99)) || vehicles?.[vehicles.length - 1]) as any

    const { data: guides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [finalLanguage]).limit(5)
    let selectedGuide = guides?.[0] as any

    const { data: allEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)
    
    const { data: mealRates } = await supabase.from('meal_rates').select('*').eq('is_active', true).limit(1)
    const tierMealMultiplier: Record<ServiceTier, number> = { 'budget': 0.8, 'standard': 1.0, 'deluxe': 1.3, 'luxury': 1.6 }
    let lunchRate = Math.round(toNumber(mealRates?.[0]?.lunch_rate_eur, 12) * tierMealMultiplier[tier])
    let dinnerRate = Math.round(toNumber(mealRates?.[0]?.dinner_rate_eur, 18) * tierMealMultiplier[tier])

    // Fetch airport services rates
    const { data: airportServicesData } = await supabase.from('airport_services').select('*').eq('is_active', true)
    const airportServiceRate = airportServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 25

    // Fetch hotel services rates
    const { data: hotelServicesData } = await supabase.from('hotel_services').select('*').eq('is_active', true)
    const hotelServiceRate = hotelServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 15

    let hotelRate = 0
    let hotelName_final = hotel_name || 'Standard Hotel'
    let selectedHotel = null

    if (includeAccommodationFinal) {
      const { data: hotels } = await supabase.from('hotel_contacts').select('*').ilike('city', effectiveCity).eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false }).limit(5)
      if (hotels?.length) {
        selectedHotel = hotels[0] as any
        hotelRate = toNumber(selectedHotel.rate_double_eur, 80)
        hotelName_final = selectedHotel.name
      } else {
        const defaultRates: Record<ServiceTier, number> = { 'budget': 45, 'standard': 80, 'deluxe': 120, 'luxury': 180 }
        hotelRate = defaultRates[tier]
      }
    }

    const { data: tippingRates } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
    let dailyTips = tippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 15
    const tierTipsMultiplier: Record<ServiceTier, number> = { 'budget': 0.8, 'standard': 1.0, 'deluxe': 1.2, 'luxury': 1.5 }
    dailyTips = Math.round(dailyTips * tierTipsMultiplier[tier])

    const vehiclePerDay = selectedVehicle ? toNumber(selectedVehicle.daily_rate_eur, 50) : 50
    const guidePerDay = selectedGuide ? toNumber(selectedGuide.daily_rate_eur, 55) : 55
    const roomsNeeded = Math.ceil(totalPax / 2)

    // ============================================
    // GENERATE ITINERARY CONTENT
    // ============================================

    let itineraryData: any

    if (inputMode === 'structured' && raw_itinerary) {
      console.log('📋 Using STRUCTURED mode - following provided itinerary')
      
      itineraryData = await generateFromStructuredInput(
        extracted_days || [],
        raw_itinerary,
        {
          tier,
          totalPax,
          language: finalLanguage,
          attractionNames,
          writingRules,
          packageType: effectivePackageType
        }
      )
    } else {
      console.log('🎨 Using CREATIVE mode - AI generating itinerary')
      
      itineraryData = await generateCreativeItinerary({
        clientName: client_name,
        tourName: finalTourName,
        durationDays: duration_days,
        tier,
        totalPax,
        numAdults: num_adults,
        numChildren: num_children,
        language: finalLanguage,
        cities,
        interests,
        specialRequests: special_requests,
        startDate: start_date,
        effectiveCity,
        attractionNames,
        contentContext,
        writingContext,
        includeLunch: include_lunch,
        includeDinner: include_dinner,
        includeAccommodation: includeAccommodationFinal
      })
    }

    // Update duration from AI result
    if (itineraryData.total_days) {
      duration_days = itineraryData.total_days
    }

    // Recalculate end date
    const finalEndDate = new Date(startDateObj)
    finalEndDate.setDate(startDateObj.getDate() + duration_days - 1)

    // Create itinerary record - UPDATED: Use effectivePackageType
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        tenant_id,
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name || finalTourName,
        start_date,
        end_date: finalEndDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency,
        total_cost: 0,
        total_revenue: 0,
        margin_percent,
        status: skip_pricing ? 'draft' : 'quoted',
        tier,
        package_type: effectivePackageType,
        cost_mode,
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        client_id
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Failed to create itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log(`✅ Created itinerary ${itinerary.id} with ${duration_days} days`)

    // Create days and services
    let totalSupplierCost = 0
    let totalClientPrice = 0

    for (const dayData of itineraryData.days || []) {
      const dayNumber = dayData.day_number || 1
      const dayDate = new Date(startDateObj)
      dayDate.setDate(startDateObj.getDate() + dayNumber - 1)

      const isLastDay = dayNumber === duration_days
      const isTransferOnly = dayData.is_transfer_only || false
      const isSailingDay = dayData.is_sailing_day || false
      const isFreeDay = dayData.is_free_day || isSailingDay || false
      const isCruiseDay = dayData.is_cruise_day || dayData.accommodation_type === 'cruise'
      const dayNeedsGuide = dayData.guide_required !== false && !isTransferOnly && !isFreeDay
      const dayIncludesLunch = isFreeDay ? false : (dayData.includes_lunch ?? include_lunch)
      const dayIncludesDinner = dayData.includes_dinner ?? include_dinner
      const includesHotelForDay = !isLastDay && includeAccommodationFinal && !isCruiseDay && (dayData.includes_hotel !== false)

      // Generate appropriate title for free/sailing days
      let dayTitle = dayData.title || `Day ${dayNumber}`
      if (isSailingDay && !dayTitle.toLowerCase().includes('sailing')) {
        dayTitle = `Day ${dayNumber}: Sailing Day on the Nile`
      } else if (isFreeDay && !isSailingDay && !dayTitle.toLowerCase().includes('free') && !dayTitle.toLowerCase().includes('leisure')) {
        dayTitle = `Day ${dayNumber}: Day at Leisure`
      }

      // Create day record
      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayNumber,
          date: dayDate.toISOString().split('T')[0],
          title: dayTitle,
          description: dayData.description || '',
          city: dayData.city || effectiveCity,
          overnight_city: dayData.overnight_city || dayData.city || effectiveCity,
          attractions: dayData.attractions || [],
          guide_required: dayNeedsGuide,
          lunch_included: dayIncludesLunch,
          dinner_included: dayIncludesDinner,
          hotel_included: includesHotelForDay
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error creating day ${dayNumber}:`, dayError)
        continue
      }

      if (skip_pricing) continue

      // Handle departure day - only transfer
      if (dayData.is_departure && isTransferOnly) {
        const transferCost = vehiclePerDay * 0.5
        await supabase.from('itinerary_services').insert({
          itinerary_day_id: day.id,
          service_type: 'transportation',
          service_code: 'TRANSFER',
          service_name: 'Airport Transfer',
          quantity: 1,
          rate_eur: transferCost,
          rate_non_eur: transferCost,
          total_cost: transferCost,
          client_price: withMargin(transferCost),
          notes: 'Transfer to airport'
        })
        totalSupplierCost += transferCost
        totalClientPrice += withMargin(transferCost)
        continue
      }

      // Services array
      const services: any[] = []

      // Airport Services (for arrivals/departures/domestic flights)
      if (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) {
        const isInternational = dayData.is_arrival || dayData.is_departure
        const serviceDesc = isInternational ? 'Airport Meet & Assist (International)' : 'Airport Meet & Assist (Domestic)'
        
        services.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: serviceDesc,
          quantity: 1,
          rate_eur: airportServiceRate,
          rate_non_eur: airportServiceRate,
          total_cost: airportServiceRate,
          client_price: withMargin(airportServiceRate),
          notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
        })
        totalSupplierCost += airportServiceRate
        totalClientPrice += withMargin(airportServiceRate)
      }

      // Hotel Services (for check-in/check-out including cruise)
      if (dayData.needs_hotel_service && !isFreeDay) {
        const isCruiseService = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
        services.push({
          service_type: 'hotel_service',
          service_code: 'HOTEL-SVC',
          service_name: isCruiseService ? 'Cruise Boarding Assistance' : 'Hotel Porterage & Assistance',
          quantity: 1,
          rate_eur: hotelServiceRate,
          rate_non_eur: hotelServiceRate,
          total_cost: hotelServiceRate,
          client_price: withMargin(hotelServiceRate),
          notes: isCruiseService ? 'Cruise embarkation/disembarkation assistance' : 'Hotel check-in/out assistance'
        })
        totalSupplierCost += hotelServiceRate
        totalClientPrice += withMargin(hotelServiceRate)
      }

      // Transportation (always included unless it's a free day)
      if (!isFreeDay) {
        const transportRate = isTransferOnly ? vehiclePerDay * 0.5 : vehiclePerDay
        services.push({
          service_type: 'transportation',
          service_code: selectedVehicle?.id || 'TRANS',
          service_name: isTransferOnly ? 'Airport/Hotel Transfer' : `${selectedVehicle?.vehicle_type || 'Vehicle'} Transportation`,
          supplier_name: selectedVehicle?.company_name || null,
          quantity: 1,
          rate_eur: transportRate,
          rate_non_eur: transportRate,
          total_cost: transportRate,
          client_price: withMargin(transportRate),
          notes: `From ${dayData.city || effectiveCity}`
        })
        totalSupplierCost += transportRate
        totalClientPrice += withMargin(transportRate)
      }

      // Guide (only if required for this day)
      if (dayNeedsGuide) {
        services.push({
          service_type: 'guide',
          service_code: selectedGuide?.id || 'GUIDE',
          service_name: `${finalLanguage} Speaking Guide`,
          supplier_name: selectedGuide?.name || null,
          quantity: 1,
          rate_eur: guidePerDay,
          rate_non_eur: guidePerDay,
          total_cost: guidePerDay,
          client_price: withMargin(guidePerDay),
          notes: `Professional ${finalLanguage} guide`
        })
        totalSupplierCost += guidePerDay
        totalClientPrice += withMargin(guidePerDay)

       // Tips (only when guide is present)
       services.push({
        service_type: 'tips',
        service_code: 'TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: dailyTips,
        rate_non_eur: dailyTips,
        total_cost: dailyTips,
        client_price: withMargin(dailyTips),
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += dailyTips
      totalClientPrice += withMargin(dailyTips)
      }

      // Entrance fees (ONLY for INSIDE attractions, not OUTSIDE photo stops)
      const entranceAttractions = dayData.entrance_included || dayData.attractions || []
      const photoStops = dayData.photo_stops || []
      
      if (entranceAttractions.length > 0 && !isTransferOnly && !isFreeDay) {
        let dayEntranceTotal = 0
        const matchedAttractions: string[] = []
        
        for (const attr of entranceAttractions) {
          // Skip if this attraction is in photo_stops (OUTSIDE)
          if (photoStops.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
            continue
          }
          
          const fee = allEntranceFees?.find((ef: any) =>
            ef.attraction_name.toLowerCase().includes(attr.toLowerCase()) ||
            attr.toLowerCase().includes(ef.attraction_name.toLowerCase())
          )
          
          if (fee) {
            // Check if it's an add-on (should be excluded from automatic pricing)
            if (fee.is_addon) continue
            
            const feePerPerson = isEuroPassport 
              ? toNumber(fee.eur_rate, 0) 
              : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
            dayEntranceTotal += feePerPerson * totalPax
            matchedAttractions.push(fee.attraction_name)
          }
        }
        
        if (dayEntranceTotal > 0) {
          const notesText = photoStops.length > 0 
            ? `Inside: ${matchedAttractions.join(', ')} | Photo stops: ${photoStops.join(', ')}`
            : `Sites: ${matchedAttractions.join(', ')}`
          
          services.push({
            service_type: 'entrance',
            service_code: 'ENTRANCE',
            service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
            quantity: totalPax,
            rate_eur: dayEntranceTotal / totalPax,
            rate_non_eur: dayEntranceTotal / totalPax,
            total_cost: dayEntranceTotal,
            client_price: withMargin(dayEntranceTotal),
            notes: notesText
          })
          totalSupplierCost += dayEntranceTotal
          totalClientPrice += withMargin(dayEntranceTotal)
        }
      }

      // Lunch (only if included for this day)
      if (dayIncludesLunch) {
        const lunchCost = lunchRate * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'LUNCH',
          service_name: 'Lunch',
          quantity: totalPax,
          rate_eur: lunchRate,
          rate_non_eur: lunchRate,
          total_cost: lunchCost,
          client_price: withMargin(lunchCost),
          notes: 'Lunch at local restaurant'
        })
        totalSupplierCost += lunchCost
        totalClientPrice += withMargin(lunchCost)
      }

      // Dinner (only if included for this day)
      if (dayIncludesDinner) {
        const dinnerCost = dinnerRate * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'DINNER',
          service_name: 'Dinner',
          quantity: totalPax,
          rate_eur: dinnerRate,
          rate_non_eur: dinnerRate,
          total_cost: dinnerCost,
          client_price: withMargin(dinnerCost),
          notes: 'Dinner'
        })
        totalSupplierCost += dinnerCost
        totalClientPrice += withMargin(dinnerCost)
      }

       // Water (for touring days only)
      if (!isTransferOnly && !isFreeDay) {
        const waterCost = 2 * totalPax
        services.push({
          service_type: 'supplies',
          service_code: 'WATER',
          service_name: 'Water Bottles',
          quantity: totalPax,
          rate_eur: 2,
          rate_non_eur: 2,
          total_cost: waterCost,
          client_price: withMargin(waterCost),
          notes: 'Bottled water'
        })
        totalSupplierCost += waterCost
        totalClientPrice += withMargin(waterCost)
      }

      // Hotel (only if included and not last day and not cruise day)
      if (includesHotelForDay && hotelRate > 0) {
        const hotelCost = hotelRate * roomsNeeded
        services.push({
          service_type: 'accommodation',
          service_code: selectedHotel?.id || 'HOTEL',
          service_name: `${hotelName_final} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          supplier_name: hotelName_final,
          quantity: roomsNeeded,
          rate_eur: hotelRate,
          rate_non_eur: hotelRate,
          total_cost: hotelCost,
          client_price: withMargin(hotelCost),
          notes: `Overnight at ${hotelName_final}`
        })
        totalSupplierCost += hotelCost
        totalClientPrice += withMargin(hotelCost)
      }

      // Cruise accommodation (for cruise days)
      if (isCruiseDay && !isLastDay) {
        const cruiseRate = await getCruiseRate(tier, [], supabase)
        const nightCost = cruiseRate.perPersonPerNight * totalPax
        services.push({
          service_type: 'cruise',
          service_code: cruiseRate.supplierId || 'CRUISE',
          service_name: `${cruiseRate.shipName} - Full Board`,
          supplier_name: cruiseRate.shipName,
          quantity: totalPax,
          rate_eur: cruiseRate.perPersonPerNight,
          rate_non_eur: cruiseRate.perPersonPerNight,
          total_cost: nightCost,
          client_price: withMargin(nightCost),
          notes: `Night ${dayNumber}: On board`
        })
        totalSupplierCost += nightCost
        totalClientPrice += withMargin(nightCost)
      }

      // Insert all services
      for (const svc of services) {
        await supabase.from('itinerary_services').insert({
          itinerary_day_id: day.id,
          ...svc
        })
      }
    }

    // Update totals
    if (!skip_pricing) {
      await supabase.from('itineraries').update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        supplier_cost: totalSupplierCost,
        profit: totalClientPrice - totalSupplierCost,
        status: 'quoted'
      }).eq('id', itinerary.id)
    }

    console.log('🎉 Land tour itinerary complete!', {
      id: itinerary.id,
      mode: inputMode,
      packageType: effectivePackageType,
      days: duration_days,
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice
    })

    // Create quotes if requested and not in draft mode
    let quotesCreated = { b2c_quote: null, b2b_quote: null }
    if (!skip_pricing && quote_type !== 'none') {
      console.log(`📝 Creating ${quote_type} quote(s)...`)
      quotesCreated = await createQuotesForItinerary({
        itinerary_id: itinerary.id,
        quote_type: quote_type as 'b2c' | 'b2b' | 'both' | 'none',
        num_travelers: totalPax,
        tier,
        margin_percent,
        currency,
        client_id: client_id,
        partner_id: null
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier,
        package_type: effectivePackageType,
        is_cruise: cruiseDetection.isCruise,
        generation_mode: inputMode,
        mode: skip_pricing ? 'draft' : 'quoted',
        redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
        currency,
        total_days: duration_days,
        ...(skip_pricing ? {} : {
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100
        }),
        // Include quote information if created
        ...(quotesCreated.b2c_quote ? { b2c_quote: quotesCreated.b2c_quote } : {}),
        ...(quotesCreated.b2b_quote ? { b2b_quote: quotesCreated.b2b_quote } : {})
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate itinerary' },
      { status: 500 }
    )
  }
}