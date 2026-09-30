import { describe, it, expect, vi, beforeEach } from 'vitest'

// The checklist on a generated task: PATCH /api/tasks/[id]/checklist ticks a
// row and the status follows; PUT status 'done' (the Complete button) ticks
// every row — it used to set only the status, leaving "Done, 0 of 2 booked"
// that the next tick moved back to To Do — and is refused while a booking
// that left the itinerary still has to be cancelled.

type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: null }
interface Query {
  select: (columns?: string) => Query
  update: (patch: Row) => Query
  eq: (column: string, value: unknown) => Query
  is: (column: string, value: null) => Query
  single: () => Promise<{ data: Row | null; error: null }>
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  then: <T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) => Promise<T>
}
let tasks: Row[]
/** Simulates another request writing between our read and our write. */
let interfere: (() => void) | null

function from() {
  let patch: Row | null = null
  const filters: Array<(r: Row) => boolean> = []
  const run = (): Result => {
    if (patch && interfere) { interfere(); interfere = null }
    const rows = tasks.filter(r => filters.every(f => f(r)))
    if (patch) rows.forEach(r => Object.assign(r, patch))
    return { data: rows.map(r => ({ ...r })), error: null }
  }
  const q: Query = {
    select: () => q,
    update: p => ((patch = p), q),
    eq: (c, v) => (filters.push(r => r[c] === v), q),
    is: (c, v) => (filters.push(r => r[c] === v), q),
    single: async () => ({ data: run().data?.[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, role: 'admin', tenant_id: 't1', user: { id: 'u1' }, supabase: { from } }),
  createAuthenticatedClient: async () => ({ from }),
}))

const { PATCH } = await import('@/app/api/tasks/[id]/checklist/route')
const { PUT } = await import('@/app/api/tasks/[id]/route')
const ctx = { params: Promise.resolve({ id: 'task1' }) }
const patch = async (body: Row) => {
  const res = await PATCH({ json: async () => body } as never, ctx)
  return { status: res.status, body: await res.json() }
}
const put = async (body: Row) => {
  const res = await PUT({ json: async () => body } as never, ctx)
  return { status: res.status, body: await res.json() }
}

const row = (key: string, extra: Row = {}): Row => ({
  key, day_from: 1, day_to: 1, date_from: null, date_to: null, city: 'Cairo', name: key, quantity: 1,
  nights: null, supplier: null, notes: null, booked: false, confirmation: null, booked_at: null, ...extra,
})

beforeEach(() => {
  interfere = null
  tasks = [{ id: 'task1', status: 'todo', updated_at: 'v1', completed_at: null, checklist: [row('A'), row('B')] }]
})
const task = () => tasks[0]

describe('PATCH /api/tasks/[id]/checklist', () => {
  it('ticks a row and the status follows it', async () => {
    expect((await patch({ key: 'A', booked: true })).status).toBe(200)
    expect(task().status).toBe('in_progress')
    await patch({ key: 'B', booked: true })
    expect(task().status).toBe('done')
    expect(task().completed_at).toBeTruthy()
  })

  it('saves a confirmation number', async () => {
    await patch({ key: 'A', confirmation: ' MH-1 ' })
    expect((task().checklist as Row[])[0].confirmation).toBe('MH-1')
  })

  it('re-applies on top of a concurrent write instead of losing it', async () => {
    interfere = () => {
      // Another tab ticked B after we read the task.
      Object.assign(task(), { updated_at: 'v2', checklist: [row('A'), row('B', { booked: true })] })
    }
    expect((await patch({ key: 'A', booked: true })).status).toBe(200)
    expect((task().checklist as Row[]).map(r => r.booked)).toEqual([true, true])
  })

  it('rejects a malformed body, an unknown row, and a task without a checklist', async () => {
    expect((await patch({ key: 'A' })).status).toBe(400)
    expect((await patch({ key: 'Z', booked: true })).status).toBe(404)
    task().checklist = null
    expect((await patch({ key: 'A', booked: true })).status).toBe(400)
  })
})

describe('PUT /api/tasks/[id] status done (Complete)', () => {
  it('ticks every row', async () => {
    expect((await put({ status: 'done' })).status).toBe(200)
    expect((task().checklist as Row[]).every(r => r.booked)).toBe(true)
    expect(task().status).toBe('done')
  })

  it('is refused while a booking still has to be cancelled', async () => {
    task().checklist = [row('A'), row('Old', { booked: true, removed: true })]
    const res = await put({ status: 'done' })
    expect(res.status).toBe(409)
    expect(res.body.to_cancel).toBe(1)
    expect(task().status).toBe('todo')
  })

  it('a task made by hand completes as before', async () => {
    task().checklist = null
    expect((await put({ status: 'done' })).status).toBe(200)
    expect(task().status).toBe('done')
  })
})
