// A hotel or cruise rate IS its dated periods (migration 379, operator's
// decision 2026-09-22). On production every priced hotel and cruise was priced
// from its "Default rate" columns, for ANY travel date — the validity dates on
// the same row were ignored, so a contract valid to April 2027 priced a July
// 2027 departure and called it complete. The default became period 1, covering
// the row's own validity dates at the price it was charged.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getHotelRates, getCruiseRates, clearVocabularyMemo } from '@/lib/auto-pricing-service'

const SCOPE = { tenantId: 'test-tenant' }
const rates = (ppd: number, supp: number) => ({ ppd_eur: ppd, single_supplement_eur: supp, triple_reduction_eur: 0, ppd_non_eur: ppd, single_supplement_non_eur: supp, triple_reduction_non_eur: 0, guide_rate_eur: 0 })
// A live hotel BEFORE (room columns) and AFTER 379 (one period + the mirror).
const before = { id: 'h1', property_name: 'Basma Aswan', city: 'Aswan', tier: 'standard', is_active: true, seasons: null, ppd_eur: null, double_rate_eur: 210, single_rate_eur: 160, rate_valid_from: '2026-04-01', rate_valid_to: '2027-04-30' }
const after = { ...before, ppd_eur: 105, single_supplement_eur: 55, triple_reduction_eur: 0, seasons: [{ name: 'Contract rate', from: '2026-04-01', to: '2027-04-30', rates: rates(105, 55) }] }

beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

describe('a converted hotel rate', () => {
  it('INSIDE its window prices exactly as it did', async () => {
    setMockTables({ accommodation_rates: [before] })
    const was = await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10')
    setMockTables({ accommodation_rates: [after] })
    const is = await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2026-11-10')
    expect(was).toMatchObject({ source: 'db', ppdNight: 105, singleSuppNight: 55 })
    expect(is).toMatchObject({ source: 'db', ppdNight: 105, singleSuppNight: 55, tripleRedNight: 0 })
  })

  it('OUTSIDE it — the contract has run out — it was priced anyway; now it is a gap naming the date', async () => {
    setMockTables({ accommodation_rates: [before] })
    expect(await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2027-07-10')).toMatchObject({ source: 'db', ppdNight: 105 })
    setMockTables({ accommodation_rates: [after] })
    const is = await getHotelRates(SCOPE, 'Aswan', 'standard' as never, '2027-07-10')
    expect(is?.source).toBe('missing')
    expect(is?.periodGap).toEqual({ propertyName: 'Basma Aswan', date: '2027-07-10' })
  })

  it('with NO travel date (the tours list, the pricing grid) it is period 1, via the mirrored base columns', async () => {
    setMockTables({ accommodation_rates: [after] })
    expect(await getHotelRates(SCOPE, 'Aswan', 'standard' as never)).toMatchObject({ source: 'db', ppdNight: 105 })
  })
})

describe('a converted cruise rate', () => {
  const ship = { id: 'c1', ship_name: 'MS Nile Star', tier: 'standard', embark_city: 'Luxor', duration_nights: [4], is_active: true, ppd_eur: 120, single_supplement_eur: 40, triple_reduction_eur: 0 }
  const converted = { ...ship, seasons: [{ name: 'Contract rate', from: '2026-10-01', to: '2027-04-30', rates: rates(120, 40) }] }
  it('inside the window: the same; before it opens or after it closes: a gap', async () => {
    setMockTables({ nile_cruises: [converted] })
    expect(await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', '2026-12-01')).toMatchObject({ source: 'db', ppdNight: 120, singleSuppNight: 40 })
    expect((await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', '2026-09-25'))?.periodGap?.date).toBe('2026-09-25')
    expect((await getCruiseRates(SCOPE, 'standard' as never, 'Luxor', '2027-05-01'))?.periodGap?.date).toBe('2027-05-01')
  })
})

describe('the rate form', () => {
  const hotel = readFileSync(join(process.cwd(), 'app/rates/hotels/hotels-content.tsx'), 'utf8')
  const cruise = readFileSync(join(process.cwd(), 'app/rates/cruises/page.tsx'), 'utf8')
  const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
  it('no longer offers a "Default rate" — a fallback the engine refuses', () => {
    for (const src of [hotel, cruise]) {
      expect(code(src)).not.toMatch(/Default rate/)
      expect(code(src)).not.toMatch(/used only for travel dates no contract period above covers/)
    }
  })
  it('asks for at least one period before saving', () => {
    expect(hotel).toContain('Add at least one rate period — the dates this hotel rate covers, and its price.')
    expect(cruise).toContain('Add at least one rate period — the dates this cruise rate covers, and its price.')
  })
})

describe('the save routes', () => {
  it.each([
    'app/api/rates/hotels/route.ts', 'app/api/rates/hotels/[id]/route.ts',
    'app/api/rates/cruises/route.ts', 'app/api/rates/cruises/[id]/route.ts',
  ])('%s: the first period is mirrored onto the base columns LAST, so the form cannot overwrite it', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    const patch = src.lastIndexOf('...seasonsPatch,')
    expect(patch).toBeGreaterThan(-1)
    expect(src.indexOf('...seasonsPatch,')).toBe(patch) // once
    const tail = src.slice(patch + '...seasonsPatch,'.length).replace(/\s/g, '')
    expect(tail.startsWith('}'), 'nothing is spread or assigned after it').toBe(true)
  })
})

describe('migration 379', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/379_rates_are_dated_periods.sql'), 'utf8')
  it('touches only rows with no periods, a price, and both dates — and checks itself', () => {
    expect(sql).toMatch(/jsonb_array_length\(seasons\) = 0/)
    expect(sql).toMatch(/rate_valid_from IS NOT NULL AND rate_valid_to IS NOT NULL AND rate_valid_from <= rate_valid_to/)
    expect(sql).toMatch(/WHERE p\.ppd > 0/)
    expect(sql).toMatch(/RAISE EXCEPTION '379:/)
  })
})
