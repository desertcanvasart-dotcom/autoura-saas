import { describe, it, expect } from 'vitest'
import { checkText, checkSegments, describeViolations, SUPPORTED_LANGUAGES } from '@/lib/publish/engine/fact-check'

// ============================================================================
// The post-check (docs/publish/PLAN.md §9; Phase 1 acceptance: "a draft
// containing a number, currency, date or policy statement outside a fact
// slot is rejected"). Adversarial on purpose: numbers spelled out, other
// scripts' digits, prices in parentheses, policy hidden in a friendly phrase.
// Names from the records and glossary pass; claims are flagged, not refused.
// ============================================================================

// The € signs below are deliberate: they are prices a draft might contain,
// which the post-check must refuse (counted in scripts/euro-literal-baseline.json).
const rules = (text: string, language = 'en', allowedTerms: string[] = []) =>
  checkText(text, { language, allowedTerms }).violations.map(v => v.rule)

describe('rejected in English', () => {
  const cases: Array<[string, string]> = [
    ['Explore Luxor in 3 days.', 'digit'],
    ['A journey of five unforgettable days.', 'number_word'],
    ['Visit the tomb of Ramses II.', 'roman_numeral'],
    ['All this for just (€499).', 'currency'],
    ['Only 499 EUR per traveller.', 'digit'],
    ['From EUR four hundred.', 'currency'],
    ['Priced in dollars for your comfort.', 'currency'],
    ['Departures every Monday and Friday.', 'date'],
    ['The cruise sails daily from Aswan.', 'date'],
    ['Best enjoyed in December.', 'date'],
    ['Breakfast and dinner are included.', 'policy'],
    ['Free cancellation up to the last minute.', 'policy'],
    ['A small deposit secures your place.', 'policy'],
    ['Fully refundable if plans change.', 'policy'],
    ['Our guaranteed departures never let you down.', 'policy'],
    ['The second day brings Karnak.', 'number_word'],
    ['Twice the temples, half the crowds.', 'number_word'],
    ['Opening at ٩ in the morning.', 'digit'],
    ['A price that is hard to beat.', 'policy'],
    ['The 18th Dynasty comes alive.', 'digit'],
  ]
  for (const [text, rule] of cases) {
    it(`"${text}" → ${rule}`, () => { expect(rules(text)).toContain(rule) })
  }
})

describe('passes in English', () => {
  const clean = [
    'Wake to the Nile at first light and cross to the West Bank.',
    'Freedom to wander the souk at your own pace.',
    'A taxi ride through Cairo\'s old streets.',
    'Feeling the hush of the Valley of the Kings.',
    'Including Karnak and Luxor Temple, the great sanctuaries of Thebes.',
    'May the desert light stay with you.',
    'I could stay in Aswan forever.',
  ]
  for (const text of clean) {
    it(`"${text}"`, () => { expect(checkText(text, { language: 'en' }).violations).toEqual([]) })
  }
})

describe('names from the records and glossary are never a violation', () => {
  it('a sight, a ship and an agency whose names hold digits or numerals pass', () => {
    const text = 'Descend into KV62, then board the MS Nile 1886 with Travel2Egypt, past the colossi of Ramses II.'
    expect(rules(text, 'en', ['KV62', 'MS Nile 1886', 'Travel2Egypt', 'Ramses II'])).toEqual([])
  })
  it('masking is exact: a number next to a name still fails', () => {
    expect(rules('KV62 and 3 more tombs.', 'en', ['KV62'])).toEqual(['digit'])
  })
})

describe('French', () => {
  it('rejects numbers, prices, dates and policy', () => {
    expect(rules('Un voyage de cinq jours.', 'fr')).toContain('number_word')
    expect(rules('Départ chaque lundi.', 'fr')).toContain('date')
    expect(rules('Le petit-déjeuner est inclus.', 'fr')).toContain('policy')
    expect(rules('Annulation gratuite.', 'fr')).toEqual(expect.arrayContaining(['policy']))
    expect(rules('Seulement quatre cents euros.', 'fr')).toEqual(expect.arrayContaining(['number_word', 'currency']))
    expect(rules('Le prix est imbattable.', 'fr')).toContain('policy')
    expect(rules('La deuxième journée mène à Karnak.', 'fr')).toContain('number_word')
  })
  it('passes ordinary prose, articles included', () => {
    expect(checkText('Un lever de soleil sur le Nil, une felouque et le silence du désert.', { language: 'fr' }).violations).toEqual([])
  })
})

describe('Spanish', () => {
  it('rejects numbers, prices, dates and policy', () => {
    expect(rules('Un viaje de cinco días.', 'es')).toContain('number_word')
    expect(rules('Salidas todos los días.', 'es')).toContain('date')
    expect(rules('El desayuno está incluido.', 'es')).toContain('policy')
    expect(rules('Cancelación gratuita.', 'es')).toEqual(expect.arrayContaining(['policy']))
    expect(rules('Por solo trescientos dólares.', 'es')).toEqual(expect.arrayContaining(['currency']))
    expect(rules('Veintidós templos.', 'es')).toContain('number_word')
  })
  it('passes ordinary prose', () => {
    expect(checkText('Un amanecer sobre el Nilo y el silencio del desierto blanco.', { language: 'es' }).violations).toEqual([])
  })
})

describe('claims are flagged for the reviewer, not refused — unless on the claim list', () => {
  it('flags superlatives and credentials', () => {
    const r = checkText('The best Egyptologists in Cairo, licensed since the start.', { language: 'en' })
    expect(r.ok).toBe(true)
    expect(r.flags.map(f => f.match.toLowerCase())).toEqual(expect.arrayContaining(['best', 'egyptologists', 'licensed', 'since']))
  })
  it('a claim the brand allows is not flagged', () => {
    const r = checkText('Travel with Egyptologist guides.', { language: 'en', allowedClaims: ['Egyptologist guides'] })
    expect(r.flags).toEqual([])
  })
})

describe('drafts', () => {
  it('slots are facts and pass; violations name their segment', () => {
    const r = checkSegments([
      { type: 'text', text: 'Sail from Aswan to Luxor' },
      { type: 'slot', slot: 'price_from' },
      { type: 'text', text: 'in four days.' },
    ], { language: 'en' })
    expect(r.ok).toBe(false)
    expect(r.violations).toEqual([{ rule: 'number_word', match: 'four', segment: 2 }])
  })
  it('the retry instruction names each offending word', () => {
    expect(describeViolations([{ rule: 'digit', match: '3' }, { rule: 'policy', match: 'included' }]))
      .toBe('"3" is a number; "included" is a price, policy or promise word')
  })
  it('a language without a word list cannot be checked — so it cannot be published', () => {
    expect(() => checkText('x', { language: 'de' })).toThrow(/no post-check word list for language "de"/)
    expect(Object.keys(SUPPORTED_LANGUAGES).sort()).toEqual(['en', 'es', 'fr'])
  })
})
