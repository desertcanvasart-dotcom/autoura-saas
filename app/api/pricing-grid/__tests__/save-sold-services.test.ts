import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GridConfig, GridDay } from '@/app/pricing-grid/types'
import { calculateDay } from '@/app/pricing-grid/lib/calculator'
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
let seq = 0

function table(name: string) {
  let payload: Row | Row[] | null = null
  const chain = {
    insert(p: Row | Row[]) { payload = p; return chain },
    update() { return chain },
    delete() { return chain },
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
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: { from: table } }),
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

async function save(withGuide: boolean) {
  for (const k of Object.keys(inserted)) delete inserted[k]
  const { POST } = await import('@/app/api/pricing-grid/save/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ config: config(withGuide), days: [day()], totals: {} }),
  }) as never)
  return res.json()
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

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

  it('every service names its day in BOTH columns and leaves client_price empty', async () => {
    await save(true)
    const dayId = inserted.itinerary_days?.[0]?.id
    expect(dayId).toBeTruthy()
    for (const s of inserted.itinerary_services ?? []) {
      expect(s.day_id).toBe(dayId)
      expect(s.itinerary_day_id).toBe(dayId)
      expect(s.client_price).toBeNull()
    }
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
