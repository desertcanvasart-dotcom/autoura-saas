import { describe, it, expect, vi } from 'vitest'
import { draftNarrative, draftPrompt, outputSchema, SYSTEM_PROMPT, MAX_ATTEMPTS, type DraftInput, type ModelCall } from '@/lib/publish/engine/engine'
import { availableSlots } from '@/lib/publish/engine/slots'
import { engineBrand } from '@/lib/publish/engine/generate'
import type { TourFacts } from '@/lib/publish/contract'

// ============================================================================
// The content engine (docs/publish/PLAN.md §9, step 6). The model writes the
// language; facts exist only as slots; every reply passes the post-check or
// is sent back with the exact words to remove; after MAX_ATTEMPTS it is kept
// as failed_check for a person — never passed as clean. Run against a
// scripted model, so every path is exercised without a network call.
// ============================================================================

// The € signs below are deliberate: they are prices a draft might contain,
// which the post-check must refuse (counted in scripts/euro-literal-baseline.json).
const FACTS: TourFacts = {
  durationDays: 3, durationNights: 2, images: [],
  days: [
    { day: 1, title: 'Arrive in Luxor', city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: false, dinner: true }, sights: ['Karnak Temple'] },
    { day: 2, title: 'West Bank', city: 'Luxor', overnight: true, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Valley of the Kings', 'KV62'] },
    { day: 3, title: 'Home', city: 'Luxor', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: [] },
  ],
  mainAttractions: ['Karnak Temple'], highlights: [], inclusions: ['Guide'], exclusions: [],
  accommodation: [{ kind: 'hotel', name: 'Winter Palace', city: 'Luxor' }],
  groupSize: { min: 2, max: 8 }, departureDays: ['mon'], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', tierLabel: 'Deluxe', fromPrice: 840, bands: [{ minPax: 2, maxPax: 6, perPerson: 840 }], indicative: [] },
  publishable: { ok: true, reasons: [] },
}

function input(over: Partial<DraftInput> = {}): DraftInput {
  return {
    kind: 'overview', language: 'en', tourName: 'Luxor in 3 Days', companyName: 'Travel2Egypt', facts: FACTS,
    brand: { tone: 'warm', claims: ['Egyptologist guides'], avoid: ['cheap'] },
    sources: [{ id: 'n1', title: 'Guide note', text: 'Go early to Karnak: the light is soft.' }],
    glossary: [{ term: 'karnak', spelling: 'Karnak Temple' }],
    ...over,
  }
}

const seg = (text: string, sources: string[] = []) => ({ type: 'text', text, slot: '', sources })
const slot = (s: string) => ({ type: 'slot', text: '', slot: s, sources: [] })
const replies = (...bodies: unknown[]) => {
  const call = vi.fn<ModelCall>()
  for (const b of bodies) call.mockResolvedValueOnce(typeof b === 'string' || b === null
    ? { text: b as string | null, stopReason: b === null ? 'refusal' : 'end_turn', model: 'claude-test' }
    : { text: JSON.stringify(b), stopReason: 'end_turn', model: 'claude-test' })
  return call
}

describe('a clean draft', () => {
  it('passes on the first try, slots and sources kept, names from the records allowed', async () => {
    const call = replies({ segments: [
      seg('Go early to Karnak Temple, while the light is soft, then descend into KV62.', ['n1']),
      slot('price_from'),
      seg('Stay at the Winter Palace with Travel2Egypt on Luxor in 3 Days.'),
    ] })
    const r = await draftNarrative(input(), call)
    expect(r).toMatchObject({ status: 'in_review', attempts: 1, model: 'claude-test', promptVersion: 'publish-narrative-v1', sourcesUsed: ['n1'] })
    expect(r.check.ok).toBe(true)
    expect(r.content).toEqual({ kind: 'overview', segments: [
      { type: 'text', text: 'Go early to Karnak Temple, while the light is soft, then descend into KV62.', sources: ['n1'] },
      { type: 'slot', slot: 'price_from' },
      { type: 'text', text: 'Stay at the Winter Palace with Travel2Egypt on Luxor in 3 Days.' },
    ] })
  })
})

describe('a draft that states a fact', () => {
  it('is sent back with the exact words, append-only, and the corrected draft is kept', async () => {
    const call = replies(
      { segments: [seg('Five days of temples, breakfast included, from €840.')] },
      { segments: [seg('Days of temples at the pace of the Nile,'), slot('price_from')] },
    )
    const r = await draftNarrative(input(), call)
    expect(r.status).toBe('in_review')
    expect(r.attempts).toBe(2)
    const second = call.mock.calls[1][0].messages
    expect(second).toHaveLength(3)
    expect(second[1].role).toBe('assistant')
    expect(second[2].content).toMatch(/"Five" is a number written as a word/)
    expect(second[2].content).toMatch(/"included" is a price, policy or promise word/)
    expect(second[2].content).toMatch(/"€" is a currency or price/)
  })
  it(`still breaking it after ${MAX_ATTEMPTS} attempts: kept as failed_check, never passed as clean`, async () => {
    const bad = { segments: [seg('Departs every Monday.')] }
    const call = replies(bad, bad, bad)
    const r = await draftNarrative(input(), call)
    expect(call).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(r.status).toBe('failed_check')
    expect(r.check.violations.map(v => v.rule)).toEqual(['date'])
    expect(r.content).not.toBeNull() // kept for a person to fix
  })
})

describe('when the model gives nothing usable', () => {
  it('a refusal, invalid JSON or empty text: failed_check with the reason', async () => {
    expect(await draftNarrative(input(), replies(null))).toMatchObject({ status: 'failed_check', content: null, notes: ['The model gave no usable draft (refusal).'] })
    expect(await draftNarrative(input(), replies('{not json'))).toMatchObject({ status: 'failed_check', notes: ["The model's reply was not valid JSON."] })
    expect(await draftNarrative(input(), replies({ segments: [seg('   ')] }))).toMatchObject({ status: 'failed_check', notes: ["The model's reply had no usable text."] })
  })
})

describe('slots, sources and kinds', () => {
  it('a slot the tour cannot fill is dropped, never rendered blank; an unknown source id is dropped', async () => {
    const onRequest = { ...FACTS, price: { ...FACTS.price, status: 'on_request' as const, from: null } }
    const r = await draftNarrative(input({ facts: onRequest }), replies({ segments: [seg('Temples by the river.', ['n1', 'made-up']), slot('price_from'), slot('cancellation')] }))
    expect(r.content).toEqual({ kind: 'overview', segments: [{ type: 'text', text: 'Temples by the river.', sources: ['n1'] }] })
  })
  it('only slots whose fact exists are offered, and the schema enforces it', () => {
    expect(availableSlots(FACTS)).toEqual(['duration', 'price_from', 'group_size', 'departure_days'])
    const schema = outputSchema('overview', availableSlots(FACTS), ['n1'], []) as { properties: { segments: { items: { properties: { slot: { enum: string[] }; sources: { items: { enum: string[] } } } } } } }
    expect(schema.properties.segments.items.properties.slot.enum).toEqual(['', 'duration', 'price_from', 'group_size', 'departure_days'])
    expect(schema.properties.segments.items.properties.sources.items.enum).toEqual(['n1'])
  })
  it('days: one narrative per listed day, a missing day noted', async () => {
    const r = await draftNarrative(input({ kind: 'days' }), replies({ days: [
      { day: 2, segments: [seg('Cross to the West Bank for the Valley of the Kings.')] },
      { day: 1, segments: [seg('Evening light on Karnak Temple.')] },
      { day: 9, segments: [seg('Not a day of this tour.')] },
    ] }))
    expect(r.content).toEqual({ kind: 'days', days: [
      { day: 1, segments: [{ type: 'text', text: 'Evening light on Karnak Temple.' }] },
      { day: 2, segments: [{ type: 'text', text: 'Cross to the West Bank for the Valley of the Kings.' }] },
    ] })
    expect(r.notes).toEqual(['No narrative for day 3.'])
  })
  it('highlights and SEO; an over-long title is noted, and SEO offers no slots', async () => {
    const h = await draftNarrative(input({ kind: 'highlights' }), replies({ items: [{ segments: [seg('Karnak Temple at dawn')] }, { segments: [seg('Tea on the Winter Palace terrace')] }] }))
    expect(h.content).toEqual({ kind: 'highlights', items: [[{ type: 'text', text: 'Karnak Temple at dawn' }], [{ type: 'text', text: 'Tea on the Winter Palace terrace' }]] })
    const call = replies({ title: 'Luxor in 3 Days — temples, tombs and the Nile with Travel2Egypt', description: 'Karnak Temple and the Valley of the Kings, at the pace of the river.' })
    const s = await draftNarrative(input({ kind: 'seo' }), call)
    expect(s.status).toBe('in_review')
    expect(s.notes[0]).toMatch(/The title is \d+ characters/)
    expect(JSON.stringify(call.mock.calls[0][0].schema)).not.toContain('slot')
  })
  it('a language without a post-check list is refused before any call', async () => {
    const call = replies()
    await expect(draftNarrative(input({ language: 'de' }), call)).rejects.toThrow(/does not write "de"/)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('what the model is told', () => {
  const prompt = draftPrompt(input({ instruction: 'Mention the felucca.' }), availableSlots(FACTS))

  it('the shape of the tour, the brand, glossary, notes, slots and the reviewer\'s note', () => {
    expect(prompt).toContain('write in English only')
    expect(prompt).toContain('Tone of voice: warm.')
    expect(prompt).toContain('Claims this agency may make (and no others): Egyptologist guides.')
    expect(prompt).toContain('Words and phrases to avoid: cheap.')
    expect(prompt).toContain('Spell these names exactly: Karnak Temple.')
    expect(prompt).toContain('"Valley of the Kings"')
    expect(prompt).toContain('- price_from: the starting price per person')
    expect(prompt).toContain('[n1] Guide note')
    expect(prompt).toContain('The reviewer asked for this change: Mention the felucca.')
  })
  it('never the facts themselves: no price, group size, departure day or inclusion values', () => {
    expect(prompt).not.toContain('840')
    expect(prompt).not.toMatch(/"max": ?8|"min": ?2/)
    expect(prompt).not.toMatch(/\bmon\b/)
    expect(prompt).not.toContain('Guide"') // the inclusion list is not sent
    expect(prompt).not.toContain('Deluxe')
  })
  it('the system prompt states the rule and is the same for every tour (cacheable)', () => {
    expect(SYSTEM_PROMPT).toContain('never state a fact in your text')
    expect(SYSTEM_PROMPT).not.toMatch(/Travel2Egypt|Luxor/)
  })
})

describe('the brand as the engine reads it', () => {
  it('tone resolved; claims and words to avoid from the stored brand, strings only', () => {
    expect(engineBrand('private_journeys', { tone: 'formal', claims: ['Licensed by ETAA', 7, ''], avoid: ['cheap'] }))
      .toEqual({ tone: 'formal', claims: ['Licensed by ETAA'], avoid: ['cheap'] })
    expect(engineBrand('transparent_value', null)).toEqual({ tone: 'warm', claims: [], avoid: [] })
  })
})
