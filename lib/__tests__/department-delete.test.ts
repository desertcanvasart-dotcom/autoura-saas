import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteDepartment } from '@/lib/department-delete'

// ============================================================================
// Deleting a department moves its members and tasks first. It used to delete
// straight away: ON DELETE SET NULL (214) silently un-filed every member and
// task, and the dialog could only warn.
// ============================================================================

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

// Just the query shapes deleteDepartment uses. `limitMoves` makes an update
// reach fewer rows than exist — what a policy or a concurrent write would do.
function fakeDb(tables: Record<string, Row[]>, limitMoves?: number) {
  return {
    tables,
    from(table: string) {
      let op: 'select' | 'update' | 'delete' = 'select'
      let patch: Row = {}
      const filters: Array<[string, unknown]> = []
      const matching = () => tables[table].filter(r => filters.every(([c, v]) => r[c] === v))
      const run = () => {
        let rows = matching()
        if (op === 'update') {
          if (limitMoves !== undefined && table !== 'departments') rows = rows.slice(0, limitMoves)
          rows.forEach(r => Object.assign(r, patch))
        }
        if (op === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r))
        return { data: rows.map(r => ({ ...r })), error: null }
      }
      const q: Query = {
        select: () => q,
        update: (p: Row) => ((op = 'update'), (patch = p), q),
        delete: () => ((op = 'delete'), q),
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (res, rej) => Promise.resolve(run()).then(res, rej),
      }
      return q
    },
  }
}

// The fake stands in for the Supabase client deleteDepartment takes.
const client = (db: ReturnType<typeof fakeDb>) => db as unknown as SupabaseClient

const T = 'tenant-1'
const seed = () => fakeDb({
  departments: [
    { id: 'ops', tenant_id: T, name: 'Ops', service_types: ['guide', 'entrance'], is_active: true },
    { id: 'res', tenant_id: T, name: 'Reservations', service_types: ['accommodation'], is_active: true },
    { id: 'old', tenant_id: T, name: 'Old', service_types: ['meal'], is_active: false },
    { id: 'global', tenant_id: null, name: 'Accounting', service_types: ['invoice'], is_active: true },
  ],
  team_members: [{ id: 'm1', department_id: 'ops' }, { id: 'm2', department_id: 'ops' }, { id: 'm3', department_id: 'res' }],
  tasks: [{ id: 't1', department_id: 'ops' }, { id: 't2', department_id: 'res' }],
})
const OPS_REFS = { team_members: 2, tasks: 1 }

describe('deleteDepartment', () => {
  it("moves members and tasks to one of the company's departments, with its service types", async () => {
    const db = seed()
    const r = await deleteDepartment(client(db), 'ops', 'res', OPS_REFS)
    expect(r).toEqual({ ok: true, moved: { team_members: 2, tasks: 1 }, unrouted: [] })
    expect(db.tables.departments.map(d => d.id)).toEqual(['res', 'old', 'global'])
    expect(db.tables.team_members.every(m => m.department_id === 'res')).toBe(true)
    expect(db.tables.tasks.every(t => t.department_id === 'res')).toBe(true)
    expect(db.tables.departments[0].service_types).toEqual(['accommodation', 'guide', 'entrance'])
  })

  it('a built-in target takes the people and tasks, but cannot take the service types — reported, not dropped', async () => {
    const db = seed()
    const r = await deleteDepartment(client(db), 'ops', 'global', OPS_REFS)
    expect(r).toEqual({ ok: true, moved: { team_members: 2, tasks: 1 }, unrouted: ['guide', 'entrance'] })
    expect(db.tables.departments.find(d => d.id === 'global')?.service_types).toEqual(['invoice'])
  })

  it("'none' leaves them without a department and reports the service types left unrouted", async () => {
    const db = seed()
    const r = await deleteDepartment(client(db), 'ops', null, OPS_REFS)
    expect(r).toEqual({ ok: true, moved: { team_members: 2, tasks: 1 }, unrouted: ['guide', 'entrance'] })
    expect(db.tables.team_members.filter(m => m.department_id === null).map(m => m.id)).toEqual(['m1', 'm2'])
  })

  it('an inactive department routed nothing, so it hands over no service types', async () => {
    const db = seed()
    const r = await deleteDepartment(client(db), 'old', 'res', { team_members: 0, tasks: 0 })
    expect(r).toMatchObject({ ok: true, unrouted: [] })
    expect(db.tables.departments.find(d => d.id === 'res')?.service_types).toEqual(['accommodation'])
  })

  it('refuses a target that is itself, missing or inactive — and changes nothing', async () => {
    for (const [target, status] of [['ops', 400], ['nope', 404], ['old', 400]] as const) {
      const db = seed()
      expect(await deleteDepartment(client(db), 'ops', target, OPS_REFS)).toMatchObject({ ok: false, status })
      expect(db.tables.departments).toHaveLength(4)
      expect(db.tables.team_members.filter(m => m.department_id === 'ops')).toHaveLength(2)
    }
  })

  it('if a move reaches fewer rows than were counted, the department is NOT deleted', async () => {
    const db = fakeDb(seed().tables, 1)
    const r = await deleteDepartment(client(db), 'ops', 'res', OPS_REFS)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.tables.departments.map(d => d.id)).toContain('ops')
  })
})
