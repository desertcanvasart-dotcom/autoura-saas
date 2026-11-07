// Land packages (migration 462): the Bahariya desert trip bought from one
// provider at one price per person. Charged ONCE; on the days it covers, what
// it includes — the road out and back, the guide, its meals, its night, the
// entrance fees — is not charged again. Operator, 2026-11-07.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { fullRateTables, TEMPLATE_ID, cairoTemplateRow } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import {
  landPackageCoverage, packageInclusions, packageLineName, packageMeals, packagePricePerPerson, sightCovered,
  type LandPackageRow,
} from '@/lib/pricing/land-package'

const BAHARIYA_CAMP: LandPackageRow = {
  id: 'lp-camp', package_name: 'Bahariya desert safari (camp)', city: 'Bahariya', start_city: 'Cairo',
  duration_days: 2, night_places: ['camp'],
  meals: [{ breakfast: false, lunch: true, dinner: true }, { breakfast: true, lunch: false, dinner: false }],
  includes_transport: true, includes_local_vehicle: true, includes_guide: true, includes_entrance: true,
  covered_attractions: ['White Desert', 'Crystal Mountain', 'English Mountain', 'Hot Spring', 'Black Desert'],
  vehicle_capacity: 6, base_rate_eur: 120, base_rate_non_eur: 120,
}

describe('the rule', () => {
  it('covers the day it starts and the next ones; charged once, on the first', () => {
    const days = [{ day: 1 }, { day: 2, land_package_id: 'lp-camp' }, { day: 3 }, { day: 4 }]
    const c = landPackageCoverage(days, new Map([['lp-camp', BAHARIYA_CAMP]]))
    expect(c.holes).toEqual([])
    expect(c.charges.map(x => x.day)).toEqual([2])
    expect([...c.covered.keys()]).toEqual([2, 3])
    expect(c.covered.get(2)).toMatchObject({ index: 0, last: false, night: 'camp', transport: true, guide: true, meals: { lunch: true, dinner: true, breakfast: false } })
    expect(c.covered.get(3)).toMatchObject({ index: 1, last: true, night: null, endsIn: 'Cairo', meals: { breakfast: true, lunch: false } })
  })

  it('a package running past the trip, a missing one, or two on one day are gaps', () => {
    const pk = new Map([['lp-camp', BAHARIYA_CAMP]])
    expect(landPackageCoverage([{ day: 1 }, { day: 2, land_package_id: 'lp-camp' }], pk).holes[0].message).toMatch(/2 days \/ 1 night, but the trip ends/)
    expect(landPackageCoverage([{ day: 1, land_package_id: 'gone' }], pk).holes[0].message).toMatch(/no longer in Rates → Land packages/)
    const twice = landPackageCoverage([{ day: 1, land_package_id: 'lp-camp' }, { day: 2, land_package_id: 'lp-camp' }, { day: 3 }], pk)
    expect(twice.charges).toHaveLength(1)
    expect(twice.holes[0].message).toMatch(/already covered/)
  })

  it('reads its meals per day, its price, and says what it includes', () => {
    expect(packageMeals({ meals: [{ lunch: true }], duration_days: 2 })).toEqual([
      { breakfast: false, lunch: true, dinner: false }, { breakfast: false, lunch: false, dinner: false },
    ])
    expect(packagePricePerPerson(BAHARIYA_CAMP)).toBe(120)
    expect(packagePricePerPerson({ ...BAHARIYA_CAMP, base_rate_eur: null, base_rate_non_eur: null })).toBeNull()
    expect(packageLineName(BAHARIYA_CAMP)).toBe('Bahariya desert safari (camp) — 2 days / 1 night')
    expect(packageInclusions(BAHARIYA_CAMP)).toEqual([
      'Car from and back to Cairo', '4x4 (up to 6 per car)', '1 night: desert camp', 'Guide',
      'Meals: lunch day 1, dinner day 1, breakfast day 2',
      'Entrance: White Desert, Crystal Mountain, English Mountain, Hot Spring, Black Desert',
    ])
  })

  it('covers the sights its ticket names (or every sight when it names none)', () => {
    expect(sightCovered(BAHARIYA_CAMP, 'white desert')).toBe(true)
    expect(sightCovered(BAHARIYA_CAMP, 'Karnak Temple')).toBe(false)
    expect(sightCovered({ includes_entrance: true, covered_attractions: [] }, 'Anything')).toBe(true)
    expect(sightCovered({ includes_entrance: false, covered_attractions: ['White Desert'] }, 'White Desert')).toBe(false)
  })
})

describe('priced (the tour engine)', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })

  const S = (guide: boolean) => ({ airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: guide })
  const M = (b: string, l: string, d: string) => ({ breakfast: b, lunch: l, dinner: d })
  // Cairo → two days in Bahariya → Cairo. Every meal is a restaurant meal and
  // every night a hotel, so WITHOUT the package all of it is charged.
  const trip = (withPackage: boolean) => [
    { day: 1, title: 'Cairo', city: 'Cairo', meals: M('none', 'none', 'none'), accommodation_type: 'hotel', attractions: ['Pyramids of Giza'], services: S(true) },
    { day: 2, title: 'To the White Desert', city: 'Bahariya', meals: M('none', 'external', 'external'), accommodation_type: 'hotel', attractions: ['Black Desert', 'Hot Spring', 'White Desert'], services: S(true), ...(withPackage ? { land_package_id: 'lp-camp' } : {}) },
    { day: 3, title: 'Crystal Mountain, back to Cairo', city: 'Bahariya', meals: M('external', 'none', 'none'), accommodation_type: 'hotel', attractions: ['Crystal Mountain', 'English Mountain'], services: S(true) },
    { day: 4, title: 'Cairo', city: 'Cairo', meals: M('none', 'none', 'none'), accommodation_type: 'none', attractions: ['Egyptian Museum'], services: S(true) },
  ]
  const ROADS = ['Sedan', 'Minivan'].flatMap(v => [
    { id: `out-${v}`, service_type: 'intercity_dropoff', vehicle_type: v, city: 'Bahariya', origin_city: 'Cairo', destination_city: 'Bahariya', base_rate_eur: 90, base_rate_non_eur: 90, is_active: true },
    { id: `back-${v}`, service_type: 'intercity_dropoff', vehicle_type: v, city: 'Cairo', origin_city: 'Bahariya', destination_city: 'Cairo', base_rate_eur: 90, base_rate_non_eur: 90, is_active: true },
    ...['Cairo', 'Bahariya'].map(city => ({ id: `dt-${v}-${city}`, service_type: 'day_tour', vehicle_type: v, city, base_rate_eur: 40, base_rate_non_eur: 40, is_active: true })),
  ])
  const price = async (withPackage: boolean, pkg: Partial<LandPackageRow> = {}) => {
    const t = fullRateTables()
    t.tour_templates = [{ ...cairoTemplateRow, itinerary: trip(withPackage), duration_days: 4, tour_type: 'multi_day' }]
    t.transportation_rates = ROADS
    t.accommodation_rates = [...(t.accommodation_rates as unknown[]), { id: 'h-bah', property_name: 'Oasis Lodge', city: 'Bahariya', tier: 'standard', ppd_eur: 35, single_supplement_eur: 10, triple_reduction_eur: 0, is_active: true }]
    t.entrance_fees = [...(t.entrance_fees as unknown[]), ...['Black Desert', 'Hot Spring', 'White Desert', 'Crystal Mountain', 'English Mountain'].map((n, i) => ({ id: `e-bah-${i}`, attraction_name: n, eur_rate: 5, non_eur_rate: 5, is_active: true }))]
    t.land_packages = [{ ...BAHARIYA_CAMP, rate_currency: 'EUR', is_active: true, ...pkg }]
    setMockTables(t)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 0 } as never)
  }
  type R = Awaited<ReturnType<typeof price>>
  const on = (r: R, days: number[]) => r.services.filter(s => days.includes(s.dayNumber as number) && s.lineTotal > 0)
  const kinds = (r: R, days: number[]) => [...new Set(on(r, days).map(s => s.serviceType))].sort()

  it('without the package the Bahariya days are charged piece by piece', async () => {
    const r = await price(false)
    expect(kinds(r, [2, 3])).toEqual(expect.arrayContaining(['accommodation', 'entrance', 'meal', 'transportation']))
  })

  it('with it: one package line, and nothing it includes is charged on its days', async () => {
    const r = await price(true)
    const pkgLines = r.services.filter(s => s.serviceType === 'package')
    expect(pkgLines).toHaveLength(1)
    expect(pkgLines[0]).toMatchObject({ dayNumber: 2, unitCost: 120, isPerPax: true, serviceName: 'Bahariya desert safari (camp) — 2 days / 1 night' })
    expect(pkgLines[0].notes).toMatch(/Car from and back to Cairo/)
    // Day 3's night is back in Cairo (after the package) — the only charge left on its days.
    expect(kinds(r, [2])).toEqual(['package'])
    expect(on(r, [3]).map(s => s.serviceType)).toEqual(['accommodation'])
    expect(r.holes.filter(h => [2, 3].includes(h.dayNumber as number))).toEqual([])
  })

  it('the day after is no road move from Bahariya — the package drove the group back', async () => {
    const r = await price(true)
    expect(on(r, [4]).filter(s => s.serviceType === 'transportation').map(s => s.serviceName).join()).not.toMatch(/Bahariya/)
  })

  it('days outside the package keep their own services', async () => {
    const without = await price(false), withIt = await price(true)
    // Water and tips are per sightseeing day, and the package days are the
    // provider's — so their totals shrink; everything else on days 1 and 4
    // is as before, except day 4's ride: no longer the road back from
    // Bahariya (the package drove them) but Cairo's own day tour.
    const outside = (r: R) => on(r, [1, 4]).filter(s => !['water', 'tips'].includes(s.serviceType)).map(s => `${s.dayNumber} ${s.serviceType} ${s.lineTotal}`).sort()
    expect(outside(without)).toContain('4 transportation 90')
    expect(outside(withIt)).toEqual(outside(without).map(l => (l === '4 transportation 90' ? '4 transportation 40' : l)).sort())
  })

  it('the night after the package is spent where it returns (Cairo), not in Bahariya', async () => {
    const r = await price(true)
    const nights = r.services.filter(s => s.serviceType === 'accommodation').map(s => `${s.dayNumber} ${s.serviceName}`)
    expect(nights).toEqual(['1 Hotel - Cairo Grand Hotel (Cairo)', '3 Hotel - Cairo Grand Hotel (Cairo)'])
  })

  it('a sight its ticket does not name is still charged', async () => {
    const r = await price(true, { covered_attractions: ['White Desert'] })
    expect(on(r, [2, 3]).filter(s => s.serviceType === 'entrance').map(s => s.serviceName).sort()).toEqual(
      expect.arrayContaining([expect.stringMatching(/Hot Spring/), expect.stringMatching(/Crystal Mountain/)]))
    expect(on(r, [2, 3]).some(s => s.serviceType === 'entrance' && /White Desert/.test(s.serviceName))).toBe(false)
  })

  it('a package with no price per person is a gap, never free', async () => {
    const r = await price(true, { base_rate_eur: null, base_rate_non_eur: null })
    expect(r.holes.some(h => /has no price per person/.test(h.message))).toBe(true)
    expect(r.services.some(s => s.serviceType === 'package')).toBe(false)
  })

  it('it is in the total: per person, the package replaces what it covers', async () => {
    const r = await price(true)
    const two = r.paxPricing.find(p => p.numPax === 2)!.withoutLeader
    expect(two.pricePerPerson).toBeGreaterThan(120)
  })
})
