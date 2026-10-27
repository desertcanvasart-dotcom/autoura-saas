import { describe, it, expect, vi } from 'vitest'
import { checkTranslation, draftTranslation, labelSources, readTranslation } from '@/lib/publish/engine/translate'
import { renderableNarrative, toStoredPart, translateFacts, withPart } from '@/lib/publish/narrative'
import type { ModelCall } from '@/lib/publish/engine/engine'
import type { TourFacts } from '@/lib/publish/contract'

// ============================================================================
// The tour's own wording in the site's second language (operator,
// 2026-10-27: AI translates, a person approves). What it proves:
//   · the wording sent is the records' own (name, days, sights, highlights,
//     inclusions…), never a hotel's or ship's name;
//   · a translation must state the same facts: a changed, added or dropped
//     number, currency or weekday is refused and sent back;
//   · on the page a translation applies only while its original is still in
//     the records — prices and terms are never touched.
// ============================================================================

const NAME = 'Five Days in Cairo'
const FACTS = {
  durationDays: 5, durationNights: 4, images: [],
  days: [
    { day: 1, title: 'Arrival in Cairo', city: 'Cairo', overnight: true, meals: { breakfast: false, lunch: false, dinner: false }, sights: [] },
    { day: 2, title: 'Giza', city: 'Cairo', overnight: true, meals: { breakfast: true, lunch: true, dinner: false }, sights: ['Giza Pyramids', 'Great Sphinx'] },
  ],
  mainAttractions: ['Giza Pyramids'], highlights: ['Camel ride at sunset'],
  inclusions: ['Four nights with breakfast', '2 bottles of water a day'], exclusions: ['Tips'],
  accommodation: [{ kind: 'hotel', name: 'Sandbox Lotus Inn Cairo', city: 'Cairo' }],
  groupSize: { min: 2, max: 16 }, departureDays: ['sat'], departures: [], cancellation: null,
  price: { status: 'available', currency: 'EUR', basis: { pax: 2, season: 'lowest' }, from: { perPerson: 441, tier: 'budget', tierLabel: 'Budget' }, byNationality: null, table: [], indicative: [] },
  publishable: { ok: true, reasons: [] },
} as unknown as TourFacts

describe('the wording that is translated', () => {
  it("is the records' own words, each once, in page order — never a business name", () => {
    expect(labelSources(FACTS, NAME)).toEqual([
      'Five Days in Cairo', 'Arrival in Cairo', 'Cairo', 'Giza', 'Giza Pyramids', 'Great Sphinx',
      'Camel ride at sunset', 'Four nights with breakfast', '2 bottles of water a day', 'Tips', 'Budget',
    ])
    expect(labelSources(FACTS, NAME)).not.toContain('Sandbox Lotus Inn Cairo')
  })
})

describe('faithfulness', () => {
  const ok = (source: string, text: string, lang = 'fr') => checkTranslation([{ source, text }], lang).ok
  it('a faithful translation passes', () => {
    expect(ok('Four nights with breakfast', 'Quatre nuits avec petit-déjeuner')).toBe(true)
    expect(ok('2 bottles of water a day', '2 bouteilles d’eau par jour')).toBe(true)
    expect(ok('Seventy-minute felucca ride', 'Balade en felouque de soixante-dix minutes')).toBe(true)
    expect(ok('Giza Pyramids', 'Pyramides de Gizeh')).toBe(true)
    expect(ok('Departs Saturday', 'Départ le samedi')).toBe(true)
  })
  it('a changed, added or dropped number is refused', () => {
    expect(ok('2 bottles of water a day', '3 bouteilles d’eau par jour')).toBe(false)
    expect(ok('2 bottles of water a day', 'Bouteilles d’eau')).toBe(false)
    expect(ok('Four nights with breakfast', 'Nuits avec petit-déjeuner')).toBe(false)
    expect(ok('Breakfast', 'Petit-déjeuner pour deux')).toBe(false)
  })
  it('a price or a weekday that moves is refused', () => {
    expect(ok('Entrance fees', 'Droits d’entrée (20 EUR)')).toBe(false)
    expect(ok('Departs Saturday', 'Départ le dimanche et le samedi')).toBe(false)
    expect(ok('Departs Saturday', 'Salidas', 'es')).toBe(false)
  })
  it('names each refused pair', () => {
    const r = checkTranslation([{ source: '2 bottles', text: '3 bouteilles' }], 'fr')
    expect(r.violations).toEqual([{ rule: 'digit', match: '"2 bottles" → "3 bouteilles"', segment: 0 }])
  })
})

describe('reading the reply', () => {
  it('keeps known originals only, each once, in source order, and reports what is missing', () => {
    const r = readTranslation({ items: [
      { source: 'Tips', text: 'Pourboires' }, { source: 'Invented', text: 'Inventé' }, { source: 'Tips', text: 'Autre' }, { source: 'Cairo', text: ' Le Caire ' },
    ] }, ['Cairo', 'Tips', 'Giza'])
    expect(r.items).toEqual([{ source: 'Cairo', text: 'Le Caire' }, { source: 'Tips', text: 'Pourboires' }])
    expect(r.missing).toEqual(['Giza'])
  })
})

describe('the translation loop', () => {
  const reply = (items: Array<[string, string]>) => ({ text: JSON.stringify({ items: items.map(([source, text]) => ({ source, text })) }), stopReason: 'end_turn', model: 'claude-test' })
  const input = { language: 'fr', sources: ['2 bottles of water a day', 'Tips'], glossary: [], avoid: [] }

  it('sends back a translation that changes a number, and keeps the corrected one for review', async () => {
    const call = vi.fn<ModelCall>()
      .mockResolvedValueOnce(reply([['2 bottles of water a day', '3 bouteilles d’eau par jour'], ['Tips', 'Pourboires']]))
      .mockResolvedValueOnce(reply([['2 bottles of water a day', '2 bouteilles d’eau par jour'], ['Tips', 'Pourboires']]))
    const r = await draftTranslation(input, call)
    expect(r.status).toBe('in_review')
    expect(r.attempts).toBe(2)
    expect(r.content).toEqual({ kind: 'labels', items: [{ source: '2 bottles of water a day', text: '2 bouteilles d’eau par jour' }, { source: 'Tips', text: 'Pourboires' }] })
    expect(String(call.mock.calls[1][0].messages.at(-1)!.content)).toContain('"2 bottles of water a day" → "3 bouteilles d’eau par jour": its numbers differ')
  })

  it('never passes a translation that keeps changing a fact', async () => {
    const call = vi.fn<ModelCall>().mockResolvedValue(reply([['2 bottles of water a day', '3 bouteilles'], ['Tips', 'Pourboires']]))
    const r = await draftTranslation(input, call)
    expect(r.status).toBe('failed_check')
    expect(r.attempts).toBe(3)
  })

  it('English is the records\' own language — nothing to translate', async () => {
    await expect(draftTranslation({ ...input, language: 'en' }, vi.fn())).rejects.toThrow(/already in English/)
  })
})

describe('on the page', () => {
  const approved = withPart(null, toStoredPart({ kind: 'labels', items: [
    { source: 'Five Days in Cairo', text: 'Cinq jours au Caire' }, { source: 'Cairo', text: 'Le Caire' },
    { source: 'Four nights with breakfast', text: 'Quatre nuits avec petit-déjeuner' }, { source: 'Budget', text: 'Économique' },
    { source: 'Old inclusion', text: 'Ancienne' },
  ] }, FACTS, NAME))

  it('a translation shows while its original is in the records; the rest is reported untranslated', () => {
    const r = renderableNarrative(approved, FACTS, NAME)
    expect(r.labels).toEqual({ 'Five Days in Cairo': 'Cinq jours au Caire', Cairo: 'Le Caire', 'Four nights with breakfast': 'Quatre nuits avec petit-déjeuner', Budget: 'Économique' })
    expect(r.stale).toEqual(['labels'])
  })

  it('translates words only — every price, number and term is the records\'', () => {
    const t = translateFacts(FACTS, renderableNarrative(approved, FACTS, NAME).labels)
    expect(t.days[0]).toMatchObject({ title: 'Arrival in Cairo', city: 'Le Caire' })
    expect(t.inclusions).toEqual(['Quatre nuits avec petit-déjeuner', '2 bottles of water a day'])
    expect(t.accommodation[0]).toEqual({ kind: 'hotel', name: 'Sandbox Lotus Inn Cairo', city: 'Le Caire' })
    expect(t.price).toEqual({ ...FACTS.price, from: { ...FACTS.price.from!, tierLabel: 'Économique' } })
    expect({ ...t, days: FACTS.days, inclusions: FACTS.inclusions, accommodation: FACTS.accommodation, price: FACTS.price, mainAttractions: FACTS.mainAttractions, highlights: FACTS.highlights, exclusions: FACTS.exclusions }).toEqual(FACTS)
  })

  it('nothing approved: the facts are returned as they are', () => {
    expect(translateFacts(FACTS, {})).toBe(FACTS)
  })
})
