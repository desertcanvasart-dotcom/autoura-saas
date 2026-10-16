import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, role: 'member', supabase: { from, rpc } }),
  createAdminClient: () => ({ rpc: adminRpc, from }),
}))
// No rates on file: each pick keeps the price it carries.
vi.mock('@/lib/pricing/grid-rates', () => ({ loadGridRates: async () => ({}) }))
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
    }),
  }) as never)
  return { status: res.status, ...(await res.json()) }
}


beforeEach(async () => {
  seq = 100
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { clearRunCurrencyCache } = await import('@/lib/rates/run-currency')
  clearRunCurrencyCache()
  tables = { tenants: [{ id: 't1', rates_currency: null }], itineraries: [], b2c_quotes: [] }
})

// The grid prices in the tenant's run currency; its Currency picker is a
// display choice. A EUR 2,500 trip shown in USD was saved as "USD 2,500".
describe('Pricing Grid save — the currency the amounts are in', () => {
  it('labels the itinerary and the B2C quote with the run currency, not the display currency', async () => {
    const r = await save({ currency: 'USD' })
    expect(r.success).toBe(true)
    expect(r.currency).toBe('EUR')
    const itn = tables.itineraries[0]
    expect(itn.currency).toBe('EUR')
    // pax 2 × (10 + 2) = 24, +25% = 30 — the EUR figure, unconverted.
    expect(itn.selling_price).toBe(30)
    expect(tables.b2c_quotes[0].currency).toBe('EUR')
    expect(tables.b2c_quotes[0].selling_price).toBe(30)
  })

  it('a tenant whose rates are in another currency saves in that one', async () => {
    tables.tenants[0].rates_currency = 'GBP'
    const r = await save({ currency: 'EUR' })
    expect(r.currency).toBe('GBP')
    expect(tables.itineraries[0].currency).toBe('GBP')
    expect(tables.b2c_quotes[0].currency).toBe('GBP')
  })
})
