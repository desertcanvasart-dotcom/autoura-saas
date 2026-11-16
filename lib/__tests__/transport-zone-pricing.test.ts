// Transport priced by the hotel's area, and by the sights a card covers
// (docs/transport-zones/PLAN.md step 4, owner decisions D1–D10, 2026-11-16).
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { chooseCardForSights, pickupZoneFor } from '@/lib/pricing/transport-zone'
import { transportLookupKey } from '@/lib/pricing/transport-suppliers'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

describe('pickupZoneFor — the area of the guests\' hotel', () => {
  const days = [
    { city: 'Cairo', accommodation_type: 'hotel' },                       // 0 arrive Cairo
    { city: 'Cairo', accommodation_type: 'none' },                        // 1 leave Cairo (slept there last night)
    { city: 'Luxor', accommodation_type: 'cruise' },                      // 2 cruise
    { city: 'Luxor', accommodation_type: 'cruise', pickup_zone: 'west_bank' }, // 3 cruise, stated
    { city: 'Aswan', accommodation_type: 'hotel' },                       // 4
  ]
  const hotel = (c: string) => ({ Cairo: 'october', Aswan: null } as Record<string, string | null>)[c]
  it('arriving at a hotel: its area', () => expect(pickupZoneFor(days, 0, 'Cairo', hotel)).toBe('october'))
  it('setting out from last night\'s hotel: its area', () => expect(pickupZoneFor(days, 1, 'Cairo', hotel)).toBe('october'))
  it('no hotel night there (a cruise): the default', () => expect(pickupZoneFor(days, 2, 'Luxor', hotel)).toBeNull())
  it('a day that states its pickup area keeps it (D9)', () => expect(pickupZoneFor(days, 3, 'Luxor', hotel)).toBe('west_bank'))
  it('a hotel with no area: the default', () => expect(pickupZoneFor(days, 4, 'Aswan', hotel)).toBeNull())
  it('another city than the day\'s: only that city\'s adjacent hotel nights count', () => expect(pickupZoneFor(days, 4, 'Luxor', hotel)).toBeNull())
})

describe('chooseCardForSights — the smallest card covering the day (D4, D8)', () => {
  const c = (name: string, price: number, covers: string[], starred = false) => ({ route_name: name, base_rate_eur: price, covers_sights: covers, is_preferred: starred })
  const east = c('EAST BANK', 30, ['Karnak Temple', 'Luxor Temple'])
  const eastExt = c('EAST BANK EXTENDED', 45, ['Karnak Temple', 'Luxor Temple', 'Dendera Temple'])
  const west = c('WEST BANK', 35, ['Valley Of Kings', 'Hatshepsut Temple', 'Colossi of Memnon'])
  const both = c('EAST & WEST BANK', 60, ['Karnak Temple', 'Luxor Temple', 'Valley Of Kings', 'Hatshepsut Temple', 'Colossi of Memnon'])
  const cards = [east, eastExt, west, both]
  const pick = (sights: string[], from = cards) => chooseCardForSights(from, sights)
  it('Karnak alone → East Bank', () => expect(pick(['karnak temple'])).toEqual({ kind: 'card', card: east }))
  it('Karnak + Dendera → East Bank Extended', () => expect(pick(['Karnak Temple', 'Dendera Temple'])).toEqual({ kind: 'card', card: eastExt }))
  it('Karnak + Valley of the Kings → East & West Bank', () => expect(pick(['Karnak Temple', 'Valley Of Kings'])).toEqual({ kind: 'card', card: both }))
  it('nothing covers → a gap naming the cards, unless a card lists no sights', () => {
    expect(pick(['Abu Simbel'])).toEqual({ kind: 'uncovered', cards: ['EAST BANK', 'EAST BANK EXTENDED', 'WEST BANK', 'EAST & WEST BANK'] })
    const plain = c('LUXOR-DAY-TOUR', 50, [])
    expect(pick(['Abu Simbel'], [...cards, plain])).toEqual({ kind: 'card', card: plain })
  })
  it('equally small: the starred one, else the cheapest with the choice recorded', () => {
    const east2 = c('EAST BANK (Co B)', 28, ['Karnak Temple', 'Luxor Temple'])
    expect(pick(['Karnak Temple'], [east, east2])).toEqual({ kind: 'card', card: east2, routeChoice: { chosen: 'EAST BANK (Co B)', others: ['EAST BANK'], amongStarred: false } })
    const eastStar = { ...east, is_preferred: true }
    expect(pick(['Karnak Temple'], [eastStar, east2])).toEqual({ kind: 'card', card: eastStar })
  })
  it('a day with no sights prefers a card that lists none', () => {
    const plain = c('LUXOR-TRANSFER', 20, [])
    expect(pick([], [east, plain])).toEqual({ kind: 'card', card: plain })
  })
})

describe('the area is part of the lookup key', () => {
  it('a West Bank card and the city card do not compete', () => {
    const a = { service_type: 'airport_transfer', city: 'Luxor', vehicle_type: 'sedan' }
    expect(transportLookupKey({ ...a, zone: 'west_bank' })).not.toBe(transportLookupKey({ ...a, zone: null }))
  })
})

describe('through the engine', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  })
  const zones = [
    { id: 'z1', city: 'Cairo', key: 'cairo', label: 'Cairo', is_default: true, rank: 1 },
    { id: 'z2', city: 'Cairo', key: 'october', label: '6th of October & Sheikh Zayed', is_default: false, rank: 2 },
  ]
  type Row = Record<string, unknown>
  const run = async (o: { hotelZone?: string | null; cards?: (base: Row[]) => Row[] } = {}) => {
    const tables = fullRateTables()
    tables.tour_templates = [JSON.parse(JSON.stringify(cairoTemplateRow))]
    tables.city_zones = zones
    tables.accommodation_rates = (tables.accommodation_rates as Row[]).map(h => ({ ...h, zone: o.hotelZone ?? null }))
    const base = tables.transportation_rates as Row[]
    tables.transportation_rates = o.cards ? o.cards(base) : base
    setMockTables(tables)
    return calculateDayBasedPricing({ templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard', isEurPassport: true, language: 'English', marginPercent: 25 })
  }
  const day2 = (r: Awaited<ReturnType<typeof run>>) => r.services.find(s => s.serviceType === 'transportation' && s.dayNumber === 2)

  it('a hotel with no area, or the default area, prices the city card exactly as before', async () => {
    const before = await run()
    const asDefault = await run({ hotelZone: 'cairo', cards: b => b.map(c => ({ ...c, zone: 'cairo' })) })
    expect(day2(asDefault)!.unitCost).toBe(day2(before)!.unitCost)
    expect(asDefault.paxPricing).toEqual(before.paxPricing)
  })
  it('a 6th of October hotel with no 6th of October card: a gap naming the area, never the city price (D3)', async () => {
    const r = await run({ hotelZone: 'october' })
    expect(day2(r)?.unitCost ?? 0).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => h.kind === 'transport' && /for 6th of October & Sheikh Zayed hotels/.test(h.message))).toBe(true)
  })
  it('a 6th of October hotel with a 6th of October card: that card, in the lines and the money alike', async () => {
    const r = await run({ hotelZone: 'october', cards: b => [...b, ...b.map(c => ({ ...c, id: `${c.id}-oct`, zone: 'october', route_name: 'CAIRO-DAY-TOUR-OCTOBER', base_rate_eur: Number(c.base_rate_eur) + 15, base_rate_non_eur: Number(c.base_rate_non_eur) + 15 }))] })
    expect(day2(r)!.serviceName).toBe('CAIRO-DAY-TOUR-OCTOBER')
    expect(r.holes.filter(h => h.kind === 'transport')).toEqual([])
    const base = await run({ hotelZone: null })
    // +15 per vehicle, once (one transport day) — the money follows the line.
    expect(r.paxPricing[1].withoutLeader.totalCost - base.paxPricing[1].withoutLeader.totalCost).toBeCloseTo(15, 5)
  })
  it('cards listing sights: the smallest covering the day\'s two sights', async () => {
    const r = await run({ cards: b => b.flatMap(c => [
      { ...c, id: `${c.id}-pyr`, route_name: 'PYRAMIDS ONLY', base_rate_eur: 40, covers_sights: ['Pyramids of Giza'] },
      { ...c, id: `${c.id}-both`, route_name: 'PYRAMIDS + MUSEUM', base_rate_eur: 65, covers_sights: ['Pyramids of Giza', 'Egyptian Museum'] },
      { ...c, id: `${c.id}-all`, route_name: 'ALL CAIRO', base_rate_eur: 90, covers_sights: ['Pyramids of Giza', 'Egyptian Museum', 'Citadel'] },
    ]) })
    expect(day2(r)!.serviceName).toBe('PYRAMIDS + MUSEUM')
    expect(day2(r)!.unitCost).toBe(65)
    expect(r.warnings.some(w => /priced the cheapest/.test(w))).toBe(false)
  })
  it('cards listing sights and none covering the day: a gap naming the sights', async () => {
    const r = await run({ cards: b => b.map(c => ({ ...c, route_name: 'PYRAMIDS ONLY', covers_sights: ['Pyramids of Giza'] })) })
    expect(r.complete).toBe(false)
    expect(r.holes.some(h => h.kind === 'transport' && /covers Pyramids of Giza \+ Egyptian Museum/.test(h.message))).toBe(true)
  })
})
