import { describe, it, expect } from 'vitest'
import {
  egyptPromptContext,
  genericPromptContext,
  loadDestinationPromptContext,
} from '../destination-context'
import { buildStructuredPrompt, buildCreativePrompt } from '../prompt-builder'
import { EGYPT_TRAVEL_GLOSSARY } from '../egypt-glossary'

// P2: destination-parameterised generation. The golden snapshots prove the
// Egypt/default path never moved; these tests prove the OTHER destinations
// actually get their own framing, and that the loader can only ever fail
// back to Egypt — never throw into the generation route.

const JORDAN = genericPromptContext({
  name: 'Jordan',
  defaultCity: 'Amman',
  cities: [
    { name: 'Amman', airport_codes: ['AMM'], aliases: null },
    { name: 'Petra', airport_codes: null, aliases: ['PTR'] },
    { name: 'Aqaba', airport_codes: ['AQJ'], aliases: null },
  ],
  brief: null,
})

const STRUCTURED_INPUT = {
  rawItinerary: 'D1 AMM arrival\nD2 AMM/PTR/AMM\nD3 AMM departure',
  dayMappingSection: '\nDAY 1 INPUT:\nD1 AMM arrival',
  expectedDays: 3,
  language: 'English',
  tier: 'standard' as const,
  totalPax: 2,
  packageType: 'land-package' as const,
}

const CREATIVE_INPUT = {
  clientName: 'Test Client',
  tourName: 'Jordan Classic',
  durationDays: 3,
  tier: 'standard' as const,
  numAdults: 2,
  numChildren: 0,
  language: 'English',
  cities: ['Amman'],
  interests: [],
  specialRequests: [],
  startDate: '2026-12-01',
  effectiveCity: 'Amman',
  attractionNames: ['Petra Treasury', 'Amman Citadel'],
  contentContext: '',
  writingContext: '',
  includeLunch: true,
  includeDinner: false,
  includeAccommodation: true,
}

describe('genericPromptContext', () => {
  it('decodes airport codes and aliases from catalog data', () => {
    expect(JORDAN.decodingRules).toContain('AMM=Amman')
    expect(JORDAN.decodingRules).toContain('PTR=Petra')
    expect(JORDAN.decodingRules).toContain('AQJ=Aqaba')
  })

  it('says so when no shorthand codes exist', () => {
    const bare = genericPromptContext({
      name: 'Kenya', defaultCity: 'Nairobi',
      cities: [{ name: 'Nairobi' }],
    })
    expect(bare.decodingRules).toContain('no shorthand codes registered for Kenya')
  })

  it('carries no Egypt vocabulary', () => {
    for (const block of [JORDAN.glossaryBlock, JORDAN.decodingRules,
      JORDAN.forbiddenAddExamples, JORDAN.exampleTripName]) {
      expect(block).not.toMatch(/Egypt|Cairo|Nile|Abu Simbel|EgyptAir/i)
    }
  })
})

describe('destination-parameterised prompts', () => {
  it('structured prompt speaks the destination, not Egypt', () => {
    const p = buildStructuredPrompt({ ...STRUCTURED_INPUT, destination: JORDAN })
    expect(p).toContain('TRAVEL INDUSTRY ABBREVIATIONS - JORDAN')
    expect(p).toContain('AMM=Amman')
    expect(p).not.toContain(EGYPT_TRAVEL_GLOSSARY)
    expect(p).not.toContain('Abu Simbel')
    expect(p).not.toContain('Nile Cruise')
  })

  it('creative prompt names the destination and its default city', () => {
    const p = buildCreativePrompt({ ...CREATIVE_INPUT, destination: JORDAN })
    expect(p).toContain('Create a 3-day Jordan itinerary.')
    expect(p).toContain('"title": "Day 1: Arrival in Amman"')
    expect(p).not.toContain('Egypt itinerary')
  })

  it('the generation brief is injected only when present', () => {
    const brief = 'Always mention that Petra needs a full day.'
    const withBrief = buildCreativePrompt({
      ...CREATIVE_INPUT,
      destination: genericPromptContext({
        name: 'Jordan', defaultCity: 'Amman',
        cities: [{ name: 'Amman' }], brief,
      }),
    })
    expect(withBrief).toContain('DESTINATION BRIEF')
    expect(withBrief).toContain(brief)
    expect(buildCreativePrompt({ ...CREATIVE_INPUT, destination: JORDAN }))
      .not.toContain('DESTINATION BRIEF')
  })

  it('an Egypt tenant with a brief keeps the full Egypt framing plus the brief', () => {
    const p = buildStructuredPrompt({
      ...STRUCTURED_INPUT,
      destination: egyptPromptContext('Coordinate every Nile cruise day with the dahabiya desk.'),
    })
    expect(p).toContain('EGYPTIAN TRAVEL INDUSTRY ABBREVIATIONS')
    expect(p).toContain('DESTINATION BRIEF')
    expect(p).toContain('dahabiya desk')
  })
})

describe('loadDestinationPromptContext', () => {
  const dbReturning = (result: unknown) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => result }),
        }),
      }),
    }),
  })

  it('resolves a non-Egypt default destination', async () => {
    const ctx = await loadDestinationPromptContext(dbReturning({
      data: {
        generation_brief: 'Desert-first pacing.',
        destination_catalog: {
          country_code: 'JO', name: 'Jordan',
          destination_cities: [
            { name: 'Petra', airport_codes: null, aliases: null, sort_order: 2, is_active: true },
            { name: 'Amman', airport_codes: ['AMM'], aliases: null, sort_order: 1, is_active: true },
            { name: 'Ghost', airport_codes: null, aliases: null, sort_order: 3, is_active: false },
          ],
        },
      },
    }))
    expect(ctx.name).toBe('Jordan')
    expect(ctx.defaultCity).toBe('Amman') // lowest sort_order, inactive dropped
    expect(ctx.brief).toBe('Desert-first pacing.')
  })

  it('an Egypt default keeps the verbatim Egypt context with the tenant brief', async () => {
    const ctx = await loadDestinationPromptContext(dbReturning({
      data: {
        generation_brief: 'ATS voice.',
        destination_catalog: { country_code: 'EG', name: 'Egypt', destination_cities: [] },
      },
    }))
    expect(ctx.glossaryBlock).toBe(EGYPT_TRAVEL_GLOSSARY)
    expect(ctx.brief).toBe('ATS voice.')
  })

  it('no selection → Egypt, and a throwing db → Egypt (never throws)', async () => {
    const none = await loadDestinationPromptContext(dbReturning({ data: null }))
    expect(none.name).toBe('Egypt')
    expect(none.brief).toBeNull()

    const broken = { from: () => { throw new Error('table missing') } }
    const ctx = await loadDestinationPromptContext(broken)
    expect(ctx.name).toBe('Egypt')
  })
})
