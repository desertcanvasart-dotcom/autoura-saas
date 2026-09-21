import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// /api/attraction-aliases — an agency's own attraction names.
//
// Aliases became per-agency in migration 370, which makes this API the only
// door through which one is ever written. The contract under test:
//   * the tenant is the CALLER's, from the session — a poisoned body cannot
//     file an alias under another agency, and every read and write is filtered
//     by that tenant even though RLS would do it too
//   * only an owner or an admin writes; a refusal says who can
//   * an alias into thin air — the fault the old global rows had — is refused
//   * a delete that removed nothing is a 404, not a quiet success
// ============================================================================

type Row = Record<string, unknown>
const TENANT = 'tenant-mine'
let auth: Row
let tables: Record<string, Row[]>
const writes: Array<{ table: string; op: string; row?: Row; filters: Array<[string, unknown]> }> = []

/** A thenable PostgREST-ish builder over `tables`, recording every write. */
function from(table: string) {
  const filters: Array<[string, unknown]> = []
  let op = 'select'
  let payload: Row | undefined
  const rows = () => (tables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))
  const run = () => {
    if (op === 'insert') {
      const row = { id: `new-${writes.length}`, is_active: true, ...payload }
      writes.push({ table, op, row: payload, filters })
      tables[table] = [...(tables[table] ?? []), row]
      return { data: [row], error: null }
    }
    if (op === 'update') {
      writes.push({ table, op, row: payload, filters })
      const hit = rows(); hit.forEach(r => Object.assign(r, payload))
      return { data: hit, error: null }
    }
    if (op === 'delete') {
      writes.push({ table, op, filters })
      const hit = rows(); tables[table] = (tables[table] ?? []).filter(r => !hit.includes(r))
      return { data: hit, error: null }
    }
    return { data: rows(), error: null }
  }
  const b: Record<string, unknown> = {
    select: () => b, order: () => b,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return b },
    insert: (row: Row) => { op = 'insert'; payload = row; return b },
    update: (row: Row) => { op = 'update'; payload = row; return b },
    delete: () => { op = 'delete'; return b },
    single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.data[0] ? null : { code: 'PGRST116', message: 'no rows' } } },
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({ requireAuth: async () => auth }))

import { GET, POST } from '@/app/api/attraction-aliases/route'
import { PATCH, DELETE } from '@/app/api/attraction-aliases/[id]/route'

const req = (body?: unknown) => new Request('http://x/api/attraction-aliases', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }) as never
const at = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  writes.length = 0
  auth = { error: null, status: 200, supabase: { from }, tenant_id: TENANT, role: 'owner' }
  tables = {
    entrance_fees: [
      { tenant_id: TENANT, attraction_name: 'Valley Of Kings', city: 'Luxor', is_active: true },
      { tenant_id: TENANT, attraction_name: 'Salah Eldin Citadel', city: 'Cairo', is_active: true },
      { tenant_id: 'tenant-other', attraction_name: 'Their Secret Temple', city: 'Luxor', is_active: true },
    ],
    attraction_aliases: [
      { id: 'a1', tenant_id: TENANT, alias: 'Citadel', canonical: 'Salah Eldin Citadel', is_active: true },
      { id: 'a2', tenant_id: TENANT, alias: 'Old one', canonical: 'Citadel of Saladin', is_active: true },
      { id: 'theirs', tenant_id: 'tenant-other', alias: 'Secret', canonical: 'Their Secret Temple', is_active: true },
    ],
    tour_templates: [
      { tenant_id: TENANT, template_name: 'Luxor Day', is_active: true, itinerary: [{ attractions: ['Valley of the Kings', 'Citadel'] }] },
      { tenant_id: 'tenant-other', template_name: 'Theirs', is_active: true, itinerary: [{ attractions: ['Something of theirs'] }] },
    ],
  }
})

describe('GET — one call feeds the screen', () => {
  it('returns only this agency\'s aliases, fees and tour wordings', async () => {
    const json = await (await GET()).json()
    expect(json.data.aliases.map((a: Row) => a.id)).toEqual(['a1', 'a2'])
    expect(json.data.fees.map((f: Row) => f.attraction_name)).toEqual(['Valley Of Kings', 'Salah Eldin Citadel'])
    expect(JSON.stringify(json)).not.toMatch(/Secret|Theirs|Something of theirs/)
  })

  it('says which aliases no longer reach a fee', async () => {
    const { data } = await (await GET()).json()
    expect(data.aliases[0].health).toEqual({ ok: true, fees: ['Salah Eldin Citadel'] })
    expect(data.aliases[1].health.ok).toBe(false)
  })

  it('lists the wording that reaches no fee — and not the one an alias already covers', async () => {
    const { data } = await (await GET()).json()
    expect(data.unresolved.map((u: Row) => u.wording)).toEqual(['Valley of the Kings'])
  })

  it('tells the screen whether this person may change anything', async () => {
    expect((await (await GET()).json()).data.canWrite).toBe(true)
    auth.role = 'agent'
    expect((await (await GET()).json()).data.canWrite).toBe(false)
  })

  it('passes an auth failure straight through', async () => {
    auth = { error: 'Not signed in', status: 401 }
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST — add an alias', () => {
  it('files it under the CALLER\'s agency, whatever the body claims', async () => {
    const res = await POST(req({ alias: 'Valley of the Kings', canonical: 'valley of kings', tenant_id: 'tenant-other', id: 'chosen-by-attacker' }))
    expect(res.status).toBe(201)
    expect(writes).toHaveLength(1)
    expect(writes[0].row).toEqual({ tenant_id: TENANT, alias: 'Valley of the Kings', canonical: 'Valley Of Kings' })
  })

  it('refuses one into thin air, and writes nothing', async () => {
    const res = await POST(req({ alias: 'Pyramids', canonical: 'Pyramids of Giza' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no fee called "Pyramids of Giza"/)
    expect(writes).toEqual([])
  })

  it('cannot point at ANOTHER agency\'s fee — it is not on this sheet', async () => {
    const res = await POST(req({ alias: 'The secret', canonical: 'Their Secret Temple' }))
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })

  it('refuses a second alias for the same wording', async () => {
    const res = await POST(req({ alias: 'citadel', canonical: 'Valley Of Kings' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/already has an alias/)
  })

  it.each(['agent', 'manager', 'viewer', '', undefined])('is refused for role %s, saying who can', async role => {
    auth.role = role
    const res = await POST(req({ alias: 'Valley of the Kings', canonical: 'Valley Of Kings' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/owner or an admin/)
    expect(writes).toEqual([])
  })

  it('an admin may, as well as the owner', async () => {
    auth.role = 'admin'
    expect((await POST(req({ alias: 'Valley of the Kings', canonical: 'Valley Of Kings' }))).status).toBe(201)
  })

  it('survives a body that is not JSON', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'not json' }) as never)
    expect(res.status).toBe(400)
  })
})

describe('PATCH — change one', () => {
  it('re-checks the fee when the target changes', async () => {
    const res = await PATCH(req({ canonical: 'Citadel of Saladin' }), at('a1'))
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })

  it('switching a BROKEN alias off is always allowed — that is how it is parked', async () => {
    const res = await PATCH(req({ is_active: false }), at('a2'))
    expect(res.status).toBe(200)
    expect(writes[0].row).toMatchObject({ is_active: false })
    expect(writes[0].row).not.toHaveProperty('canonical')
  })

  it('scopes the write to this agency as well as the id', async () => {
    await PATCH(req({ is_active: false }), at('a1'))
    expect(writes[0].filters).toEqual(expect.arrayContaining([['id', 'a1'], ['tenant_id', TENANT]]))
  })

  it('another agency\'s alias is simply not found', async () => {
    const res = await PATCH(req({ is_active: false }), at('theirs'))
    expect(res.status).toBe(404)
    expect(writes).toEqual([])
  })

  it('is refused for a non-admin', async () => {
    auth.role = 'agent'
    expect((await PATCH(req({ is_active: false }), at('a1'))).status).toBe(403)
  })
})

describe('DELETE — remove one', () => {
  it('removes this agency\'s alias', async () => {
    const res = await DELETE(req(), at('a1'))
    expect(res.status).toBe(200)
    expect(tables.attraction_aliases.map(a => a.id)).toEqual(['a2', 'theirs'])
  })

  it('a delete that removed nothing is a 404, never a quiet success', async () => {
    const res = await DELETE(req(), at('theirs'))
    expect(res.status).toBe(404)
    expect(tables.attraction_aliases.map(a => a.id)).toContain('theirs')
  })

  it('is refused for a non-admin, and nothing goes', async () => {
    auth.role = 'agent'
    expect((await DELETE(req(), at('a1'))).status).toBe(403)
    expect(tables.attraction_aliases).toHaveLength(3)
  })
})
