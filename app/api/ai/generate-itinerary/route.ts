import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Admin client for bypassing RLS on content library
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default margin percentage (used if no user preference)
const DEFAULT_MARGIN_PERCENT = 25

// ============================================
// TIER SYSTEM CONSTANTS
// ============================================
type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
type InputMode = 'creative' | 'structured'

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
}

function detectCruiseRequest(
  tourRequested: string,
  interests: string[],
  cities: string[],
  specialRequests: string[]
): CruiseDetectionResult {
  const allText = [
    tourRequested || '',
    ...(interests || []),
    ...(cities || []),
    ...(specialRequests || [])
  ].join(' ').toLowerCase()

  // Cruise keywords
  const cruiseKeywords = [
    'nile cruise', 'cruise', 'river cruise', 'boat cruise',
    'felucca', 'dahabiya', 'sailing', 'cruise ship',
    'lake nasser', 'floating hotel'
  ]

  const matchedKeywords = cruiseKeywords.filter(keyword => allText.includes(keyword))
  const isCruise = matchedKeywords.length > 0

  if (!isCruise) {
    return {
      isCruise: false,
      cruiseType: null,
      route: null,
      detectedDuration: null,
      startCity: null,
      endCity: null,
      keywords: []
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

  if (allText.includes('luxor to aswan') || allText.includes('luxor-aswan') || allText.includes('luxor aswan')) {
    route = 'luxor-aswan'
    startCity = 'Luxor'
    endCity = 'Aswan'
  } else if (allText.includes('aswan to luxor') || allText.includes('aswan-luxor') || allText.includes('aswan luxor')) {
    route = 'aswan-luxor'
    startCity = 'Aswan'
    endCity = 'Luxor'
  } else if (allText.includes('round trip') || allText.includes('round-trip')) {
    route = 'round-trip'
    startCity = 'Luxor'
    endCity = 'Luxor'
  } else if (cruiseType === 'lake-nasser') {
    route = 'aswan-abu-simbel'
    startCity = 'Aswan'
    endCity = 'Abu Simbel'
  }

  // If no explicit route, infer from cities
  if (!route && cities && cities.length > 0) {
    const citiesLower = cities.map(c => c.toLowerCase())
    if (citiesLower.includes('luxor') && citiesLower.includes('aswan')) {
      route = 'luxor-aswan'
      startCity = 'Luxor'
      endCity = 'Aswan'
    } else if (citiesLower.includes('luxor')) {
      route = 'luxor-aswan'
      startCity = 'Luxor'
      endCity = 'Aswan'
    } else if (citiesLower.includes('aswan')) {
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    }
  }

  // Default route if still not determined
  if (!route) {
    route = 'luxor-aswan'
    startCity = 'Luxor'
    endCity = 'Aswan'
  }

  // Detect duration from text
  let detectedDuration: number | null = null
  const durationPatterns = [
    { pattern: /(\d+)\s*night/i, addOne: true },
    { pattern: /(\d+)\s*day/i, addOne: false },
    { pattern: /(\d+)-night/i, addOne: true },
    { pattern: /(\d+)-day/i, addOne: false }
  ]

  for (const { pattern, addOne } of durationPatterns) {
    const match = allText.match(pattern)
    if (match) {
      const num = parseInt(match[1])
      detectedDuration = addOne ? num + 1 : num
      break
    }
  }

  console.log(`🚢 CRUISE DETECTED:`, {
    type: cruiseType,
    route,
    startCity,
    endCity,
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
    keywords: matchedKeywords
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
    let query = supabaseAdmin
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
      const { data: fallbackCruises } = await supabaseAdmin
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

      const content = fallbackCruises[0]
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
    let bestMatch = cruises[0]
    if (requestedDuration) {
      const durationMatch = cruises.find(c => c.duration_days === requestedDuration)
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
  rule_type: string
  rule_text: string
  category: string
  priority: number
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

    const { data: variations, error } = await supabaseAdmin
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
    const { data: rules, error } = await supabaseAdmin
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

  const enforceRules = rules.filter(r => r.rule_type === 'enforce').slice(0, 5)
  const avoidRules = rules.filter(r => r.rule_type === 'avoid').slice(0, 5)

  if (enforceRules.length > 0) {
    context += 'MUST follow:\n'
    enforceRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  if (avoidRules.length > 0) {
    context += 'AVOID:\n'
    avoidRules.forEach(r => context += `- ${r.rule_text}\n`)
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

async function generateFromStructuredInput(
  extractedDays: ExtractedDay[],
  rawItinerary: string,
  params: {
    tier: ServiceTier
    totalPax: number
    language: string
    attractionNames: string[]
    writingRules: WritingRule[]
  }
): Promise<any> {
  const { tier, totalPax, language, attractionNames, writingRules } = params
  const writingContext = buildWritingRulesContext(writingRules)

  const prompt = `You are a travel operations assistant. The user has provided a SPECIFIC day-by-day itinerary that you must FOLLOW EXACTLY.

CRITICAL INSTRUCTION: You are NOT creating an itinerary. You are CONVERTING the provided plan into the required JSON format while:
1. PRESERVING the exact structure (same number of days, same dates)
2. PRESERVING the exact activities for each day
3. ONLY adding professional descriptions - never changing the content
4. Matching attraction names to our database where possible

PROVIDED ITINERARY:
${rawItinerary}

PARSED STRUCTURE (for reference):
${JSON.stringify(extractedDays, null, 2)}

AVAILABLE ATTRACTIONS IN OUR DATABASE (use exact names when matching):
${attractionNames.join(', ')}

SERVICE TIER: ${tier.toUpperCase()} (${TIER_DESCRIPTIONS[tier]})
TRAVELERS: ${totalPax} people
GUIDE LANGUAGE: ${language}
${writingContext}

YOUR TASK:
Convert this into our JSON format. For each day:
1. Keep the EXACT date and activities from the input
2. Write a professional 2-3 sentence description
3. Match attractions to our database names (use closest match)
4. Set guide_required ONLY if explicitly mentioned in the original OR if it's a sightseeing day with attractions
5. Set includes_lunch/includes_dinner ONLY if explicitly mentioned
6. For transfer-only days: keep activities minimal, description brief, guide_required: false

STRICT RULES:
- Do NOT add attractions not in the original itinerary
- Do NOT add meals unless explicitly mentioned
- Do NOT reorder or combine days
- Do NOT skip any days from the input
- If original says "transfer to hotel" - that's the ONLY activity
- Arrival days with just transfer = is_transfer_only: true

Return ONLY valid JSON:
{
  "trip_name": "descriptive name based on the itinerary",
  "total_days": ${extractedDays.length},
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "title": "Day 1: [title from input]",
      "description": "Professional 2-3 sentence description",
      "city": "city name",
      "overnight_city": "overnight city",
      "is_arrival": true/false,
      "is_departure": true/false,
      "is_transfer_only": true/false,
      "is_free_day": true/false,
      "attractions": ["Exact Attraction Name from database"],
      "activities": ["activity descriptions from input"],
      "guide_required": true/false,
      "includes_lunch": true/false,
      "includes_dinner": true/false,
      "includes_hotel": true/false,
      "transport_notes": "flight/transfer info if any",
      "hotel_name": "hotel if mentioned"
    }
  ]
}

Remember: Your job is to FORMAT the provided itinerary, not to CREATE a new one.`

  const message = await anthropic.messages.create({
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

  // Parse JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON')
  }

  return JSON.parse(jsonMatch[0])
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

  const message = await anthropic.messages.create({
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
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createClient()
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
      package_type = 'full-package',
      skip_pricing = false,
      
      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null // 'creative' | 'structured' | null
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
    }

    console.log('🤖 Input Mode:', inputMode)

    // ============================================
    // CRUISE DETECTION (only for creative mode)
    // ============================================
    const cruiseDetection = inputMode === 'creative' 
      ? detectCruiseRequest(finalTourName, interests, cities, special_requests)
      : { isCruise: false, cruiseType: null, route: null, detectedDuration: null, startCity: null, endCity: null, keywords: [] }

    let duration_days = parseInt(raw_duration_days) || 1
    
    // For structured mode, use extracted days count
    if (inputMode === 'structured' && extracted_days?.length) {
      duration_days = extracted_days.length
    }
    // Adjust duration for cruise if needed
    else if (cruiseDetection.isCruise && duration_days === 1) {
      duration_days = cruiseDetection.detectedDuration || (cruiseDetection.cruiseType === 'lake-nasser' ? 4 : 5)
      console.log(`🚢 Adjusted cruise duration to ${duration_days} days`)
    }

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
    // CRUISE PATH (only for creative mode)
    // ============================================
    if (cruiseDetection.isCruise && inputMode === 'creative') {
      console.log('🚢 Processing as CRUISE itinerary...')
      
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
        
        // Create itinerary
        const { data: itinerary, error: itineraryError } = await supabase
          .from('itineraries')
          .insert({
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
            package_type: 'nile-cruise',
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

        return NextResponse.json({
          success: true,
          data: {
            id: itinerary.id,
            itinerary_id: itinerary.id,
            itinerary_code: itinerary.itinerary_code,
            trip_name: cruiseContent.variation.title || cruiseContent.content.name,
            tier,
            package_type: 'nile-cruise',
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
            })
          }
        })
      } else {
        console.log('⚠️ No cruise content in Content Library, falling back to AI generation')
        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR PATH (STRUCTURED OR CREATIVE)
    // ============================================
    console.log(`🏛️ Processing as LAND TOUR itinerary (${inputMode} mode)...`)

    // Fetch rates and content
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const contentLibrary = await fetchContentLibrary(tier, searchCities, interests)
    const writingRules = await fetchWritingRules()
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)
    const attractionNames = await fetchAttractionsList(supabase)

    // Determine inclusions based on package type
    let includeAccommodationFinal = include_accommodation
    if (package_type === 'day-trips' || package_type === 'tours-only') {
      includeAccommodationFinal = false
    }

    // Fetch rates
    const { data: vehicles } = await supabase.from('vehicles').select('*').eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false })
    let selectedVehicle = vehicles?.find((v: any) => totalPax >= toNumber(v.capacity_min, 1) && totalPax <= toNumber(v.capacity_max, 99)) || vehicles?.[vehicles.length - 1]
    
    const { data: guides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [finalLanguage]).limit(5)
    let selectedGuide = guides?.[0]

    const { data: allEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)
    
    const { data: mealRates } = await supabase.from('meal_rates').select('*').eq('is_active', true).limit(1)
    const tierMealMultiplier: Record<ServiceTier, number> = { 'budget': 0.8, 'standard': 1.0, 'deluxe': 1.3, 'luxury': 1.6 }
    let lunchRate = Math.round(toNumber(mealRates?.[0]?.lunch_rate_eur, 12) * tierMealMultiplier[tier])
    let dinnerRate = Math.round(toNumber(mealRates?.[0]?.dinner_rate_eur, 18) * tierMealMultiplier[tier])

    let hotelRate = 0
    let hotelName_final = hotel_name || 'Standard Hotel'
    let selectedHotel = null

    if (includeAccommodationFinal) {
      const { data: hotels } = await supabase.from('hotel_contacts').select('*').ilike('city', effectiveCity).eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false }).limit(5)
      if (hotels?.length) {
        selectedHotel = hotels[0]
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

    if (inputMode === 'structured' && extracted_days && raw_itinerary) {
      console.log('📋 Using STRUCTURED mode - following provided itinerary')
      
      itineraryData = await generateFromStructuredInput(
        extracted_days,
        raw_itinerary,
        {
          tier,
          totalPax,
          language: finalLanguage,
          attractionNames,
          writingRules
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

    console.log('✅ AI generated itinerary:', {
      tripName: itineraryData.trip_name,
      days: itineraryData.days?.length
    })

    // ============================================
    // CREATE ITINERARY IN DATABASE
    // ============================================

    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name,
        start_date,
        end_date: endDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency,
        total_cost: 0,
        total_revenue: 0,
        margin_percent,
        status: 'draft',
        tier,
        package_type,
        cost_mode,
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        client_id
      })
      .select()
      .single()

    if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)

    console.log('📝 Created itinerary:', itinerary.id)

    // ============================================
    // CREATE DAYS AND SERVICES
    // ============================================

    let totalSupplierCost = 0
    let totalClientPrice = 0

    for (const dayData of itineraryData.days) {
      const dayDate = new Date(startDateObj)
      dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

      const isLastDay = dayData.day_number === duration_days
      const isTransferOnly = dayData.is_transfer_only || (dayData.is_arrival && (!dayData.attractions || dayData.attractions.length === 0))
      const isFreeDay = dayData.is_free_day || false
      const includesHotelForDay = dayData.includes_hotel !== false && !isLastDay && includeAccommodationFinal
      
      // Use day-specific settings if in structured mode
      const dayIncludesLunch = inputMode === 'structured' 
        ? dayData.includes_lunch === true 
        : include_lunch && !isTransferOnly && !isFreeDay
      
      const dayIncludesDinner = inputMode === 'structured'
        ? dayData.includes_dinner === true
        : include_dinner && !isTransferOnly && !isFreeDay
      
      const dayNeedsGuide = inputMode === 'structured'
        ? dayData.guide_required === true
        : !isTransferOnly && !isFreeDay

      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayData.day_number,
          date: dayData.date || dayDate.toISOString().split('T')[0],
          title: dayData.title,
          description: dayData.description,
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
        console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
        continue
      }

      // Skip pricing if requested
      if (skip_pricing) continue

      // Skip most services for departure-only days
      if (dayData.is_departure && isTransferOnly) {
        // Only add transfer service
        const transferCost = vehiclePerDay * 0.5 // Half day for airport transfer
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

      // Entrance fees (only for attractions actually visited)
      if (dayData.attractions?.length > 0 && !isTransferOnly && !isFreeDay) {
        let dayEntranceTotal = 0
        const matchedAttractions: string[] = []
        
        for (const attr of dayData.attractions) {
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
          services.push({
            service_type: 'entrance',
            service_code: 'ENTRANCE',
            service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
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

      // Hotel (only if included and not last day)
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
      days: duration_days,
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice
    })

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier,
        package_type,
        is_cruise: false,
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
        })
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