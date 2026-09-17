// Every gap is listed where it happens.
//
// A hole used to live only in a separate list, which the operator had to match
// back to the programme by hand: "no standard hotel in Aswan" told them what,
// never which night. Each hole that stands for a service on a day is now also
// listed IN THAT DAY at 0, marked unpriced, with the reason on the line —
// and the totals are untouched.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const price = async (tables: Record<string, unknown[]>) => {
  setMockTables(tables as never)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

/** The fixture trip with every rate present. */
const complete = () => {
  const tables = fullRateTables()
  tables.tour_templates = [JSON.parse(JSON.stringify(cairoTemplateRow))]
  return tables
}

describe('when every rate resolves', () => {
  it('nothing is marked unpriced', async () => {
    const result = await price(complete())
    expect(result.complete).toBe(true)
    expect(result.services.filter(s => s.unpriced)).toEqual([])
  })

  it('the lines read day by day, in the order the day runs', async () => {
    const result = await price(complete())
    const days = result.services.map(s => s.dayNumber).filter(d => d > 0)
    expect(days, 'day numbers must not go backwards').toEqual([...days].sort((a, b) => a - b))
  })
})

describe('when the hotel has no rate', () => {
  const noHotels = () => {
    const tables = complete()
    tables.accommodation_rates = []
    return tables
  }

  it('the night is listed in its own day, at zero, with the reason', async () => {
    const result = await price(noHotels())
    const nights = result.services.filter(s => s.serviceType === 'accommodation' && s.unpriced)

    expect(nights.length).toBeGreaterThan(0)
    for (const night of nights) {
      expect(night.dayNumber).toBeGreaterThan(0)
      expect(night.lineTotal).toBe(0)
      expect(night.unitCost).toBe(0)
      expect(night.rateSource).toBe('none')
      expect(night.issue, 'the line carries the operator-facing reason').toBeTruthy()
      expect(night.serviceName).toContain('no rate')
    }
  })

  it('one line per night in the city, not one for the whole trip', async () => {
    const result = await price(noHotels())
    const nights = result.services.filter(s => s.serviceType === 'accommodation' && s.unpriced)
    // The fixture sleeps in Cairo on days 1 and 2 (day 3 is a departure).
    expect(nights.map(n => n.dayNumber).sort()).toEqual([1, 2])
  })

  it('adds nothing to the price', async () => {
    const withRates = await price(complete())
    const without = await price(noHotels())
    const unpricedTotal = without.services.filter(s => s.unpriced).reduce((n, s) => n + s.lineTotal, 0)

    expect(unpricedTotal).toBe(0)
    expect(without.complete).toBe(false)
    expect(without.paxPricing[0].withoutLeader.totalCost)
      .toBeLessThan(withRates.paxPricing[0].withoutLeader.totalCost)
  })

  it('still records the hole, so every existing gate keeps working', async () => {
    const result = await price(noHotels())
    expect(result.holes.some(h => h.kind === 'hotel')).toBe(true)
  })

  it('does not list the same gap twice', async () => {
    const result = await price(noHotels())
    const ids = result.services.filter(s => s.unpriced).map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('when a guide has no rate', () => {
  it('the guide is listed on the day that needed one', async () => {
    const tables = complete()
    tables.guide_rates = []
    tables.guides = []
    const result = await price(tables)

    const guide = result.services.find(s => s.serviceType === 'guide' && s.unpriced)
    // The fixture asks for a guide on day 2 only.
    expect(guide?.dayNumber).toBe(2)
    expect(guide?.lineTotal).toBe(0)
    expect(guide?.issue).toBeTruthy()
  })
})
