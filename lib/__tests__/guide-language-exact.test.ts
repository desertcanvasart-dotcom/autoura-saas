// The guide rate is matched EXACTLY, per city (sibling #459). It was an
// `ilike` substring match (where `_` is a wildcard) that took the cheapest of
// whatever matched — and every live agency prices its guides PER CITY, which
// the engine ignored.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getGuideRate, calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { guideLanguageKey, pickGuideRateRow, languagesWithRates } from '@/lib/guides/guide-language'

const VOCAB = [{ key: 'english', label: 'English' }, { key: 'french', label: 'French' }, { key: 'spanish', label: 'Spanish' }]

describe('the language', () => {
  it('a key, a label, or a spelling of either all mean the same key', () => {
    for (const v of ['english', 'English', 'ENGLISH', ' english ']) expect(guideLanguageKey(v, VOCAB)).toBe('english')
  })
  it('never a substring: "span" is not Spanish, and an unlisted word is its own key', () => {
    expect(guideLanguageKey('span', VOCAB)).toBe('span')
    expect(guideLanguageKey('Portuguese', VOCAB)).toBe('portuguese')
    expect(guideLanguageKey('', VOCAB)).toBe('')
  })
})

describe('the row for a day', () => {
  const rows = [
    { id: 'cai', city: 'Cairo', base_rate_eur: 2000 }, { id: 'cai2', city: 'Cairo', base_rate_eur: 2000 },
    { id: 'lux', city: 'Luxor', base_rate_eur: 2400 }, { id: 'any', city: null, base_rate_eur: 1800 },
    { id: 'blank', city: 'Aswan', base_rate_eur: 0 },
  ]
  it('the day’s own city; with none, the all-cities row', () => {
    expect(pickGuideRateRow(rows, 'luxor')).toMatchObject({ kind: 'one', rate: 2400, cityMatched: true })
    expect(pickGuideRateRow(rows, 'Hurghada')).toMatchObject({ kind: 'one', rate: 1800, cityMatched: false })
    expect(pickGuideRateRow(rows, 'Aswan')).toMatchObject({ kind: 'one', rate: 1800 }) // Aswan's row has no price
  })
  it('two rows for the same place at the SAME price are one rate; at different prices, a gap — never the cheapest', () => {
    expect(pickGuideRateRow(rows, 'Cairo')).toMatchObject({ kind: 'one', rate: 2000 })
    expect(pickGuideRateRow([...rows, { id: 'cai3', city: 'Cairo', base_rate_eur: 2500 }], 'Cairo')).toEqual({ kind: 'ambiguous', count: 3, rates: [2000, 2500], where: 'in Cairo' })
  })
  it('a Giza day takes Cairo’s guide, as it takes Cairo’s station', () => {
    expect(pickGuideRateRow(rows, 'Giza')).toMatchObject({ kind: 'one', rate: 2000, cityMatched: true })
  })
  it('nothing priced anywhere: none', () => {
    expect(pickGuideRateRow([{ id: 'x', city: null, base_rate_eur: null }], 'Cairo')).toEqual({ kind: 'none' })
  })
  it('which languages have a rate, for the picker', () => {
    expect(languagesWithRates(VOCAB, [{ id: 'a', guide_language: 'English', base_rate_eur: 50 }, { id: 'b', guide_language: 'french', base_rate_eur: 0 }]))
      .toEqual([{ key: 'english', label: 'English', hasRate: true }, { key: 'french', label: 'French', hasRate: false }, { key: 'spanish', label: 'Spanish', hasRate: false }])
  })
})

describe('the engine', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const SCOPE = { tenantId: 'test-tenant' }
  const gr = (over: Record<string, unknown>) => ({ id: 'g', guide_language: 'english', guide_type: 'egyptologist', tour_duration: 'full_day', city: null, full_day_rate: null, base_rate_eur: 60, is_active: true, ...over })

  it('prices the day’s city’s row, and says so', async () => {
    setMockTables({ guide_rates: [gr({ id: 'cai', city: 'Cairo', base_rate_eur: 60 }), gr({ id: 'lux', city: 'Luxor', base_rate_eur: 75 })] })
    expect(await getGuideRate(SCOPE, 'English', 'standard' as never, { city: 'Luxor' })).toMatchObject({ source: 'db', dailyRate: 75, cityMatched: true })
    expect(await getGuideRate(SCOPE, 'English', 'standard' as never, { city: 'Aswan' })).toBeNull()
  })
  it('a row stored as the WORD still matches the key; a substring never does', async () => {
    setMockTables({ guide_rates: [gr({ guide_language: 'English' }), gr({ id: 's', guide_language: 'spanish', base_rate_eur: 70 })] })
    expect((await getGuideRate(SCOPE, 'english', 'standard' as never))?.dailyRate).toBe(60)
    expect(await getGuideRate(SCOPE, 'span', 'standard' as never)).toBeNull()
  })
  it('no guide of that language is a MISS — not a guide of another language marked approximate', async () => {
    setMockTables({ guide_rates: [gr({ guide_language: 'french' })], guides: [{ id: 'q', name: 'Ahmed', daily_rate: 60, languages: ['Arabic'], tier: 'standard', is_active: true }] })
    expect(await getGuideRate(SCOPE, 'English', 'standard' as never)).toBeNull()
  })
  it('two prices for the same place: a gap that names them', async () => {
    setMockTables({ guide_rates: [gr({ id: 'a', city: 'Cairo', base_rate_eur: 60 }), gr({ id: 'b', city: 'Cairo', base_rate_eur: 80 })] })
    const r = await getGuideRate(SCOPE, 'English', 'standard' as never, { city: 'Cairo' })
    expect(r).toMatchObject({ source: 'missing', ambiguous: { count: 2, names: ['60', '80'] } })
  })
  it('a tour: each sightseeing day at ITS city’s guide rate', async () => {
    const t = fullRateTables()
    t.guide_rates = [gr({ id: 'cai', city: 'Cairo', base_rate_eur: 60 }), gr({ id: 'lux', city: 'Luxor', base_rate_eur: 75 })]
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: [
      { day: 1, title: 'Cairo', city: 'Cairo', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, accommodation_type: 'hotel', attractions: ['Giza Plateau'], services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true } },
      { day: 2, title: 'Luxor', city: 'Luxor', meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, accommodation_type: 'none', attractions: ['Karnak Temple'], transport_type: 'flight', services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true } },
    ] }]
    setMockTables(t)
    const r = await calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
    expect(r.services.filter(s => s.serviceType === 'guide').map(s => `d${s.dayNumber} ${s.unitCost}`)).toEqual(['d1 60', 'd2 75'])
  })
  it('the substring match, the cheapest-row limit and the any-language fallback are gone', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    const fn = engine.slice(engine.indexOf('export async function getGuideRate'), engine.indexOf('// ============================================', engine.indexOf('export async function getGuideRate') + 100))
    expect(fn).not.toMatch(/\.ilike\('guide_language'/)
    expect(fn).not.toMatch(/order\('full_day_rate'/)
    expect(fn).not.toMatch(/any guide regardless of language/)
  })
})

describe('the calculator', () => {
  it('asks the language from the agency’s list, a language with no rate shown but not choosable, and sends it', () => {
    const page = readFileSync(join(process.cwd(), 'app/b2b/calculator/[id]/page.tsx'), 'utf8')
    expect(page).toContain("fetch('/api/rates/guides/languages')")
    expect(page).toMatch(/disabled=\{!l\.hasRate\}/)
    expect(page).toMatch(/list\.find\(l => l\.hasRate\)\?\.key/)
    expect((page.match(/^\s+language,$/gm) ?? []).length).toBe(2)
    expect(readFileSync(join(process.cwd(), 'app/api/rates/guides/languages/route.ts'), 'utf8')).toContain('languagesWithRates(')
  })
})
