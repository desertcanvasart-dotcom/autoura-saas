import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from './fixtures/sample-templates'

// ============================================
// A gap in a stored rate contract is a HOLE, not a fallback
// ============================================
// The last place the engine still fabricated: a hotel/cruise whose row HAS
// the operator's dated periods (`seasons`, mig 305), priced a night that no
// period covers from the base columns — and legacyColumnMirror fills those
// with the FIRST period's rate on every save. October wore the summer
// price, marked complete: true. Now a stored contract with an uncovered
// travel date yields one hole per property naming the date; only rows with
// NO stored periods keep the historical base-column path.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const BASE_PARAMS = {
  templateId: TEMPLATE_ID,
  tenantId: 'test-tenant',
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

const WINTER = {
  name: 'Winter contract',
  from: '2026-11-01',
  to: '2027-03-31',
  rates: {
    ppd_eur: 90,
    single_supplement_eur: 40,
    triple_reduction_eur: 0,
    ppd_non_eur: 100,
    single_supplement_non_eur: 45,
    triple_reduction_non_eur: 0,
  },
}

function tablesWithHotelSeasons() {
  const tables = fullRateTables()
  // The mirror writes the first period's rate onto the base columns — that
  // is exactly the number the old fallback would fabricate from.
  tables.accommodation_rates = tables.accommodation_rates.map((h: Record<string, unknown>) => ({
    ...h,
    ppd_eur: 90,
    single_supplement_eur: 40,
    seasons: [WINTER],
  }))
  return tables
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('stored rate periods vs travel date', () => {
  it('a night inside a period prices from that period', async () => {
    setMockTables(tablesWithHotelSeasons())
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS, travelDate: '2026-12-10' })
    expect(r.complete).toBe(true)
    expect(r.holes).toEqual([])
    // 2 hotel nights × the period's single supplement (40), not the base 30.
    expect(r.singleSupplement).toBe(80)
  })

  it('a night in a gap between periods is a HOLE naming the property and date — never the base columns', async () => {
    setMockTables(tablesWithHotelSeasons())
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS, travelDate: '2026-06-15' })
    expect(r.complete).toBe(false)
    const gapHoles = r.holes.filter(h => /none covers 2026-06-15/.test(h.message))
    expect(gapHoles.length).toBeGreaterThanOrEqual(1)
    expect(gapHoles[0].kind).toBe('hotel')
    expect(gapHoles[0].message).toContain('Cairo Grand Hotel')
    expect(gapHoles[0].message).toContain('Rates → Hotels')
  })

  it('a date-less calculation on a period row still prices from the mirrored base columns', async () => {
    setMockTables(tablesWithHotelSeasons())
    const r = await calculateDayBasedPricing(BASE_PARAMS)
    // No travel date: the grid/browse case. The mirror IS the first period,
    // so the base columns are honest here — not a gap.
    expect(r.complete).toBe(true)
    expect(r.singleSupplement).toBe(80)
  })

  it('a legacy row with no stored periods keeps the historical column path', async () => {
    setMockTables(fullRateTables())
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS, travelDate: '2026-06-15' })
    expect(r.complete).toBe(true)
    // Base single supplement 30 × 2 nights — unchanged behaviour.
    expect(r.singleSupplement).toBe(60)
  })
})
