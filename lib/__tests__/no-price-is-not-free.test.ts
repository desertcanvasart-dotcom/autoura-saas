// No price is not a price of zero.
//
// A hotel (or a ship) entered with its name, city and tier and NOTHING in any
// price column came out of the lookup as an EXACT match at 0: the night was
// priced at nothing and no gap was recorded. Found on production 2026-09-22 —
// Sillage Egypte, "The Nile & the Red Sea", luxury tier, day 3: Old Cataract,
// Aswan, free. The dated-period path has refused a blank rate since #431; the
// price-columns path never did.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getHotelRates, getCruiseRates, calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'

const SCOPE = { tenantId: 'test-tenant' }
const hotel = (over: Record<string, unknown>) => ({ id: 'h1', property_name: 'Old Cataract', city: 'Aswan', tier: 'luxury', is_active: true, seasons: null, ...over })
const ship = (over: Record<string, unknown>) => ({ id: 'c1', ship_name: 'MS Nile Star', tier: 'luxury', embark_city: 'Luxor', duration_nights: 4, is_active: true, seasons: null, ...over })

beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

describe('a hotel with no price', () => {
  it.each([
    ['every price column NULL', {}],
    ['a per-person rate of 0', { ppd_eur: 0 }],
    ['a room rate of 0 and no per-person rate', { ppd_eur: null, double_rate_eur: 0 }],
  ])('%s → a miss that names the hotel, never an exact match at 0', async (_label, cols) => {
    setMockTables({ accommodation_rates: [hotel(cols)] })
    const r = await getHotelRates(SCOPE, 'Aswan', 'luxury' as never, '2026-11-10')
    expect(r?.source).toBe('missing')
    expect(r?.noPrice).toEqual({ propertyName: 'Old Cataract' })
    expect(r?.ppdNight).toBe(0)
  })

  it('a wrong-TIER stand-in with no price stays what it was — "no hotel in this tier", not "that hotel has no price"', async () => {
    setMockTables({ accommodation_rates: [hotel({})] }) // luxury only
    const r = await getHotelRates(SCOPE, 'Aswan', 'budget' as never, '2026-11-10')
    expect(r?.source).toBe('fuzzy')
    expect(r?.noPrice).toBeUndefined()
  })

  it('a real price still prices — per person, or half the double room', async () => {
    setMockTables({ accommodation_rates: [hotel({ ppd_eur: 210 })] })
    expect(await getHotelRates(SCOPE, 'Aswan', 'luxury' as never, '2026-11-10')).toMatchObject({ source: 'db', ppdNight: 210 })
    setMockTables({ accommodation_rates: [hotel({ ppd_eur: null, double_rate_eur: 300 })] })
    const r = await getHotelRates(SCOPE, 'Aswan', 'luxury' as never, '2026-11-10')
    expect(r).toMatchObject({ source: 'db', ppdNight: 150 })
    expect(r?.noPrice).toBeUndefined()
  })
})

describe('a ship with no price', () => {
  it.each([
    ['every price column NULL (the legacy branch divided NULL by the nights)', {}],
    ['a per-person rate of 0', { ppd_eur: 0 }],
    ['a trip rate of 0', { rate_double_eur: 0 }],
  ])('%s → a miss that names the ship', async (_label, cols) => {
    setMockTables({ nile_cruises: [ship(cols)] })
    const r = await getCruiseRates(SCOPE, 'luxury' as never, 'Luxor', '2026-11-10')
    expect(r?.source).toBe('missing')
    expect(r?.noPrice).toEqual({ propertyName: 'MS Nile Star' })
  })

  it('a real price still prices, and its supplements are never negative or NaN', async () => {
    setMockTables({ nile_cruises: [ship({ ppd_eur: 120 })] })
    const r = await getCruiseRates(SCOPE, 'luxury' as never, 'Luxor', '2026-11-10')
    expect(r).toMatchObject({ source: 'db', ppdNight: 120, singleSuppNight: 0, tripleRedNight: 0 })
  })
})

describe('the tour engine says so instead of pricing the night at nothing', () => {
  it('the hotel is named in a gap, the tour is incomplete, and no hotel line is priced at 0 as if it were real', async () => {
    const tables = fullRateTables()
    const rows = (tables.accommodation_rates ?? []) as Array<Record<string, unknown>>
    // Blank every price column on every hotel — entered, never priced.
    tables.accommodation_rates = rows.map(h => ({
      ...h, seasons: null, ppd_eur: null, double_rate_eur: null, single_rate_eur: null,
      high_season_ppd_eur: null, peak_season_ppd_eur: null,
    }))
    setMockTables(tables)
    const r = await calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)

    const gap = r.holes.find(h => h.kind === 'hotel')
    expect(gap, 'a hotel gap is recorded').toBeDefined()
    expect(gap!.message).toMatch(/is on your hotel sheet with no price\. Enter its rate in Rates → Hotels\./)
    expect(r.complete).toBe(false)
    const hotelLines = r.services.filter(s => s.serviceType === 'accommodation')
    expect(hotelLines.every(l => /no rate/i.test(l.serviceName)), 'the only hotel lines are the ones that SAY there is no rate').toBe(true)
  })
})
