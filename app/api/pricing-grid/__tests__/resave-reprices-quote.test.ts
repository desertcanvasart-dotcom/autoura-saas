import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Re-saving an itinerary from the Pricing Grid ("Update Itinerary").
// Live 2026-09-30: water added and saved, "price never changed". The save DID
// reprice the itinerary — but it also inserted a NEW draft B2C quote every
// time, so the quote the operator was working from kept the old price, and
// it stamped a fresh random ITN code (and status 'draft') over the
// itinerary on every save.
// ============================================================================

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let seq = 0
const adminRpc = vi.fn(async (fn: string, _args?: Row) => ({ data: fn === 'generate_b2c_quote_number' ? `Q-NEW-${++seq}` : null, error: null }))

interface Query {
  select: (columns?: string) => Query
  insert: (rows: Row | Row[]) => Query
  update: (patch: Row) => Query
  eq: (column: string, value: unknown) => Query
  in: (column: string, values: unknown[]) => Query
  is: (column: string, value: unknown) => Query
  ilike: (column: string, value: unknown) => Query
  order: (column: string, opts?: { ascending?: boolean }) => Query
  limit: (n: number) => Query
  single: () => Promise<{ data: Row | null; error: null }>
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  then: <T>(resolve: (r: { data: Row[]; error: null }) => T, reject?: (e: unknown) => T) => Promise<T>
}

function from(name: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row[] = []
  let patch: Row = {}
  let desc = false
  let max = Infinity
  const filters: Array<(r: Row) => boolean> = []
  const run = (): Row[] => {
    const all = (tables[name] ??= [])
    if (op === 'insert') {
      const rows = payload.map(r => ({ id: `${name}-${++seq}`, created_at: String(seq).padStart(4, '0'), ...r }))
      all.push(...rows)
      return rows
    }
    let rows = all.filter(r => filters.every(f => f(r)))
    if (op === 'update') rows.forEach(r => Object.assign(r, patch))
    if (desc) rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return rows.slice(0, max).map(r => ({ ...r }))
  }
  const q: Query = {
    select: () => q,
    insert: rows => ((op = 'insert'), (payload = Array.isArray(rows) ? rows : [rows]), q),
    update: p => ((op = 'update'), (patch = p), q),
    eq: (c, v) => (filters.push(r => r[c] === v), q),
    in: (c, vs) => (filters.push(r => vs.includes(r[c])), q),
    is: () => q,
    ilike: () => q,
    order: (_c, opts) => ((desc = opts?.ascending === false), q),
    limit: n => ((max = n), q),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res, rej) => Promise.resolve({ data: run(), error: null as null }).then(res, rej),
  }
  return q
}

async function rpc() {
  return { data: [{ days_inserted: 1, services_inserted: 1 }], error: null }
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: { from, rpc } }),
  createAdminClient: () => ({ rpc: adminRpc, from }),
}))
vi.mock('@/lib/grid-client-link', () => ({
  resolveGridClient: async () => ({ clientId: null, how: 'none' }),
}))

const water = (days = 1) => Array.from({ length: days }, (_, i) => ({
  id: `d${i + 1}`, dayNumber: i + 1, title: 'Cairo', city: 'Cairo', description: '',
  slots: [
    { slotId: 'entrance_fees', selectedItems: [{ rateId: 'e1', name: 'Pyramids', rateEur: 10, rateNonEur: 10 }], customAmount: 0 },
    { slotId: 'water', selectedItems: [{ rateId: 'water-standard', name: 'Water', rateEur: 2, rateNonEur: 2 }], customAmount: 0 },
  ],
}))

async function save(config: Row, days = water()) {
  const { POST } = await import('@/app/api/pricing-grid/save/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({
      config: {
        clientType: 'b2c', pax: 2, passport: 'eu', withGuide: true, marginPercent: 25, currency: 'EUR',
        startDate: '2026-11-01', clientName: 'Smith', tourName: 'Cairo', tier: 'standard', ...config,
      },
      days,
      totals: {},
    }),
  }) as never)
  return { status: res.status, ...(await res.json()) }
}

beforeEach(() => {
  seq = 100
  adminRpc.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  tables = {
    itineraries: [{
      id: 'it1', tenant_id: 't1', itinerary_code: 'ITN-S-2026-6476', status: 'confirmed',
      notes: 'Client asked for a quiet hotel', trip_name: 'Cairo Classic', total_cost: 30,
    }],
    b2c_quotes: [
      { id: 'q-old', itinerary_id: 'it1', quote_number: 'Q-1', status: 'rejected', selling_price: 10, created_at: '0001' },
      { id: 'q1', itinerary_id: 'it1', quote_number: 'Q-2', status: 'sent', selling_price: 30, created_at: '0002' },
    ],
  }
})

const itinerary = () => tables.itineraries[0]
const quote = (id: string) => tables.b2c_quotes.find(q => q.id === id)!

describe('Update Itinerary from the Pricing Grid', () => {
  it("reprices the itinerary's open quote instead of adding a new one", async () => {
    // (Pyramids 10 + water 2) × 2 pax = 24 cost → 30 at 25%; two days → 60.
    const body = await save({ itineraryId: 'it1' }, water(2))
    expect(body.success).toBe(true)
    expect(body.quoteAction).toBe('updated')
    expect(body).toMatchObject({ quoteId: 'q1', quoteNumber: 'Q-2', previousSellingTotal: 30, sellingTotal: 60 })
    expect(tables.b2c_quotes).toHaveLength(2)
    expect(quote('q1')).toMatchObject({ selling_price: 60, total_cost: 48, price_per_person: 30, margin_percent: 25, num_travelers: 2 })
    // The closed quote is left alone.
    expect(quote('q-old').selling_price).toBe(10)
  })

  it('records a version of the repriced quote', async () => {
    await save({ itineraryId: 'it1' })
    expect(adminRpc).toHaveBeenCalledWith('create_b2c_quote_version', {
      p_quote_id: 'q1', p_changed_by: 'u1', p_change_reason: 'Repriced from the Pricing Grid',
    })
    expect(adminRpc).not.toHaveBeenCalledWith('generate_b2c_quote_number')
  })

  it("keeps the itinerary's code, status and notes", async () => {
    const body = await save({ itineraryId: 'it1' })
    expect(body.itineraryCode).toBe('ITN-S-2026-6476')
    expect(itinerary()).toMatchObject({
      itinerary_code: 'ITN-S-2026-6476', status: 'confirmed', notes: 'Client asked for a quiet hotel',
      trip_name: 'Cairo', total_cost: 30,
    })
  })

  it('an accepted quote keeps its agreed price — the new price goes on a new draft', async () => {
    quote('q1').status = 'accepted'
    const body = await save({ itineraryId: 'it1' }, water(2))
    expect(body.quoteAction).toBe('created')
    expect(quote('q1').selling_price).toBe(30)
    const created = tables.b2c_quotes.find(q => q.id === body.quoteId)!
    expect(created).toMatchObject({ itinerary_id: 'it1', status: 'draft', selling_price: 60 })
  })

  it('a first save creates the itinerary and its quote', async () => {
    const body = await save({})
    expect(body.quoteAction).toBe('created')
    expect(body.itineraryCode).toMatch(/^ITN-S-\d{4}-\d{4}$/)
    expect(tables.b2c_quotes.filter(q => q.itinerary_id === body.itineraryId)).toHaveLength(1)
  })
})
