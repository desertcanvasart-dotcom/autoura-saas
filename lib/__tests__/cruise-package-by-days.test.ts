// Cruise sightseeing transport as a PACKAGE for the sailing's exact length in
// days (sibling #463): nights + 1, never a neighbouring length; each covered
// day reads "Included"; with no package the per-day rates apply as before.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { cruiseSailings, packageForDuration } from '@/lib/pricing/cruise-package'

const N = { breakfast: 'none', lunch: 'none', dinner: 'none' }

describe('a sailing', () => {
  it('is a run of nights aboard; its package length is nights + 1; the day after is the disembarkation', () => {
    const days = [{ day: 1, accommodation_type: 'hotel' }, { day: 2, accommodation_type: 'cruise' }, { day: 3, accommodation_type: 'cruise' }, { day: 4, accommodation_type: 'cruise' }, { day: 5, accommodation_type: 'hotel' }]
    expect(cruiseSailings(days)).toEqual([{ nights: 3, durationDays: 4, nightDays: [2, 3, 4], disembarkDay: 5 }])
  })
  it('two sailings are two; a sailing that ends the programme has no disembarkation day', () => {
    const days = [{ day: 1, accommodation_type: 'cruise' }, { day: 2, accommodation_type: 'hotel' }, { day: 3, accommodation_type: 'cruise' }]
    expect(cruiseSailings(days)).toEqual([
      { nights: 1, durationDays: 2, nightDays: [1], disembarkDay: 2 },
      { nights: 1, durationDays: 2, nightDays: [3], disembarkDay: null },
    ])
    expect(cruiseSailings([{ day: 1, accommodation_type: 'hotel' }])).toEqual([])
  })
  it('the package is the EXACT length — a 4-night cruise is 5 days, and 4D is not 5D', () => {
    const pk = [{ id: '4D', duration_days: 4 }, { id: '5D', duration_days: 5 }]
    expect(packageForDuration(pk, 5)).toEqual({ kind: 'one', pkg: pk[1] })
    expect(packageForDuration(pk, 6)).toEqual({ kind: 'none' })
    expect(packageForDuration([...pk, { id: '5D-b', duration_days: 5 }], 5)).toEqual({ kind: 'ambiguous', count: 2 })
  })
})

describe('priced', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  // Services stated on every day, so the only transport in play is the
  // sightseeing (the position defaults would add an airport run).
  const S = (guide: boolean) => ({ airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: guide })
  const CRUISE = [
    { day: 1, title: 'Luxor', city: 'Luxor', meals: N, accommodation_type: 'hotel', attractions: ['Karnak Temple'], services: S(true) },
    { day: 2, title: 'Board', city: 'Luxor', meals: N, accommodation_type: 'cruise', attractions: ['Luxor Temple'], services: S(true) },
    { day: 3, title: 'Kom Ombo', city: 'Kom Ombo', meals: N, accommodation_type: 'cruise', attractions: ['Kom Ombo Temple'], services: S(true) },
    { day: 4, title: 'Aswan', city: 'Aswan', meals: N, accommodation_type: 'cruise', attractions: ['Philae Temple'], services: S(true) },
    { day: 5, title: 'Leave the ship', city: 'Aswan', meals: N, accommodation_type: 'hotel', services: S(false) },
    { day: 6, title: 'Home', city: 'Aswan', meals: N, services: S(false) },
  ]
  const DAY_TOUR = ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus'].flatMap(v => ['Luxor', 'Kom Ombo', 'Aswan'].map(city => ({ id: `dt-${v}-${city}`, service_code: 'DT', service_type: 'day_tour', vehicle_type: v, city, base_rate_eur: 40, base_rate_non_eur: 40, is_active: true })))
  const PKG = (over: Record<string, unknown> = {}) => ({ id: 'p5', package_code: '5D', package_name: '5D Cruise Sightseeing', package_type: 'cruise_sightseeing', duration_days: 4, sedan_capacity: 2, sedan_rate: 150, minivan_capacity: 7, minivan_rate: 220, is_active: true, ...over })
  const price = async (packages: unknown[]) => {
    const t = fullRateTables(); t.tour_templates = [{ ...cairoTemplateRow, itinerary: CRUISE, duration_days: 6, tour_type: 'multi_day' }]
    t.transportation_rates = DAY_TOUR; t.b2b_transport_packages = packages; setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  const transport = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'transportation').map(s => `d${s.dayNumber} ${s.serviceName} = ${s.unitCost}`)
  const pp = (r: Awaited<ReturnType<typeof price>>, n: number) => r.paxPricing.find(p => p.numPax === n)!.withoutLeader.pricePerPerson

  it('no package: the per-day rates, as always — a day tour on each sightseeing day', async () => {
    const r = await price([])
    expect(transport(r)).toEqual(['d1 Sedan - Luxor = 40', 'd2 Sedan - Luxor = 40', 'd3 Sedan - Kom Ombo = 40', 'd4 Sedan - Aswan = 40'])
  })

  it('a package of the exact length (3 nights = 4 days): priced once, the nights aboard and the disembarkation read Included, day 1 keeps its own day tour', async () => {
    const r = await price([PKG()])
    expect(transport(r)).toEqual([
      'd1 Sedan - Luxor = 40',
      'd2 5D Cruise Sightseeing (4 days, Sedan) = 150',
      'd2 Sightseeing transport — Included in 5D Cruise Sightseeing = 0',
      'd3 Sightseeing transport — Included in 5D Cruise Sightseeing = 0',
      'd4 Sightseeing transport — Included in 5D Cruise Sightseeing = 0',
      'd5 Transfer off the ship — Included in 5D Cruise Sightseeing = 0',
    ])
    expect(r.holes.filter(h => h.kind === 'transport')).toEqual([])
  })

  it('the package is in the total, at the group’s vehicle: sedan for 2, minivan for 4', async () => {
    const none = await price([]); const pkg = await price([PKG()])
    // per person: package replaces three 40 day tours (120) with 150 → +30 for the group
    expect(pp(pkg, 2) - pp(none, 2)).toBeCloseTo(30 / 2, 2)
    expect(pp(pkg, 4) - pp(none, 4)).toBeCloseTo((220 - 120) / 4, 2)
  })

  it('a package of a NEIGHBOURING length is never used — the per-day rates apply', async () => {
    const r = await price([PKG({ duration_days: 5 })])
    expect(transport(r)).toEqual(['d1 Sedan - Luxor = 40', 'd2 Sedan - Luxor = 40', 'd3 Sedan - Kom Ombo = 40', 'd4 Sedan - Aswan = 40'])
  })

  it('a package with no vehicle price for the group is a gap naming it, never 0', async () => {
    const r = await price([PKG({ sedan_rate: null, minivan_rate: null })])
    expect(r.holes.some(h => h.kind === 'transport' && /5D Cruise Sightseeing has no vehicle price/.test(h.message))).toBe(true)
    expect(transport(r).some(l => /5D Cruise Sightseeing \(4 days/.test(l))).toBe(false)
  })

  it('two packages of the same length: a gap — pricing does not choose', async () => {
    const r = await price([PKG(), PKG({ id: 'p5b', package_code: '5D-B' })])
    expect(r.holes.some(h => /2 cruise sightseeing packages are 4 days long/.test(h.message))).toBe(true)
  })
})
