// THE ROWS OF A BREAKDOWN MUST ADD UP TO ITS SUBTOTAL.
//
// Reported from production, 2026-09-21: the B2B calculator for Sawa Tours'
// "Aswan Highlights", two passengers — rows summing to 112.47 above a subtotal
// of 124.48. Three separate faults, all in how the lines relate to the money:
//
//   1. a per-person line (lunch, water, an entrance fee) was shown ONCE while
//      the subtotal charged it for every passenger;
//   2. the vehicle line was always the TWO-passenger vehicle — at four the row
//      said sedan while the subtotal had charged the minivan (37 of 45 live
//      tours did not add up at four passengers);
//   3. a day's extra transfers — dinner out, a local transfer (#459) — were
//      shown as lines and NEVER charged: they were added to a variable nothing
//      read.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'
import { scaleForGroup, sumForGroup } from '@/lib/pricing/line-for-group'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

describe('a line, as the group pays it', () => {
  it('a per-person line is multiplied by the group', () => {
    expect(scaleForGroup({ isPerPax: true, quantity: 1, lineTotal: 10 }, 4)).toEqual({ quantity: 4, lineTotal: 40 })
  })
  it('a fixed line is not — one guide, one vehicle, whatever the group', () => {
    expect(scaleForGroup({ isPerPax: false, quantity: 1, lineTotal: 66.98 }, 4)).toEqual({ quantity: 1, lineTotal: 66.98 })
  })
  it('rounds to cents, and never multiplies by nonsense', () => {
    expect(scaleForGroup({ isPerPax: true, lineTotal: 3.337 }, 3).lineTotal).toBe(10.01)
    expect(scaleForGroup({ isPerPax: true, lineTotal: 10 }, 0)).toEqual({ quantity: 1, lineTotal: 10 })
    expect(scaleForGroup({ isPerPax: true, lineTotal: 10 }, NaN)).toEqual({ quantity: 1, lineTotal: 10 })
  })
  it('the production screenshot: 66.98 + 33.49 + 2.00×2 + 10.00×2', () => {
    const lines = [
      { isPerPax: false, lineTotal: 66.98 }, { isPerPax: false, lineTotal: 33.49 },
      { isPerPax: true, lineTotal: 2 }, { isPerPax: true, lineTotal: 10 },
    ]
    expect(sumForGroup(lines, 2)).toBe(124.47)   // the subtotal on screen: 124.48
    expect(sumForGroup(lines, 1)).toBe(112.47)   // what the rows APPEARED to say
  })
})

const vehicle = (vehicle_type: string, rate: number, service_type = 'day_tour') => ({
  id: `t-${service_type}-${vehicle_type}`, service_type, city: 'Cairo', destination_city: null, origin_city: null,
  duration: null, area: null, vehicle_type, base_rate_eur: rate, is_active: true,
})

async function priceFor(numPax: number, dayPatch: Record<string, unknown> = {}, extraRates: Array<Record<string, unknown>> = []) {
  const tables = fullRateTables()
  tables.transportation_rates = [vehicle('Sedan', 40), vehicle('Minivan', 90), ...extraRates]
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  // One sightseeing day in Cairo, so the vehicle is the only thing that changes with the group.
  template.itinerary = [{ ...template.itinerary[1], day: 1, city: 'Cairo', accommodation_type: 'none', ...dayPatch }]
  template.tour_type = 'day_tour'
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateAutoPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', numPax,
    isEurPassport: true, language: 'English', marginPercent: 25, tourLeaderIncluded: false,
  } as never)
}
const transportLines = (r: Awaited<ReturnType<typeof priceFor>>) => r.services.filter(s => s.serviceType === 'transportation' && !s.unpriced)

describe('the vehicle line is the vehicle that was charged', () => {
  it('two passengers: the sedan, on the row and in the money', async () => {
    const r = await priceFor(2)
    expect(transportLines(r).map(l => l.unitCost)).toEqual([40])
    expect(sumForGroup(r.services, 2)).toBeCloseTo(r.subtotalCost, 1)
  })

  it('four passengers: the MINIVAN on the row — it used to say sedan under a minivan subtotal', async () => {
    const r = await priceFor(4)
    expect(transportLines(r).map(l => l.unitCost)).toEqual([90])
    expect(sumForGroup(r.services, 4)).toBeCloseTo(r.subtotalCost, 1)
  })

  it('and the difference between the two groups is exactly the vehicle plus the extra people', async () => {
    const [two, four] = [await priceFor(2), await priceFor(4)]
    const perPerson = two.services.filter(s => s.isPerPax).reduce((n, s) => n + s.lineTotal, 0)
    expect(four.subtotalCost - two.subtotalCost).toBeCloseTo((90 - 40) + perPerson * 2, 1)
  })
})

describe('a day\'s extra transfers are charged, not only shown', () => {
  const dinner = { meals: { breakfast: 'none', lunch: 'none', dinner: 'external' } }
  const dinnerRates = [vehicle('Sedan', 25, 'outside_dinner'), vehicle('Minivan', 45, 'outside_dinner')]

  it('a dinner transfer is on the breakdown AND in the subtotal', async () => {
    const [without, withDinner] = [await priceFor(2, { meals: { breakfast: 'none', lunch: 'none', dinner: 'none' } }, dinnerRates), await priceFor(2, dinner, dinnerRates)]
    const line = withDinner.services.find(s => s.id.endsWith('-dinner-transfer'))
    expect(line?.unitCost).toBe(25)
    // The dinner itself is a meal line; take it out so only the TRANSFER is compared.
    const meal = withDinner.services.filter(s => s.serviceType === 'meal').reduce((n, s) => n + s.lineTotal * 2, 0)
             - without.services.filter(s => s.serviceType === 'meal').reduce((n, s) => n + s.lineTotal * 2, 0)
    expect(withDinner.subtotalCost - without.subtotalCost - meal).toBeCloseTo(25, 1)
  })

  it('it is sized for the group, like the day\'s own vehicle', async () => {
    const r = await priceFor(4, dinner, dinnerRates)
    expect(r.services.find(s => s.id.endsWith('-dinner-transfer'))?.unitCost).toBe(45)
    expect(sumForGroup(r.services, 4)).toBeCloseTo(r.subtotalCost, 1)
  })

  it('the rows still add up with one on the day', async () => {
    const r = await priceFor(2, dinner, dinnerRates)
    expect(sumForGroup(r.services, 2)).toBeCloseTo(r.subtotalCost, 1)
  })

  it('nothing accumulates a total that nobody reads any more', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(engine).not.toMatch(/baseTransportCost/)
  })
})

describe('the calculator route sends lines as the group pays them', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/b2b/calculate-price/route.ts'), 'utf8')
  it('scales quantity and total through the one shared rule', () => {
    expect(route).toContain("import { scaleForGroup } from '@/lib/pricing/line-for-group'")
    expect(route).toMatch(/quantity: perPaxQuantity\(s\),/)
    expect(route).toMatch(/line_total: perPaxTotal\(s\),/)
  })
})
