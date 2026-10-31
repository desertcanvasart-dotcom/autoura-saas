// Rate reads see every row, not PostgREST's first 1000, and a failed read is
// an error — never "no rates". The rows a table under one page returns are
// exactly today's, in today's order (no order is added to a short read).
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setMockTables, setMockMaxRows, createMockClient } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { fetchEveryRow, RowReadError } from '@/lib/db/fetch-all-pages'
import { loadTippingRows, buildTransportCache } from '@/lib/auto-pricing-service'
import { loadGridRates } from '@/lib/pricing/grid-rates'

// A scripted query: records every .order/.range it is given and pages
// `rows` as PostgREST would (an unordered read in the table's own order).
function scripted(rows: Array<{ id: number }>, calls: string[], failAt?: number) {
  return () => {
    let ordered = rows
    const q = {
      order(col: string) {
        calls.push(`order:${col}`)
        ordered = [...rows].sort((a, b) => a.id - b.id)
        return q
      },
      range(from: number, to: number) {
        calls.push(`range:${from}-${to}`)
        if (failAt === from) return Promise.resolve({ data: null, error: { message: 'boom' } })
        return Promise.resolve({ data: ordered.slice(from, to + 1), error: null })
      },
    }
    return q
  }
}

describe('fetchEveryRow', () => {
  it('a table under one page: one read, no order added, rows in the order they came', async () => {
    const rows = [{ id: 3 }, { id: 1 }, { id: 2 }]
    const calls: string[] = []
    const got = await fetchEveryRow('t', scripted(rows, calls), { pageSize: 5 })
    expect(got).toEqual(rows)
    expect(calls).toEqual(['range:0-4'])
  })

  it('past the first page: every row is read, paged on id', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: 12 - i }))
    const calls: string[] = []
    const got = await fetchEveryRow('t', scripted(rows, calls), { pageSize: 5 })
    expect(got).toHaveLength(12)
    expect(got.map(r => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(calls).toEqual(['range:0-4', 'order:id', 'range:0-4', 'order:id', 'range:5-9', 'order:id', 'range:10-14'])
  })

  it('a failed read throws — it is not an empty list', async () => {
    await expect(fetchEveryRow('tipping_rates', scripted([{ id: 1 }], [], 0), { pageSize: 5 }))
      .rejects.toThrow(/Could not read tipping_rates: boom/)
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }))
    await expect(fetchEveryRow('t', scripted(rows, [], 5), { pageSize: 5 })).rejects.toBeInstanceOf(RowReadError)
  })
})

// The engine and the grid over a table larger than PostgREST's 1000 cap.
const BIG = 2500
const scope = { tenantId: 'test-tenant' } as never

describe('pricing reads beyond 1000 rows', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    // Every response stops at 1000 rows, as Supabase's does.
    setMockMaxRows(1000)
  })
  afterAll(() => setMockMaxRows(null))
  it('the engine prices tips from all 2,500 tipping rows', async () => {
    setMockTables({
      tipping_rates: Array.from({ length: BIG }, (_, i) => ({
        id: `tip-${String(i).padStart(5, '0')}`, tenant_id: 'test-tenant', is_active: true,
        role_type: 'driver', context: `ctx_${i}`, rate_unit: 'per_day', rate_eur: 1, rate_currency: null, city: null,
      })),
    })
    expect(await loadTippingRows(scope)).toHaveLength(BIG)
  })

  it('the engine transport cache holds the row past 1000', async () => {
    setMockTables({
      transportation_rates: Array.from({ length: BIG }, (_, i) => ({
        id: `tr-${String(i).padStart(5, '0')}`, tenant_id: 'test-tenant', is_active: true,
        service_type: 'airport_transfer', city: `City${i}`, duration: null, area: null,
        vehicle_type: 'sedan', base_rate_eur: 10, rate_currency: null,
      })),
    })
    const cache = await buildTransportCache(scope)
    expect([...cache.keys()].some(k => k.includes('city2499'))).toBe(true)
  })

  it('the pricing grid offers the tipping row past 1000', async () => {
    setMockTables({
      tipping_rates: Array.from({ length: BIG }, (_, i) => ({
        id: `tip-${String(i).padStart(5, '0')}`, tenant_id: 'test-tenant', is_active: true,
        role_type: 'driver', context: `ctx_${i}`, rate_unit: 'per_day', rate_eur: 1, rate_currency: null, city: null,
      })),
    })
    const rates = await loadGridRates(createMockClient(), 'test-tenant', { tier: 'standard' })
    const tipIds = (rates.tipping ?? []).map((o: { id?: string }) => String(o.id))
    expect(tipIds.length).toBe(BIG)
    expect(tipIds.some(id => id.includes('tip-02499'))).toBe(true)
  })
})
