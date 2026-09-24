import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// /api/guides/[id] must read the SAME source as the /api/guides list.
//
// The list serves guides from `suppliers` (supplier_type='guide'), and every
// guide picker stores that suppliers id (itinerary_resources.resource_id →
// itineraries.assigned_guide_id). The single-guide route read the legacy
// `guides` table, so a picked guide 404'd on the itinerary page — seen live
// 2026-09-24 for a guide that exists only in suppliers — and the resources
// page's Delete could never find the row it listed.
// ============================================================================

type Row = Record<string, unknown>
let db: Record<string, Row[]>
const deleted: Array<{ table: string; filters: Record<string, unknown> }> = []
const updated: Array<{ table: string; patch: Row }> = []

// A tiny PostgREST stand-in: every .eq() is a real filter over the table's
// rows, so a missing tenant/type filter shows up as a wrong result.
function query(table: string) {
  const filters: Record<string, unknown> = {}
  let op: 'select' | 'update' | 'delete' = 'select'
  let patch: Row = {}
  let head = false
  const rows = () => (db[table] ?? []).filter(r =>
    Object.entries(filters).every(([k, v]) => r[k] === v))
  const run = () => {
    if (op === 'delete') {
      deleted.push({ table, filters: { ...filters } })
      const gone = new Set(rows())
      db[table] = (db[table] ?? []).filter(r => !gone.has(r))
      return { data: null, error: null }
    }
    if (op === 'update') {
      updated.push({ table, patch })
      const hit = rows()
      hit.forEach(r => Object.assign(r, patch))
      return { data: hit, error: null }
    }
    const hit = rows()
    return head ? { count: hit.length, data: null, error: null } : { data: hit, error: null }
  }
  const q: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q },
    update: (p: Row) => { op = 'update'; patch = p; return q },
    delete: () => { op = 'delete'; return q },
    eq: (k: string, v: unknown) => { filters[k] = v; return q },
    order: () => q,
    maybeSingle: async () => {
      const r = run() as { data: Row[] | null; error: null }
      return { data: r.data?.[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(run()).then(resolve, reject),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, tenant_id: 'tenant-A', user: { id: 'u1' } }),
  createAdminClient: () => ({ from: (t: string) => query(t) }),
}))

import { GET, PUT, DELETE } from '@/app/api/guides/[id]/route'
import { GET as LIST } from '@/app/api/guides/route'

const MAGDE = 'd4cccc26-a1d3-4fd2-8d86-e8f1613d56ee'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method = 'GET', body?: unknown) =>
  new Request(`https://app.test/api/guides/x`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never

beforeEach(() => {
  deleted.length = 0
  updated.length = 0
  db = {
    suppliers: [
      {
        id: MAGDE, tenant_id: 'tenant-A', supplier_type: 'guide', type: 'guide',
        name: 'Magde Takla (Alexandria)', company_name: 'Magde Takla (Alexandria)',
        contact_phone: '+20 100 000 0001', phone: '+20 3 000 0000', whatsapp: null, phone2: null,
        contact_email: 'magde@example.test', email: 'office@example.test',
        city: 'Alexandria', languages: ['English', 'German'], status: 'active', is_active: null,
        notes: null,
      },
      // same id space, another tenant — must never leak
      { id: 'other-tenant-guide', tenant_id: 'tenant-B', supplier_type: 'guide', name: 'Not yours', status: 'active' },
      // a hotel supplier is not a guide
      { id: 'hotel-1', tenant_id: 'tenant-A', supplier_type: 'hotel', name: 'Some Hotel', status: 'active' },
    ],
    guides: [
      { id: 'legacy-guide', tenant_id: 'tenant-A', name: 'Old Guide', phone: '+20 1', languages: ['French'] },
    ],
    itineraries: [],
    itinerary_resources: [],
  }
})

describe('GET /api/guides/[id]', () => {
  it('finds a guide that exists only in suppliers (the live 404)', async () => {
    const res = await GET(req(), ctx(MAGDE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Magde Takla (Alexandria)')
    expect(body.data.languages).toEqual(['English', 'German'])
  })

  it('returns exactly the shape the list returns for the same guide', async () => {
    const list = await (await LIST({ nextUrl: new URL('https://app.test/api/guides') } as never)).json()
    const fromList = list.data.find((g: Row) => g.id === MAGDE)
    const { bookings, ...one } = (await (await GET(req(), ctx(MAGDE))).json()).data
    expect(bookings).toEqual([])
    expect(one).toEqual(fromList)
    // guide-facing fields beat the raw supplier columns of the same name
    expect(one.phone).toBe('+20 100 000 0001')
    expect(one.email).toBe('magde@example.test')
    expect(one.is_active).toBe(true)
  })

  it('does not serve another tenant’s guide or a non-guide supplier', async () => {
    expect((await GET(req(), ctx('other-tenant-guide'))).status).toBe(404)
    expect((await GET(req(), ctx('hotel-1'))).status).toBe(404)
  })

  it('still resolves an old assignment that points at the legacy guides table', async () => {
    const res = await GET(req(), ctx('legacy-guide'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ name: 'Old Guide', legacy: true })
  })
})

describe('PUT /api/guides/[id]', () => {
  it('writes the supplier columns the list reads back', async () => {
    const res = await PUT(req('PUT', { phone: '+20 111', is_active: false, name: 'Magde T.', daily_rate: 50 }), ctx(MAGDE))
    expect(res.status).toBe(200)
    expect(updated).toEqual([{
      table: 'suppliers',
      patch: { contact_phone: '+20 111', status: 'inactive', name: 'Magde T.', company_name: 'Magde T.' },
    }])
    const data = (await res.json()).data
    expect(data).toMatchObject({ phone: '+20 111', is_active: false, name: 'Magde T.' })
  })

  it('404s another tenant’s guide without touching it', async () => {
    const res = await PUT(req('PUT', { name: 'hijack' }), ctx('other-tenant-guide'))
    expect(res.status).toBe(404)
    expect(db.suppliers.find(r => r.id === 'other-tenant-guide')!.name).toBe('Not yours')
  })
})

describe('DELETE /api/guides/[id]', () => {
  it('deletes the suppliers row the resources page listed', async () => {
    const res = await DELETE(req('DELETE'), ctx(MAGDE))
    expect(res.status).toBe(200)
    expect(deleted).toEqual([{
      table: 'suppliers',
      filters: { id: MAGDE, supplier_type: 'guide', tenant_id: 'tenant-A' },
    }])
    expect(db.suppliers.some(r => r.id === MAGDE)).toBe(false)
  })

  it('refuses while any itinerary still has the guide assigned', async () => {
    db.itinerary_resources.push({
      id: 'r1', tenant_id: 'tenant-A', resource_type: 'guide', resource_id: MAGDE, status: 'pending',
    })
    const res = await DELETE(req('DELETE'), ctx(MAGDE))
    expect(res.status).toBe(409)
    expect(deleted).toHaveLength(0)
  })

  it('404s a guide from another tenant or a non-guide supplier', async () => {
    expect((await DELETE(req('DELETE'), ctx('other-tenant-guide'))).status).toBe(404)
    expect((await DELETE(req('DELETE'), ctx('hotel-1'))).status).toBe(404)
    expect(deleted).toHaveLength(0)
  })
})
