// The hotel or ship an itinerary NAMES wins over the tier (operator,
// 2026-09-22); with no name, the tier's own favoured hotel — as before.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { mentions, pickNamedProperty, phraseKey } from '@/lib/pricing/named-property'

describe('what counts as naming a property', () => {
  it('the full name, as a whole phrase — whatever the case, spacing, punctuation or accents', () => {
    expect(mentions('Overnight at the OLD   CATARACT, Aswan.', 'Old Cataract')).toBe(true)
    expect(mentions('Séjour au Mövenpick Aswan', 'Movenpick Aswan')).toBe(true)
    expect(phraseKey('Old Cataract, Aswan – Mandarin Oriental')).toBe('old cataract aswan mandarin oriental')
  })
  it('not part of a word, not part of the name, and never a name under four letters', () => {
    expect(mentions('A cataractous river', 'Cataract')).toBe(false)
    expect(mentions('Overnight at the Old Cataract', 'Old Cataract Aswan Mandarin Oriental')).toBe(false)
    expect(mentions('Nil by mouth', 'Nil')).toBe(false)
    expect(mentions('', 'Old Cataract')).toBe(false)
  })
})

describe('which row the name picks', () => {
  const rows = [
    { id: 'std', name: 'Cairo Grand Hotel', tier: 'standard' },
    { id: 'lux', name: 'Nile Palace', tier: 'luxury' },
    { id: 'fs1', name: 'Four Seasons Cairo', tier: 'luxury' },
    { id: 'fs2', name: 'Four Seasons Cairo at Nile Plaza', tier: 'luxury' },
  ]
  it('a named hotel wins WHATEVER its tier', () => {
    expect(pickNamedProperty(['Two nights at the Nile Palace'], rows, 'standard')).toEqual({ kind: 'one', rateId: 'lux', name: 'Nile Palace', tier: 'luxury', otherTier: true })
  })
  it('nothing named → none: the tier decides, as before', () => {
    expect(pickNamedProperty(['Arrival in Cairo', 'A comfortable hotel'], rows, 'standard')).toEqual({ kind: 'none' })
    expect(pickNamedProperty([], rows, 'standard')).toEqual({ kind: 'none' })
  })
  it('a name inside a longer name: the LONGER one is what was written', () => {
    expect(pickNamedProperty(['Stay at Four Seasons Cairo at Nile Plaza'], rows, 'standard')).toMatchObject({ kind: 'one', rateId: 'fs2' })
    expect(pickNamedProperty(['Stay at Four Seasons Cairo'], rows, 'standard')).toMatchObject({ kind: 'one', rateId: 'fs1' })
  })
  it('two different hotels named for the same nights is NOT a choice the engine makes', () => {
    expect(pickNamedProperty(['Nile Palace or Cairo Grand Hotel'], rows, 'standard')).toEqual({ kind: 'ambiguous', reason: 'several_properties', names: ['Cairo Grand Hotel', 'Nile Palace'] })
  })
  it('one property, several rate rows: the selected tier’s row, else its only row, else its starred row, else a gap', () => {
    const multi = [{ id: 'a', name: 'MS Mayfair', tier: 'standard' }, { id: 'b', name: 'MS Mayfair', tier: 'luxury' }]
    expect(pickNamedProperty(['Aboard MS Mayfair'], multi, 'luxury')).toMatchObject({ kind: 'one', rateId: 'b', otherTier: false })
    expect(pickNamedProperty(['Aboard MS Mayfair'], multi, 'budget')).toEqual({ kind: 'ambiguous', reason: 'several_rows', names: ['MS Mayfair'] })
    expect(pickNamedProperty(['Aboard MS Mayfair'], [...multi, { id: 'c', name: 'MS Mayfair', tier: 'deluxe', is_preferred: true }], 'budget')).toMatchObject({ kind: 'one', rateId: 'c', otherTier: true })
  })
})

describe('priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  const LUXURY = { id: 'h-cai-lux', property_name: 'Nile Palace', city: 'Cairo', tier: 'luxury', ppd_eur: 200, single_supplement_eur: 90, triple_reduction_eur: 0, is_active: true }
  const price = async (describeDay1: string, extraHotels: Array<Record<string, unknown>> = [LUXURY], day1: Record<string, unknown> = {}) => {
    const t = fullRateTables()
    t.accommodation_rates = [...(t.accommodation_rates as Array<Record<string, unknown>>), ...extraHotels]
    const days = (cairoTemplateRow.itinerary as Array<Record<string, unknown>>).map((d, i) => (i === 0 ? { ...d, description: describeDay1, ...day1 } : d))
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: days }]
    setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const hotelLines = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'accommodation').map(s => `${s.serviceName} @ ${s.unitCost}`)

  it('no hotel named → the STANDARD tier’s hotel, as before', async () => {
    const r = await price('Transfer to your hotel.')
    expect(hotelLines(r).every(l => /Cairo Grand Hotel/.test(l) && / @ 55$/.test(l))).toBe(true)
    expect(r.complete).toBe(true)
  })

  it('the programme says "Nile Palace" → the Nile Palace is priced, at ITS rate, on a STANDARD quote', async () => {
    const r = await price('Transfer to the Nile Palace for two nights.')
    expect(hotelLines(r).length).toBeGreaterThan(0)
    expect(hotelLines(r).every(l => /Nile Palace/.test(l) && / @ 200$/.test(l))).toBe(true)
    expect(r.complete).toBe(true)
  })

  it('a hotel PICKED on the day still beats a hotel named in its text', async () => {
    const r = await price('Transfer to the Nile Palace.', [LUXURY], { property_by_tier: { standard: 'h-cai-std' } })
    expect(hotelLines(r).every(l => /Cairo Grand Hotel/.test(l))).toBe(true)
  })

  it('two hotels named → a gap that names both; the tier’s hotel is NOT quietly used instead', async () => {
    const r = await price('Nile Palace or the Cairo Grand Hotel, subject to availability.')
    const gap = r.holes.find(h => h.kind === 'hotel')
    expect(gap?.message).toMatch(/names more than one hotel in Cairo: "Cairo Grand Hotel" and "Nile Palace"/)
    expect(r.complete).toBe(false)
    expect(hotelLines(r).some(l => / @ 55$/.test(l))).toBe(false)
  })

  it('a named hotel that is switched off is not on the sheet to be named — the tier decides', async () => {
    const r = await price('Transfer to the Nile Palace.', [{ ...LUXURY, is_active: false }])
    expect(hotelLines(r).every(l => /Cairo Grand Hotel/.test(l))).toBe(true)
  })

  it('a hotel in ANOTHER city with the same words in the text does not count', async () => {
    const r = await price('Tomorrow: Luxor, and the Nile Palace.', [{ ...LUXURY, city: 'Luxor' }])
    expect(hotelLines(r).every(l => /Cairo Grand Hotel/.test(l))).toBe(true)
  })
})
