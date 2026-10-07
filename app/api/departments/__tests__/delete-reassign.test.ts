import { describe, it, expect, vi, beforeEach } from 'vitest'

// DELETE /api/departments/[id]: a department members or tasks are filed under
// is refused until the caller says where they go (?reassign_to=<id|none>).
// It used to delete at once, and ON DELETE SET NULL silently un-filed them.

type Row = Record<string, unknown>
type Result = { data: Row[] | null; count?: number; error: null }
interface Query {
  select: (columns?: string, opts?: { head?: boolean }) => Query
  update: (patch: Row) => Query
  delete: () => Query
  eq: (column: string, value: unknown) => Query
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  then: <T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) => Promise<T>
}
let tables: Record<string, Row[]>

function from(table: string) {
  let op: 'select' | 'update' | 'delete' = 'select'
  let patch: Row = {}
  let head = false
  const filters: Array<[string, unknown]> = []
  const matching = () => tables[table].filter(r => filters.every(([c, v]) => r[c] === v))
  const run = () => {
    const rows = matching()
    if (op === 'update') rows.forEach(r => Object.assign(r, patch))
    if (op === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r))
    return head ? { count: rows.length, data: null, error: null } : { data: rows.map(r => ({ ...r })), error: null }
  }
  const q: Query = {
    select: (_c, opts) => { if (opts?.head) head = true; return q },
    update: (p: Row) => ((op = 'update'), (patch = p), q),
    delete: () => ((op = 'delete'), q),
    eq: (c: string, v: unknown) => (filters.push([c, v]), q),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, role: 'admin', tenant_id: 't1', supabase: { from } }),
}))

const { DELETE } = await import('@/app/api/departments/[id]/route')
const del = (id: string, query = '') =>
  DELETE({ nextUrl: new URL(`http://x/api/departments/${id}${query}`) } as never, { params: Promise.resolve({ id }) })

beforeEach(() => {
  tables = {
    departments: [
      { id: 'ops', tenant_id: 't1', name: 'Ops', service_types: ['guide'], is_active: true },
      { id: 'res', tenant_id: 't1', name: 'Reservations', service_types: [], is_active: true },
      { id: 'empty', tenant_id: 't1', name: 'Empty', service_types: [], is_active: true },
    ],
    team_members: [{ id: 'm1', department_id: 'ops' }],
    tasks: [{ id: 't1', department_id: 'ops' }],
  }
})

describe('DELETE /api/departments/[id]', () => {
  it('refuses (409) a referenced department when no destination is given — nothing is un-filed', async () => {
    const res = await del('ops')
    expect(res.status).toBe(409)
    expect((await res.json()).references).toEqual({ team_members: 1, tasks: 1 })
    expect(tables.departments.map(d => d.id)).toContain('ops')
    expect(tables.team_members[0].department_id).toBe('ops')
  })

  it('moves members and tasks to the chosen department, then deletes', async () => {
    const res = await del('ops', '?reassign_to=res')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, moved: { team_members: 1, tasks: 1 }, unrouted: [] })
    expect(tables.team_members[0].department_id).toBe('res')
    expect(tables.tasks[0].department_id).toBe('res')
    expect(tables.departments.map(d => d.id)).toEqual(['res', 'empty'])
  })

  it("'none' is an explicit choice to leave them without a department", async () => {
    const res = await del('ops', '?reassign_to=none')
    expect((await res.json())).toMatchObject({ success: true, unrouted: ['guide'] })
    expect(tables.team_members[0].department_id).toBeNull()
  })

  it('a department nothing references deletes without a destination', async () => {
    const res = await del('empty')
    expect(res.status).toBe(200)
    expect(tables.departments.map(d => d.id)).not.toContain('empty')
  })
})
