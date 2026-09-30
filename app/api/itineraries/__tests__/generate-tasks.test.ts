import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/itineraries/[id]/generate-tasks — the deterministic generator
// that replaced the AI one. What a click-through would not show: running it
// twice changes nothing (the AI version duplicated every task), a dry run
// writes nothing, an assignee from another company is never used (the
// notification is written with the admin client), and grid lines typed
// 'other' / 'transfer' / 'tip' land in the right task or none.

type Row = Record<string, unknown>
type Result = { data: Row[] | Row | null; error: null }
interface Query {
  select: (columns?: string) => Query
  insert: (rows: Row[]) => Query
  update: (patch: Row) => Query
  eq: (column: string, value: unknown) => Query
  in: (column: string, values: unknown[]) => Query
  order: (column: string) => Query
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  then: <T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) => Promise<T>
}

let tables: Record<string, Row[]>
let nextId = 0

function from(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let patch: Row = {}
  let inserted: Row[] = []
  const filters: Array<(r: Row) => boolean> = []
  const matching = () => tables[table].filter(r => filters.every(f => f(r)))
  const run = (): Result => {
    if (op === 'insert') {
      const rows = inserted.map(r => ({ id: `new-${++nextId}`, created_at: String(nextId), ...r }))
      tables[table].push(...rows)
      return { data: rows.map(r => ({ ...r })), error: null }
    }
    const rows = matching()
    if (op === 'update') rows.forEach(r => Object.assign(r, patch))
    return { data: rows.map(r => ({ ...r })), error: null }
  }
  const q: Query = {
    select: () => q,
    insert: rows => ((op = 'insert'), (inserted = rows), q),
    update: p => ((op = 'update'), (patch = p), q),
    eq: (c, v) => (filters.push(r => r[c] === v), q),
    in: (c, vs) => (filters.push(r => vs.includes(r[c])), q),
    order: () => q,
    maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, role: 'admin', tenant_id: 't1', user: { id: 'u1' }, supabase: { from } }),
}))
const notify = vi.fn(async (_input: Row) => ({}))
vi.mock('@/lib/notifications', () => ({ createNotification: (input: Row) => notify(input) }))

const { POST } = await import('@/app/api/itineraries/[id]/generate-tasks/route')
const call = async (body: Row) => {
  const res = await POST(
    { json: async () => ({ today: '2026-10-01', ...body }) } as never,
    { params: Promise.resolve({ id: 'it1' }) }
  )
  return { status: res.status, body: await res.json() }
}

const day = (id: string, n: number, extra: Row = {}): Row => ({
  id, itinerary_id: 'it1', day_number: n, date: `2026-12-1${n}`, city: 'Cairo', overnight_city: 'Cairo',
  day_type: 'tour', is_departure: false, is_cruise_day: false, is_sailing_day: false, accommodation_type: null,
  hotel_included: null, overnight: null, transport_type: null, intercity: null, flight_from: null, flight_to: null,
  guide_required: false, has_sightseeing: null, attractions: null, ...extra,
})
const svc = (dayId: string, slot: string, type: string, name: string): Row => ({
  itinerary_id: 'it1', itinerary_day_id: dayId, day_id: dayId, service_type: type, service_name: name,
  description: `[pricing-grid:${slot}] ${name}`, quantity: 1, notes: null, supplier_name: null,
})

beforeEach(() => {
  notify.mockClear()
  nextId = 0
  tables = {
    itineraries: [{
      id: 'it1', itinerary_code: 'IT-1', client_name: 'Smith', trip_name: null, start_date: '2026-12-11',
      end_date: '2026-12-12', num_adults: 2, num_children: 0, num_infants: 0,
    }],
    itinerary_days: [day('d1', 1), day('d2', 2, { day_type: 'departure' })],
    itinerary_services: [
      svc('d1', 'accommodation', 'accommodation', 'Mena House'),
      svc('d1', 'airport_services', 'transfer', 'Meet & assist'),
      svc('d1', 'hotel_services', 'other', 'Porterage'),
      svc('d1', 'tipping', 'tip', 'Tips'),
      svc('d1', 'water', 'other', 'Water'),
    ],
    departments: [
      { id: 'res', name: 'Reservation', service_types: ['accommodation', 'cruise'], is_active: true },
      { id: 'exe', name: 'Execution', service_types: ['airport_service', 'hotel_service'], is_active: true },
    ],
    team_members: [
      { id: 'm-res', tenant_id: 't1', is_active: true, department_id: 'res' },
      { id: 'm-other-company', tenant_id: 't2', is_active: true, department_id: 'res' },
    ],
    tasks: [
      // Made by hand — never touched.
      { id: 'hand', linked_type: 'itinerary', linked_id: 'it1', service_type: null, status: 'todo', created_at: '0' },
    ],
  }
})

const generated = () => tables.tasks.filter(t => t.service_type)

describe('POST /api/itineraries/[id]/generate-tasks', () => {
  it('a dry run previews the tasks and writes nothing', async () => {
    const { status, body } = await call({ dry_run: true })
    expect(status).toBe(200)
    expect(body.tasks.map((t: Row) => [t.action, t.service_type, (t.department as Row).id])).toEqual([
      ['create', 'accommodation', 'res'],
      ['create', 'airport_service', 'exe'],
      ['create', 'hotel_service', 'exe'],
    ])
    expect(body.other_tasks).toBe(1)
    expect(generated()).toHaveLength(0)
  })

  it('creates one task per category with its checklist, then a second run changes nothing', async () => {
    const first = await call({ assignments: { res: 'm-res' } })
    expect(first.body.counts).toEqual({ created: 3, updated: 0, reopened: 0, unchanged: 0 })
    const acc = generated().find(t => t.service_type === 'accommodation')!
    expect(acc).toMatchObject({ tenant_id: 't1', department_id: 'res', assigned_to: 'm-res', status: 'todo', linked_id: 'it1' })
    expect((acc.checklist as Row[]).map(r => [r.name, r.booked])).toEqual([['Mena House', false]])

    const second = await call({})
    expect(second.body.counts).toEqual({ created: 0, updated: 0, reopened: 0, unchanged: 3 })
    expect(generated()).toHaveLength(3)
    expect(tables.tasks.find(t => t.id === 'hand')).toMatchObject({ status: 'todo', service_type: null })
  })

  it('notifies only assignees who are active members of this company', async () => {
    await call({ assignments: { res: 'm-other-company', exe: 'm-res' } })
    const acc = generated().find(t => t.service_type === 'accommodation')!
    expect(acc.assigned_to).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ team_member_id: 'm-res', type: 'task_assigned' })
  })

  it('a category no active department claims is skipped, not created unassigned', async () => {
    tables.itinerary_services.push(svc('d1', 'boat_rides', 'other', 'Felucca'))
    const { body } = await call({ dry_run: true })
    expect(body.skipped).toEqual([{ service_type: 'other', label: 'Other services', service_count: 1, reason: 'no_active_department' }])
  })

  it('a changed itinerary reopens a finished task and keeps the booked row', async () => {
    await call({})
    const acc = generated().find(t => t.service_type === 'accommodation')!
    const rows = (acc.checklist as Row[]).map(r => ({ ...r, booked: true, confirmation: 'MH-1' }))
    Object.assign(acc, { checklist: rows, status: 'done' })

    tables.itinerary_days = [day('d1', 1), day('d2', 2), day('d3', 3, { day_type: 'departure' })]
    tables.itinerary_services.push(svc('d2', 'accommodation', 'accommodation', 'Old Cataract'))
    const { body } = await call({})
    expect(body.counts.reopened).toBe(1)
    expect(acc.status).toBe('in_progress')
    expect((acc.checklist as Row[]).map(r => [r.name, r.booked, r.confirmation])).toEqual([
      ['Mena House', true, 'MH-1'],
      ['Old Cataract', false, null],
    ])
  })

  it('404s for an itinerary the caller cannot see', async () => {
    tables.itineraries = []
    expect((await call({})).status).toBe(404)
  })
})
