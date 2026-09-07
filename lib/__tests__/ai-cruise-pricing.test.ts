// The AI path priced every cruise at 0. `lib/ai/cruise-pricing.ts` read
// `rate_per_person_eur` / `double_cabin_rate_eur` — columns that do not exist
// on nile_cruises — and `|| 0` turned the absence into a free cruise reported
// as found. These pin the real columns, the seasonal and legacy models, the
// contract currency, and the refusal to guess.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getCruiseRate } from '@/lib/ai/cruise-pricing'

const TENANT = 'test-tenant'
const ask = (over: Record<string, unknown> = {}) =>
  getCruiseRate({ tenantId: TENANT, tier: 'standard', ...over } as never)

const ship = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, ship_name: name, tier: 'standard', is_active: true, cabin_type: 'Deluxe Cabin',
  duration_nights: 4, supplier_id: `sup-${id}`, ppd_eur: 120,
  single_supplement_eur: 40, triple_reduction_eur: 0, ...extra,
})

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

describe('the dead-column bug', () => {
  it('prices from ppd_eur — the column that actually exists', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra')] })
    const r = await ask()
    expect(r.found).toBe(true)
    expect(r.perPersonPerNight).toBe(120)
    expect(r.shipName).toBe('MS Ra')
    expect(r.cabinType).toBe('Deluxe Cabin')
  })

  it('a row carrying ONLY the old imaginary columns is a MISS, never a free cruise', async () => {
    setMockTables({
      nile_cruises: [ship('c1', 'MS Ghost', {
        ppd_eur: null, rate_double_eur: null,
        // The columns the old code read. They do not exist on the table; a
        // row that somehow carried them must still not be priced from them.
        rate_per_person_eur: 150, double_cabin_rate_eur: 300,
      })],
    })
    const r = await ask()
    expect(r.found).toBe(false)
    expect(r.perPersonPerNight).toBe(0)
    expect(r.reason).toBeTruthy()
  })

  it('the legacy whole-trip rate is divided by the nights, not read as a nightly rate', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Legacy', { ppd_eur: null, rate_double_eur: 480, duration_nights: 4 })] })
    expect((await ask()).perPersonPerNight).toBe(120)
  })

  it('seasonal rates follow the travel date', async () => {
    setMockTables({
      nile_cruises: [ship('c1', 'MS Season', {
        ppd_eur: 100, peak_season_ppd_eur: 180,
        high_season_start: '2026-10-01', high_season_end: '2026-11-30',
        high_season_ppd_eur: 140,
      })],
    })
    expect((await ask({ travelDate: '2026-10-15' })).perPersonPerNight).toBe(140)
    expect((await ask({ travelDate: '2026-06-15' })).perPersonPerNight).toBe(100)
  })

  it('a rate in a contract currency is converted, not taken at face value', async () => {
    setMockTables({
      nile_cruises: [ship('c1', 'MS Cairo', { ppd_eur: 6000, rate_currency: 'EGP' })],
      exchange_rates: [{ base_currency: 'EGP', target_currency: 'EUR', rate: 0.02, is_active: true }],
    })
    const r = await ask()
    expect(r.found).toBe(true)
    expect(r.perPersonPerNight).toBe(120)
  })
})

describe('which ship', () => {
  it('prefers a recommended ship over the tier default', async () => {
    setMockTables({
      nile_cruises: [ship('c1', 'MS Ra', { is_preferred: true }), ship('c2', 'MS Isis', { ppd_eur: 200, tier: 'luxury' })],
    })
    const r = await ask({ recommendedSuppliers: ['MS Isis'] })
    expect(r.shipName).toBe('MS Isis')
    expect(r.perPersonPerNight).toBe(200)
  })

  it('falls back to the tier when no recommended ship is on file', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra')] })
    expect((await ask({ recommendedSuppliers: ['MS Unknown'] })).shipName).toBe('MS Ra')
  })

  it('carries the supplier, falling back to the cruise row when it names none', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra')] })
    expect((await ask()).supplierId).toBe('sup-c1')
    setMockTables({ nile_cruises: [ship('c2', 'MS Solo', { supplier_id: null })] })
    expect((await ask()).supplierId).toBe('c2')
  })
})

describe('refusing to guess', () => {
  it('several ships and none preferred → not found, with the reason naming them', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Ra'), ship('c2', 'MS Isis')] })
    const r = await ask()
    expect(r.found).toBe(false)
    expect(r.perPersonPerNight).toBe(0)
    expect(r.reason).toMatch(/MS Ra, MS Isis/)
  })

  it('no cruise at all → not found, never a default price', async () => {
    setMockTables({ nile_cruises: [] })
    const r = await ask()
    expect(r.found).toBe(false)
    expect(r.perPersonPerNight).toBe(0)
    expect(r.reason).toMatch(/Rates → Cruises/)
  })

  it('a zero rate on file is a miss, not a free cruise', async () => {
    setMockTables({ nile_cruises: [ship('c1', 'MS Zero', { ppd_eur: 0, rate_double_eur: null })] })
    expect((await ask()).found).toBe(false)
  })
})

describe('no second implementation', () => {
  it('the module reads no rate columns of its own', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync(new URL('../ai/cruise-pricing.ts', import.meta.url), 'utf8')
    // Comments name the dead columns deliberately (they explain the bug);
    // only CODE must be free of them.
    const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')
    expect(code).not.toMatch(/rate_per_person_eur|double_cabin_rate_eur/)
    expect(code).not.toMatch(/\.from\(\s*['"`]nile_cruises/)
    expect(code).toMatch(/getCruiseRates/)
  })
})
