import { describe, it, expect } from 'vitest'
import { buildStructuredPrompt, buildCreativePrompt } from '../prompt-builder'

// ============================================
// GOLDEN MASTER — the generation prompts
// ============================================
// These snapshots pin the EXACT prompt text sent to the model. They exist as
// the referee for the multi-destination port (docs/plans/): when the
// destination becomes a prompt parameter, the Egypt/default output must not
// move by a byte — an unnoticed prompt change is an unnoticed change to every
// itinerary every tenant generates. If a snapshot fails because you
// deliberately edited the prompt, update it with `vitest -u` and say so in
// the commit.

const STRUCTURED_INPUT = {
  rawItinerary: 'D1 CAI arrival\nD2 CAI/ALX/CAI day trip\nD3 CAI departure',
  dayMappingSection: '\nDAY 1 INPUT (CONVERT THIS EXACTLY):\n───\nD1 CAI arrival\n───',
  expectedDays: 3,
  language: 'English',
  tier: 'standard' as const,
  totalPax: 2,
  packageType: 'land-package' as const,
}

const CREATIVE_INPUT = {
  clientName: 'Test Client',
  tourName: 'Test Tour',
  durationDays: 3,
  tier: 'standard' as const,
  numAdults: 2,
  numChildren: 0,
  language: 'English',
  cities: ['Cairo'],
  interests: ['history'],
  specialRequests: [],
  startDate: '2026-12-01',
  effectiveCity: 'Cairo',
  attractionNames: ['Giza Plateau', 'Egyptian Museum'],
  contentContext: 'CONTENT:\ntest content',
  writingContext: 'WRITING RULES:\n- test rule',
  includeLunch: true,
  includeDinner: false,
  includeAccommodation: true,
}

describe('generation prompt golden master', () => {
  it('structured prompt is unchanged', () => {
    expect(buildStructuredPrompt(STRUCTURED_INPUT)).toMatchSnapshot()
  })

  it('creative prompt is unchanged', () => {
    expect(buildCreativePrompt(CREATIVE_INPUT)).toMatchSnapshot()
  })

  it('the empty-cities fallback uses effectiveCity', () => {
    const p = buildCreativePrompt({ ...CREATIVE_INPUT, cities: [] })
    expect(p).toContain('CITIES: Cairo')
  })
})
