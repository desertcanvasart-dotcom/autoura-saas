import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from './fixtures/sample-templates'

// ============================================
// Guide grades + the throughout guide (B-item 1)
// ============================================
// The sibling's test list, replicated: spot + default grade price
// byte-identically to before; the per-day fee splits full-day vs
// Meet & Assist; the bed line and the unpriced-bed hole; the meet/assist
// hole; meals at ≤3 vs 4+ pax; senior pricing and the
// senior-hole-never-fallback rule; the +1 vehicle seat.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, getGuideRate } from '@/lib/auto-pricing-service'
import type { CatalogScope } from '@/lib/catalog-scope'

const BASE_PARAMS = {
  templateId: TEMPLATE_ID,
  tenantId: 'test-tenant',
  tier: 'standard' as const,
  isEurPassport: true,
  language: 'English',
  marginPercent: 25,
}

const SCOPE = { tenantId: 'test-tenant', useGlobalCatalog: true } as unknown as CatalogScope

const GUIDE_RATE_ROWS = [
  { id: 'gr-full', guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'full_day', full_day_rate: 70, is_active: true },
  { id: 'gr-meet', guide_language: 'English', guide_type: 'egyptologist', tour_duration: 'meet_greet', full_day_rate: 25, is_active: true },
  { id: 'gr-snr-full', guide_language: 'English', guide_type: 'senior', tour_duration: 'full_day', full_day_rate: 110, is_active: true },
  { id: 'gr-snr-meet', guide_language: 'English', guide_type: 'senior', tour_duration: 'meet_greet', full_day_rate: 40, is_active: true },
]

const HOTEL_SEASON = {
  name: 'Contract',
  from: '2026-01-01',
  to: '2026-12-31',
  rates: {
    ppd_eur: 55,
    single_supplement_eur: 30,
    triple_reduction_eur: 0,
    ppd_non_eur: 55,
    single_supplement_non_eur: 30,
    triple_reduction_non_eur: 0,
    guide_rate_eur: 18,
  },
}

function throughputTables(opts?: { guideBed?: boolean; meetRow?: boolean; guideRateRows?: boolean }) {
  const tables = fullRateTables()
  if (opts?.guideRateRows !== false) {
    tables.guide_rates = GUIDE_RATE_ROWS.filter(r => opts?.meetRow !== false || r.tour_duration !== 'meet_greet')
  }
  const season = JSON.parse(JSON.stringify(HOTEL_SEASON))
  if (opts?.guideBed === false) season.rates.guide_rate_eur = 0
  tables.accommodation_rates = tables.accommodation_rates.map((h: Record<string, unknown>) => ({
    ...h,
    seasons: [season],
  }))
  return tables
}

const guideLines = (r: Awaited<ReturnType<typeof calculateDayBasedPricing>>) =>
  r.services.filter(s => s.serviceType === 'guide')

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('getGuideRate — grades and durations', () => {
  it('the default ask keeps the historical roster fallback', async () => {
    setMockTables(fullRateTables()) // no guide_rates rows at all
    const r = await getGuideRate(SCOPE, 'English', 'standard')
    expect(r?.dailyRate).toBe(60) // the roster's Ahmed — exactly as before
    expect(r?.source).toBe('db')
  })

  it('a guide_rates row wins over the roster for the default ask', async () => {
    setMockTables(throughputTables())
    const r = await getGuideRate(SCOPE, 'English', 'standard')
    expect(r?.dailyRate).toBe(70)
    expect(r?.source).toBe('db')
  })

  it('a SENIOR ask without a row is a hole — never the egyptologist rate', async () => {
    setMockTables(fullRateTables())
    expect(await getGuideRate(SCOPE, 'English', 'standard', { grade: 'senior' })).toBeNull()
  })

  it('a meet_greet ask without a row is a hole — never the full-day rate', async () => {
    setMockTables(throughputTables({ meetRow: false }))
    expect(await getGuideRate(SCOPE, 'English', 'standard', { duration: 'meet_greet' })).toBeNull()
  })

  it('senior rows price the senior ask', async () => {
    setMockTables(throughputTables())
    const r = await getGuideRate(SCOPE, 'English', 'standard', { grade: 'senior' })
    expect(r?.dailyRate).toBe(110)
  })
})

describe('spot mode is byte-identical to the historical behaviour', () => {
  it('default grade + spot with no guide_rates rows matches the golden numbers', async () => {
    setMockTables(fullRateTables())
    const r = await calculateDayBasedPricing({ ...BASE_PARAMS, guideMode: 'spot' })
    const pax2 = r.paxPricing.find(p => p.numPax === 2)
    // The golden master's locked figures (auto-pricing-service.test.ts).
    expect(pax2?.withoutLeader.totalCost).toBe(462)
    expect(r.complete).toBe(true)
  })
})

describe('throughout mode', () => {
  const params = { ...BASE_PARAMS, guideMode: 'throughout' as const, travelDate: '2026-06-10', requestedPax: 2 }

  it('a fee EVERY day: full-day on sightseeing days, Meet & Assist on the rest', async () => {
    setMockTables(throughputTables())
    const r = await calculateDayBasedPricing(params)
    const fees = guideLines(r)
    // 3-day template: day 2 is the sightseeing day.
    expect(fees).toHaveLength(3)
    expect(fees.map(f => f.unitCost)).toEqual([25, 70, 25])
    expect(fees[0].serviceName).toContain('Meet & Assist')
    expect(fees[1].serviceName).toContain('Throughout Guide')
    expect(r.complete).toBe(true)
  })

  it('a bed each night from the period guide rate', async () => {
    setMockTables(throughputTables())
    const r = await calculateDayBasedPricing(params)
    const beds = r.services.filter(s => s.serviceName.includes('Throughout Guide — bed'))
    expect(beds).toHaveLength(2) // two hotel nights
    expect(beds.every(b => b.unitCost === 18)).toBe(true)
  })

  it('a blank guide bed is one hole per property — never a free bed', async () => {
    setMockTables(throughputTables({ guideBed: false }))
    const r = await calculateDayBasedPricing(params)
    expect(r.complete).toBe(false)
    const bedHoles = r.holes.filter(h => /Guide Bed/.test(h.message))
    expect(bedHoles).toHaveLength(1) // one per property, not per night
    expect(bedHoles[0].message).toContain('Cairo Grand Hotel')
  })

  it('a missing Meet & Assist rate is a hole NAMING the duration to add', async () => {
    setMockTables(throughputTables({ meetRow: false }))
    const r = await calculateDayBasedPricing(params)
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => /meet_greet/.test(h.message))).toBe(true)
  })

  it('meals at group rates when the party is ≤ 3; restaurants feed him free at 4+', async () => {
    setMockTables(throughputTables())
    const small = await calculateDayBasedPricing({ ...params, requestedPax: 3 })
    const smallMeals = small.services.filter(s => s.serviceName.includes('Throughout Guide — lunch'))
    expect(smallMeals).toHaveLength(1) // day 2's external lunch

    setMockTables(throughputTables())
    const big = await calculateDayBasedPricing({ ...params, requestedPax: 4 })
    expect(big.services.some(s => s.serviceName.includes('Throughout Guide — lunch'))).toBe(false)
  })

  it('one extra seat in every vehicle sizing (+1), stacking with the tour leader', async () => {
    setMockTables(throughputTables())
    const spot = await calculateDayBasedPricing({ ...BASE_PARAMS, guideMode: 'spot', travelDate: '2026-06-10' })
    setMockTables(throughputTables())
    const thru = await calculateDayBasedPricing(params)

    const at = (r: typeof spot, pax: number) => r.paxPricing.find(p => p.numPax === pax)!.withoutLeader.totalCost
    // perPerson from two same-vehicle spot rows (pax 3→4, both Minivan).
    const perPerson = at(spot, 4) - at(spot, 3)
    // At pax 3 (+1 = 4, same Minivan) the delta over spot is EXACTLY the
    // guide's fixed extras (fees + beds + meals).
    const guideExtras = at(thru, 3) - at(spot, 3)
    // At pax 2 the +1 crosses Sedan → Minivan, so the delta additionally
    // carries the transport step spot itself shows between pax 2 and 3.
    const transportStep = at(spot, 3) - at(spot, 2) - perPerson
    expect(at(thru, 2) - at(spot, 2)).toBeCloseTo(guideExtras + transportStep, 2)
    expect(transportStep).toBeGreaterThan(0) // the boundary is real

    // Tour leader stacks: the withLeader row sizes at pax+2. At pax 2 the
    // leader row must cost MORE under throughout than under spot by at
    // least the guide extras (it also carries the same vehicle sizing).
    const leaderDelta =
      thru.paxPricing.find(p => p.numPax === 2)!.withLeader.totalCost -
      spot.paxPricing.find(p => p.numPax === 2)!.withLeader.totalCost
    expect(leaderDelta).toBeGreaterThanOrEqual(guideExtras - 0.01)
  })

  it('a senior throughout guide prices from the senior rows', async () => {
    setMockTables(throughputTables())
    const r = await calculateDayBasedPricing({ ...params, guideGrade: 'senior' })
    const fees = guideLines(r)
    expect(fees.map(f => f.unitCost)).toEqual([40, 110, 40])
    expect(r.complete).toBe(true)
  })
})
