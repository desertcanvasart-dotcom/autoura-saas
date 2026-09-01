import { describe, it, expect, vi, beforeEach } from 'vitest'

// The tour-create form double-fires ~1.4s apart in the wild (confirmed twice in
// production: two identical templates 1.43s apart, once before a client-side
// submit guard shipped and once after — the two calls are seconds apart, so a
// same-tick ref guard can't see them). The server is therefore the backstop:
// a create that matches one this tenant just made returns the existing row
// instead of a twin, and the variations batch skips (template_id, tier) pairs
// that already exist.

const mockAuth = vi.fn()
vi.mock('@/lib/supabase-server', () => ({ requireAuth: () => mockAuth() }))

type Row = Record<string, unknown>
type Result = { data: unknown; error: null }

/** Minimal chainable supabase stub driven by a per-table row set. */
function makeSupabase(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[]> = {}
  const from = (table: string) => {
    const rows = [...(tables[table] ?? [])]
    const filters: ((r: Row) => boolean)[] = []
    const apply = () => rows.filter(r => filters.every(f => f(r)))
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return chain },
      gte: (col: string, val: unknown) => { filters.push(r => (r[col] as string) >= (val as string)); return chain },
      in: (col: string, vals: unknown[]) => { filters.push(r => vals.includes(r[col])); return chain },
      order: () => chain,
      limit: () => chain,
      maybeSingle: (): Promise<Result> => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      single: (): Promise<Result> => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      then: (res: (r: Result) => unknown) => Promise.resolve({ data: apply(), error: null }).then(res),
      insert: (payload: Row | Row[]) => {
        const arr = Array.isArray(payload) ? payload : [payload]
        inserted[table] = [...(inserted[table] ?? []), ...arr]
        const withId = arr.map((r, i) => ({ id: `new-${table}-${i}`, ...r }))
        return {
          select: () => ({
            single: (): Promise<Result> => Promise.resolve({ data: withId[0], error: null }),
            then: (res: (r: Result) => unknown) => Promise.resolve({ data: withId, error: null }).then(res),
          }),
        }
      },
    }
    return chain
  }
  return { inserted, from }
}

const TENANT = 'tenant-1'
const NOW = new Date().toISOString()

const post = async (mod: string, body: unknown, sb: ReturnType<typeof makeSupabase>) => {
  mockAuth.mockResolvedValue({ error: null, supabase: sb, tenant_id: TENANT })
  const { POST } = await import(mod)
  const req = new Request('http://t' + mod, { method: 'POST', body: JSON.stringify(body) })
  return (await POST(req as unknown as Request & { json: () => Promise<unknown> })).json()
}

beforeEach(() => vi.clearAllMocks())

describe('tour template create idempotency', () => {
  it('returns the existing template when an identical one was just created', async () => {
    const sb = makeSupabase({
      tour_templates: [{ id: 'tmpl-1', tenant_id: TENANT, template_name: 'Memphis Day Trip', tour_type: 'day_tour', created_at: NOW }],
    })
    const json = await post('../templates/route', { template_name: 'Memphis Day Trip', tour_type: 'day_tour', duration_days: 1 }, sb)
    expect(json).toMatchObject({ success: true, deduplicated: true, data: { id: 'tmpl-1' } })
    expect(sb.inserted.tour_templates).toBeUndefined()
  })

  it('inserts normally when there is no recent twin', async () => {
    const sb = makeSupabase({ tour_templates: [] })
    const json = await post('../templates/route', { template_name: 'Brand New Tour', tour_type: 'day_tour', duration_days: 1 }, sb)
    expect(json).toMatchObject({ success: true })
    expect(json.deduplicated).toBeUndefined()
    expect(sb.inserted.tour_templates).toHaveLength(1)
  })
})

describe('tour variations create idempotency', () => {
  it('skips a (template_id, tier) pair that already exists', async () => {
    const sb = makeSupabase({
      tour_templates: [{ id: 'tmpl-1', tenant_id: TENANT }],
      tour_variations: [{ id: 'var-1', template_id: 'tmpl-1', tier: 'standard', variation_name: 'X - Standard' }],
    })
    const json = await post('../variations/route', [{ template_id: 'tmpl-1', tier: 'standard', variation_name: 'X - Standard' }], sb)
    expect(json).toMatchObject({ success: true, deduplicated: true })
    expect(sb.inserted.tour_variations).toBeUndefined()
  })

  it('inserts a genuinely new tier for the same template', async () => {
    const sb = makeSupabase({
      tour_templates: [{ id: 'tmpl-1', tenant_id: TENANT }],
      tour_variations: [{ id: 'var-1', template_id: 'tmpl-1', tier: 'standard' }],
    })
    const json = await post('../variations/route', [{ template_id: 'tmpl-1', tier: 'luxury', variation_name: 'X - Luxury' }], sb)
    expect(json).toMatchObject({ success: true })
    expect(sb.inserted.tour_variations).toHaveLength(1)
    expect(sb.inserted.tour_variations[0].tier).toBe('luxury')
  })
})
