// A day may name the hotel for its tier, and the engine prices THAT one.
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

const hotel = (id: string, name: string, ppd: number, extra: Record<string, unknown> = {}) => ({
  id, property_name: name, city: 'Cairo', tier: 'standard', is_active: true,
  ppd_eur: ppd, single_supplement_eur: 0, triple_reduction_eur: 0, ...extra,
})

/** The fixture trip, with the chosen hotel written onto its hotel nights. */
async function price(hotels: Array<Record<string, unknown>>, chosen?: Record<string, string>) {
  const tables = fullRateTables()
  tables.accommodation_rates = hotels
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  if (chosen) {
    for (const day of template.itinerary) {
      if (day.accommodation_type === 'hotel') day.property_by_tier = chosen
    }
  }
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

describe('a day that names its hotel', () => {
  const two = [hotel('h1', 'Nile Palace', 100), hotel('h2', 'Desert View', 250)]

  it('is priced from THAT hotel, even where the engine could not choose', async () => {
    // Two standard hotels in Cairo and neither preferred: without a choice
    // this is an ambiguous gap (the refuse-to-guess rule).
    const result = await price(two, { standard: 'h2' })
    const night = result.services.find(s => s.serviceType === 'accommodation' && !s.unpriced)
    expect(night?.serviceName).toContain('Desert View')
    expect(night?.unitCost).toBe(250)
    expect(result.holes.some(h => h.kind === 'hotel')).toBe(false)
  })

  it('without a choice, the ambiguity is still a gap — nothing is picked for you', async () => {
    const result = await price(two)
    expect(result.complete).toBe(false)
    expect(result.holes.some(h => h.kind === 'hotel')).toBe(true)
  })

  it('a choice for ANOTHER tier does not apply to this one', async () => {
    const result = await price(two, { deluxe: 'h2' })
    expect(result.holes.some(h => h.kind === 'hotel'), 'the standard run is still ambiguous').toBe(true)
  })

  it('a chosen hotel that was switched off is a gap, never a substitution', async () => {
    const result = await price([hotel('h1', 'Nile Palace', 100), hotel('h2', 'Desert View', 250, { is_active: false })], { standard: 'h2' })
    expect(result.complete).toBe(false)
    expect(result.services.some(s => s.serviceType === 'accommodation' && s.unitCost === 100)).toBe(false)
  })

  it('a chosen hotel that was deleted is a gap too', async () => {
    const result = await price([hotel('h1', 'Nile Palace', 100)], { standard: 'gone' })
    expect(result.complete).toBe(false)
    expect(result.services.some(s => s.serviceType === 'accommodation' && s.unitCost === 100)).toBe(false)
  })

  it('one hotel in the city still prices without anyone choosing', async () => {
    const result = await price([hotel('h1', 'Nile Palace', 100)])
    const night = result.services.find(s => s.serviceType === 'accommodation' && !s.unpriced)
    expect(night?.unitCost).toBe(100)
  })
})

describe('a cruise night that names its ship', () => {
  const ship = (id: string, name: string, ppd: number, extra: Record<string, unknown> = {}) => ({
    // Shaped like the rows the other engine tests use: an unpinned lookup
    // narrows by the embark city as well as the tier.
    id, ship_name: name, tier: 'standard', is_active: true, embark_city: 'Cairo', duration_nights: 2,
    ppd_eur: ppd, single_supplement_eur: 0, triple_reduction_eur: 0, ...extra,
  })

  /** The fixture trip with its nights aboard, and a ship named per tier. */
  async function priceCruise(ships: Array<Record<string, unknown>>, chosen?: Record<string, string>) {
    const tables = fullRateTables()
    tables.nile_cruises = ships
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    for (const d of template.itinerary) {
      if (d.accommodation_type === 'hotel') {
        d.accommodation_type = 'cruise'
        if (chosen) d.property_by_tier = chosen
      }
    }
    tables.tour_templates = [template]
    setMockTables(tables)
    return calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })
  }

  it('is priced from THAT ship', async () => {
    const result = await priceCruise([ship('c1', 'Sun Boat', 150), ship('c2', 'Al Farida', 320)], { standard: 'c2' })
    const night = result.services.find(s => s.serviceType === 'cruise' && !s.unpriced)
    expect(night?.serviceName).toContain('Al Farida')
    expect(night?.unitCost).toBe(320)
  })

  it('a named ship that was switched off is a gap, not the other ship', async () => {
    const result = await priceCruise(
      [ship('c1', 'Sun Boat', 150), ship('c2', 'Al Farida', 320, { is_active: false })],
      { standard: 'c2' }
    )
    expect(result.complete).toBe(false)
    expect(result.services.some(s => s.serviceType === 'cruise' && s.unitCost === 150)).toBe(false)
  })

  it('without a choice it picks as it always has', async () => {
    const result = await priceCruise([ship('c1', 'Sun Boat', 150)])
    const night = result.services.find(s => s.serviceType === 'cruise' && !s.unpriced)
    expect(night?.unitCost).toBe(150)
  })
})
