// A cruise's length is what it says — never an assumed four nights.
//
// `nile_cruises.duration_nights` is a JSON LIST of the lengths a ship sails
// (the form is a multi-select), and the length is what turns a price entered
// PER TRIP into a price per night. It was `|| 4` in five places, the column
// itself DEFAULTed to '[4]', the save route wrote [4] when none was sent, and
// one reader saw the list as "not a number" — so a 7-night ship was divided by
// 4 on import and export.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getCruiseRates, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { cruiseNightsStated, cruiseLengthsToStore, cruisePpdNightEur, cruisePpdNightNonEur } from '@/lib/rates/cruise-ppd'
import { applyCanonicalAliases } from '@/lib/bulk-rate-service'

describe('how many nights — when the ship says', () => {
  it.each([
    [4, 4], ['7', 7], [[7], 7], [['3'], 3], [3.9, 3],
  ])('%j → %i', (value, nights) => expect(cruiseNightsStated(value)).toBe(nights))

  it.each([
    [null], [undefined], [''], [0], [-2], ['abc'], [[]], [[0]], [{}],
    [[3, 4, 7]], // several lengths: a per-trip price cannot say which trip it is the price of
  ])('%j → not stated', (value) => expect(cruiseNightsStated(value)).toBeNull())
})

describe('the rate readers', () => {
  it('a per-trip price with a stated length is that price per night — a SEVEN-night list is divided by 7, not 4', () => {
    expect(cruisePpdNightEur({ rate_double_eur: 700, duration_nights: [7] })).toBe(100)
    expect(cruisePpdNightNonEur({ rate_double_non_eur: 1400, duration_nights: 7 })).toBe(200)
  })
  it('a per-trip price with NO stated length is unpriced — not a quarter of it', () => {
    expect(cruisePpdNightEur({ rate_double_eur: 700 })).toBe(0)
    expect(cruisePpdNightEur({ rate_double_eur: 700, duration_nights: [3, 4, 7] })).toBe(0)
  })
  it('a per-NIGHT price never needed the length', () => {
    expect(cruisePpdNightEur({ ppd_eur: 120 })).toBe(120)
    expect(cruisePpdNightEur({ ppd_eur: 120, duration_nights: [3, 4, 7] })).toBe(120)
  })
})

describe('the bulk import', () => {
  it('derives the nightly price from the trip price and the stated nights', () => {
    const record: Record<string, unknown> = { duration_nights: 7, rate_low_double_eur: 700, rate_low_single_eur: 910 }
    applyCanonicalAliases('nile_cruises', record)
    expect(record.ppd_eur).toBe(100)
    expect(record.single_supplement_eur).toBe(30)
  })
  it('derives NOTHING when the sheet gives no length — the row is left without a nightly price', () => {
    const record: Record<string, unknown> = { rate_low_double_eur: 700 }
    applyCanonicalAliases('nile_cruises', record)
    expect(record.ppd_eur).toBeUndefined()
  })
})

describe('the tour engine', () => {
  const SCOPE = { tenantId: 'test-tenant' }
  const ship = (over: Record<string, unknown>) => ({ id: 'c1', ship_name: 'MS Nile Star', tier: 'luxury', embark_city: 'Luxor', is_active: true, seasons: null, ppd_eur: null, ...over })
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const ask = () => getCruiseRates(SCOPE, 'luxury' as never, 'Luxor', '2026-11-10')

  it('priced per trip, no length → a gap that names the ship; never trip ÷ 4', async () => {
    setMockTables({ nile_cruises: [ship({ rate_double_eur: 800, duration_nights: null })] })
    const r = await ask()
    expect(r?.source).toBe('missing')
    expect(r?.noDuration).toEqual({ propertyName: 'MS Nile Star' })
    expect(r?.ppdNight).toBe(0)
  })
  it('priced per trip, SEVERAL lengths → the same gap', async () => {
    setMockTables({ nile_cruises: [ship({ rate_double_eur: 800, duration_nights: [3, 4, 7] })] })
    expect((await ask())?.noDuration).toEqual({ propertyName: 'MS Nile Star' })
  })
  it('priced per trip, ONE length → that price per night', async () => {
    setMockTables({ nile_cruises: [ship({ rate_double_eur: 800, duration_nights: [4] })] })
    expect(await ask()).toMatchObject({ source: 'db', ppdNight: 200, durationNights: 4 })
  })
  it('priced per NIGHT: the length is not needed, so no length is not a gap', async () => {
    setMockTables({ nile_cruises: [ship({ ppd_eur: 150, duration_nights: null })] })
    const r = await ask()
    expect(r).toMatchObject({ source: 'db', ppdNight: 150 })
    expect(r?.noDuration).toBeUndefined()
  })
})

describe('what gets stored', () => {
  it('the lengths that were sent, as a tidy list', () => {
    expect(cruiseLengthsToStore([7, 3, '4', 3])).toEqual([3, 4, 7])
    expect(cruiseLengthsToStore(4)).toEqual([4])
  })
  it('nothing sent → undefined, so nothing is invented', () => {
    for (const v of [undefined, null, '', [], [0], ['x']]) expect(cruiseLengthsToStore(v)).toBeUndefined()
  })
})

describe('it cannot come back', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  it.each([
    'lib/auto-pricing-service.ts', 'lib/rates/cruise-ppd.ts', 'lib/bulk-rate-service.ts',
    'app/api/rates/cruises/route.ts', 'app/api/rates/cruises/[id]/route.ts',
  ])('%s assumes no length', (file) => {
    const code = read(file)
    expect(code).not.toMatch(/duration_nights[^\n]*\|\|\s*\[?4\]?/)
    expect(code).not.toMatch(/duration_nights[^\n]*\?\?\s*\[?4\]?/)
  })
  it('the form does not preselect four nights, and asks for a length', () => {
    const page = readFileSync(join(process.cwd(), 'app/rates/cruises/page.tsx'), 'utf8')
    expect(page).not.toMatch(/duration_nights:\s*\[4\]/)
    expect(page).toContain('Choose how many nights this cruise is (Duration).')
  })
  it('migration 378 drops the column default', () => {
    expect(readFileSync(join(process.cwd(), 'supabase/migrations/378_cruise_length_has_no_default.sql'), 'utf8'))
      .toMatch(/ALTER COLUMN duration_nights DROP DEFAULT/)
  })
})
