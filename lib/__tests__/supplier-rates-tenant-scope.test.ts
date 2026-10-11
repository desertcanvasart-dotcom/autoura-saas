import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/supplier-rates reads with the admin client (no row security): every
// table it touches must be filtered to the caller's company. vehicle_rates,
// seasonal_rates and assistant_rates were read with no filter at all — they
// do not exist, so nothing leaked, but a table added to the map was read
// across every company.

const reads: { table: string; filters: Record<string, unknown> }[] = []

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, role: 'admin', supabase: {} }),
  createAdminClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters[c] = v; return q },
        order: async () => { reads.push({ table, filters: { ...filters } }); return { data: [], error: null } },
      }
      return q
    },
  }),
}))

import { GET } from '@/app/api/supplier-rates/route'

const get = (qs: string) => GET(new NextRequest(`http://x/api/supplier-rates?${qs}`))

beforeEach(() => { reads.length = 0 })

describe('supplier rates', () => {
  it('every table read is filtered to the caller’s company', async () => {
    expect((await get('supplier_id=s1')).status).toBe(200)
    expect(reads.length).toBeGreaterThan(0)
    for (const r of reads) expect(r.filters, r.table).toEqual({ supplier_id: 's1', tenant_id: 't1' })
  })

  it('the tables that do not exist are no longer queried', async () => {
    await get('supplier_id=s1')
    const tables = reads.map(r => r.table)
    for (const t of ['vehicle_rates', 'seasonal_rates', 'assistant_rates']) expect(tables).not.toContain(t)
  })

  it('a supplier type still reads its own tables', async () => {
    await get('supplier_id=s1&supplier_type=hotel')
    expect(reads.map(r => r.table)).toEqual(['accommodation_rates'])
    reads.length = 0
    await get('supplier_id=s1&supplier_type=ground_handler')
    expect(reads.map(r => r.table).sort()).toEqual(['airport_staff_rates', 'hotel_staff_rates'])
  })
})
