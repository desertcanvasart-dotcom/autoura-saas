// Airport / hotel assistance priced per group, per person or per unit
// (migration 393). The engine charged every assistance line ONCE for the
// group — an Aswan meet-and-assist cost the same for 2 travellers as for 20.
import { vi, describe, it, expect, beforeAll } from 'vitest'
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

async function priceWithArrivalRate(extra: Record<string, unknown>) {
  const tables = fullRateTables()
  tables.airport_staff_rates = [{
    id: 'ap1', airport_code: 'CAI', direction: 'arrival', service_type: 'meet_greet',
    rate_eur: 15, is_active: true, ...extra,
  }]
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  template.itinerary[0].services.airport_arrival = true
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 0, requestedPax: 4,
  })
}

const line = (r: Awaited<ReturnType<typeof priceWithArrivalRate>>) =>
  r.services.find(s => s.serviceType === 'airport_service' && !s.unpriced)!
const costAt = (r: Awaited<ReturnType<typeof priceWithArrivalRate>>, pax: number) =>
  r.paxPricing.find(p => p.numPax === pax)!.withoutLeader.totalCost

describe('the engine prices assistance by the rate’s basis', () => {
  it('per group (no basis stated): one fixed line, as before', async () => {
    const r = await priceWithArrivalRate({})
    expect(line(r)).toMatchObject({ unitCost: 15, lineTotal: 15, isPerPax: false })
  })

  it('per person: a per-pax line, so each extra traveller adds the rate', async () => {
    const flat = await priceWithArrivalRate({ pricing_type: 'flat' })
    const pp = await priceWithArrivalRate({ pricing_type: 'per_person' })
    expect(line(pp)).toMatchObject({ unitCost: 15, isPerPax: true, quantityMode: 'per_pax' })
    // Per group adds 15 once; per person adds 15 × pax.
    expect(costAt(pp, 2) - costAt(flat, 2)).toBeCloseTo(15, 2)
    expect(costAt(pp, 4) - costAt(flat, 4)).toBeCloseTo(45, 2)
  })

  it('per unit: sized at the requested pax', async () => {
    const r = await priceWithArrivalRate({ pricing_type: 'per_unit', max_capacity: 2 })
    // 4 travellers, 2 per unit → 2 units.
    expect(line(r)).toMatchObject({ unitCost: 15, lineTotal: 30, isPerPax: false })
  })
})
