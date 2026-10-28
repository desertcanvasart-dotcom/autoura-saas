import { describe, it, expect } from 'vitest'
import { renderableNarrative, toStoredPart, withPart, tourFingerprint, dayFingerprint, factsHash, type NarrativeBundle } from '@/lib/publish/narrative'
import type { TourFacts } from '@/lib/publish/contract'

// ============================================================================
// Approved narrative against today's facts (docs/publish/PLAN.md §10): a part
// shows only while the facts it was written from still hold. A changed sight
// hides the overview and highlights; a changed day hides that day's text
// only; a slot that can no longer be filled hides its part; facts that do
// not touch the text (a price) change nothing. Nothing describing the old
// itinerary stays live.
// ============================================================================

const FACTS: TourFacts = {
  durationDays: 2, durationNights: 1, images: [],
  days: [
    { day: 1, title: 'Luxor', city: 'Luxor', overnight: true, meals: { breakfast: false, lunch: true, dinner: true }, sights: ['Karnak Temple'] },
    { day: 2, title: 'Aswan', city: 'Aswan', overnight: false, meals: { breakfast: true, lunch: false, dinner: false }, sights: ['Philae'] },
  ],
  mainAttractions: ['Karnak Temple'], highlights: [], inclusions: ['Guide'], exclusions: [],
  accommodation: [{ kind: 'hotel', name: 'Winter Palace', city: 'Luxor' }],
  groupSize: null, departureDays: [], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', tierLabel: 'Standard', fromPrice: 500, bands: [{ minPax: 2, maxPax: 6, perPerson: 500 }], indicative: [] },
  publishable: { ok: true, reasons: [] },
}
const NAME = 'Luxor and Aswan'
const t = (text: string) => ({ type: 'text' as const, text })

function approvedBundle(facts = FACTS): NarrativeBundle {
  let b: NarrativeBundle | null = null
  b = withPart(b, toStoredPart({ kind: 'overview', segments: [t('Temples by the Nile, from'), { type: 'slot', slot: 'price_from' }] }, facts, NAME))
  b = withPart(b, toStoredPart({ kind: 'highlights', items: [[t('Karnak Temple at dawn')]] }, facts, NAME))
  b = withPart(b, toStoredPart({ kind: 'days', days: [{ day: 1, segments: [t('Karnak at dusk.')] }, { day: 2, segments: [t('Philae by boat.')] }] }, facts, NAME))
  b = withPart(b, toStoredPart({ kind: 'seo', title: 'Luxor and Aswan', description: 'Temples by the Nile.' }, facts, NAME))
  return b
}

describe('what shows', () => {
  it('everything, against the facts it was written from', () => {
    const r = renderableNarrative(approvedBundle(), FACTS, NAME)
    expect(r.overview).toEqual([t('Temples by the Nile, from'), { type: 'slot', slot: 'price_from' }])
    expect(r.highlights).toEqual([[t('Karnak Temple at dawn')]])
    expect(r.days.map(d => d.day)).toEqual([1, 2])
    expect(r.seo).toEqual({ title: 'Luxor and Aswan', description: 'Temples by the Nile.' })
    expect(r.stale).toEqual([])
  })
  it('a price change touches no text — the price is a slot', () => {
    const cheaper = { ...FACTS, price: { ...FACTS.price, from: { ...FACTS.price.from!, perPerson: 450 } } }
    expect(renderableNarrative(approvedBundle(), cheaper, NAME).stale).toEqual([])
    expect(factsHash(cheaper)).not.toBe(factsHash(FACTS)) // …but the audit hash sees it
  })
  it('a changed sight on day two hides the whole-tour parts and day two — day one stays', () => {
    const changed = { ...FACTS, days: [FACTS.days[0], { ...FACTS.days[1], sights: ['High Dam'] }] }
    const r = renderableNarrative(approvedBundle(), changed, NAME)
    expect(r.overview).toBeNull()
    expect(r.highlights).toBeNull()
    expect(r.seo).toBeNull()
    expect(r.days.map(d => d.day)).toEqual([1])
    expect(r.stale).toEqual(['overview', 'highlights', 'day 2', 'seo'])
  })
  it('a different hotel hides text that could name the old one', () => {
    const moved = { ...FACTS, accommodation: [{ kind: 'hotel' as const, name: 'Old Cataract', city: 'Aswan' }] }
    expect(renderableNarrative(approvedBundle(), moved, NAME).stale).toContain('overview')
  })
  it('a removed day hides its text', () => {
    const shorter = { ...FACTS, days: [FACTS.days[0]] }
    expect(renderableNarrative(approvedBundle(), shorter, NAME).stale).toContain('day 2')
  })
  it('a slot that can no longer be filled hides its part — never a blank in a sentence', () => {
    const onRequest = { ...FACTS, price: { ...FACTS.price, status: 'on_request' as const, from: null } }
    const r = renderableNarrative(approvedBundle(), onRequest, NAME)
    expect(r.overview).toBeNull()
    expect(r.stale).toEqual(['overview'])
    expect(r.days).toHaveLength(2)
  })
  it('no version or no facts: nothing to show', () => {
    expect(renderableNarrative(null, FACTS, NAME)).toEqual({ overview: null, highlights: null, days: [], seo: null, labels: {}, stale: [] })
  })
})

describe('the bundle', () => {
  it('approving one part replaces only that part', () => {
    const b = approvedBundle()
    const next = withPart(b, toStoredPart({ kind: 'overview', segments: [t('A new overview.')] }, FACTS, NAME))
    expect(next.overview).toMatchObject({ segments: [t('A new overview.')] })
    expect(next.highlights).toBe(b.highlights)
    expect(next.days).toBe(b.days)
  })
  it('each day carries its own fingerprint', () => {
    const part = toStoredPart({ kind: 'days', days: [{ day: 2, segments: [t('x')] }] }, FACTS, NAME)
    expect(part.part === 'days' && part.days[0].fingerprint).toBe(dayFingerprint(FACTS.days[1]))
    expect(part.fingerprint).toBe(tourFingerprint(FACTS, NAME))
  })
  it('fingerprints ignore letter case and the order of sights', () => {
    const shuffled = { ...FACTS, days: [{ ...FACTS.days[0], sights: ['karnak temple'] }, FACTS.days[1]] }
    expect(tourFingerprint(shuffled, 'LUXOR AND ASWAN')).toBe(tourFingerprint(FACTS, NAME))
  })
})
