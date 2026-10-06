import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GridConfig, GridDay } from '@/app/pricing-grid/types'
import { calculateDay, calculatePaxRange } from '@/app/pricing-grid/lib/calculator'
import { soldItems, customAmountSold } from '@/app/pricing-grid/lib/guide-rule'

// ============================================================================
// What the grid SAVES must be what it PRICED, and must be findable by day.
// Live 2026-09-24, ITN-S-2026-6386: priced with the guide switched off
// (445.72 × 1.30 = 579.44 sold), saved WITH its 3 guide rows (143.71), every
// service carrying only day_id — which the itinerary pages do not read — and
// client_price 0, which reads as "sold for free".
// ============================================================================

type Row = Record<string, unknown>
const inserted: Record<string, Row[]> = {}
const deleted: string[] = []
let seq = 0
// What save_pricing_grid_days (migration 391) received, and whether it fails.
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
let rpcError: { message: string } | null = null

// The days and services go to the database in ONE call; its SQL (tested on
// PGlite in lib/__tests__/pricing-grid-atomic-save.test.ts) writes them.
async function rpc(fn: string, args: Record<string, unknown>) {
  rpcCalls.push({ fn, args })
  if (rpcError) return { data: null, error: rpcError }
  const days = (args.p_days as Row[]) ?? []
  let services = 0
  for (const d of days) {
    const { services: svcs, ...dayRow } = d as Row & { services: Row[] }
    ;(inserted.itinerary_days ??= []).push(dayRow)
    ;(inserted.itinerary_services ??= []).push(...svcs)
    services += svcs.length
  }
  return { data: [{ days_inserted: days.length, services_inserted: services }], error: null }
}

function table(name: string) {
  let payload: Row | Row[] | null = null
  const chain = {
    insert(p: Row | Row[]) { payload = p; return chain },
    update() { return chain },
    delete() { deleted.push(name); return chain },
    select() { return chain },
    eq() { return chain }, in() { return chain }, is() { return chain }, ilike() { return chain }, limit() { return chain },
    maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    single() {
      const rows = Array.isArray(payload) ? payload : payload ? [payload] : []
      const withIds = rows.map(r => ({ id: `${name}-${++seq}`, ...r }))
      ;(inserted[name] ??= []).push(...withIds)
      return Promise.resolve({ data: withIds[0] ?? null, error: null })
    },
    then(res: (v: { data: null; error: null }) => unknown) {
      const rows = Array.isArray(payload) ? payload : payload ? [payload] : []
      ;(inserted[name] ??= []).push(...rows)
      return Promise.resolve({ data: null, error: null }).then(res)
    },
  }
  return chain
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: { from: table, rpc } }),
  createAdminClient: () => ({ rpc: async () => ({ data: 'Q-1', error: null }), from: table }),
}))

const item = (rateId: string, name: string, rate: number) => ({ rateId, name, rateEur: rate, rateNonEur: rate })
const day = (): GridDay => ({
  id: 'd1', dayNumber: 1, title: 'Cairo', city: 'Cairo', description: '',
  slots: [
    { slotId: 'guide', selectedItems: [item('g1', 'English Cairo', 40)] },
    { slotId: 'tipping', selectedItems: [item('tip_guide', 'Guide tip', 10), item('tip_driver', 'Driver tip', 5)] },
    { slotId: 'entrance_fees', selectedItems: [item('e1', 'Pyramids', 10)] },
  ],
} as unknown as GridDay)

const config = (withGuide: boolean) => ({
  clientType: 'b2c', pax: 2, passport: 'eu', withGuide, marginPercent: 30, currency: 'EUR',
  startDate: '2026-11-01', clientName: '', clientEmail: '', clientPhone: '', tourName: 'T',
}) as unknown as GridConfig

async function save(withGuide: boolean, days: GridDay[] = [day()]) {
  for (const k of Object.keys(inserted)) delete inserted[k]
  deleted.length = 0
  rpcCalls = []
  const { POST } = await import('@/app/api/pricing-grid/save/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ config: config(withGuide), days, totals: {} }),
  }) as never)
  return { status: res.status, ...(await res.json()) }
}

beforeEach(() => {
  rpcError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the grid saves what it priced', () => {
  it('guide OFF: no guide row and no guide tip is saved, the driver tip is', async () => {
    const body = await save(false)
    expect(body.success).toBe(true)
    const names = (inserted.itinerary_services ?? []).map(s => s.service_name)
    expect(names).toEqual(['Driver tip', 'Pyramids'])
  })

  it('guide OFF: the stored selling total equals the calculator’s price for the same day', async () => {
    await save(false)
    const priced = calculateDay(day(), config(false))
    // entrance 10 × 2 pax + driver tip 5 = 25 cost → 32.50 at 30%
    expect(Number(inserted.itineraries?.[0]?.total_cost)).toBeCloseTo(25 * 1.3, 2)
    expect(priced.groupTotal + priced.perPersonTotal * 2).toBeCloseTo(25, 2)
  })

  it('guide ON: the guide and both tips are saved', async () => {
    await save(true)
    const names = (inserted.itinerary_services ?? []).map(s => s.service_name)
    expect(names).toEqual(['English Cairo', 'Guide tip', 'Driver tip', 'Pyramids'])
  })

  // Both day columns and an empty client_price are now set by the SQL
  // function itself — asserted on PGlite (pricing-grid-atomic-save.test.ts).
})

describe('the save is one transaction and keeps each day\'s settings (migration 391)', () => {
  it('days and services go to save_pricing_grid_days in ONE call; nothing is deleted or inserted piecemeal', async () => {
    const body = await save(true)
    expect(body.success).toBe(true)
    expect(rpcCalls.map(c => c.fn)).toEqual(['save_pricing_grid_days'])
    expect(deleted).not.toContain('itinerary_days')
    expect(body.daysCreated).toBe(1)
    expect(body.servicesCreated).toBe(4)
  })

  it("each day carries its type and overrides; an unset override stays null", async () => {
    const d = { ...day(), dayType: 'transfer', intercity: 'flight', hasSightseeing: true } as GridDay
    await save(true, [d, { ...day(), id: 'd2', dayNumber: 2 }])
    const [first, second] = inserted.itinerary_days ?? []
    expect(first).toMatchObject({ day_type: 'transfer', intercity: 'flight', has_sightseeing: true, overnight: null })
    expect(second).toMatchObject({ day_type: 'tour', intercity: null, has_sightseeing: null })
  })

  it('a failed save answers 500 — never success — and removes the empty new itinerary', async () => {
    rpcError = { message: 'boom' }
    const body = await save(true)
    expect(body.status).toBe(500)
    expect(body.success).toBe(false)
    expect(deleted).toEqual(['itineraries'])
  })
})

describe('guide-rule', () => {
  const tipping = { slotId: 'tipping', selectedItems: [{ rateId: 'tip_guide' }, { rateId: 'tip_driver' }] }
  it('guide off drops the guide slot and guide tips; other slots untouched', () => {
    expect(soldItems({ slotId: 'guide', selectedItems: [{ rateId: 'g' }] }, false)).toEqual([])
    expect(soldItems(tipping, false)).toEqual([{ rateId: 'tip_driver' }])
    expect(soldItems({ slotId: 'meals', selectedItems: [{ rateId: 'm' }] }, false)).toHaveLength(1)
    expect(soldItems(tipping, true)).toHaveLength(2)
  })
  it('custom amounts: guide off drops them from guide and tipping only', () => {
    expect(customAmountSold('guide', false)).toBe(false)
    expect(customAmountSold('tipping', false)).toBe(false)
    expect(customAmountSold('other_group', false)).toBe(true)
    expect(customAmountSold('guide', true)).toBe(true)
  })
})

// Migration 393: airport / hotel services and activities save by their own
// basis, so the itinerary stores what the grid priced.
describe('the grid saves each line by its rate’s basis', () => {
  const basisDay = (): GridDay => ({
    id: 'd1', dayNumber: 1, title: 'Aswan', city: 'Aswan', description: '',
    slots: [
      { slotId: 'airport_services', selectedItems: [{ ...item('a1', 'ASW meet & assist', 30), pricingBasis: 'per_person' }] },
      { slotId: 'hotel_services', selectedItems: [{ ...item('h1', 'Porterage', 5), pricingBasis: 'per_unit', unitCapacity: 2 }] },
      { slotId: 'experiences', selectedItems: [{ ...item('x1', 'Private felucca', 40), pricingBasis: 'flat' }] },
    ],
  } as unknown as GridDay)

  it('quantity and total follow the basis; the itinerary total matches the calculator', async () => {
    await save(true, [basisDay()])
    const rows = (inserted.itinerary_services ?? []).map(s => [s.service_name, s.quantity, s.total_cost])
    expect(rows).toEqual([
      ['ASW meet & assist', 2, 60],
      ['Porterage', 1, 5],
      ['Private felucca', 1, 40],
    ])
    const priced = calculateDay(basisDay(), config(true))
    expect(priced.dailyTotal).toBe(105)
    expect(Number(inserted.itineraries?.[0]?.total_cost)).toBeCloseTo(105 * 1.3, 2)
  })
})

// The single supplement is sold only to a party of one (single-supplement.ts).
// The save used to write it for every party, × pax: a 2-pax trip stored a
// supplement line the quote never charged.
describe('the grid saves the single supplement only for a party of one', () => {
  const hotelDay = (): GridDay => ({
    id: 'd1', dayNumber: 1, title: 'Cairo', city: 'Cairo', description: '',
    slots: [
      { slotId: 'accommodation', selectedItems: [item('mena', 'Mena House', 100), item('mena_supp', 'Single Supplement', 60)] },
    ],
  } as unknown as GridDay)

  async function saveAt(pax: number) {
    for (const k of Object.keys(inserted)) delete inserted[k]
    const { POST } = await import('@/app/api/pricing-grid/save/route')
    await POST(new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ config: { ...config(true), pax }, days: [hotelDay()], totals: {} }),
    }) as never)
    return (inserted.itinerary_services ?? []).map(s => [s.service_name, s.quantity, s.total_cost])
  }

  it('2 pax: only the double rate is saved, and the total matches the calculator', async () => {
    expect(await saveAt(2)).toEqual([['Mena House', 2, 200]])
    const priced = calculateDay(hotelDay(), { ...config(true), pax: 2 })
    expect(priced.dailyTotal).toBe(200)
    expect(Number(inserted.itineraries?.[0]?.total_cost)).toBeCloseTo(200 * 1.3, 2)
  })

  it('1 pax: the supplement is saved and charged', async () => {
    expect(await saveAt(1)).toEqual([['Mena House', 1, 100], ['Single Supplement', 1, 60]])
    const priced = calculateDay(hotelDay(), { ...config(true), pax: 1 })
    expect(priced.dailyTotal).toBe(160)
    expect(Number(inserted.itineraries?.[0]?.total_cost)).toBeCloseTo(160 * 1.3, 2)
  })
})

// A typed accommodation amount (a legacy saved row, an old draft) is per
// person and wins over a picked hotel, as in every other slot. The on-screen
// price used to ignore it while the B2B sheet and the save counted it.
describe('a typed accommodation amount: the price, the B2B sheet and the save agree', () => {
  const amountDay = (items: ReturnType<typeof item>[] = []): GridDay => ({
    id: 'd1', dayNumber: 1, title: 'Cairo', city: 'Cairo', description: '',
    slots: [{ slotId: 'accommodation', selectedItems: items, customAmount: 90 }],
  } as unknown as GridDay)

  for (const [label, items] of [['alone', []], ['beside a picked hotel', [item('mena', 'Mena House', 100)]]] as const) {
    it(label, async () => {
      const d = amountDay([...items])
      expect(calculateDay(d, config(true)).dailyTotal).toBe(180)
      const sheet = calculatePaxRange([d], { ...config(true), marginPercent: 0 }, new Map(), { paxFrom: 2, paxTo: 2 })
      expect(sheet.paxPricing[0].withoutLeader.totalCost).toBe(180)
      await save(true, [d])
      expect((inserted.itinerary_services ?? []).map(s => [s.quantity, s.total_cost])).toEqual([[2, 180]])
      expect(Number(inserted.itineraries?.[0]?.total_cost)).toBeCloseTo(180 * 1.3, 2)
    })
  }
})
