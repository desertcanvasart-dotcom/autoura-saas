// ============================================
// POST /api/pricing-grid/parse
// AI-powered text-to-grid parser
// Two-stage: structured parse → generative fallback
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

// Lazy-initialized clients
let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  }
  return _anthropic
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdmin> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// ============================================
// EGYPT TRAVEL GLOSSARY (abbreviations)
// ============================================
const EGYPT_GLOSSARY = `
CITY CODES: CAI=Cairo, ALX=Alexandria, ASW=Aswan, LXR=Luxor, HRG=Hurghada, SSH=Sharm El Sheikh, RMF=Marsa Alam, ABS=Abu Simbel, GZA=Giza, KOM=Kom Ombo, EDFU=Edfu, ESN=Esna, SAQ=Saqqara, MEM=Memphis, FAY=Fayoum, SIW=Siwa
AIRLINE CODES: MS=EgyptAir, BA=British Airways, TK=Turkish Airlines
ACCOMMODATION: BB=Bed & Breakfast, HB=Half Board, FB=Full Board, AI=All Inclusive, RO=Room Only, OV=Overnight
MEAL PLANS: L=Lunch, D=Dinner, B=Breakfast
TRANSPORT: APT=Airport, TRF=Transfer, SIC=Seat-in-Coach, PVT=Private
ACTIVITIES: S&L=Sound & Light show, VoK=Valley of the Kings, VoQ=Valley of the Queens
CRUISE: EMB=Embarkation, DIS=Disembarkation, FB=Full Board onboard
`

// ============================================
// Helper: Fetch all rates for AI context
// ============================================
async function fetchAllRates(tenantId: string, tier: string) {
  const admin = getSupabaseAdmin()

  const [
    transportRes, guideRes, airportRes, hotelStaffRes, tippingRes,
    activityRes, accommodationRes, entranceRes, flightRes, mealRes,
    cruiseRes, sleepingTrainRes,
  ] = await Promise.all([
    admin.from('transportation_rates').select('id, service_type, vehicle_type, origin_city, destination_city, city, base_rate_eur, capacity_min, capacity_max').eq('tenant_id', tenantId).eq('is_active', true),
    admin.from('guide_rates').select('id, guide_type, guide_language, city, full_day_rate, half_day_rate, base_rate_eur').eq('tenant_id', tenantId),
    admin.from('airport_staff_rates').select('id, service_type, airport_code, direction, rate_eur').eq('tenant_id', tenantId).eq('is_active', true),
    admin.from('hotel_staff_rates').select('id, service_type, hotel_category, rate_eur').eq('tenant_id', tenantId).eq('is_active', true),
    admin.from('tipping_rates').select('id, role_type, context, rate_unit, rate_eur').eq('tenant_id', tenantId).eq('is_active', true),
    admin.from('activity_rates').select('id, activity_name, activity_category, city, base_rate_eur, base_rate_non_eur').eq('tenant_id', tenantId),
    admin.from('accommodation_rates').select('id, hotel_name, city, room_type, tier, rate_low_season_dbl, rate_high_season_dbl, rate_low_season_sgl, rate_high_season_sgl').eq('tenant_id', tenantId).eq('tier', tier),
    admin.from('entrance_fees').select('id, attraction_name, city, eur_rate, non_eur_rate, category').eq('tenant_id', tenantId),
    admin.from('flight_rates').select('id, route_from, route_to, route_name, airline, base_rate_eur, base_rate_non_eur').eq('tenant_id', tenantId).eq('is_active', true),
    admin.from('meal_rates').select('id, restaurant_name, meal_type, city, base_rate_eur, base_rate_non_eur').eq('tenant_id', tenantId),
    admin.from('nile_cruises').select('id, ship_name, cabin_type, tier, route_name, embark_city, disembark_city, ppd_eur, ppd_non_eur, single_supplement_eur, duration_nights, meals_included, sightseeing_included').eq('tenant_id', tenantId).eq('is_active', true).eq('tier', tier),
    admin.from('sleeping_train_rates').select('id, origin_city, destination_city, cabin_type, rate_oneway_eur, operator_name').eq('tenant_id', tenantId).eq('is_active', true),
  ])

  return {
    transportation: transportRes.data || [],
    guides: guideRes.data || [],
    airport_staff: airportRes.data || [],
    hotel_staff: hotelStaffRes.data || [],
    tipping: tippingRes.data || [],
    activities: activityRes.data || [],
    accommodation: accommodationRes.data || [],
    entrance_fees: entranceRes.data || [],
    flights: flightRes.data || [],
    meals: mealRes.data || [],
    cruises: cruiseRes.data || [],
    sleeping_trains: sleepingTrainRes.data || [],
  }
}

// ============================================
// Build rate catalog string for AI prompt
// ============================================
function buildRateCatalog(rates: Record<string, any[]>): string {
  let catalog = ''

  if (rates.accommodation.length > 0) {
    catalog += '\n## ACCOMMODATION (per person double, filtered by tier)\n'
    for (const r of rates.accommodation) {
      catalog += `ID: ${r.id} | ${r.hotel_name} | ${r.city} | ${r.room_type || 'standard'} | PPD: €${r.rate_low_season_dbl || r.rate_high_season_dbl || 0}\n`
    }
  }

  if (rates.transportation.length > 0) {
    catalog += '\n## TRANSPORT (group cost)\n'
    for (const r of rates.transportation) {
      catalog += `ID: ${r.id} | ${r.service_type} | ${r.vehicle_type || ''} | ${r.origin_city || r.city}${r.destination_city ? ' → ' + r.destination_city : ''} | ${r.capacity_min || '?'}-${r.capacity_max || '?'} pax | €${r.base_rate_eur || 0}\n`
    }
  }

  if (rates.guides.length > 0) {
    catalog += '\n## GUIDES (group cost)\n'
    for (const r of rates.guides) {
      catalog += `ID: ${r.id} | ${r.guide_language || r.guide_type || 'Guide'} | ${r.city || 'Any'} | Full Day: €${r.base_rate_eur || r.full_day_rate || 0}\n`
    }
  }

  if (rates.entrance_fees.length > 0) {
    catalog += '\n## ENTRANCE FEES (per person)\n'
    for (const r of rates.entrance_fees) {
      catalog += `ID: ${r.id} | ${r.attraction_name} | ${r.city || ''} | EU: €${r.eur_rate || 0} | Non-EU: €${r.non_eur_rate || 0}\n`
    }
  }

  if (rates.flights.length > 0) {
    catalog += '\n## FLIGHTS (per person)\n'
    for (const r of rates.flights) {
      catalog += `ID: ${r.id} | ${r.route_name || r.route_from + ' → ' + r.route_to} | ${r.airline || ''} | €${r.base_rate_eur || 0}\n`
    }
  }

  if (rates.meals.length > 0) {
    catalog += '\n## MEALS (per person)\n'
    for (const r of rates.meals) {
      catalog += `ID: ${r.id} | ${r.restaurant_name || ''} | ${r.meal_type || ''} | ${r.city || ''} | €${r.base_rate_eur || 0}\n`
    }
  }

  if (rates.activities.length > 0) {
    catalog += '\n## ACTIVITIES / EXPERIENCES (per person for experiences, group for boats)\n'
    for (const r of rates.activities) {
      catalog += `ID: ${r.id} | ${r.activity_name} | ${r.city || ''} | ${r.activity_category || ''} | €${r.base_rate_eur || 0}\n`
    }
  }

  if (rates.cruises.length > 0) {
    catalog += '\n## NILE CRUISES (per person per night, filtered by tier)\n'
    for (const r of rates.cruises) {
      catalog += `ID: ${r.id} | ${r.ship_name} | ${r.cabin_type || ''} | ${r.route_name || ''} | PPD: €${r.ppd_eur || 0} | Supp: €${r.single_supplement_eur || 0}\n`
    }
  }

  if (rates.airport_staff.length > 0) {
    catalog += '\n## AIRPORT SERVICES (group cost)\n'
    for (const r of rates.airport_staff) {
      catalog += `ID: ${r.id} | ${r.service_type} | ${r.airport_code} | ${r.direction} | €${r.rate_eur || 0}\n`
    }
  }

  if (rates.hotel_staff.length > 0) {
    catalog += '\n## HOTEL SERVICES (group cost)\n'
    for (const r of rates.hotel_staff) {
      catalog += `ID: ${r.id} | ${r.service_type} | ${r.hotel_category || 'all'} | €${r.rate_eur || 0}\n`
    }
  }

  if (rates.tipping.length > 0) {
    catalog += '\n## TIPPING (group cost)\n'
    for (const r of rates.tipping) {
      catalog += `ID: ${r.id} | ${r.role_type} | ${r.context || ''} | ${r.rate_unit || ''} | €${r.rate_eur || 0}\n`
    }
  }

  if (rates.sleeping_trains.length > 0) {
    catalog += '\n## SLEEPING TRAINS (per person)\n'
    for (const r of rates.sleeping_trains) {
      catalog += `ID: ${r.id} | ${r.origin_city} → ${r.destination_city} | ${r.cabin_type || ''} | €${r.rate_oneway_eur || 0}\n`
    }
  }

  return catalog
}

// ============================================
// Build flat rate lookup map for validation
// ============================================
function buildRateMap(rates: Record<string, any[]>): Map<string, { rate: number; rateNonEur: number; label: string; table: string }> {
  const map = new Map<string, { rate: number; rateNonEur: number; label: string; table: string }>()

  for (const r of rates.accommodation) {
    map.set(r.id, { rate: Number(r.rate_low_season_dbl) || Number(r.rate_high_season_dbl) || 0, rateNonEur: Number(r.rate_low_season_dbl) || 0, label: `${r.hotel_name} | ${r.city}`, table: 'accommodation' })
  }
  for (const r of rates.transportation) {
    map.set(r.id, { rate: Number(r.base_rate_eur) || 0, rateNonEur: Number(r.base_rate_eur) || 0, label: `${r.service_type} ${r.vehicle_type || ''} ${r.origin_city || r.city}`, table: 'transportation' })
  }
  for (const r of rates.guides) {
    map.set(r.id, { rate: Number(r.base_rate_eur) || Number(r.full_day_rate) || 0, rateNonEur: Number(r.base_rate_eur) || Number(r.full_day_rate) || 0, label: `${r.guide_language || r.guide_type || 'Guide'} ${r.city || ''}`, table: 'guide' })
  }
  for (const r of rates.entrance_fees) {
    map.set(r.id, { rate: Number(r.eur_rate) || 0, rateNonEur: Number(r.non_eur_rate) || Number(r.eur_rate) || 0, label: r.attraction_name, table: 'entrance_fees' })
  }
  for (const r of rates.flights) {
    map.set(r.id, { rate: Number(r.base_rate_eur) || 0, rateNonEur: Number(r.base_rate_non_eur) || 0, label: r.route_name || `${r.route_from} → ${r.route_to}`, table: 'flights' })
  }
  for (const r of rates.meals) {
    map.set(r.id, { rate: Number(r.base_rate_eur) || 0, rateNonEur: Number(r.base_rate_non_eur) || 0, label: `${r.restaurant_name || ''} ${r.meal_type || ''}`, table: 'meals' })
  }
  for (const r of rates.activities) {
    map.set(r.id, { rate: Number(r.base_rate_eur) || 0, rateNonEur: Number(r.base_rate_non_eur) || 0, label: r.activity_name, table: 'activities' })
  }
  for (const r of rates.cruises) {
    map.set(r.id, { rate: Number(r.ppd_eur) || 0, rateNonEur: Number(r.ppd_non_eur) || 0, label: `${r.ship_name} ${r.cabin_type || ''}`, table: 'cruise' })
  }
  for (const r of rates.airport_staff) {
    map.set(r.id, { rate: Number(r.rate_eur) || 0, rateNonEur: Number(r.rate_eur) || 0, label: `${r.service_type} ${r.airport_code}`, table: 'airport_staff' })
  }
  for (const r of rates.hotel_staff) {
    map.set(r.id, { rate: Number(r.rate_eur) || 0, rateNonEur: Number(r.rate_eur) || 0, label: `${r.service_type}`, table: 'hotel_staff' })
  }
  for (const r of rates.tipping) {
    map.set(r.id, { rate: Number(r.rate_eur) || 0, rateNonEur: Number(r.rate_eur) || 0, label: `${r.role_type} ${r.context || ''}`, table: 'tipping' })
  }
  for (const r of rates.sleeping_trains) {
    map.set(r.id, { rate: Number(r.rate_oneway_eur) || 0, rateNonEur: Number(r.rate_oneway_eur) || 0, label: `${r.origin_city} → ${r.destination_city}`, table: 'sleeping_trains' })
  }

  return map
}

// ============================================
// POST handler
// ============================================
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { tenant_id } = authResult
    if (!tenant_id) {
      return NextResponse.json({ success: false, error: 'No tenant' }, { status: 403 })
    }

    const body = await request.json()
    const { text, tier = 'standard', pax = 2, mode = 'full' } = body

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return NextResponse.json({ success: false, error: 'Text input is required (min 10 chars)' }, { status: 400 })
    }

    // --- Structure-only mode: extract itinerary without rate matching ---
    if (mode === 'structure') {
      return handleStructureParse(text, pax)
    }

    // 1. Fetch all rates for this tenant
    const rates = await fetchAllRates(tenant_id, tier)
    const rateCatalog = buildRateCatalog(rates)
    const rateMap = buildRateMap(rates)

    if (rateCatalog.trim().length < 50) {
      return NextResponse.json({
        success: false,
        error: 'No rates found in database. Please add rates first in the Rates section.',
      }, { status: 400 })
    }

    // 2. Stage 1: AI structured parse
    const anthropic = getAnthropic()

    const systemPrompt = `You are an Egypt travel itinerary parser for a tour operator pricing system.

Given a text input (WhatsApp message, email, booking request, or itinerary), extract a structured day-by-day itinerary.

${EGYPT_GLOSSARY}

## AVAILABLE RATE CATALOG
Match services to these exact IDs from the database:
${rateCatalog}

## OUTPUT FORMAT
Return valid JSON only (no markdown, no backticks):
{
  "metadata": {
    "clientName": "string or null",
    "clientEmail": "string or null",
    "clientPhone": "string or null",
    "pax": number or null,
    "startDate": "YYYY-MM-DD or null",
    "passport": "eu or non_eu or null",
    "tourName": "string or null",
    "nationality": "string or null"
  },
  "days": [
    {
      "dayNumber": 1,
      "title": "Day title",
      "city": "Primary city",
      "description": "Brief description",
      "slots": {
        "route": ["rate_id1", "rate_id2"],
        "guide": "rate_id or null",
        "airport_services": ["rate_id1"],
        "hotel_services": ["rate_id1"],
        "tipping": ["rate_id1", "rate_id2"],
        "boat_rides": ["rate_id1"],
        "other_group": null,
        "accommodation": "rate_id or null",
        "entrance_fees": ["rate_id1", "rate_id2"],
        "flights": ["rate_id1"],
        "experiences": ["rate_id1"],
        "meals": ["rate_id1", "rate_id2"],
        "water": 1,
        "cruise": "rate_id or null",
        "sleeping_trains": "rate_id or null",
        "other_pp": null
      }
    }
  ]
}

## TRANSPORT RULES
The transport catalog has different service_type values. A single day often needs MULTIPLE transport entries:
- "airport_transfer" — one-way airport-to-hotel or hotel-to-airport transfer
- "day_tour" — full-day sightseeing transport within a city
- "intercity" — between cities by road (e.g., Cairo → Alexandria)

**Airport transfer and day tour are ALWAYS separate entries, even in the same city on the same day.**

Common patterns (select ALL that apply for each day):
- Arrival day with sightseeing: airport_transfer (airport→hotel) + day_tour (sightseeing transport)
- Pure sightseeing day: day_tour only
- Departure day with sightseeing: day_tour (sightseeing) + airport_transfer (hotel→airport)
- Departure day (no sightseeing): airport_transfer (hotel→airport) only
- Multi-city day via flight (e.g., fly Cairo→Luxor then sightsee):
  * airport_transfer in origin city (hotel→airport)
  * airport_transfer in destination city (airport→hotel or airport→sites)
  * day_tour in destination city (if sightseeing)
- Intercity by road: intercity transfer (replaces flight + airport transfers)

Pick vehicle size based on pax count (${pax} travelers): sedan(1-2), minivan(3-7), van(8-12), minibus(13-20), bus(21-45).
Match the origin_city and destination_city of each transport entry to the day's actual route.

## RULES
- Match attractions/hotels/restaurants by name to the EXACT IDs in the catalog
- For entrance fees: use EU or non-EU rates based on passport type
- Multi-select slots (route, entrance_fees, meals, etc.) use arrays of IDs
- Single-select slots (guide, accommodation, cruise) use a single ID string
- Custom slots (water, other_group, other_pp) use a number (EUR amount) or null
- Set water to 1 EUR per person per day by default
- For cruise days: set the cruise slot, suppress route (transport included in cruise)
- If a day mentions arrival only (no sightseeing), only add airport transfer
- If a day mentions departure only, only add airport transfer
- Extract client metadata from greetings, signatures, or context clues
- tourName should be a descriptive name like "Cairo & Luxor Classic" based on the itinerary content
- If service lines are prefixed with [GROUP] or [PP], use that to determine which slot category they belong to (GROUP = route/guide/airport_services/hotel_services/tipping/boat_rides/other_group, PP = accommodation/entrance_fees/flights/experiences/meals/water/cruise/sleeping_trains/other_pp)`

    let aiResult: any = null
    let generationMode: 'parsed' | 'generated' = 'parsed'

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: `Parse this travel inquiry/itinerary into a priced day-by-day grid:\n\n${text}` }],
        system: systemPrompt,
      })

      const content = response.content[0]
      if (content.type === 'text') {
        // Try to parse JSON from response
        let jsonText = content.text.trim()
        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
        aiResult = JSON.parse(jsonText)
      }
    } catch (parseError: any) {
      console.error('AI parse error (Stage 1):', parseError.message)
    }

    // 3. Stage 2: Generative fallback if 0 days
    if (!aiResult || !aiResult.days || aiResult.days.length === 0) {
      generationMode = 'generated'
      try {
        const genPrompt = `You are an Egypt travel expert. The user sent a vague inquiry. Generate a suggested ${pax}-person itinerary.

${EGYPT_GLOSSARY}

## AVAILABLE RATES
${rateCatalog}

Return the same JSON format as before with suggested days, matching real rate IDs from the catalog.
Generate a reasonable 5-7 day Egypt itinerary covering popular sites.`

        const genResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: `Generate a suggested itinerary for this inquiry:\n\n${text}` }],
          system: genPrompt,
        })

        const genContent = genResponse.content[0]
        if (genContent.type === 'text') {
          let jsonText = genContent.text.trim()
          jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
          aiResult = JSON.parse(jsonText)
        }
      } catch (genError: any) {
        console.error('AI generative fallback error:', genError.message)
        return NextResponse.json({
          success: false,
          error: 'Could not parse or generate itinerary from the provided text',
        }, { status: 422 })
      }
    }

    if (!aiResult || !aiResult.days || aiResult.days.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'AI could not extract any days from the input',
      }, { status: 422 })
    }

    // 4. Post-processing: validate IDs, build GridDay objects
    const days = aiResult.days.map((aiDay: any, index: number) => {
      const dayId = crypto.randomUUID()
      const dayNumber = aiDay.dayNumber || index + 1

      // Build slots array
      const slots = buildSlotsFromAI(aiDay.slots || {}, rateMap)

      return {
        id: dayId,
        dayNumber,
        title: aiDay.title || `Day ${dayNumber}`,
        city: aiDay.city || '',
        description: aiDay.description || '',
        isExpanded: index === 0, // First day expanded
        slots,
      }
    })

    // 5. Auto-fill water on days that don't have it
    for (const day of days) {
      const waterSlot = day.slots.find((s: any) => s.slotId === 'water')
      if (waterSlot && waterSlot.resolvedRate === 0 && waterSlot.customAmount === null) {
        waterSlot.customAmount = 1
        waterSlot.resolvedRate = 1
        waterSlot.label = 'Water (€1 pp/day)'
      }
    }

    return NextResponse.json({
      success: true,
      days,
      metadata: aiResult.metadata || {},
      generationMode,
    })

  } catch (error: any) {
    console.error('Pricing grid parse error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Parse failed' },
      { status: 500 }
    )
  }
}

// ============================================
// Build slot values from AI response
// ============================================
function buildSlotsFromAI(
  aiSlots: Record<string, any>,
  rateMap: Map<string, { rate: number; rateNonEur: number; label: string; table: string }>
) {
  const ALL_SLOT_IDS = [
    'route', 'guide', 'airport_services', 'hotel_services', 'tipping', 'boat_rides', 'other_group',
    'accommodation', 'entrance_fees', 'flights', 'experiences', 'meals', 'water', 'cruise', 'sleeping_trains', 'other_pp',
  ]

  const MULTI_SLOTS = new Set(['route', 'airport_services', 'hotel_services', 'tipping', 'boat_rides', 'entrance_fees', 'flights', 'experiences', 'meals'])
  const SINGLE_SLOTS = new Set(['guide', 'accommodation', 'cruise', 'sleeping_trains'])
  const CUSTOM_SLOTS = new Set(['water', 'other_group', 'other_pp'])

  return ALL_SLOT_IDS.map(slotId => {
    const raw = aiSlots[slotId]

    if (CUSTOM_SLOTS.has(slotId)) {
      const amount = typeof raw === 'number' ? raw : null
      return {
        slotId,
        selectedId: null,
        selectedIds: [],
        customAmount: amount,
        resolvedRate: amount || 0,
        label: amount ? `Custom €${amount}` : '',
      }
    }

    if (SINGLE_SLOTS.has(slotId)) {
      const id = typeof raw === 'string' ? raw : null
      const rateInfo = id ? rateMap.get(id) : null
      return {
        slotId,
        selectedId: rateInfo ? id : null,
        selectedIds: [],
        customAmount: null,
        resolvedRate: rateInfo?.rate || 0,
        label: rateInfo?.label || '',
      }
    }

    if (MULTI_SLOTS.has(slotId)) {
      const ids = Array.isArray(raw) ? raw.filter((id: string) => rateMap.has(id)) : []
      const totalRate = ids.reduce((sum: number, id: string) => sum + (rateMap.get(id)?.rate || 0), 0)
      const labels = ids.map((id: string) => rateMap.get(id)?.label || '').filter(Boolean)
      return {
        slotId,
        selectedId: null,
        selectedIds: ids,
        customAmount: null,
        resolvedRate: totalRate,
        label: labels.join(', '),
      }
    }

    return {
      slotId,
      selectedId: null,
      selectedIds: [],
      customAmount: null,
      resolvedRate: 0,
      label: '',
    }
  })
}

// ============================================
// Structure-only parse (no rate matching)
// ============================================
async function handleStructureParse(text: string, pax: number) {
  const anthropic = getAnthropic()

  const systemPrompt = `You are an Egypt travel itinerary parser. Extract a structured day-by-day itinerary from the input text WITHOUT matching any rates or prices.

${EGYPT_GLOSSARY}

## OUTPUT FORMAT
Return valid JSON only (no markdown, no backticks):
{
  "metadata": {
    "clientName": "string or null",
    "clientEmail": "string or null",
    "clientPhone": "string or null",
    "pax": number or null,
    "startDate": "YYYY-MM-DD or null",
    "passport": "eu or non_eu or null",
    "tourName": "string or null",
    "nationality": "string or null"
  },
  "days": [
    {
      "dayNumber": 1,
      "title": "Descriptive day title",
      "city": "Primary city",
      "description": "What happens this day",
      "services": [
        { "text": "Human-readable service description", "category": "group or per_person" }
      ]
    }
  ]
}

## SERVICE CATEGORIES
Group services (shared cost across all travelers):
- Transport / transfers (airport transfers, intercity drives, day tour transport)
- Guide services
- Airport meet & assist
- Hotel check-in/check-out assistance
- Tipping
- Boat rides (felucca, motorboat)

Per-person services (cost per traveler):
- Accommodation / hotel nights
- Entrance fees to sites and attractions
- Domestic flights
- Experiences and activities
- Meals (breakfast, lunch, dinner)
- Nile Cruise nights
- Sleeping train tickets

## TRANSPORT RULES
A single day often needs MULTIPLE separate transport services. Always list each as a separate service item:
- "airport_transfer" — one-way airport-to-hotel or hotel-to-airport transfer
- "day_tour" — full-day sightseeing transport within a city
- "intercity" — between cities by road

**Airport transfer and day tour are ALWAYS separate entries, even in the same city on the same day.**

Common patterns (list ALL that apply):
- Arrival day with sightseeing: "Airport transfer from [Airport] to hotel" (group) + "Full-day sightseeing transport in [City]" (group)
- Pure sightseeing day: "Full-day sightseeing transport in [City]" (group)
- Departure day with sightseeing: "Full-day sightseeing transport in [City]" (group) + "Transfer from hotel to [Airport]" (group)
- Departure day (no sightseeing): "Transfer from hotel to [Airport]" (group) only
- Multi-city day via flight (e.g., fly Cairo→Luxor then sightsee):
  * "Transfer from hotel to Cairo Airport" (group)
  * "Airport transfer from Luxor Airport to hotel/sites" (group)
  * "Full-day sightseeing transport in Luxor" (group)
- Intercity by road: "Intercity transfer from [City A] to [City B]" (group)

## RULES
- List every service/activity mentioned or implied for each day as a separate item
- Use clear, descriptive text for each service (e.g. "Airport transfer from Cairo Airport to hotel", "Full-day sightseeing transport in Cairo", "Entrance to Pyramids of Giza", "Full-day Egyptologist guide in Luxor")
- For transport: always list airport transfers and day tour transport as SEPARATE service items
- For accommodation, include the hotel name if mentioned
- For meals, specify the meal type (breakfast, lunch, dinner)
- Include "Water (1 bottle per person)" for each touring day
- For arrival-only days, include airport transfer and accommodation
- For departure days, include hotel checkout and airport transfer
- For cruise days, list the cruise as a service and include any shore excursions
- Extract client metadata from greetings, signatures, or context clues
- tourName should be descriptive (e.g. "Cairo & Luxor Classic") based on itinerary content
- If the text is vague, generate a reasonable suggested itinerary for ${pax} travelers`

  let aiResult: any = null

  // Retry up to 3 times for transient errors (429/529)
  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: `Parse this travel inquiry into a structured day-by-day itinerary (no pricing):\n\n${text}` }],
        system: systemPrompt,
      })

      const content = response.content[0]
      if (content.type === 'text') {
        let jsonText = content.text.trim()
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
        aiResult = JSON.parse(jsonText)
      }
      break // Success, exit retry loop
    } catch (parseError: any) {
      const status = parseError?.status || parseError?.error?.status || 0
      const isRetryable = status === 429 || status === 529
      console.error(`Structure parse error (attempt ${attempt}/${MAX_RETRIES}):`, parseError.message)

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = attempt * 2000 // 2s, 4s backoff
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      const userMessage = isRetryable
        ? 'AI service is temporarily overloaded. Please try again in a moment.'
        : 'Could not parse itinerary structure from the provided text'
      return NextResponse.json({
        success: false,
        error: userMessage,
      }, { status: 422 })
    }
  }

  if (!aiResult || !aiResult.days || aiResult.days.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'AI could not extract any days from the input',
    }, { status: 422 })
  }

  const days = aiResult.days.map((aiDay: any, index: number) => ({
    id: crypto.randomUUID(),
    dayNumber: aiDay.dayNumber || index + 1,
    title: aiDay.title || `Day ${index + 1}`,
    city: aiDay.city || '',
    description: aiDay.description || '',
    isExpanded: true,
    services: (aiDay.services || []).map((svc: any) => ({
      id: crypto.randomUUID(),
      text: svc.text || '',
      category: svc.category === 'group' ? 'group' : 'per_person',
    })),
  }))

  return NextResponse.json({
    success: true,
    days,
    metadata: aiResult.metadata || {},
    mode: 'structure',
  })
}
