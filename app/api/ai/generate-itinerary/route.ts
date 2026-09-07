import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import { getMemoriesForPrompt, logAgentRun } from '@/lib/agent-memory'
import { gateVolume, incrementVolumeUsage, loadUsageAnchor } from '@/lib/usage-enforcement'
import { applyDayRules } from '@/lib/ai/day-rules-engine'
import {
  createHoleCollector,
  requireRates,
  requireUsableRate,
  describeHoles,
  unpricedSummary,
} from '@/lib/ai/generation-holes'
import {
  resolveAirportRates,
  resolveHotelServiceRate,
  AIRPORT_SERVICE_BY_TIER,
} from '@/lib/ai/staff-rate-resolution'
import type { ServiceTier, InputMode, ExtractedDay } from '@/lib/ai/parsing-utils'
import {
  isValidDate, toNumber, normalizeTier, calculateExpectedDays,
} from '@/lib/ai/parsing-utils'
import { detectCruiseRequest, determinePackageType } from '@/lib/ai/cruise-detection'
import type { CruiseDetectionResult } from '@/lib/ai/cruise-detection'
import { getCruiseRate } from '@/lib/ai/cruise-pricing'
import {
  findCruiseContent, fetchContentLibrary, fetchWritingRules,
  buildContentContext, buildWritingRulesContext, fetchAttractionsList,
} from '@/lib/ai/content-library'
import { getUserPreferences } from '@/lib/ai/user-preferences'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { presetTierFor, tierMultiplier } from '@/lib/vocabulary'
import { generateFromStructuredInput, generateCreativeItinerary } from '@/lib/ai/prompt-builder'
import { loadDestinationPromptContext } from '@/lib/ai/destination-context'
import { getTenantRunCurrency, DEFAULT_RUN_CURRENCY } from '@/lib/rates/run-currency'
import { createCruiseItineraryServices } from '@/lib/ai/cruise-service-creation'
import { createLandItineraryServices } from '@/lib/ai/service-creation'

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

// ============================================
// HELPER: Create itinerary with graceful column fallback
// ============================================
async function createItineraryRecord(supabase: any, data: Record<string, any>): Promise<{ data: any; error: any }> {
  // Try with all columns first (includes nationality, language, is_euro_passport from migration 152)
  const { data: result, error } = await supabase
    .from('itineraries')
    .insert(data)
    .select()
    .single()

  if (error && error.message?.includes('Could not find the')) {
    // Column doesn't exist yet — remove the new columns and retry

    const { nationality, language, is_euro_passport, ...fallbackData } = data
    // Append nationality info to notes so it's not lost
    if (nationality) {
      fallbackData.notes = fallbackData.notes
        ? `${fallbackData.notes} | Nationality: ${nationality}, Language: ${language || 'English'}`
        : `Nationality: ${nationality}, Language: ${language || 'English'}`
    }
    return await supabase.from('itineraries').insert(fallbackData).select().single()
  }

  return { data: result, error }
}


// Itinerary-generation helpers (glossary, parsing, cruise detection/pricing,
// content library, user preferences, prompt builders, service creation) now
// live in lib/ai/* — see imports above.

// ============================================
// HELPER: CREATE QUOTES AFTER ITINERARY
// ============================================

async function createQuotesForItinerary(params: {
  itinerary_id: string
  // The caller's session tenant. This used to be resolved via an
  // UNFILTERED `from('tenants').select('id').single()` on the admin
  // client — which errors (or picks an arbitrary tenant) the moment more
  // than one tenant exists. Quotes must carry the caller's tenant.
  tenant_id: string
  quote_type: 'b2c' | 'b2b' | 'both' | 'none'
  num_travelers: number
  tier: ServiceTier
  margin_percent: number
  currency: string
  client_id?: string | null
  partner_id?: string | null
  // Attribution (mig 269): the staff member driving the generation.
  created_by?: string | null
}) {
  const {
    itinerary_id,
    tenant_id,
    quote_type,
    num_travelers,
    tier,
    margin_percent,
    currency,
    client_id,
    partner_id,
    created_by
  } = params

  if (quote_type === 'none') {
    return { b2c_quote: null, b2b_quote: null }
  }

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
          created_by: created_by || null,
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
          created_by: created_by || null,
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
    if (authResult.error !== null) {
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

    // Capture user ID once (reused for quota logging + run logging)
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    // Destination context (P2): the tenant's default destination shapes the
    // generation prompts. No selection, or any load failure → Egypt verbatim,
    // proven byte-identical by the golden snapshots.
    const destinationContext = await loadDestinationPromptContext(supabase)

    // ── Plan limits ──────────────────────────────────────────
    // This route consumes TWO metrics: it is an AI generation AND it creates
    // an itinerary row. Checking only the AI meter would let the annual
    // itinerary limit be bypassed entirely by always generating — the exact
    // opposite of the intended incentive.
    const aiGate = await gateVolume(supabase, tenant_id, 'ai_generations', 'AI generations this month')
    if (!aiGate.ok) {
      await supabase.from('agent_runs').insert({
        tenant_id,
        agent_type: 'itinerary',
        triggered_by: userId,
        status: 'quota_exceeded',
        input_summary: 'Blocked: AI generation limit reached',
      })
      return aiGate.response!
    }

    const itineraryGate = await gateVolume(supabase, tenant_id, 'itineraries', 'itineraries this year')
    if (!itineraryGate.ok) {
      await supabase.from('agent_runs').insert({
        tenant_id,
        agent_type: 'itinerary',
        triggered_by: userId,
        status: 'quota_exceeded',
        input_summary: 'Blocked: annual itinerary limit reached',
      })
      return itineraryGate.response!
    }

    // Warning/overage from either metric rides along on the success response.
    const usageNotice = aiGate.usage ?? itineraryGate.usage

    // ─────────────────────────────────────────────────────────

    const runStartTime = Date.now()

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
      city: requested_city = null,
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = true,
      margin_percent = userPrefs.default_margin_percent,
      currency: requested_currency = null,
      cost_mode = userPrefs.default_cost_mode,
      package_type: requested_package_type = 'land-package',
      // Harness: pricing is OPT-IN and safe-by-default. Conversations from
      // WhatsApp/email generate an UNPRICED draft for the user to revise, then
      // price in the grid. The route only prices if a caller explicitly asks.
      skip_pricing = true,

      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null, // 'creative' | 'structured' | null

      // NEW: Quote type for Phase 1B
      quote_type = 'none' // 'b2c' | 'b2b' | 'both' | 'none'
    } = body

    // Quote currency (C3.4): explicit request wins; a user pref someone
    // actually changed wins next; otherwise the tenant's run currency — the
    // engine's numbers are in that currency, so the label must match.
    const tenantRunCurrency = await getTenantRunCurrency(supabase, tenant_id)
    const currency = requested_currency
      || (userPrefs.default_currency !== DEFAULT_RUN_CURRENCY ? userPrefs.default_currency : tenantRunCurrency)

    const city = requested_city || destinationContext.defaultCity
    const finalTourName = tour_requested || tour_name || `${destinationContext.name} Tour`
    let finalLanguage = language !== 'English' ? language : (conversation_language || 'English')
    // The agency's tiers (Settings → Your vocabulary): a typed word resolves
    // to the agency's own key, a synonym maps by ladder position.
    const tierItems = await loadVocabulary(supabase, 'tier')
    const tierLadder = tierItems.map(i => i.key)
    const tier: ServiceTier = raw_tier
      ? normalizeTier(raw_tier, tierItems)
      : budget_level !== 'standard' ? normalizeTier(budget_level, tierItems) : normalizeTier(userPrefs.default_tier, tierItems)

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

      }
    }



    let duration_days = parseInt(raw_duration_days) || 1

    // For structured mode, calculate days from raw itinerary
    if (inputMode === 'structured' && raw_itinerary) {
      const calculatedDays = calculateExpectedDays(raw_itinerary, extracted_days)
      if (calculatedDays > duration_days) {
        duration_days = calculatedDays

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
    if (cruiseDetection.isCruise) {
      // CRUISE BUSINESS RULES: Enforce valid cruise durations
      // Luxor→Aswan: always 5 days (4 nights)
      // Aswan→Luxor: always 4 days (3 nights)
      // Round trip Luxor: always 8 days (7 nights)
      // Lake Nasser: 4 or 5 days (3-4 nights)
      const validCruiseDurations: Record<string, number> = {
        'luxor-aswan': 5,
        'aswan-luxor': 4,
        'round-trip': 8,
        'aswan-abu-simbel': 4
      }

      const expectedDuration = cruiseDetection.route ? validCruiseDurations[cruiseDetection.route] : null

      if (duration_days === 1) {
        // Parser couldn't determine duration — use detected or business rules
        duration_days = cruiseDetection.detectedDuration || expectedDuration || 5

      } else if (cruiseDetection.detectedDuration && cruiseDetection.detectedDuration !== duration_days) {
        // Parser got a different duration than what cruise detection found (nights+1 mismatch)

        duration_days = cruiseDetection.detectedDuration

      } else if (expectedDuration && !cruiseDetection.includesLand && duration_days !== expectedDuration) {
        // Pure cruise with wrong duration for the route — apply business rule

        duration_days = expectedDuration
      }


    }

    // UPDATED: Determine effective package type
    const effectivePackageType = determinePackageType(requested_package_type, cruiseDetection)


    let effectiveCity = city
    if (cruiseDetection.isCruise && cruiseDetection.startCity) {
      effectiveCity = cruiseDetection.startCity
    } else if (cities.length > 0) {
      effectiveCity = cities[0]
    }



    const totalPax = num_adults + num_children

    // ── Fetch + inject agent memory ──────────────────────────
    const memoryResult = await getMemoriesForPrompt({
      supabase,
      tenant_id,
      client_id: client_id || null,
    })

    // ─────────────────────────────────────────────────────────

    // Passport type
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland']
      isEuroPassport = euCountries.some(c => nationality.toLowerCase().includes(c))
    }
    isEuroPassport = isEuroPassport ?? false

    // Infer guide language from nationality if language is still default English
    if (nationality && finalLanguage === 'English') {
      const nationalityLanguageMap: Record<string, string> = {
        'japanese': 'Japanese', 'japan': 'Japanese',
        'french': 'French', 'france': 'French',
        'spanish': 'Spanish', 'spain': 'Spanish',
        'german': 'German', 'germany': 'German',
        'italian': 'Italian', 'italy': 'Italian',
        'chinese': 'Chinese', 'china': 'Chinese',
        'korean': 'Korean', 'korea': 'Korean',
        'portuguese': 'Portuguese', 'portugal': 'Portuguese', 'brazil': 'Portuguese',
        'russian': 'Russian', 'russia': 'Russian',
        'arabic': 'Arabic', 'saudi': 'Arabic', 'uae': 'Arabic', 'emirati': 'Arabic',
        'turkish': 'Turkish', 'turkey': 'Turkish',
        'dutch': 'Dutch', 'netherlands': 'Dutch', 'holland': 'Dutch',
        'polish': 'Polish', 'poland': 'Polish'
      }
      const natLower = nationality.toLowerCase()
      for (const [key, lang] of Object.entries(nationalityLanguageMap)) {
        if (natLower.includes(key)) {

          finalLanguage = lang
          break
        }
      }
    }

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


      const cruiseContent = await findCruiseContent(getSupabaseAdmin(), cruiseDetection, tier, duration_days)

      if (cruiseContent.found && cruiseContent.dayByDay.length > 0) {


        // Use Content Library duration if available
        if (cruiseContent.content.duration_days) {
          duration_days = cruiseContent.content.duration_days
        }

        const cruiseRate = await getCruiseRate({ tenantId: tenant_id, tier, recommendedSuppliers: cruiseContent.recommendedSuppliers, travelDate: start_date })


        const nights = duration_days - 1

        // Create itinerary - UPDATED: Use effectivePackageType + nationality/language
        const { data: itinerary, error: itineraryError } = await createItineraryRecord(supabase, {
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
            nationality: nationality || null,
            language: finalLanguage,
            is_euro_passport: isEuroPassport,
            notes: special_requests.length > 0 ? special_requests.join('; ') : null,
            client_id
          })

        if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)



        const { totalSupplierCost, totalClientPrice } = await createCruiseItineraryServices(supabase, {
          dayByDay: cruiseContent.dayByDay, itineraryId: itinerary.id, startDateObj,
          durationDays: duration_days, effectiveCity, cruiseRate, totalPax,
          isEuroPassport, skipPricing: skip_pricing, withMargin,
        })

        // Update totals
        if (!skip_pricing) {
          await supabase.from('itineraries').update({
            total_cost: totalClientPrice,
            total_revenue: totalClientPrice,
            supplier_cost: totalSupplierCost,
            profit: totalClientPrice - totalSupplierCost
          }).eq('id', itinerary.id)
        }



        // Auto-assign cruise as a resource for the itinerary
        if (cruiseRate.found && cruiseRate.supplierId) {
          try {
            const cruiseRouteLabelMap: Record<string, string> = {
              'luxor-aswan': 'Luxor → Aswan',
              'aswan-luxor': 'Aswan → Luxor',
              'round-trip': 'Round Trip',
              'aswan-abu-simbel': 'Aswan → Abu Simbel'
            }
            const routeLabel = cruiseDetection.route ? cruiseRouteLabelMap[cruiseDetection.route] || cruiseDetection.route : ''
            const cruiseEndDate = new Date(startDateObj)
            cruiseEndDate.setDate(startDateObj.getDate() + duration_days - 1)

            await supabase.from('itinerary_resources').insert({
              tenant_id,
              itinerary_id: itinerary.id,
              resource_type: 'cruise',
              resource_id: cruiseRate.supplierId,
              resource_name: `${cruiseRate.shipName}${routeLabel ? ` (${routeLabel})` : ''}`,
              start_date: start_date,
              end_date: cruiseEndDate.toISOString().split('T')[0],
              cost_eur: totalSupplierCost,
              quantity: totalPax,
              status: 'pending',
              notes: `${nights} nights, ${totalPax} pax, ${cruiseRate.cabinType}`
            })

          } catch (resourceError) {
            console.error('⚠️ Failed to auto-assign cruise resource:', resourceError)
          }
        }

        // Create quotes if requested and not in draft mode
        let cruiseQuotesCreated = { b2c_quote: null, b2b_quote: null }
        if (!skip_pricing && quote_type !== 'none') {

          cruiseQuotesCreated = await createQuotesForItinerary({
            itinerary_id: itinerary.id,
            tenant_id,
            created_by: userId,
            quote_type: quote_type as 'b2c' | 'b2b' | 'both' | 'none',
            num_travelers: totalPax,
            tier,
            margin_percent,
            currency,
            client_id: client_id,
            partner_id: null
          })
        }

        // ── Post-run logging + usage tracking (cruise path) ──
        const cruiseRunDuration = Date.now() - runStartTime
        const cruiseInputSummary = `${duration_days}d ${tier} ${effectivePackageType} · ${totalPax} pax · ${effectiveCity} · cruise`
        const cruiseOutputSummary = `${itinerary.id} · ${duration_days} days · cost €${Math.round(totalClientPrice)}`

        logAgentRun({
          supabase,
          tenant_id,
          agent_type: 'itinerary',
          triggered_by: userId,
          itinerary_id: itinerary.id,
          input_summary: cruiseInputSummary,
          output_summary: cruiseOutputSummary,
          duration_ms: cruiseRunDuration,
          memories_injected: memoryResult.count,
          status: 'success',
        }).catch(console.error)

        void (async () => {
          const anchor = await loadUsageAnchor(supabase, tenant_id)
          incrementVolumeUsage(supabase, tenant_id, 'ai_generations', anchor)
          incrementVolumeUsage(supabase, tenant_id, 'itineraries', anchor)
        })()
        // ─────────────────────────────────────────────────────

        return NextResponse.json({
          success: true,
          ...(usageNotice ? { usage: usageNotice } : {}),
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

        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR / CRUISE+LAND PATH (STRUCTURED OR CREATIVE)
    // ============================================


    // Fetch rates and content
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const contentLibrary = await fetchContentLibrary(getSupabaseAdmin(), tier, searchCities, interests)
    const writingRules = await fetchWritingRules(getSupabaseAdmin())
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)
    const attractionNames = await fetchAttractionsList(supabase)

    // Determine inclusions based on package type
    let includeAccommodationFinal = include_accommodation
    if (effectivePackageType === 'day-trips' || effectivePackageType === 'tours-only') {
      includeAccommodationFinal = false
    }

    // ============================================
    // Fetch rates — harness Layer 1: record gaps, never substitute constants.
    //
    // Every lookup below now captures its `error`. A missing TABLE and an empty
    // table are different problems (one is a code fix, one is data entry) and
    // the operator-facing message has to say which. If anything is missing we
    // do not price at all — see `pricingBlocked` further down.
    // ============================================
    const { holes, addHole } = createHoleCollector()
    const rateHoles = { holes, addHole }

    const { data: vehicles, error: vehiclesError } = await supabase.from('vehicles').select('*').eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false })
    requireRates(rateHoles, {
      kind: 'transport', tier, table: 'vehicles', error: vehiclesError, rows: vehicles,
      lookupAttempted: `vehicles where is_active and tier = '${tier}'`,
      message: `No active ${tier} vehicles are set up. Add them in Rates → Vehicles, with a daily rate and passenger capacity.`,
    })
    // The column is `passenger_capacity` — a single seat count. `capacity_min`
    // and `capacity_max` were read here and do not exist, so the comparison was
    // `totalPax >= undefined` (false) on every row and selection always fell
    // through to the LAST vehicle in the list, whatever that happened to be.
    // app/api/b2b/calculate-price reads the real columns; this now matches it.
    //
    // Smallest vehicle that actually seats the party, so a group of 2 is not
    // priced in a coach. `is_preferred` already ordered the query, so a
    // preferred vehicle wins among equal capacities.
    const seating = (vehicles ?? [])
      .filter((v: any) => toNumber(v.passenger_capacity, 0) >= totalPax)
      .sort((a: any, b: any) => toNumber(a.passenger_capacity, 0) - toNumber(b.passenger_capacity, 0))
    const selectedVehicle = seating[0] as any

    if (vehicles?.length && !selectedVehicle) {
      addHole({
        kind: 'transport', tier, reason: 'missing',
        lookupAttempted: `vehicles seating ${totalPax} pax at tier '${tier}'`,
        message: `No ${tier} vehicle seats ${totalPax} passengers. Add one in Rates → Vehicles with a large enough passenger capacity.`,
      })
    }

    const { data: guides, error: guidesError } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [finalLanguage]).limit(5)
    requireRates(rateHoles, {
      kind: 'guide', tier, table: 'guides', error: guidesError, rows: guides,
      lookupAttempted: `guides where is_active, tier = '${tier}', speaks '${finalLanguage}'`,
      message: `No active ${tier} guide speaking ${finalLanguage} is set up. Add one in Rates → Guides with a daily rate.`,
    })
    const selectedGuide = guides?.[0] as any

    const { data: allEntranceFees, error: entranceFeesError } = await supabase.from('entrance_fees').select('*').eq('is_active', true)
    requireRates(rateHoles, {
      kind: 'entrance', tier, table: 'entrance_fees', error: entranceFeesError, rows: allEntranceFees,
      lookupAttempted: 'entrance_fees where is_active',
      message: 'No active entrance fees are set up. Add them in Rates → Entrance Fees.',
    })

    // meal_rates holds ONE ROW PER meal_type AND tier — not one row carrying a
    // lunch column and a dinner column. `lunch_rate_eur` / `dinner_rate_eur`
    // were read here and do not exist; the rate column is `base_rate_eur`.
    //
    // Because the table is already tier-scoped, the old `tierMealMultiplier`
    // is gone: multiplying a deluxe rate by a deluxe factor charges the
    // uplift twice.
    const { data: mealRates, error: mealRatesError } = await supabase
      .from('meal_rates').select('*').eq('is_active', true).eq('tier', tier)
    const haveMealRates = requireRates(rateHoles, {
      kind: 'meal', tier, table: 'meal_rates', error: mealRatesError, rows: mealRates,
      lookupAttempted: `meal_rates where is_active and tier = '${tier}'`,
      message: `No active ${tier} meal rates are set up. Add lunch and dinner rates in Rates → Meals.`,
    })

    const mealRateFor = (kind: 'lunch' | 'dinner') =>
      (mealRates ?? []).find((m: any) => String(m.meal_type ?? '').toLowerCase().includes(kind))?.base_rate_eur

    // Only the meals this itinerary actually includes are required. Blocking a
    // lunch-only trip because no dinner rate exists would be a gap the operator
    // cannot act on.
    let lunchRate = 0
    let dinnerRate = 0
    if (haveMealRates && include_lunch) {
      lunchRate = requireUsableRate(rateHoles, mealRateFor('lunch'), {
        kind: 'meal', tier, table: 'meal_rates',
        lookupAttempted: `meal_rates base_rate_eur for lunch at tier '${tier}'`,
        message: `No ${tier} lunch rate is set up. Add one in Rates → Meals.`,
      }) ?? 0
    }
    if (haveMealRates && include_dinner) {
      dinnerRate = requireUsableRate(rateHoles, mealRateFor('dinner'), {
        kind: 'meal', tier, table: 'meal_rates',
        lookupAttempted: `meal_rates base_rate_eur for dinner at tier '${tier}'`,
        message: `No ${tier} dinner rate is set up. Add one in Rates → Meals.`,
      }) ?? 0
    }

    // Airport and hotel staff services.
    //
    // The rate is SELECTED, never summed. The previous code added every active
    // row together — across all airports, both directions and every service
    // level — which against the real table is €559 for one airport touch.
    //
    // Multiplicity is handled in service-creation, which adds one occurrence
    // per qualifying day, so an itinerary returning to the same city is charged
    // each time. See lib/ai/staff-rate-resolution.ts for the tier mapping.
    const { data: airportStaffRates, error: airportStaffRatesError } = await supabase.from('airport_staff_rates').select('*').eq('is_active', true)
    const haveAirportRows = requireRates(rateHoles, {
      kind: 'airport_service', tier, table: 'airport_staff_rates', error: airportStaffRatesError, rows: airportStaffRates,
      lookupAttempted: 'airport_staff_rates where is_active',
      message: 'No active airport staff rates are set up. Add them in Rates → Airport Services.',
    })

    let airportServiceRates = { arrival: 0, departure: 0 }
    if (haveAirportRows) {
      const resolved = resolveAirportRates(airportStaffRates, { tier, city: effectiveCity, ladder: tierLadder })
      if (resolved.ok) {
        airportServiceRates = { arrival: resolved.rates.arrival, departure: resolved.rates.departure }
      } else {
        const wanted = AIRPORT_SERVICE_BY_TIER[presetTierFor(tierLadder, tier)]
        addHole({
          kind: 'airport_service', tier, reason: 'missing',
          lookupAttempted: `airport_staff_rates for '${effectiveCity}' service_type '${wanted}'`,
          message: resolved.reason === 'unknown_city'
            ? `${resolved.detail}, so airport assistance cannot be priced. Add the city's airport mapping, or use a city that has rates.`
            : `${resolved.detail}. Add a ${wanted} rate for both arrival and departure in Rates → Airport Services.`,
        })
      }
    }

    const { data: hotelStaffRates, error: hotelStaffRatesError } = await supabase.from('hotel_staff_rates').select('*').eq('is_active', true)
    const haveHotelRows = requireRates(rateHoles, {
      kind: 'hotel_service', tier, table: 'hotel_staff_rates', error: hotelStaffRatesError, rows: hotelStaffRates,
      lookupAttempted: 'hotel_staff_rates where is_active',
      message: 'No active hotel staff rates are set up. Add them in Rates → Hotel Services.',
    })

    let hotelServiceRate = 0
    if (haveHotelRows) {
      const resolved = resolveHotelServiceRate(hotelStaffRates)
      if (resolved.ok) {
        hotelServiceRate = resolved.rate
      } else {
        addHole({
          kind: 'hotel_service', tier, reason: 'missing',
          lookupAttempted: 'hotel_staff_rates porter / all',
          message: `${resolved.detail}. Add it in Rates → Hotel Services.`,
        })
      }
    }

    let hotelRate = 0
    let hotelName_final = hotel_name || 'Standard Hotel'
    let selectedHotel = null

    if (includeAccommodationFinal) {
      const { data: hotels, error: hotelsError } = await supabase.from('hotel_contacts').select('*').ilike('city', effectiveCity).eq('is_active', true).eq('tier', tier).order('is_preferred', { ascending: false }).limit(5)
      const haveHotels = requireRates(rateHoles, {
        kind: 'hotel', tier, table: 'hotel_contacts', error: hotelsError, rows: hotels,
        lookupAttempted: `hotel_contacts in '${effectiveCity}' where is_active and tier = '${tier}'`,
        message: `No active ${tier} hotel is set up for ${effectiveCity}. Add one in Rates → Hotels with a double-room rate.`,
      })
      if (haveHotels) {
        selectedHotel = hotels![0] as any
        hotelRate = toNumber(selectedHotel.rate_double_eur, 0)
        hotelName_final = selectedHotel.name
        // A hotel row with no rate prices accommodation at zero, which reads as
        // "included" on a quote. That is a gap, not a free room.
        if (hotelRate <= 0) {
          addHole({
            kind: 'hotel', tier, reason: 'missing',
            lookupAttempted: `rate_double_eur for '${selectedHotel.name}'`,
            message: `${selectedHotel.name} has no double-room rate. Add one in Rates → Hotels.`,
          })
        }
      }
    }

    const { data: tippingRates, error: tippingRatesError } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
    requireRates(rateHoles, {
      kind: 'tipping', tier, table: 'tipping_rates', error: tippingRatesError, rows: tippingRates,
      lookupAttempted: 'tipping_rates where is_active',
      message: 'No active tipping rates are set up. Add them in Rates → Tipping.',
    })
    let dailyTips = tippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 0
    // By position on the agency's ladder: lowest tier 0.8 … highest 1.5.
    dailyTips = Math.round(dailyTips * tierMultiplier(tierLadder, tier))

    // `daily_rate`, not `daily_rate_eur` — the latter does not exist on either
    // table, so both of these were silently 0 and every quote said transport
    // and guiding were free.
    const vehiclePerDay = selectedVehicle
      ? (requireUsableRate(rateHoles, selectedVehicle.daily_rate, {
          kind: 'transport', tier, table: 'vehicles',
          lookupAttempted: `daily_rate for vehicle '${selectedVehicle.vehicle_type ?? selectedVehicle.name ?? selectedVehicle.id}'`,
          message: `The selected ${tier} vehicle has no daily rate. Add one in Rates → Vehicles.`,
        }) ?? 0)
      : 0
    const guidePerDay = selectedGuide
      ? (requireUsableRate(rateHoles, selectedGuide.daily_rate, {
          kind: 'guide', tier, table: 'guides',
          lookupAttempted: `daily_rate for guide '${selectedGuide.full_name ?? selectedGuide.name ?? selectedGuide.id}'`,
          message: `The selected ${tier} guide has no daily rate. Add one in Rates → Guides.`,
        }) ?? 0)
      : 0
    const roomsNeeded = Math.ceil(totalPax / 2)

    // ============================================
    // THE GATE: an itinerary with any rate gap is NOT priced.
    //
    // It is still generated and saved — the operator keeps the day-by-day work
    // — but it stays a draft with no total, so nothing fabricated can be
    // quoted, PDF'd or sent. The send-path guard cannot catch this for us:
    // checkAmountDeliverable validates arithmetic, not provenance, so an
    // invented-but-plausible total passes it.
    // ============================================
    const pricingBlocked = holes.length > 0
    const effectiveSkipPricing = skip_pricing || pricingBlocked

    if (pricingBlocked && !skip_pricing) {
      console.warn(
        `[generate-itinerary] pricing withheld — ${holes.length} rate gap(s):`,
        holes.map(h => `${h.kind}: ${h.lookupAttempted}`).join(' | ')
      )
    }

    // ============================================
    // GENERATE ITINERARY CONTENT
    // ============================================

    let itineraryData: any

    if (inputMode === 'structured' && raw_itinerary) {


      itineraryData = await generateFromStructuredInput(
        extracted_days || [],
        raw_itinerary,
        {
          tier,
          totalPax,
          language: finalLanguage,
          attractionNames,
          writingRules,
          packageType: effectivePackageType,
          memoryPromptBlock: memoryResult.prompt_block,
          destination: destinationContext
        }
      )
    } else {


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
        includeAccommodation: includeAccommodationFinal,
        memoryPromptBlock: memoryResult.prompt_block,
        destination: destinationContext
      })
    }

    // Day-rules engine: deterministic post-AI cleanup. Sets arrival/departure/
    // transfer-only flags and strips non-attractions (meal venues, geographic
    // terms like "Red Sea", cruise-bundled activities) from attractions[] so
    // pricing only charges entrance fees for real, bookable sites.
    // NOTE: this MUTATES AI day output → changes which attractions get priced.
    if (itineraryData?.days) {
      itineraryData.days = applyDayRules(itineraryData.days, effectivePackageType)
    }

    // Update duration from AI result
    if (itineraryData.total_days) {
      duration_days = itineraryData.total_days
    }

    // Recalculate end date
    const finalEndDate = new Date(startDateObj)
    finalEndDate.setDate(startDateObj.getDate() + duration_days - 1)

    // Create itinerary record - UPDATED: Use effectivePackageType
    const { data: itinerary, error: itineraryError } = await createItineraryRecord(supabase, {
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
        status: effectiveSkipPricing ? 'draft' : 'quoted',
        tier,
        package_type: effectivePackageType,
        cost_mode,
        nationality: nationality || null,
        language: finalLanguage,
        is_euro_passport: isEuroPassport,
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        client_id
      })

    if (itineraryError) {
      console.error('❌ Failed to create itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }



    // Create days and services
    const { totalSupplierCost, totalClientPrice } = await createLandItineraryServices(supabase, {
      tenantId: tenant_id,
      days: itineraryData.days || [], itineraryId: itinerary.id, startDateObj,
      durationDays: duration_days, effectiveCity, totalPax, isEuroPassport,
      skipPricing: effectiveSkipPricing, withMargin, tier, finalLanguage,
      includeLunch: include_lunch, includeDinner: include_dinner, includeAccommodationFinal,
      vehiclePerDay, guidePerDay, selectedVehicle, selectedGuide,
      selectedHotel, hotelRate, hotelName_final, roomsNeeded,
      airportServiceRates, hotelServiceRate, lunchRate, dinnerRate,
      dailyTips, allEntranceFees,
    })

    // Update totals — only when every rate behind them is real.
    if (!effectiveSkipPricing) {
      await supabase.from('itineraries').update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        supplier_cost: totalSupplierCost,
        profit: totalClientPrice - totalSupplierCost,
        status: 'quoted'
      }).eq('id', itinerary.id)
    }



    // Auto-assign cruise resource if this itinerary includes cruise days
    if (cruiseDetection.isCruise) {
      try {
        const cruiseRate = await getCruiseRate({ tenantId: tenant_id, tier, travelDate: start_date })
        if (cruiseRate.found && cruiseRate.supplierId) {
          const cruiseRouteLabelMap: Record<string, string> = {
            'luxor-aswan': 'Luxor → Aswan',
            'aswan-luxor': 'Aswan → Luxor',
            'round-trip': 'Round Trip',
            'aswan-abu-simbel': 'Aswan → Abu Simbel'
          }
          const routeLabel = cruiseDetection.route ? cruiseRouteLabelMap[cruiseDetection.route] || cruiseDetection.route : ''
          const cruiseNights = cruiseDetection.cruiseNights || (duration_days - 1)

          await supabase.from('itinerary_resources').insert({
            tenant_id,
            itinerary_id: itinerary.id,
            resource_type: 'cruise',
            resource_id: cruiseRate.supplierId,
            resource_name: `${cruiseRate.shipName}${routeLabel ? ` (${routeLabel})` : ''}`,
            start_date: start_date,
            end_date: endDate.toISOString().split('T')[0],
            cost_eur: cruiseRate.perPersonPerNight * totalPax * cruiseNights,
            quantity: totalPax,
            status: 'pending',
            notes: `${cruiseNights} nights, ${totalPax} pax, ${cruiseRate.cabinType}`
          })

        }
      } catch (resourceError) {
        console.error('⚠️ Failed to auto-assign cruise resource:', resourceError)
      }
    }

    // Create quotes if requested and not in draft mode
    let quotesCreated = { b2c_quote: null, b2b_quote: null }
    // No quote for an unpriced itinerary. A quote is precisely the artefact
    // that gets PDF'd and sent, so creating one here would route the gap
    // straight to a client.
    if (!effectiveSkipPricing && quote_type !== 'none') {

      quotesCreated = await createQuotesForItinerary({
        itinerary_id: itinerary.id,
        tenant_id,
        created_by: userId,
        quote_type: quote_type as 'b2c' | 'b2b' | 'both' | 'none',
        num_travelers: totalPax,
        tier,
        margin_percent,
        currency,
        client_id: client_id,
        partner_id: null
      })
    }

    // ── Post-run logging + usage tracking (land path) ────
    const landRunDuration = Date.now() - runStartTime
    const landInputSummary = `${duration_days}d ${tier} ${effectivePackageType} · ${totalPax} pax · ${effectiveCity}${cruiseDetection.isCruise ? ' · cruise' : ''}`
    const landOutputSummary = `${itinerary.id} · ${duration_days} days · cost €${Math.round(totalClientPrice)}`

    logAgentRun({
      supabase,
      tenant_id,
      agent_type: 'itinerary',
      triggered_by: userId,
      itinerary_id: itinerary.id,
      input_summary: landInputSummary,
      output_summary: landOutputSummary,
      duration_ms: landRunDuration,
      memories_injected: memoryResult.count,
      status: 'success',
    }).catch(console.error)

    void (async () => {
      const anchor = await loadUsageAnchor(supabase, tenant_id)
      incrementVolumeUsage(supabase, tenant_id, 'ai_generations', anchor)
      incrementVolumeUsage(supabase, tenant_id, 'itineraries', anchor)
    })()
    // ─────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      ...(usageNotice ? { usage: usageNotice } : {}),
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier,
        package_type: effectivePackageType,
        is_cruise: cruiseDetection.isCruise,
        generation_mode: inputMode,
        mode: effectiveSkipPricing ? 'draft' : 'quoted',
        redirect_to: effectiveSkipPricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
        currency,
        total_days: duration_days,
        ...(effectiveSkipPricing ? {} : {
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100
        }),
        // Pricing was withheld because rates are missing — say which, so the
        // operator can fix it rather than wonder where the total went. Absent
        // entirely when pricing succeeded.
        ...(pricingBlocked ? {
          pricing_complete: false,
          pricing_blocked_reason: unpricedSummary(holes),
          pricing_gaps: describeHoles(holes),
          pricing_holes: holes,
        } : {}),
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