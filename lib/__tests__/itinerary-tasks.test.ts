import { describe, it, expect } from 'vitest'
import {
  departmentFor,
  planItineraryTasks,
  planSync,
  mergeChecklist,
  applyChecklistChange,
  statusFromChecklist,
  checklistProgress,
  completeChecklist,
  dayNeeds,
  taskCategoryOf,
  type DayForTasks,
  type ServiceForTasks,
  type ExistingGeneratedTask,
  type ChecklistItem,
} from '@/lib/tasks/itinerary-tasks'

// ============================================================================
// Operations tasks (lib/tasks/itinerary-tasks.ts): one per kind of service,
// with a checklist row per service. Ported from travel-ops-pro, plus the
// service types this app's pricing grid writes ('transfer', 'entrance_fee',
// 'tip', and 'other' for hotel services, boat rides and water — told apart by
// the "[pricing-grid:<slot>]" tag).
// ============================================================================

const itinerary = {
  itinerary_code: 'ITN-1', client_name: 'Smith', trip_name: 'Classic Egypt',
  start_date: '2026-12-10', end_date: '2026-12-16', num_adults: 2, num_children: 1, num_infants: 0,
}

const departments = [
  { id: 'res', name: 'Reservation', service_types: ['accommodation', 'cruise', 'meal', 'transportation'] },
  { id: 'avi', name: 'Aviation', service_types: ['flight'] },
  { id: 'exe', name: 'Execution', service_types: ['guide', 'entrance', 'airport_service'] },
]

const svc = (day: number, service_type: string, service_name: string, extra: Partial<ServiceForTasks> = {}): ServiceForTasks => ({
  day_number: day, date: `2026-12-${String(9 + day).padStart(2, '0')}`, city: 'Cairo', overnight_city: null,
  service_type, service_name, quantity: 1, supplier_name: null, notes: null, ...extra,
})

const services: ServiceForTasks[] = [
  svc(1, 'accommodation', 'Mena House', { supplier_name: 'Marriott' }),
  svc(2, 'accommodation', 'Mena House', { supplier_name: 'Marriott' }),
  svc(3, 'transportation', 'Sleeping Train Giza–Aswan (Half Twin)'),
  svc(4, 'cruise', 'MS Nile Goddess', { city: 'Aswan' }),
  svc(5, 'cruise', 'MS Nile Goddess', { city: 'Kom Ombo' }),
  svc(1, 'transportation', 'Airport transfer'),
  svc(2, 'transportation', 'Pyramids tour vehicle'),
  svc(2, 'guide', 'Egyptologist'),
  svc(2, 'entrance', 'Giza Plateau'),
  svc(2, 'meal', 'Lunch at Khufu’s'),
  svc(2, 'tips', 'Tipping kitty'),
  svc(1, 'flight', 'MS956'),
]

const plan = (deps = departments, list = services, today = '2026-10-01') =>
  planItineraryTasks({ itinerary, services: list, departments: deps, today })

describe('grouping into one task per category', () => {
  it('hotels, Nile cruises and sleeper trains are all Accommodation', () => {
    expect(taskCategoryOf(svc(1, 'cruise', 'x'))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'Sleeping Train Cairo–Luxor'))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'Watania', { description: '[pricing-grid:sleeping_trains] Watania' }))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'transportation', 'Airport transfer'))).toBe('transportation')
    expect(taskCategoryOf(svc(1, 'tips', 'x'))).toBeNull()
  })

  it('makes one task per category, in a fixed order, and none for tips', () => {
    const p = plan()
    expect(p.tasks.map(t => t.service_type)).toEqual(
      ['accommodation', 'flight', 'transportation', 'guide', 'meal', 'entrance']
    )
    const acc = p.tasks[0]
    expect(acc.service_count).toBe(5)
    expect(acc.department).toEqual({ id: 'res', name: 'Reservation' })
    // Two Mena House nights collapse into one line; the sleeper is a night too.
    expect(acc.items.map(i => i.key)).toEqual([
      'Days 1–2 · 2026-12-10 → 2026-12-11 · Cairo — Mena House (2 nights) · Supplier: Marriott',
      'Day 3 · 2026-12-12 · Cairo — Sleeping Train Giza–Aswan (Half Twin) (1 night)',
      'Days 4–5 · 2026-12-13 → 2026-12-14 · Aswan — MS Nile Goddess (2 nights)',
    ])
    // The sleeper is not ALSO in Transportation.
    expect(p.tasks.find(t => t.service_type === 'transportation')!.service_count).toBe(2)
    expect(acc.description).toContain('ITN-1 · Smith · Classic Egypt')
    expect(acc.description).toContain('2 adults, 1 child')
  })

  it('due dates follow the lead times, but never fall before today', () => {
    const p = plan()
    const due = Object.fromEntries(p.tasks.map(t => [t.service_type, t.due_date]))
    expect(due).toMatchObject({ accommodation: '2026-11-26', transportation: '2026-12-03', meal: '2026-12-05', entrance: '2026-12-07' })
    const late = plan(departments, services, '2026-12-01')
    expect(late.tasks.find(t => t.service_type === 'accommodation')!.due_date).toBe('2026-12-01')
  })

  it('skips every category no ACTIVE department handles', () => {
    const withoutExecution = departments.filter(d => d.id !== 'exe')
    const p = plan(withoutExecution)
    expect(p.tasks.map(t => t.service_type)).not.toContain('guide')
    expect(p.tasks.map(t => t.service_type)).not.toContain('entrance')
    expect(p.skipped.map(s => s.service_type)).toEqual(['guide', 'entrance'])
  })
})

describe('checklist rows', () => {
  it('each row carries the fields the table shows', () => {
    const acc = plan().tasks[0]
    expect(acc.items[0]).toMatchObject({
      day_from: 1, day_to: 2, date_from: '2026-12-10', date_to: '2026-12-11',
      city: 'Cairo', name: 'Mena House', quantity: 1, nights: 2, supplier: 'Marriott', notes: null,
    })
    // Only accommodation rows count nights.
    expect(plan().tasks.find(t => t.service_type === 'transportation')!.items[0].nights).toBeNull()
    // The title stays short — the rows carry the detail.
    expect(acc.title).toBe('Accommodation — ITN-1 · Smith')
  })
})

// A task as the route would store it after creating it.
const stored = (p = plan()): ExistingGeneratedTask[] =>
  planSync(p, []).actions.map((a, i) => {
    if (a.kind !== 'create') throw new Error('expected create')
    return {
      id: `task-${i}`, service_type: a.task.service_type, status: 'todo', archived: false,
      assigned_to: 'm1', generation_snapshot: a.task.snapshot, checklist: a.checklist,
    }
  })

const tick = (tasks: ExistingGeneratedTask[], type: string, which: 'all' | number) =>
  tasks.map(t => {
    if (t.service_type !== type) return t
    let rows = t.checklist!
    rows.forEach((r, i) => {
      if (which === 'all' || which === i) rows = applyChecklistChange(rows, { key: r.key, booked: true }, '2026-10-01T00:00:00Z')!
    })
    return { ...t, checklist: rows, status: statusFromChecklist(rows, t.status) }
  })

describe('regenerating syncs instead of duplicating', () => {
  it('creates every task unticked the first time, none marked new', () => {
    const actions = planSync(plan(), []).actions
    expect(actions.every(a => a.kind === 'create')).toBe(true)
    for (const a of actions) {
      if (a.kind !== 'create') continue
      expect(a.checklist.every(r => !r.booked && !r.is_new)).toBe(true)
    }
  })

  it('an unchanged itinerary changes nothing', () => {
    const sync = planSync(plan(), stored())
    expect(sync.actions.every(a => a.kind === 'unchanged')).toBe(true)
    expect(sync.orphaned).toEqual([])
  })

  it('unchanged rows keep their tick and confirmation; a new row arrives unticked and flagged new', () => {
    let tasks = tick(stored(), 'meal', 'all')
    tasks = tasks.map(t => t.service_type !== 'meal' ? t : {
      ...t, checklist: applyChecklistChange(t.checklist!, { key: t.checklist![0].key, confirmation: 'KH-123' }, 'x')!,
    })
    expect(tasks.find(t => t.service_type === 'meal')!.status).toBe('done')

    const changed = plan(departments, [...services, svc(6, 'meal', 'Dinner cruise')])
    const meal = planSync(changed, tasks).actions.find(a => a.task.service_type === 'meal')!
    // A finished task that gained a row is reopened.
    expect(meal.kind).toBe('reopen')
    if (meal.kind !== 'reopen') return
    expect(meal.status).toBe('in_progress')
    expect(meal.checklist.map(r => [r.name, r.booked, r.confirmation, !!r.is_new])).toEqual([
      ['Lunch at Khufu’s', true, 'KH-123', false],
      ['Dinner cruise', false, null, true],
    ])
  })

  it('a booked row that leaves the itinerary stays, flagged for cancellation, until marked cancelled', () => {
    const tasks = tick(stored(), 'accommodation', 'all')
    const withoutSleeper = services.filter(s => !s.service_name.startsWith('Sleeping Train'))
    const acc = planSync(plan(departments, withoutSleeper), tasks).actions.find(a => a.task.service_type === 'accommodation')!
    expect(acc.kind).toBe('reopen')
    if (acc.kind !== 'reopen') return
    const removed = acc.checklist.filter(r => r.removed)
    expect(removed.map(r => r.name)).toEqual(['Sleeping Train Giza–Aswan (Half Twin)'])
    expect(checklistProgress(acc.checklist)).toMatchObject({ total: 2, booked: 2, toCancel: 1, complete: false })

    const after = applyChecklistChange(acc.checklist, { key: removed[0].key, cancelled: true }, 'x')!
    expect(checklistProgress(after).complete).toBe(true)
    expect(statusFromChecklist(after, acc.status)).toBe('done')
  })

  it('an UNbooked row that leaves the itinerary simply disappears', () => {
    const withoutSleeper = services.filter(s => !s.service_name.startsWith('Sleeping Train'))
    const acc = planSync(plan(departments, withoutSleeper), stored()).actions.find(a => a.task.service_type === 'accommodation')!
    if (acc.kind === 'unchanged' || acc.kind === 'create') throw new Error('expected update')
    expect(acc.kind).toBe('update')
    expect(acc.checklist.some(r => r.removed)).toBe(false)
    expect(acc.checklist).toHaveLength(2)
  })

  it('a done task stays done when its rows did not change but the header did', () => {
    const tasks = tick(stored(), 'guide', 'all')
    const renamed = planItineraryTasks({
      itinerary: { ...itinerary, num_adults: 3 }, services, departments, today: '2026-10-01',
    })
    const guide = planSync(renamed, tasks).actions.find(a => a.task.service_type === 'guide')!
    expect(guide.kind).toBe('update')
    if (guide.kind !== 'update') return
    expect(guide.status).toBe('done')
    expect(guide.tripChanged).toBe(true)
  })

  it('converts a task generated before checklists: a done one counts its old rows as booked', () => {
    const p = plan()
    const legacy: ExistingGeneratedTask[] = p.tasks.map((t, i) => ({
      id: `old-${i}`, service_type: t.service_type, status: t.service_type === 'meal' ? 'done' : 'todo',
      archived: false, assigned_to: null, generation_snapshot: t.snapshot, checklist: null,
    }))
    const actions = planSync(p, legacy).actions
    // Unchanged snapshots are still rewritten once, to gain their checklist.
    expect(actions.every(a => a.kind === 'update')).toBe(true)
    const meal = actions.find(a => a.task.service_type === 'meal')!
    const guide = actions.find(a => a.task.service_type === 'guide')!
    if (meal.kind !== 'update' || guide.kind !== 'update') throw new Error('expected update')
    expect(meal.checklist.every(r => r.booked && !r.is_new)).toBe(true)
    expect(meal.status).toBe('done')
    expect(guide.checklist.every(r => !r.booked && !r.is_new)).toBe(true)
  })

  it('reports tasks whose category is gone or now excluded, without touching them', () => {
    const sync = planSync(
      plan(departments.filter(d => d.id !== 'exe'), services.filter(s => s.service_type !== 'meal')),
      stored()
    )
    expect(sync.orphaned.map(o => [o.service_type, o.reason])).toEqual([
      ['guide', 'excluded'],
      ['meal', 'removed'],
      ['entrance', 'excluded'],
    ])
  })
})

describe('ticking rows', () => {
  const rows = (): ChecklistItem[] => mergeChecklist({ previous: [], planned: plan().tasks[0].items, isRegenerate: false })

  it('status follows the rows', () => {
    let r = rows()
    expect(statusFromChecklist(r, 'todo')).toBe('todo')
    r = applyChecklistChange(r, { key: r[0].key, booked: true }, 't1')!
    expect(r[0]).toMatchObject({ booked: true, booked_at: 't1' })
    expect(statusFromChecklist(r, 'todo')).toBe('in_progress')
    for (const row of r) r = applyChecklistChange(r, { key: row.key, booked: true }, 't2')!
    expect(statusFromChecklist(r, 'in_progress')).toBe('done')
    r = applyChecklistChange(r, { key: r[1].key, booked: false }, 't3')!
    expect(r[1]).toMatchObject({ booked: false, booked_at: null })
    expect(statusFromChecklist(r, 'done')).toBe('in_progress')
  })

  it('confirmation numbers are trimmed and blank clears them', () => {
    let r = rows()
    r = applyChecklistChange(r, { key: r[0].key, confirmation: '  ABC-1  ' }, 'x')!
    expect(r[0].confirmation).toBe('ABC-1')
    r = applyChecklistChange(r, { key: r[0].key, confirmation: '   ' }, 'x')!
    expect(r[0].confirmation).toBeNull()
  })

  it('refuses a row that does not exist, and "cancelled" on a row that was not removed', () => {
    const r = rows()
    expect(applyChecklistChange(r, { key: 'nope', booked: true }, 'x')).toBeNull()
    expect(applyChecklistChange(r, { key: r[0].key, cancelled: true }, 'x')).toBeNull()
  })

  it('ticking a new row clears its "new" flag', () => {
    const r = mergeChecklist({ previous: [], planned: plan().tasks[0].items, isRegenerate: true })
    expect(r[0].is_new).toBe(true)
    const after = applyChecklistChange(r, { key: r[0].key, booked: true }, 'x')!
    expect(after[0].is_new).toBeUndefined()
  })
})

const day = (n: number, extra: Partial<DayForTasks> = {}): DayForTasks => ({
  day_number: n, date: `2026-12-${String(9 + n).padStart(2, '0')}`, city: 'Cairo', overnight_city: 'Cairo',
  day_type: 'tour', is_departure: false, is_cruise_day: false, is_sailing_day: false, accommodation_type: null,
  hotel_included: true, overnight: null, transport_type: null, intercity: null, flight_from: null, flight_to: null,
  guide_required: true, has_sightseeing: true, attractions: [], ...extra,
})

/** A departure day: no night, no sightseeing. */
const leave = (n: number) => day(n, { day_type: 'departure', has_sightseeing: false })

describe('what the days need that no service covers', () => {
  it('a day with nothing priced gets its night, guide and sites; the last day gets no night', () => {
    const needs = dayNeeds([day(1, { attractions: ['Giza Pyramids', 'Sphinx'] }), day(2, { day_type: 'departure', has_sightseeing: false })], [])
    expect(needs.map(n => [n.day_number, n.service_type, n.service_name])).toEqual([
      [1, 'accommodation', 'Hotel night (not priced yet)'],
      [1, 'guide', 'Guide (not priced yet)'],
      [1, 'entrance', 'Entrance tickets: Giza Pyramids, Sphinx (not priced yet)'],
    ])
    expect(needs.every(n => n.unpriced)).toBe(true)
  })

  it('nothing is added where a priced service already covers the need', () => {
    const priced = [
      svc(1, 'accommodation', 'Mena House'), svc(1, 'guide', 'Egyptologist'),
      svc(1, 'entrance', 'Giza Plateau'),
    ]
    expect(dayNeeds([day(1, { attractions: ['Giza Pyramids'] }), leave(2)], priced)).toEqual([])
  })

  it('a guide is needed only where the day asks for one AND has sightseeing', () => {
    const covered = [svc(1, 'accommodation', 'Mena House')]
    expect(dayNeeds([day(1, { day_type: 'arrival', has_sightseeing: false }), leave(2)], covered)).toEqual([])
    // A grid day with no guide sold is a choice, not a gap.
    expect(dayNeeds([day(1, { guide_required: false }), leave(2)], covered)).toEqual([])
    expect(dayNeeds([day(1, { guide_required: null }), leave(2)], covered)).toEqual([])
  })

  it('no night on a departure day, or where the day says none', () => {
    for (const extra of [
      { is_departure: true }, { overnight: false }, { hotel_included: false }, { accommodation_type: 'none' },
    ] as Partial<DayForTasks>[]) {
      expect(dayNeeds([day(1, { ...extra, guide_required: false }), leave(2)], [])).toEqual([])
    }
  })

  it('a cruise day needs a cruise night', () => {
    const needs = dayNeeds([day(1, { is_cruise_day: true, city: 'Aswan', overnight_city: 'Aswan' }), leave(2)], [])
    expect(needs.map(n => [n.service_type, n.service_name, n.city])).toEqual([
      ['cruise', 'Nile cruise night (not priced yet)', 'Aswan'],
      ['guide', 'Guide (not priced yet)', 'Aswan'],
    ])
  })

  it('a flight day with no flight service gets a flight row, routed from the previous city', () => {
    const needs = dayNeeds(
      [day(1, { city: 'Cairo' }), day(2, { city: 'Aswan', transport_type: 'flight', has_sightseeing: false }), leave(3)],
      [svc(1, 'accommodation', 'Mena House'), svc(1, 'guide', 'G'), svc(2, 'accommodation', 'Old Cataract')]
    )
    expect(needs.map(n => n.service_name)).toEqual(['Flight Cairo → Aswan (not priced yet)'])
  })

  it("a grid day saved as 'flight' intercity, or with flight_from/flight_to, needs a flight", () => {
    const covered = [svc(1, 'accommodation', 'H'), svc(1, 'guide', 'G')]
    expect(dayNeeds([day(1, { intercity: 'flight' }), leave(2)], covered).map(n => n.service_name))
      .toEqual(['Flight (not priced yet)'])
    expect(dayNeeds([day(1, { flight_from: 'Cairo', flight_to: 'Luxor' }), leave(2)], covered).map(n => n.service_name))
      .toEqual(['Flight Cairo → Luxor (not priced yet)'])
    expect(dayNeeds([day(1, { intercity: 'road' }), leave(2)], covered)).toEqual([])
  })

  it('a sightseeing grid day covered by an entrance_fee line needs no entrance row', () => {
    const covered = [svc(1, 'accommodation', 'H'), svc(1, 'guide', 'G'), svc(1, 'entrance_fee', 'Giza Plateau')]
    expect(dayNeeds([day(1, { attractions: ['Giza'] }), leave(2)], covered)).toEqual([])
  })

  it('unpriced nights in a row collapse into one checklist row, flagged unpriced, in the Accommodation task', () => {
    const plan = planItineraryTasks({
      itinerary, services: [], departments, today: '2026-10-01',
      days: [day(1, { has_sightseeing: false }), day(2, { has_sightseeing: false }), day(3)],
    })
    const acc = plan.tasks.find(t => t.service_type === 'accommodation')!
    expect(acc.items).toHaveLength(1)
    expect(acc.items[0]).toMatchObject({ day_from: 1, day_to: 2, nights: 2, unpriced: true, name: 'Hotel night (not priced yet)' })
    expect(acc.unpriced_count).toBe(1)
  })

  it('a booked "not priced" row keeps its tick when pricing later fills it in — it is not a cancellation', () => {
    const days = [day(1, { has_sightseeing: false }), day(2)]
    const first = planItineraryTasks({ itinerary, services: [], days, departments, today: '2026-10-01' })
    const created = planSync(first, []).actions.find(a => a.task.service_type === 'accommodation')!
    if (created.kind !== 'create') throw new Error('expected create')
    let rows = applyChecklistChange(created.checklist, { key: created.checklist[0].key, booked: true }, 't1')!
    rows = applyChecklistChange(rows, { key: rows[0].key, confirmation: 'MH-1' }, 't1')!
    const existing: ExistingGeneratedTask[] = [{
      id: 't', service_type: 'accommodation', status: 'done', archived: false, assigned_to: null,
      generation_snapshot: created.task.snapshot, checklist: rows,
    }]

    const priced = planItineraryTasks({ itinerary, services: [svc(1, 'accommodation', 'Mena House')], days, departments, today: '2026-10-01' })
    const after = planSync(priced, existing).actions[0]
    if (after.kind !== 'update') throw new Error(`expected update, got ${after.kind}`)
    expect(after.checklist).toHaveLength(1)
    expect(after.checklist[0]).toMatchObject({ name: 'Mena House', booked: true, confirmation: 'MH-1' })
    expect(after.checklist[0].is_new).toBeUndefined()
    expect(after.status).toBe('done')
  })
})

describe('Complete on a checklist task', () => {
  it('ticks every row', () => {
    const rows = mergeChecklist({ previous: [], planned: plan().tasks[0].items, isRegenerate: true })
    const done = completeChecklist(rows, 'now')
    if (!done.ok) throw new Error('expected ok')
    expect(done.items.every(r => r.booked && r.booked_at === 'now' && !r.is_new)).toBe(true)
    expect(statusFromChecklist(done.items, 'todo')).toBe('done')
  })

  it('is refused while a booking still has to be cancelled', () => {
    const rows: ChecklistItem[] = [
      ...mergeChecklist({ previous: [], planned: plan().tasks[0].items.slice(0, 1), isRegenerate: false }),
      { ...plan().tasks[0].items[1], booked: true, confirmation: null, booked_at: 'x', removed: true },
    ]
    expect(completeChecklist(rows, 'now')).toEqual({ ok: false, toCancel: 1 })
  })
})

describe("the pricing grid's service types", () => {
  const grid = (slot: string, type: string, name = slot) =>
    svc(1, type, name, { description: `[pricing-grid:${slot}] ${name}` })

  it('maps every grid slot to its task category', () => {
    expect(taskCategoryOf(grid('route', 'transportation'))).toBe('transportation')
    expect(taskCategoryOf(grid('airport_services', 'transfer'))).toBe('airport_service')
    expect(taskCategoryOf(grid('hotel_services', 'other'))).toBe('hotel_service')
    expect(taskCategoryOf(grid('boat_rides', 'other'))).toBe('other')
    expect(taskCategoryOf(grid('experiences', 'other'))).toBe('other')
    expect(taskCategoryOf(grid('other_group', 'other'))).toBe('other')
    expect(taskCategoryOf(grid('cruise', 'accommodation'))).toBe('accommodation')
    expect(taskCategoryOf(grid('sleeping_trains', 'transportation'))).toBe('accommodation')
    expect(taskCategoryOf(grid('entrance_fees', 'entrance_fee'))).toBe('entrance')
    expect(taskCategoryOf(grid('flights', 'flight'))).toBe('flight')
    expect(taskCategoryOf(grid('meals', 'meal'))).toBe('meal')
    // Nothing to book.
    expect(taskCategoryOf(grid('tipping', 'tip'))).toBeNull()
    expect(taskCategoryOf(grid('water', 'other'))).toBeNull()
  })

  it("the throughout guide's bed, meals and flight go by their service type", () => {
    expect(taskCategoryOf(svc(1, 'accommodation', 'Guide room', { description: '[pricing-grid:throughout_guide] bed' }))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, 'flight', 'Guide seat', { description: '[pricing-grid:throughout_guide] flight' }))).toBe('flight')
  })

  it('untagged lines map by type: transfer, entrance_fee, tip, activity', () => {
    expect(taskCategoryOf(svc(1, 'transfer', 'Meet & assist'))).toBe('airport_service')
    expect(taskCategoryOf(svc(1, 'entrance_fee', 'Karnak'))).toBe('entrance')
    expect(taskCategoryOf(svc(1, 'tip', 'Tips'))).toBeNull()
    expect(taskCategoryOf(svc(1, 'service_fee', 'Fee'))).toBeNull()
    expect(taskCategoryOf(svc(1, 'activity', 'Felucca'))).toBe('other')
    expect(taskCategoryOf(svc(1, 'hotel', 'Old Cataract'))).toBe('accommodation')
    expect(taskCategoryOf(svc(1, null as unknown as string, 'x'))).toBeNull()
  })

  it('a grid itinerary becomes tasks routed to the seeded departments', () => {
    const seeded = [
      ...departments,
      { id: 'exe2', name: 'Execution+', service_types: ['hotel_service', 'other'] },
    ]
    const p = planItineraryTasks({
      itinerary,
      departments: seeded,
      today: '2026-10-01',
      services: [
        grid('accommodation', 'accommodation', 'Mena House'),
        grid('airport_services', 'transfer', 'Meet & assist'),
        grid('hotel_services', 'other', 'Porterage'),
        grid('boat_rides', 'other', 'Felucca'),
        grid('entrance_fees', 'entrance_fee', 'Giza'),
        grid('tipping', 'tip', 'Tips'),
      ],
    })
    expect(p.tasks.map(t => [t.service_type, t.department.id])).toEqual([
      ['accommodation', 'res'],
      ['airport_service', 'exe'],
      ['hotel_service', 'exe2'],
      ['entrance', 'exe'],
      ['other', 'exe2'],
    ])
    expect(p.skipped).toEqual([])
  })
})

describe('routing a category to a department', () => {
  it('prefers a department claiming the category itself', () => {
    const deps = [
      { id: 'a', name: 'Cruises', service_types: ['cruise'] },
      { id: 'b', name: 'Hotels', service_types: ['accommodation'] },
    ]
    expect(departmentFor('accommodation', deps)).toEqual({ id: 'b', name: 'Hotels' })
  })

  it('falls back to a department claiming a type that maps to it', () => {
    expect(departmentFor('accommodation', [{ id: 'a', name: 'Cruises', service_types: ['cruise'] }])).toEqual({ id: 'a', name: 'Cruises' })
    expect(departmentFor('entrance', [{ id: 'x', name: 'Tickets', service_types: ['Entrance Fee'] }])).toEqual({ id: 'x', name: 'Tickets' })
  })

  it('no claim, no department', () => {
    expect(departmentFor('other', departments)).toBeNull()
    expect(departmentFor('meal', [{ id: 'n', name: 'Null', service_types: null }])).toBeNull()
  })
})
