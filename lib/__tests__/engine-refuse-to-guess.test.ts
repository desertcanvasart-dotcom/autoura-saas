// The engine's refuse-to-guess rule at the lookup level: with several rows in
// one city + tier it takes the single preferred one or returns an
// `ambiguous` hole — never `limit(1)`'s arbitrary first row. And the
// itinerary's pin (rate_id) wins over all of that.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getHotelRates, getCruiseRates, getMealRates, getGuideRate, calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const SCOPE = { tenantId: 'test-tenant' }

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const hotel = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, property_name: name, city: 'Cairo', tier: 'standard', is_active: true,
  ppd_eur: 100, single_supplement_eur: 30, triple_reduction_eur: 10, ...extra,
})

describe('getHotelRates', () => {
  it('one hotel in the city + tier → priced (db)', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'Only One')] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard')
    expect(r?.source).toBe('db')
    expect(r?.hotelId).toBe('h1')
  })
  it('several, none preferred → ambiguous hole, no price', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'A'), hotel('h2', 'B'), hotel('h3', 'C')] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard')
    expect(r?.source).toBe('missing')
    expect(r?.ambiguous).toEqual({ count: 3, names: ['A', 'B', 'C'], preferredCount: 0 })
    expect(r?.ppdNight).toBe(0)
  })
  it('several, exactly one preferred → that one', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'A'), hotel('h2', 'B', { is_preferred: true }), hotel('h3', 'C')] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard')
    expect(r?.source).toBe('db')
    expect(r?.hotelName).toBe('B')
  })
  it('several, two preferred → ambiguous again', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'A', { is_preferred: true }), hotel('h2', 'B', { is_preferred: true })] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard')
    expect(r?.ambiguous?.preferredCount).toBe(2)
  })
  it('an exact-city match is preferred over a substring city match before the rule runs', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'Downtown'), hotel('h2', 'Suburb', { city: 'New Cairo' })] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard')
    expect(r?.source).toBe('db')
    expect(r?.hotelName).toBe('Downtown')
  })
  it('the pin wins: rateId prices that row even among many, and ignores tier/city', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'A'), hotel('h2', 'B', { tier: 'luxury', ppd_eur: 300 }), hotel('h3', 'C')] })
    const r = await getHotelRates(SCOPE, 'Cairo', 'standard', undefined, { rateId: 'h2' })
    expect(r?.source).toBe('db')
    expect(r?.hotelName).toBe('B')
    expect(r?.ppdNight).toBe(300)
  })
  it('a pin to a missing/inactive row is null (re-pick hole), never a fallback', async () => {
    setMockTables({ accommodation_rates: [hotel('h1', 'A'), hotel('h2', 'B', { is_active: false })] })
    expect(await getHotelRates(SCOPE, 'Cairo', 'standard', undefined, { rateId: 'h2' })).toBeNull()
    expect(await getHotelRates(SCOPE, 'Cairo', 'standard', undefined, { rateId: 'nope' })).toBeNull()
  })
})

describe('getCruiseRates', () => {
  const ship = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, ship_name: name, tier: 'standard', is_active: true, embark_city: 'Luxor', duration_nights: 4,
    ppd_eur: 150, single_supplement_eur: 50, triple_reduction_eur: 0, ...extra,
  })
  it('several ships, none preferred → ambiguous', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra'), ship('c2', 'MS Isis')] })
    const r = await getCruiseRates(SCOPE, 'standard', 'Luxor')
    expect(r?.ambiguous).toEqual({ count: 2, names: ['MS Ra', 'MS Isis'], preferredCount: 0 })
  })
  it('the preferred ship is taken; the pin overrides even that', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra', { is_preferred: true }), ship('c2', 'MS Isis', { ppd_eur: 999 })] })
    expect((await getCruiseRates(SCOPE, 'standard', 'Luxor'))?.shipName).toBe('MS Ra')
    const pinned = await getCruiseRates(SCOPE, 'standard', 'Luxor', undefined, { rateId: 'c2' })
    expect(pinned?.shipName).toBe('MS Isis')
    expect(pinned?.cruiseId).toBe('c2')
    expect(pinned?.ppdNight).toBe(999)
  })
})

describe('getMealRates', () => {
  const meal = (id: string, type: string, restaurant: string, rate: number, extra: Record<string, unknown> = {}) => ({
    id, meal_type: type, restaurant_name: restaurant, tier: 'standard', is_active: true, base_rate_eur: rate, ...extra,
  })
  it('one restaurant per meal → priced', async () => {
    setMockTables({ meal_rates: [meal('m1', 'lunch', 'Felfela', 15), meal('m2', 'dinner', 'Naguib', 25)] })
    expect(await getMealRates(SCOPE, 'standard')).toEqual({ lunch: 15, dinner: 25, source: 'db' })
  })
  it('two dinner restaurants, none preferred → an ambiguous hole for dinner only', async () => {
    setMockTables({ meal_rates: [meal('m1', 'lunch', 'Felfela', 15), meal('m2', 'dinner', 'Naguib', 25), meal('m3', 'dinner', 'Abou El Sid', 30)] })
    const r = await getMealRates(SCOPE, 'standard')
    expect(r?.source).toBe('missing')
    expect(r?.ambiguous).toEqual({ dinner: { count: 2, names: ['Naguib', 'Abou El Sid'], preferredCount: 0 } })
  })
  it('the preferred restaurant resolves it', async () => {
    setMockTables({ meal_rates: [meal('m1', 'lunch', 'Felfela', 15), meal('m2', 'dinner', 'Naguib', 25), meal('m3', 'dinner', 'Abou El Sid', 30, { is_preferred: true })] })
    expect(await getMealRates(SCOPE, 'standard')).toEqual({ lunch: 15, dinner: 30, source: 'db' })
  })
})

describe('getGuideRate (roster fallback)', () => {
  const guide = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, name, tier: 'standard', is_active: true, languages: ['English'], daily_rate: 80, ...extra,
  })
  it('two guides in the tier, none preferred → ambiguous', async () => {
    setMockTables({ guide_rates: [], guides: [guide('g1', 'Ahmed'), guide('g2', 'Sara')] })
    const r = await getGuideRate(SCOPE, 'English', 'standard')
    expect(r?.source).toBe('missing')
    expect(r?.ambiguous?.names).toEqual(['Ahmed', 'Sara'])
  })
  it('the preferred guide is taken', async () => {
    setMockTables({ guide_rates: [], guides: [guide('g1', 'Ahmed'), guide('g2', 'Sara', { is_preferred: true })] })
    expect((await getGuideRate(SCOPE, 'English', 'standard'))?.name).toBe('Sara')
  })
})

describe('calculateDayBasedPricing surfaces the ambiguity as an operator-facing hole', () => {
  it('names the hotels and both ways to resolve it', async () => {
    const tables = fullRateTables()
    // Two standard Cairo hotels, neither preferred, on top of the fixture set.
    tables.accommodation_rates = [
      ...(tables.accommodation_rates as Array<Record<string, unknown>>).filter(h => h.city !== 'Cairo' || h.tier !== 'standard'),
      hotel('h1', 'A'), hotel('h2', 'B'),
    ]
    tables.tour_templates = [JSON.parse(JSON.stringify(cairoTemplateRow))]
    setMockTables(tables)
    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 25,
    })
    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'hotel')
    expect(hole?.message).toBe('2 standard hotels in Cairo (A, B) and none is marked preferred. Mark exactly one as preferred in Rates → Hotels, or pick one in the pricing grid.')
  })
})
