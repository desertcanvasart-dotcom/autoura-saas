// A non-EU traveller pays the hotel's and the ship's non-EU rate.
//
// Hotels and Nile cruises keep a separate rate for non-EU passport holders
// (#224 kept dual entry there on purpose), and the engine was handed the
// traveller's passport — but read only the EU column for both, so every
// non-EU hotel and cruise rate an agency entered was silently ignored.
// Entrance fees, flights, trains and activities already honoured the passport,
// and so did the pricing grid (grid-hotel-rate.ts, cruise-ppd.ts).
//
// The rule (the grid's): non-EU figure when one is entered (> 0), otherwise
// the EU figure — each figure on its own. An EU traveller is unchanged.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getHotelRates, getCruiseRates, calculateAutoPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { passportRate } from '@/lib/rates/passport-rate'
import { sumForGroup } from '@/lib/pricing/line-for-group'

const SCOPE = { tenantId: 'test-tenant' }
const period = (eu: [number, number, number], non: [number, number, number]) => ({
  ppd_eur: eu[0], single_supplement_eur: eu[1], triple_reduction_eur: eu[2],
  ppd_non_eur: non[0], single_supplement_non_eur: non[1], triple_reduction_non_eur: non[2],
  guide_rate_eur: 0,
})

beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

describe('passportRate', () => {
  it('an EU traveller always pays the EU figure', () => {
    expect(passportRate(30, 27, true)).toBe(30)
    expect(passportRate(null, 27, true)).toBeNull()
  })
  it('a non-EU traveller pays the non-EU figure when one is entered', () => {
    expect(passportRate(30, 27, false)).toBe(27)
    expect(passportRate(30, '33', false)).toBe(33)
  })
  it('a blank non-EU figure (0 — the period convention — null, empty) falls back to the EU one, never to free', () => {
    expect(passportRate(30, 0, false)).toBe(30)
    expect(passportRate(30, null, false)).toBe(30)
    expect(passportRate(30, '', false)).toBe(30)
    expect(passportRate(null, undefined, false)).toBeNull()
  })
})

describe('a hotel with dated periods', () => {
  const hotel = {
    id: 'h1', property_name: 'Basma Aswan', city: 'Aswan', tier: 'standard', is_active: true,
    ppd_eur: 30, single_supplement_eur: 20, triple_reduction_eur: 5,
    seasons: [{ name: 'Winter', from: '2026-10-01', to: '2027-04-30', rates: period([30, 20, 5], [27, 0, 4]) }],
  }
  it('an EU traveller: the EU rate, as before', async () => {
    setMockTables({ accommodation_rates: [hotel] })
    expect(await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10', { isEurPassport: true }))
      .toMatchObject({ source: 'db', ppdNight: 30, singleSuppNight: 20, tripleRedNight: 5 })
  })
  it('a non-EU traveller: the non-EU rate; the blank non-EU supplement takes the EU one', async () => {
    setMockTables({ accommodation_rates: [hotel] })
    expect(await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10', { isEurPassport: false }))
      .toMatchObject({ source: 'db', ppdNight: 27, singleSuppNight: 20, tripleRedNight: 4 })
  })
  it('no passport given: the EU rate (every caller before this change)', async () => {
    setMockTables({ accommodation_rates: [hotel] })
    expect((await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10'))?.ppdNight).toBe(30)
  })
  it('a period whose EU rate is blank is still a hole for a non-EU traveller', async () => {
    setMockTables({ accommodation_rates: [{ ...hotel, seasons: [{ ...hotel.seasons[0], rates: period([0, 0, 0], [27, 0, 0]) }] }] })
    const r = await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10', { isEurPassport: false })
    expect(r?.source).toBe('missing')
    expect(r?.periodBlank?.periodName).toBe('Winter')
  })
})

describe('a hotel priced from its columns (no periods)', () => {
  const hotel = {
    id: 'h2', property_name: 'Old Columns', city: 'Cairo', tier: 'standard', is_active: true, seasons: null,
    ppd_eur: 50, ppd_non_eur: 58, single_supplement_eur: 25, single_supplement_non_eur: null, triple_reduction_eur: 0,
  }
  it('non-EU: the non-EU nightly rate, the EU supplement where no non-EU one is entered', async () => {
    setMockTables({ accommodation_rates: [hotel] })
    expect(await getHotelRates(SCOPE, 'Cairo', 'standard' as never, undefined, { isEurPassport: false }))
      .toMatchObject({ source: 'db', ppdNight: 58, singleSuppNight: 25 })
    expect((await getHotelRates(SCOPE, 'Cairo', 'standard' as never, undefined, { isEurPassport: true }))?.ppdNight).toBe(50)
  })
})

describe('a Nile cruise', () => {
  const ship = {
    id: 'c1', ship_name: 'MS Nile Star', tier: 'standard', embark_city: 'Luxor', duration_nights: [4], is_active: true,
    ppd_eur: 120, single_supplement_eur: 40, triple_reduction_eur: 0,
  }
  it('dated periods: EU pays the EU rate, non-EU the non-EU rate', async () => {
    setMockTables({ nile_cruises: [{ ...ship, seasons: [{ name: 'Winter', from: '2026-10-01', to: '2027-04-30', rates: period([120, 40, 0], [135, 45, 0]) }] }] })
    expect(await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', '2026-12-01', { isEurPassport: true }))
      .toMatchObject({ source: 'db', ppdNight: 120, singleSuppNight: 40 })
    expect(await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', '2026-12-01', { isEurPassport: false }))
      .toMatchObject({ source: 'db', ppdNight: 135, singleSuppNight: 45 })
  })
  it('columns only: the same rule; a ship with no non-EU rate prices non-EU at the EU rate', async () => {
    setMockTables({ nile_cruises: [{ ...ship, ppd_non_eur: 130 }] })
    expect((await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', undefined, { isEurPassport: false }))?.ppdNight).toBe(130)
    setMockTables({ nile_cruises: [ship] })
    expect((await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', undefined, { isEurPassport: false }))?.ppdNight).toBe(120)
  })
  it('a legacy whole-trip rate: the non-EU trip rate over the stated nights', async () => {
    const legacy = { ...ship, ppd_eur: null, single_supplement_eur: null, rate_double_eur: 400, rate_double_non_eur: 480, rate_single_eur: 600 }
    setMockTables({ nile_cruises: [legacy] })
    expect((await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', undefined, { isEurPassport: true }))?.ppdNight).toBe(100)
    const non = await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', undefined, { isEurPassport: false })
    expect(non?.ppdNight).toBe(120)
    expect(non?.singleSuppNight).toBe(30)   // (600 − 480) / 4 — no non-EU single entered, the EU one
  })
})

describe('the engine passes the traveller\'s passport to the hotel', () => {
  async function price(isEurPassport: boolean) {
    const tables = fullRateTables()
    tables.accommodation_rates = (tables.accommodation_rates as Array<Record<string, unknown>>)
      .map(h => ({ ...h, ppd_non_eur: 70, single_supplement_non_eur: 36 }))
    setMockTables(tables)
    return calculateAutoPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', numPax: 2,
      isEurPassport, language: 'English', marginPercent: 25, tourLeaderIncluded: false,
    } as never)
  }
  const hotelLines = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'accommodation' && !s.unpriced)

  it('two nights in Cairo: 55 a night for EU, 70 for non-EU; the single supplement too', async () => {
    const eu = await price(true)
    const non = await price(false)
    const nights = (r: typeof eu) => hotelLines(r).reduce((s, l) => s + l.lineTotal, 0)
    expect(nights(eu)).toBeCloseTo(55 * 2, 2)
    expect(nights(non)).toBeCloseTo(70 * 2, 2)
    expect(eu.singleSupplement).toBeCloseTo(30 * 2, 2)
    expect(non.singleSupplement).toBeCloseTo(36 * 2, 2)
  })

  it('the non-EU breakdown still adds up to its subtotal', async () => {
    const non = await price(false)
    expect(sumForGroup(non.services, 2)).toBeCloseTo(non.subtotalCost, 1)
  })
})
