// An arrival or departure in a city with no airport on file must be a HOLE.
//
// getAirportCode fell back to 'CAI' for anything it did not recognise, so a day
// in Marsa Alam, "Nile Cruise" or a misspelled city was priced at CAIRO's meet
// & greet rate, stamped rateSource 'airport_staff_rates' — a real-looking price
// for a service nobody had a rate for. The send gate checks structure, not
// provenance, so it could reach a client.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing, getAirportCode } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const CAIRO_ARRIVAL = {
  id: 'ap1', airport_code: 'CAI', direction: 'arrival', service_type: 'meet_greet',
  rate_eur: 15, is_active: true,
}

/** The fixture trip, with day 1 arriving in `city` and asking for meet & greet. */
async function priceArrivalIn(city: string) {
  const tables = fullRateTables()
  tables.airport_staff_rates = [CAIRO_ARRIVAL]
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  template.itinerary[0].city = city
  template.itinerary[0].services.airport_arrival = true
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25,
  })
}

describe('getAirportCode', () => {
  it('knows the cities that have an airport', () => {
    expect(getAirportCode('Cairo')).toBe('CAI')
    expect(getAirportCode('luxor')).toBe('LXR')
    expect(getAirportCode('Abu Simbel')).toBe('ABS')
  })

  it('returns null for a city it does not know, instead of Cairo', () => {
    for (const city of ['Marsa Alam', 'Nile Cruise', 'Siwa', 'Cairoo', '', '  ']) {
      expect(getAirportCode(city), city).toBeNull()
    }
  })
})

describe('an arrival in a city with no airport', () => {
  it('prices nothing and records a hole naming the city', async () => {
    const result = await priceArrivalIn('Marsa Alam')

    expect(result.complete).toBe(false)
    const hole = result.holes.find(h => h.kind === 'airport_service')
    expect(hole?.message).toContain('Marsa Alam')
    expect(hole?.message).toContain('No airport is on file')

    // Since the gaps-in-their-day work, a gap is also LISTED on its day at 0
    // and marked unpriced. What must never happen is a PRICED airport line.
    const airportLines = result.services.filter(s => s.serviceType === 'airport_service')
    for (const line of airportLines) {
      expect(line.unpriced).toBe(true)
      expect(line.lineTotal).toBe(0)
    }
    expect(airportLines.some(l => l.lineTotal > 0)).toBe(false)
  })

  it('records ONE hole, not two', async () => {
    const result = await priceArrivalIn('Marsa Alam')
    expect(result.holes.filter(h => h.kind === 'airport_service')).toHaveLength(1)
  })

  it('does not charge the Cairo rate — the bug', async () => {
    const marsa = await priceArrivalIn('Marsa Alam')
    const cairo = await priceArrivalIn('Cairo')

    const cairoLine = cairo.services.find(s => s.serviceType === 'airport_service')
    expect(cairoLine?.unitCost).toBe(15)
    expect(cairo.holes.some(h => h.kind === 'airport_service')).toBe(false)

    // Marsa Alam gets no PRICE — only an unpriced line saying so.
    const marsaAirport = marsa.services.filter(s => s.serviceType === 'airport_service')
    expect(marsaAirport.every(l => l.unpriced === true && l.lineTotal === 0)).toBe(true)
    expect(marsaAirport.some(l => l.rateSource === 'airport_staff_rates')).toBe(false)
  })

  it('a known city with no rate on file still reports the missing rate', async () => {
    const tables = fullRateTables()
    tables.airport_staff_rates = []
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    template.itinerary[0].services.airport_arrival = true
    tables.tour_templates = [template]
    setMockTables(tables)
    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, language: 'English', marginPercent: 25,
    })
    const hole = result.holes.find(h => h.kind === 'airport_service')
    expect(hole?.message).toContain('CAI')
  })
})
