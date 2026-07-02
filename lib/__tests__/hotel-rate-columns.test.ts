import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTables } from './_mock-supabase'

// Mock supabase-js before importing the engine (vitest hoists vi.mock).
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { getHotelRates } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

// Regression guard for the schema split-brain (migration 220): the pricing
// engine reads the `ppd_eur` column family, while the bulk importer writes the
// `pp_double_eur` family. Migration 220 mirrors importer -> engine columns so
// imported hotels stop pricing at €0. These tests lock in WHICH column the
// engine reads, so a future change that breaks the mirror is caught.
describe('getHotelRates — accommodation column reconciliation', () => {
  beforeEach(() => setMockTables({}))

  it('prices a hotel that has the engine ppd_eur column populated', async () => {
    setMockTables({
      accommodation_rates: [{
        id: 'h1', property_name: 'Nile View', city: 'Cairo', tier: 'standard',
        is_active: true, ppd_eur: 120, single_supplement_eur: 40, triple_reduction_eur: 20,
      }],
    })
    const r = await getHotelRates('Cairo', 'standard')
    expect(r?.source).toBe('db')
    expect(r?.ppdNight).toBe(120)
    expect(r?.singleSuppNight).toBe(40)
  })

  it('a bulk-imported row with only pp_double_eur (ppd_eur still 0) prices at 0 — the bug migration 220 backfills', async () => {
    setMockTables({
      accommodation_rates: [{
        id: 'h2', property_name: 'Legacy Import', city: 'Cairo', tier: 'standard',
        is_active: true, pp_double_eur: 150, ppd_eur: 0,
      }],
    })
    const r = await getHotelRates('Cairo', 'standard')
    // The engine ignores pp_double_eur, so without the migration's mirror the
    // rate is invisible (€0). After migration 220 runs, ppd_eur = 150 and this
    // same row prices correctly.
    expect(r?.ppdNight).toBe(0)
  })

  it('once ppd_eur is populated (as migration 220 does), the same hotel prices correctly', async () => {
    setMockTables({
      accommodation_rates: [{
        id: 'h2', property_name: 'Legacy Import', city: 'Cairo', tier: 'standard',
        is_active: true, pp_double_eur: 150, ppd_eur: 150,
      }],
    })
    const r = await getHotelRates('Cairo', 'standard')
    expect(r?.ppdNight).toBe(150)
  })
})
