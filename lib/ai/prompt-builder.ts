// ============================================
// PROMPT BUILDER: STRUCTURED + CREATIVE GENERATORS
// ============================================

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import { egyptPromptContext, type DestinationPromptContext } from './destination-context'
import type { ServiceTier, ExtractedDay, PackageType } from './parsing-utils'
import { TIER_DESCRIPTIONS, calculateExpectedDays, preParseRawItinerary } from './parsing-utils'
import type { WritingRule } from './content-library'
import { buildWritingRulesContext } from './content-library'

// ============================================
// STRUCTURED MODE: FOLLOW PROVIDED ITINERARY
// ============================================

export async function generateFromStructuredInput(
  extractedDays: ExtractedDay[],
  rawItinerary: string,
  params: {
    tier: ServiceTier
    totalPax: number
    language: string
    attractionNames: string[]
    writingRules: WritingRule[]
    packageType?: PackageType
    memoryPromptBlock?: string
    destination?: DestinationPromptContext
  }
): Promise<any> {
  const { tier, totalPax, language, attractionNames, writingRules, packageType, memoryPromptBlock, destination } = params
  const writingContext = buildWritingRulesContext(writingRules)

  // Calculate expected number of days
  const expectedDays = calculateExpectedDays(rawItinerary, extractedDays)

  // PRE-PARSE the raw itinerary into day segments
  const daySegments = preParseRawItinerary(rawItinerary)


  daySegments.forEach(seg => {

  })

  // Build the day-by-day mapping section
  const dayMappingSection = daySegments.map(seg => {
    return `
DAY ${seg.dayNumber} INPUT (CONVERT THIS EXACTLY):
───────────────────────────────────────
${seg.rawContent}
───────────────────────────────────────`
  }).join('\n')

  const prompt = buildStructuredPrompt({
    destination,
    rawItinerary, dayMappingSection, expectedDays, language, tier, totalPax, packageType,
  })

  // In structured mode, only inject pricing + supplier memories (not client preferences)
  const structuredMemoryBlock = memoryPromptBlock
    ? memoryPromptBlock
        .split('\n')
        .filter(line =>
          line.includes('PRICING PATTERNS') ||
          line.includes('SUPPLIER PREFERENCES') ||
          line.startsWith('•') ||
          line.startsWith('═')
        )
        .join('\n')
    : ''

  const fullPrompt = structuredMemoryBlock
    ? prompt + '\n\n' + structuredMemoryBlock
    : prompt



  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: fullPrompt
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

  }

  // Log first day for debugging
  if (result.days && result.days[0]) {

  }

  return result
}

// ============================================
// CREATIVE MODE: AI GENERATES ITINERARY
// ============================================

export async function generateCreativeItinerary(
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
    memoryPromptBlock?: string
    destination?: DestinationPromptContext
  }
): Promise<any> {
  const {
    clientName, tourName, durationDays, tier, totalPax, numAdults, numChildren,
    language, cities, interests, specialRequests, startDate, effectiveCity,
    attractionNames, contentContext, writingContext, includeLunch, includeDinner, includeAccommodation,
    memoryPromptBlock, destination
  } = params

  const prompt = buildCreativePrompt({
    destination,
    clientName, tourName, durationDays, tier, numAdults, numChildren, language,
    cities, interests, specialRequests, startDate, effectiveCity, attractionNames,
    contentContext, writingContext, includeLunch, includeDinner, includeAccommodation,
  })

  // Append memory context if available
  const fullPrompt = memoryPromptBlock
    ? prompt + '\n\n' + memoryPromptBlock
    : prompt

  const message = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: fullPrompt
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
// PURE PROMPT BUILDERS — the golden-snapshot referee
// ============================================
// The template text is byte-identical to what the generate functions always
// sent — extracted so tests can pin the exact prompt (see
// __tests__/prompt-builder-golden.test.ts). Once pinned, no prompt byte can
// move without a failing test saying so; the multi-destination port (plan in
// docs/plans/) happens under these snapshots.

export function buildStructuredPrompt(input: {
  rawItinerary: string
  dayMappingSection: string
  expectedDays: number
  language: string
  tier: ServiceTier
  totalPax: number
  packageType?: PackageType
  destination?: DestinationPromptContext
}): string {
  const { rawItinerary, dayMappingSection, expectedDays, language, tier, totalPax, packageType } = input
  const d = input.destination ?? egyptPromptContext()
  const briefBlock = d.brief
    ? `\n═══════════════════════════════════════════════════════════════\n📌 DESTINATION BRIEF (this agency's voice — follow it)\n═══════════════════════════════════════════════════════════════\n${d.brief}\n`
    : ''
  return `You are a DATA CONVERTER. Your ONLY task is to convert travel agent shorthand into JSON format.

⛔ THIS IS NOT A CREATIVE TASK ⛔
You are NOT designing an itinerary. You are CONVERTING an existing one.

${d.glossaryBlock}${briefBlock}

═══════════════════════════════════════════════════════════════
⛔ FORBIDDEN ACTIONS - VIOLATING THESE IS A CRITICAL ERROR ⛔
═══════════════════════════════════════════════════════════════

1. FORBIDDEN: Adding attractions NOT in the input
${d.forbiddenAddExamples}

2. FORBIDDEN: Removing or skipping activities from input
${d.forbiddenRemoveExamples}

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

${d.decodingRules}

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
  "trip_name": "${d.exampleTripName}",
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
${d.verificationAddLine}
□ Free/sailing days have is_free_day: true
□ INSIDE attractions are in entrance_included (with fee)
□ OUTSIDE attractions are in photo_stops (NO fee)
□ Flight arrivals have needs_airport_service: true
□ The last day with activities includes everything mentioned (not just "departure")

NOW CONVERT THE ITINERARY TO JSON:`
}

export function buildCreativePrompt(input: {
  clientName: string
  tourName: string
  durationDays: number
  tier: ServiceTier
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
  destination?: DestinationPromptContext
}): string {
  const { clientName, tourName, durationDays, tier, numAdults, numChildren, language, cities, interests, specialRequests, startDate, effectiveCity, attractionNames, contentContext, writingContext, includeLunch, includeDinner, includeAccommodation } = input
  const d = input.destination ?? egyptPromptContext()
  const briefBlock = d.brief
    ? `\nDESTINATION BRIEF (this agency's voice — follow it):\n${d.brief}\n`
    : ''
  return `Create a ${durationDays}-day ${d.name} itinerary.

${d.glossaryBlock}${briefBlock}

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
      "title": "Day 1: Arrival in ${d.defaultCity}",
      "description": "Professional 2-3 sentence description of the day",
      "city": "${d.defaultCity}",
      "overnight_city": "${d.defaultCity}",
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
}
