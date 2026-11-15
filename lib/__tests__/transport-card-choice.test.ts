// One company, several named cards answering the same transport lookup
// (operator, 2026-11-15: "cheapest plus warning"). The cache used to keep the
// row it read last — it priced a Cairo arrival at the full-day airport card.
// Now: a starred card wins; with none starred, the cheapest, and a warning
// naming the others. Never a stop, never a silent pick.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { chooseTransportCards, routeChoiceWarning, transportLookupKey } from '@/lib/pricing/transport-suppliers'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const card = (id: string, name: string, price: number, over: Record<string, unknown> = {}) => ({
  id, service_type: 'transfer_within_city', city: 'Luxor', duration: null, area: null, vehicle_type: 'sedan',
  route_name: name, base_rate_eur: price, supplier_id: 'co', is_preferred: false, ...over,
})

describe('chooseTransportCards', () => {
  it('one card: untouched, no choice recorded', () => {
    const out = chooseTransportCards([card('1', 'LUXOR-KARNAK', 750)])
    expect(out).toHaveLength(1)
    expect(out[0].routeChoice).toBeUndefined()
  })
  it('several cards, none starred: the cheapest, naming the others', () => {
    const out = chooseTransportCards([card('1', 'LUXOR-WEST-BANK', 1800), card('2', 'LUXOR-KARNAK', 750), card('3', 'LUXOR-DENDRA', 1900)])
    expect(out.map(r => r.id)).toEqual(['2'])
    expect(out[0].routeChoice).toEqual({ chosen: 'LUXOR-KARNAK', others: ['LUXOR-WEST-BANK', 'LUXOR-DENDRA'], amongStarred: false })
  })
  it('one starred card wins — even when dearer — with no warning', () => {
    const out = chooseTransportCards([card('1', 'Airport → Hotel', 1600, { is_preferred: true }), card('2', 'Sphinx → Hotel', 1500)])
    expect(out.map(r => r.id)).toEqual(['1'])
    expect(out[0].routeChoice).toBeUndefined()
  })
  it('several starred: the cheapest of the starred, with a warning', () => {
    const out = chooseTransportCards([card('1', 'A', 900, { is_preferred: true }), card('2', 'B', 800, { is_preferred: true }), card('3', 'C', 100)])
    expect(out.map(r => r.id)).toEqual(['2'])
    expect(out[0].routeChoice?.amongStarred).toBe(true)
  })
  it('each vehicle and each city is its own lookup', () => {
    const out = chooseTransportCards([card('1', 'A', 900), card('2', 'B', 800, { vehicle_type: 'hiace' }), card('3', 'C', 700, { city: 'Aswan' })])
    expect(out.map(r => r.id)).toEqual(['1', '2', '3'])
  })
  it('a group undecided between companies is left for the company rule (a hole)', () => {
    const amb = { count: 2, names: ['X', 'Y'], preferredCount: 0 }
    const out = chooseTransportCards([card('1', 'A', 900, { ambiguity: amb }), card('2', 'B', 800, { ambiguity: amb })])
    expect(out).toHaveLength(2)
  })
  it('a road is keyed by its route, not a city', () => {
    const a = { service_type: 'intercity_dropoff', city: 'Luxor', destination_city: 'Aswan', vehicle_type: 'sedan' }
    expect(transportLookupKey(a)).not.toBe(transportLookupKey({ ...a, destination_city: 'Hurghada' }))
  })
  it('the warning names the cards and says what to do', () => {
    expect(routeChoiceWarning(6, 'local transfer · sedan · Luxor', { chosen: 'LUXOR-KARNAK', others: ['LUXOR-WEST-BANK'], amongStarred: false }))
      .toBe('Day 6: 2 cards answer local transfer · sedan · Luxor (LUXOR-KARNAK, LUXOR-WEST-BANK) — priced the cheapest, "LUXOR-KARNAK". Star the usual one in Rates → Transportation.')
  })
})

describe('through the engine', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  })
  const run = async (extra: Array<Record<string, unknown>>) => {
    const tables = fullRateTables()
    tables.tour_templates = [JSON.parse(JSON.stringify(cairoTemplateRow))]
    tables.transportation_rates = [
      ...(tables.transportation_rates as Array<Record<string, unknown>>).map(r => ({ ...r, route_name: 'CAIRO-DAY-TOUR' })),
      ...extra,
    ]
    setMockTables(tables)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 25 })
  }
  const cheaper = { id: 't-cai-cheap', service_type: 'day_tour', city: 'Cairo', duration: 'half_day', area: '', vehicle_type: 'Sedan', base_rate_eur: 40, base_rate_non_eur: 40, is_active: true, route_name: 'CAIRO-SHORT-TOUR' }

  it('two Cairo day-tour cards for a sedan, none starred: the cheaper is priced and a warning says so', async () => {
    const r = await run([cheaper])
    const line = r.services.find(s => s.serviceType === 'transportation' && s.dayNumber === 2)!
    expect(line.serviceName).toBe('CAIRO-SHORT-TOUR')
    expect(line.unitCost).toBe(40)
    expect(r.warnings.some(w => /priced the cheapest, "CAIRO-SHORT-TOUR"/.test(w))).toBe(true)
  })
  it('the starred card is priced, dearer or not, with no warning', async () => {
    const tables = fullRateTables()
    const starredDayTour = (tables.transportation_rates as Array<Record<string, unknown>>).find(r => r.vehicle_type === 'Sedan')!
    const r = await run([cheaper, { ...starredDayTour, id: 't-cai-starred', route_name: 'CAIRO-FULL-TOUR', base_rate_eur: 90, is_preferred: true }])
    const line = r.services.find(s => s.serviceType === 'transportation' && s.dayNumber === 2)!
    expect(line.serviceName).toBe('CAIRO-FULL-TOUR')
    expect(r.warnings.some(w => /priced the cheapest/.test(w))).toBe(false)
  })
})
