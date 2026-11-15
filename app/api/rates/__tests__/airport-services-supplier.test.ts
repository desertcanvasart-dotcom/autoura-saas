import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Airport services: a rate with no supplier must save.
//
// The form sends supplier_id '' when no supplier is picked. supplier_id is a
// uuid column, and Postgres refuses '' ("invalid input syntax for type uuid"),
// so editing — or adding — any airport rate without a supplier failed with
// that message (Travel2Egypt, 2026-11-15). Every other rate page already saves
// "no supplier" as null; these two routes now do too.
// ============================================================================

type Row = Record<string, unknown>
const TENANT = 'tenant-mine'
const writes: Array<{ op: 'insert' | 'update'; row: Row }> = []

function from() {
  const b: Record<string, unknown> = {
    insert: (rows: Row[]) => { writes.push({ op: 'insert', row: rows[0] }); return b },
    update: (row: Row) => { writes.push({ op: 'update', row }); return b },
    eq: () => b, select: () => b,
    single: async () => ({ data: writes[writes.length - 1]?.row ?? null, error: null }),
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, role: 'owner', tenant_id: TENANT, supabase: { from } }),
  createAuthenticatedClient: async () => ({ from }),
}))

const { POST } = await import('../airport-services/route')
const { PUT } = await import('../airport-services/[id]/route')

const form = (over: Row = {}) => ({
  service_code: 'AIR-CAI-MEETGR-ARR', airport_code: 'CAI', service_type: 'meet_greet', direction: 'both',
  rate_eur: 700, description: '', notes: '', is_active: true, supplier_id: '', supplier_name: '',
  pricing_type: 'flat', max_capacity: '', ...over,
})
const req = (body: Row) => new Request('http://x/api/rates/airport-services', { method: 'POST', body: JSON.stringify(body) }) as never

beforeEach(() => { writes.length = 0 })

describe('an airport rate with no supplier', () => {
  it('is edited with supplier_id null, not the empty string Postgres refuses', async () => {
    const res = await PUT(req(form()), { params: Promise.resolve({ id: 'r1' }) })
    expect((await res.json()).success).toBe(true)
    expect(writes[0]).toMatchObject({ op: 'update', row: { supplier_id: null, service_type: 'meet_greet' } })
  })
  it('is created with supplier_id null', async () => {
    const res = await POST(req(form()))
    expect((await res.json()).success).toBe(true)
    expect(writes[0]).toMatchObject({ op: 'insert', row: { supplier_id: null, tenant_id: TENANT } })
  })
  it('keeps a picked supplier, and an edit that does not mention one leaves it alone', async () => {
    await PUT(req(form({ supplier_id: 'sup-1' })), { params: Promise.resolve({ id: 'r1' }) })
    expect(writes[0].row.supplier_id).toBe('sup-1')
    const noSupplier = form(); delete noSupplier.supplier_id
    await PUT(req(noSupplier), { params: Promise.resolve({ id: 'r1' }) })
    expect('supplier_id' in writes[1].row).toBe(false)
  })
})
