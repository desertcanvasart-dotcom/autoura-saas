// ============================================
// DESTINATION PROMPT CONTEXT (P2)
// ============================================
// Everything destination-specific that the generation prompts interpolate,
// gathered into one object. The Egypt values are byte-identical to the text
// that used to live inline in prompt-builder.ts — the golden snapshots in
// __tests__/prompt-builder-golden.test.ts are the referee: with no context
// passed, both prompts must not move by a byte.
//
// Non-Egypt destinations get genericPromptContext(): destination-neutral
// decoding rules plus a glossary assembled from the catalog's own city and
// airport-code data. loadDestinationPromptContext() resolves the tenant's
// DEFAULT destination and never throws — any failure falls back to Egypt,
// exactly as if the feature did not exist.

import { EGYPT_TRAVEL_GLOSSARY } from './egypt-glossary'

export interface DestinationPromptContext {
  /** Country name, e.g. 'Egypt' — used in prose ("Create a … Egypt itinerary"). */
  name: string
  /** Where trips start when no city is given, e.g. 'Cairo'. */
  defaultCity: string
  /** Shorthand glossary block injected near the top of both prompts. */
  glossaryBlock: string
  /** Body of the structured prompt's DECODING RULES section. */
  decodingRules: string
  /** Example lines under FORBIDDEN action 1 (adding attractions). */
  forbiddenAddExamples: string
  /** Example lines under FORBIDDEN action 2 (removing activities). */
  forbiddenRemoveExamples: string
  /** Example trip_name in the structured output format. */
  exampleTripName: string
  /** Verification-checklist line about not inventing sites. */
  verificationAddLine: string
  /** The tenant's generation brief for this destination (or null). */
  brief: string | null
}

// --------------------------------------------
// Egypt — the verbatim text the prompts always carried
// --------------------------------------------

export function egyptPromptContext(brief: string | null = null): DestinationPromptContext {
  return {
    name: 'Egypt',
    defaultCity: 'Cairo',
    glossaryBlock: EGYPT_TRAVEL_GLOSSARY,
    decodingRules: `CITY CODES:
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
"DEPARTED BY MS955@23:20" = Departure flight at 23:20`,
    forbiddenAddExamples: `   - If Abu Simbel is not mentioned → DO NOT ADD IT
   - If Unfinished Obelisk is not mentioned → DO NOT ADD IT
   - If Grand Museum is not mentioned → DO NOT ADD IT`,
    forbiddenRemoveExamples: `   - If D1 says "Alexandria tour" → Day 1 MUST include Alexandria
   - If D2 says "Pyramids & Museum" → Day 2 MUST include BOTH`,
    exampleTripName: 'Egypt: Cairo, Nile Cruise & Hurghada',
    verificationAddLine: '□ I did NOT add Abu Simbel, Unfinished Obelisk, or other sites not mentioned',
    brief,
  }
}

// --------------------------------------------
// Any other destination — built from catalog data
// --------------------------------------------

export interface GenericDestinationInput {
  name: string
  defaultCity: string
  cities: Array<{ name: string; airport_codes?: string[] | null; aliases?: string[] | null }>
  brief?: string | null
}

export function genericPromptContext(input: GenericDestinationInput): DestinationPromptContext {
  const { name, defaultCity, cities } = input

  // Shorthand vocabulary from the catalog: airport codes and aliases both
  // decode to the city name.
  const codePairs: string[] = []
  for (const city of cities) {
    for (const code of city.airport_codes ?? []) codePairs.push(`${code}=${city.name}`)
    for (const alias of city.aliases ?? []) codePairs.push(`${alias}=${city.name}`)
  }
  const cityCodesLine = codePairs.length > 0
    ? codePairs.join(', ')
    : `(no shorthand codes registered for ${name} — city names are written in full)`

  const cityA = cities[0]?.name || defaultCity
  const cityB = cities[1]?.name || cityA

  const glossaryBlock = `
=================================================================
TRAVEL INDUSTRY ABBREVIATIONS - ${name.toUpperCase()}
=================================================================

CRITICAL: You MUST decode these abbreviations and follow the itinerary EXACTLY as written.
DO NOT add, remove, or reorder any activities. Convert ONLY what is written.

-----------------------------------------------------------------
CITY & AIRPORT CODES
-----------------------------------------------------------------
${cityCodesLine}

-----------------------------------------------------------------
ACCOMMODATION CODES
-----------------------------------------------------------------
NTS = Nights (e.g., "3NTS" = 3 nights stay)
HTL = Hotel
OVN = Overnight
C/IN = Check-in
C/OUT = Check-out

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
"D1 ${cityA}" = Day 1 in ${cityA}
"D3 ${cityA}/${cityB}" = Day 3: Travel from ${cityA} to ${cityB}
"/" between cities = transfer/travel between those cities
@ = at (time), e.g., "arrive @05:10" = arrive at 05:10

-----------------------------------------------------------------
CRITICAL: ENTRANCE FEE MARKERS
-----------------------------------------------------------------
(INSIDE) = Entrance fee REQUIRED - guests will enter the site
(OUTSIDE) = NO entrance fee - photo stop only, viewing from outside
A site with no marker = Assume entrance included

-----------------------------------------------------------------
FREE DAYS
-----------------------------------------------------------------
When a day shows ONLY the location with NO activities:
= Free day (no scheduled activities) → title = "Free Day" or "Day at Leisure"

-----------------------------------------------------------------
MEALS IN ITINERARY
-----------------------------------------------------------------
B = Breakfast
L = Lunch
D = Dinner
"L" at end of day = Lunch included

-----------------------------------------------------------------
AIRPORT & HOTEL SERVICES
-----------------------------------------------------------------

AIRPORT SERVICES (add when flights arrive/depart):
- International arrival: Airport meet & assist, visa assistance, luggage help, transfer to vehicle
- Domestic arrival: Airport meet & assist, luggage help, transfer to vehicle
- Departure: Hotel to airport transfer, check-in assistance

HOTEL SERVICES (add when):
- Check-in to hotel (first time in a city)
- Check-out from hotel (leaving city)
- Moving from one city to another

-----------------------------------------------------------------
IMPORTANT CALCULATION RULE
-----------------------------------------------------------------
Number of DAYS = Number of NIGHTS + 1

-----------------------------------------------------------------
CRITICAL RULE: FOLLOW EXACTLY
-----------------------------------------------------------------
DO NOT add attractions not mentioned in the original!
DO NOT reorder days!
DO NOT skip any day!
If a day just names a city with nothing else, it's a FREE day with NO tours!
=================================================================
`

  const decodingRules = `CITY CODES:
${cityCodesLine}

MULTI-CITY PATTERN:
"D1 ${cityA}/${cityB}/${cityA}" = Day trip: Arrive ${cityA} → Visit ${cityB} → Return ${cityA}
This is NOT just "Arrival" - it's arrival PLUS a FULL DAY TOUR!

ENTRANCE MARKERS:
(INSIDE) = Entrance fee required → add to entrance_included[]
(OUTSIDE) = Photo stop only → add to photo_stops[] (NO entrance fee)

FREE DAYS:
A day with only a city and nothing else = Free day → is_free_day: true

MEALS:
L = Lunch included
D = Dinner included

FLIGHTS:
XX123@05:10 = Flight XX123 at 05:10
"DEPARTED BY XX123@23:20" = Departure flight at 23:20`

  return {
    name,
    defaultCity,
    glossaryBlock,
    decodingRules,
    forbiddenAddExamples: `   - If a site is not mentioned in the input → DO NOT ADD IT
   - Famous sites are NOT exceptions — mentioned or absent, nothing else
   - Do NOT pad thin days with extra attractions`,
    forbiddenRemoveExamples: `   - If D1 says "${cityB} tour" → Day 1 MUST include ${cityB}
   - If a day lists TWO sites → that day MUST include BOTH`,
    exampleTripName: `${name}: Highlights of ${cityA}`,
    verificationAddLine: '□ I did NOT add any sites that were not mentioned in the input',
    brief: input.brief ?? null,
  }
}

// --------------------------------------------
// Loader — the tenant's default destination, Egypt fallback, never throws
// --------------------------------------------

interface SelectionRow {
  generation_brief: string | null
  destination_catalog: {
    country_code: string
    name: string
    destination_cities: Array<{
      name: string
      airport_codes: string[] | null
      aliases: string[] | null
      sort_order: number
      is_active: boolean
    }> | null
  } | null
}

// Structural subset of the Supabase client — just the one chained query the
// loader runs, so tests can hand in a stub without dragging the client types.
interface MinimalDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: boolean): {
        eq(column: string, value: boolean): {
          maybeSingle(): PromiseLike<{ data: unknown }>
        }
      }
    }
  }
}

// The parameter is deliberately `object`, cast once inside: matching the
// fully-generic Supabase client against MinimalDb structurally sends tsc
// into excessively-deep instantiation.
export async function loadDestinationPromptContext(db: object): Promise<DestinationPromptContext> {
  try {
    const { data: selection } = await (db as MinimalDb)
      .from('tenant_destinations')
      .select('generation_brief, destination_catalog(country_code, name, destination_cities(name, airport_codes, aliases, sort_order, is_active))')
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle()

    const row = (selection ?? null) as SelectionRow | null
    const catalog = row?.destination_catalog
    if (!row || !catalog) return egyptPromptContext()

    const brief = row.generation_brief || null
    if (catalog.country_code === 'EG') return egyptPromptContext(brief)

    const cities = (catalog.destination_cities ?? [])
      .filter(c => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)

    return genericPromptContext({
      name: catalog.name,
      defaultCity: cities[0]?.name || catalog.name,
      cities,
      brief,
    })
  } catch (error) {
    console.error('loadDestinationPromptContext failed, falling back to Egypt:', error)
    return egyptPromptContext()
  }
}
