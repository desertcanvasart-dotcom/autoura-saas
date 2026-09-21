// Every unit and every context on the tipping form is priced — not just
// "Per Day". The operator's three decisions (2026-09-21) are pinned here:
// Per Person = × travellers × every day its context applies; no tier scaling;
// tipping is never a gap.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, multiTierRateTables } from './fixtures/sample-templates'
import { tipLinesForTour, tipTotals, whyTipRowIsNotPriced, howTipIsCounted, type DayOccasions, type TippingRow } from '@/lib/pricing/tipping'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

const quiet = (day: number, over: Partial<DayOccasions> = {}): DayOccasions => ({
  day, city: 'Cairo', sightseeing: null, restaurantMeals: 0, transfers: 0, airportServices: 0, hotelServices: 0, night: null, ...over,
})
const row = (over: Partial<TippingRow>): TippingRow => ({ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 100, city: null, ...over })
const sum = (rows: TippingRow[], days: DayOccasions[]) => tipTotals(tipLinesForTour(rows, days).lines)

describe('the units', () => {
  it('Per Day: once for each day the context happens', () => {
    const days = [quiet(1), quiet(2, { sightseeing: 'full' }), quiet(3, { sightseeing: 'full' })]
    expect(sum([row({})], days)).toEqual({ group: 200, perPerson: 0 })
  })

  it('Per Service: once for each service — the restaurant tip Sawa, Afford and Travel2Egypt typed', () => {
    const days = [quiet(1, { restaurantMeals: 1 }), quiet(2, { restaurantMeals: 2 }), quiet(3)]
    expect(sum([row({ role_type: 'restaurant', context: 'restaurant', rate_unit: 'per_service', rate_eur: 150 })], days)).toEqual({ group: 450, perPerson: 0 })
  })

  it('Per Night: hotel nights for Hotel, nights aboard for Cruise, every night with no context', () => {
    const days = [quiet(1, { night: 'hotel' }), quiet(2, { night: 'cruise' }), quiet(3, { night: 'cruise' }), quiet(4)]
    const perNight = (context: string | null) => sum([row({ role_type: 'hotel_staff', context, rate_unit: 'per_night', rate_eur: 10 })], days).group
    expect(perNight('hotel')).toBe(10)
    expect(perNight('cruise')).toBe(20)
    expect(perNight(null)).toBe(30)
  })

  it('Per Cruise: once for each SAILING, however long', () => {
    const days = [quiet(1, { night: 'hotel' }), quiet(2, { night: 'cruise' }), quiet(3, { night: 'cruise' }), quiet(4, { night: 'hotel' }), quiet(5, { night: 'cruise' })]
    const { lines } = tipLinesForTour([row({ role_type: 'boat_crew', context: 'cruise', rate_unit: 'per_cruise', rate_eur: 40 })], days)
    expect(lines.map(l => l.day)).toEqual([2, 5])
  })

  it('Per Person: × travellers, once for each DAY its context applies (the operator’s choice)', () => {
    const days = [quiet(1, { sightseeing: 'full' }), quiet(2, { sightseeing: 'full' }), quiet(3)]
    const { lines } = tipLinesForTour([row({ role_type: 'guide', rate_unit: 'per_person', rate_eur: 5 })], days)
    expect(lines.every(l => l.perPerson)).toBe(true)
    expect(tipTotals(lines)).toEqual({ group: 0, perPerson: 10 }) // per traveller; the engine × pax
  })
  it('…per DAY, not per service: two restaurant meals on one day is still one', () => {
    expect(sum([row({ context: 'restaurant', rate_unit: 'per_person', rate_eur: 3 })], [quiet(1, { restaurantMeals: 2 })]).perPerson).toBe(3)
  })
})

describe('the contexts', () => {
  it('each happens only on its own occasion', () => {
    const day = quiet(1, { transfers: 2, airportServices: 1, hotelServices: 1, night: 'hotel' })
    const perService = (context: string) => sum([row({ context, rate_unit: 'per_service', rate_eur: 1 })], [day]).group
    expect(perService('transfer')).toBe(2)
    expect(perService('airport')).toBe(1)
    expect(perService('hotel')).toBe(1)
    expect(perService('restaurant')).toBe(0)
    expect(perService('day_tour')).toBe(0)
  })

  it('a half day: the role’s Half Day row replaces its Day Tour row — never both', () => {
    const rows = [row({ rate_eur: 100 }), row({ context: 'half_day_tour', rate_eur: 60 })]
    expect(sum(rows, [quiet(1, { sightseeing: 'half' })]).group).toBe(60)
    expect(sum(rows, [quiet(1, { sightseeing: 'full' })]).group).toBe(100)
  })
  it('…and a role with NO half-day row is tipped its day-tour amount on a half day', () => {
    expect(sum([row({ rate_eur: 100 })], [quiet(1, { sightseeing: 'half' })]).group).toBe(100)
  })
  it('…per role: the guide having a half-day row does not take the driver’s day-tour tip away', () => {
    const rows = [row({ role_type: 'driver', rate_eur: 100 }), row({ role_type: 'guide', rate_eur: 200 }), row({ role_type: 'guide', context: 'half_day_tour', rate_eur: 120 })]
    expect(sum(rows, [quiet(1, { sightseeing: 'half' })]).group).toBe(220)
  })

  it('no context = the guided sightseeing days, as "Per Day" always meant', () => {
    expect(sum([row({ context: null })], [quiet(1), quiet(2, { sightseeing: 'full' })]).group).toBe(100)
  })
})

describe('the city picks ONE row per role + context + unit', () => {
  const rows = [row({ city: 'Cairo', rate_eur: 100 }), row({ city: 'Aswan', rate_eur: 70 }), row({ city: null, rate_eur: 50 })]
  it('the day’s own city, else the all-cities row — never the sum', () => {
    const days = [quiet(1, { city: 'Cairo', sightseeing: 'full' }), quiet(2, { city: 'aswan ', sightseeing: 'full' }), quiet(3, { city: 'Luxor', sightseeing: 'full' })]
    expect(tipLinesForTour(rows, days).lines.map(l => l.amount)).toEqual([100, 70, 50])
  })
  it('a city with no row and no all-cities row is simply not tipped', () => {
    expect(sum([row({ city: 'Cairo' })], [quiet(1, { city: 'Luxor', sightseeing: 'full' })]).group).toBe(0)
  })
})

describe('rows that cannot be priced are SAID, not silently dropped', () => {
  it.each([
    [{ context: 'felucca' }, /do not record boat rides/],
    [{ context: 'motorboat' }, /do not record boat rides/],
    [{ context: 'camel_ride' }, /context your agency added/],
    [{ rate_unit: 'per_week' }, /unit your agency added/],
    [{ rate_unit: 'per_night', context: 'restaurant' }, /only counts nights/],
    [{ rate_unit: 'per_cruise', context: 'airport' }, /only counts sailings/],
    [{ rate_eur: 0 }, /no amount/],
  ])('%o', (over, reason) => {
    expect(whyTipRowIsNotPriced(row(over as Partial<TippingRow>))).toMatch(reason)
    const { lines, unpriced } = tipLinesForTour([row(over as Partial<TippingRow>)], [quiet(1, { sightseeing: 'full', night: 'cruise', restaurantMeals: 1, airportServices: 1 })])
    expect(lines).toEqual([])
    expect(unpriced).toHaveLength(1)
  })
  it('every unit × every priced context on the form is either priced or explained — none throws', () => {
    for (const rate_unit of ['per_day', 'per_service', 'per_night', 'per_cruise', 'per_person'])
      for (const context of ['day_tour', 'half_day_tour', 'cruise', 'transfer', 'airport', 'hotel', 'restaurant', 'felucca', 'motorboat', null])
        expect(() => tipLinesForTour([row({ rate_unit, context })], [quiet(1, { sightseeing: 'half', night: 'cruise' })])).not.toThrow()
  })
})

// ── the engine ───────────────────────────────────────────────────────────────
const price = (tier = 'standard') => calculateDayBasedPricing({
  templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier, isEurPassport: true, language: 'English', marginPercent: 0,
} as never)
const perPersonAt = (r: Awaited<ReturnType<typeof price>>, n: number) => r.paxPricing.find(p => p.numPax === n)!.withoutLeader.pricePerPerson
const tipsOf = (r: Awaited<ReturnType<typeof price>>) => r.services.filter(s => s.serviceType === 'tips')

describe('the engine', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => setMockTables({}))
  const withTips = (tipping_rates: Record<string, unknown>[]) => setMockTables({ ...multiTierRateTables(), tipping_rates })

  it('no tier scaling: the amount typed is the amount charged, on every tier', async () => {
    withTips([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 500, is_active: true }])
    const amounts = new Set<number>()
    for (const tier of ['budget', 'standard', 'deluxe', 'luxury']) for (const line of tipsOf(await price(tier))) amounts.add(line.unitCost)
    expect([...amounts]).toEqual([500])
  })

  it('never a gap: an agency with NO tipping rows is still complete', async () => {
    withTips([])
    const r = await price()
    expect(r.holes.filter(h => h.kind === 'tipping')).toEqual([])
    expect(tipsOf(r)).toEqual([])
    expect(r.complete).toBe(true)
  })

  it('a Per Person tip costs each traveller the same in any group; a group tip is shared', async () => {
    withTips([])
    const bare = await price()
    withTips([{ role_type: 'guide', context: 'day_tour', rate_unit: 'per_person', rate_eur: 5, is_active: true }])
    const perPerson = await price()
    withTips([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 40, is_active: true }])
    const group = await price()

    const days = tipsOf(perPerson).length
    expect(days).toBeGreaterThan(0)
    expect(tipsOf(perPerson).every(l => l.isPerPax && l.quantityMode === 'per_pax')).toBe(true)
    expect(tipsOf(group).every(l => !l.isPerPax && l.quantityMode === 'fixed')).toBe(true)
    for (const n of [2, 10]) {
      expect(perPersonAt(perPerson, n) - perPersonAt(bare, n)).toBeCloseTo(5 * days, 2)       // each pays 5 a day
      expect(perPersonAt(group, n) - perPersonAt(bare, n)).toBeCloseTo((40 * days) / n, 2)    // 40 a day, shared
    }
  })

  it('the lines say who and what for', async () => {
    withTips([{ role_type: 'driver', context: 'day_tour', rate_unit: 'per_day', rate_eur: 40, is_active: true }])
    expect(tipsOf(await price())[0].serviceName).toBe('Driver tip — Day Tour')
  })

  it('source: no tier multiplier on tips, no tipping gap, and no select(*)', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(engine).not.toMatch(/tierMultiplier/)
    expect(engine).not.toMatch(/kind: 'tipping'/)
    expect(engine).not.toContain('No per-day tipping rate')
  })
})

describe('the form says what pricing does', () => {
  it('in words, for the row being typed', () => {
    expect(howTipIsCounted({ context: 'restaurant', rate_unit: 'per_service' })).toMatch(/once for the group for every restaurant meal/)
    expect(howTipIsCounted({ context: 'day_tour', rate_unit: 'per_person' })).toMatch(/EACH traveller on every day with guided sightseeing/)
    expect(howTipIsCounted({ context: 'cruise', rate_unit: 'per_cruise' })).toMatch(/each sailing/)
    expect(howTipIsCounted({ context: null, rate_unit: 'per_night' })).toMatch(/every night\./)
  })
  it('the page shows it, and flags a row that cannot be priced', () => {
    const page = readFileSync(join(process.cwd(), 'app/rates/tipping/page.tsx'), 'utf8')
    expect(page).toContain('howTipIsCounted(formData)')
    expect(page).toContain('Not priced — hover for why')
  })
  it('the rules stay import-free — the page is a client component (only `next build` catches a server import)', () => {
    const rules = readFileSync(join(process.cwd(), 'lib/pricing/tipping.ts'), 'utf8')
    expect(rules).not.toMatch(/^import /m)
  })
})
