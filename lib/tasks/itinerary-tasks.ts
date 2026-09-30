// ============================================
// ITINERARY TASKS — one operations task per kind of service
// ============================================
// Each itinerary gets at most ONE generated task per category: all its hotels
// (plus Nile cruises and sleeper trains — every night's bed) in one
// Accommodation task, every transfer in one Transportation task, and so on.
//
// Each task carries a CHECKLIST (tasks.checklist, migration 392): one row per
// service, which staff tick as booked and give a confirmation number. The
// task is done when every row is ticked and nothing is waiting to be
// cancelled.
//
// WHY NOT THE AI ANY MORE
//
// These tasks used to be written by a model from the raw service list: slow,
// paid for, different on every run, and never de-duplicated — generating
// twice made every task twice. Grouping services by category is a fixed rule,
// so plain code does it the same way every time.
//
// REGENERATING SYNCS, IT DOES NOT DUPLICATE
//
// A row's identity is its KEY — the service line as text (day, date, city,
// service, quantity, supplier, notes). Generating again compares keys:
//   - a row whose key is unchanged keeps its tick and confirmation number;
//   - a new or changed row arrives unticked and flagged "new";
//   - a row that left the itinerary is dropped — unless it was already
//     booked, in which case it stays, flagged "removed", until someone marks
//     the booking cancelled. A booking is never silently forgotten.
// The task's status follows its rows, so a finished task that gains a new row
// is reopened, and one whose rows are all still booked stays done.
// Tasks created by hand (no service_type) are never touched.
//
// WHAT THE DAYS SAY, NOT ONLY WHAT WAS PRICED
//
// Service rows only exist for what pricing produced: no hotel rate, no hotel
// row. So the days are read too (dayNeeds): a hotel night, cruise night,
// flight, guide or entrance tickets the day calls for, with no service row
// covering it, still becomes a checklist row — flagged "not priced yet" —
// instead of silently missing.

import { normalizeServiceType } from '@/lib/service-types'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface ItineraryForTasks {
  itinerary_code: string
  client_name: string | null
  trip_name?: string | null
  start_date: string | null
  end_date: string | null
  num_adults: number | null
  num_children: number | null
  num_infants?: number | null
}

export interface ServiceForTasks {
  day_number: number
  date: string | null
  city: string | null
  overnight_city?: string | null
  service_type: string | null
  service_name: string
  /** The pricing grid tags its lines "[pricing-grid:<slot>] …" — the slot is
   *  what the line really is (the grid saves hotel services, boat rides and
   *  water all as 'other'). */
  description?: string | null
  quantity: number | null
  supplier_name: string | null
  notes: string | null
  /** A need read from the day (dayNeeds), with no priced service behind it. */
  unpriced?: boolean
}

/** The day fields that say what a day needs (itinerary_days). */
export interface DayForTasks {
  day_number: number
  date: string | null
  city: string | null
  overnight_city: string | null
  day_type: string | null
  is_departure: boolean | null
  is_cruise_day: boolean | null
  is_sailing_day: boolean | null
  accommodation_type: string | null
  hotel_included: boolean | null
  overnight: boolean | null
  transport_type: string | null
  intercity: string | null
  flight_from: string | null
  flight_to: string | null
  guide_required: boolean | null
  has_sightseeing: boolean | null
  attractions: string[] | null
}

interface CategoryRule {
  label: string
  /** Days before the trip starts that the work should be done by. */
  leadDays: number
  priority: TaskPriority
}

/** The categories generated, in the order tasks are listed. */
export const TASK_CATEGORIES: Readonly<Record<string, CategoryRule>> = {
  accommodation: { label: 'Accommodation', leadDays: 14, priority: 'high' },
  flight: { label: 'Flights', leadDays: 14, priority: 'high' },
  transportation: { label: 'Transportation', leadDays: 7, priority: 'medium' },
  guide: { label: 'Guides', leadDays: 7, priority: 'medium' },
  airport_service: { label: 'Airport services', leadDays: 5, priority: 'medium' },
  hotel_service: { label: 'Hotel services', leadDays: 5, priority: 'medium' },
  meal: { label: 'Meals', leadDays: 5, priority: 'medium' },
  entrance: { label: 'Entrance tickets', leadDays: 3, priority: 'low' },
  other: { label: 'Other services', leadDays: 7, priority: 'medium' },
}

/** Anything else an operator has added (a custom type) still gets a task. */
const DEFAULT_RULE = { leadDays: 7, priority: 'medium' as TaskPriority }

/** No task: nothing to book (handed out on the day, or a fee line). */
const NO_TASK = null

/**
 * The service types itinerary_services actually holds, mapped to a task
 * category. The pricing grid writes 'transfer' for airport services,
 * 'entrance_fee', 'tip' and 'other'; the itinerary editor and quotes write
 * the newer names. Unlisted types are their own category.
 */
const TYPE_TO_CATEGORY: Readonly<Record<string, string | null>> = {
  hotel: 'accommodation',
  cruise: 'accommodation',
  entrance_fee: 'entrance',
  transfer: 'airport_service',
  airport_services: 'airport_service',
  hotel_services: 'hotel_service',
  activity: 'other',
  extra: 'other',
  tip: NO_TASK,
  tips: NO_TASK,
  supplies: NO_TASK,
  service_fee: NO_TASK,
}

/** The pricing grid's slots (the "[pricing-grid:<slot>]" tag), by category. */
const GRID_SLOT_TO_CATEGORY: Readonly<Record<string, string | null>> = {
  route: 'transportation',
  guide: 'guide',
  airport_services: 'airport_service',
  hotel_services: 'hotel_service',
  tipping: NO_TASK,
  boat_rides: 'other',
  experiences: 'other',
  water: NO_TASK,
  other_group: 'other',
  other_pp: 'other',
  accommodation: 'accommodation',
  cruise: 'accommodation',
  // The ticket IS the night's bed, so it is booked alongside the hotels.
  sleeping_trains: 'accommodation',
  entrance_fees: 'entrance',
  flights: 'flight',
  meals: 'meal',
  // throughout_guide: the guide's own bed / meals / flight — by service type.
}

const GRID_TAG = /^\[pricing-grid:([a-z_]+)\]/

export function gridSlotOf(description: string | null | undefined): string | null {
  return description?.match(GRID_TAG)?.[1] ?? null
}

/** A service type (or a department's claim) as a task category. */
export function categoryOfType(serviceType: string | null | undefined): string | null {
  const type = normalizeServiceType(serviceType ?? '')
  if (!type) return null
  return type in TYPE_TO_CATEGORY ? TYPE_TO_CATEGORY[type] : type
}

/**
 * A sleeper train priced outside the grid (a transportation line) is still
 * the night's bed.
 */
export function isSleeperTrain(service: Pick<ServiceForTasks, 'service_name' | 'description'>): boolean {
  if (gridSlotOf(service.description) === 'sleeping_trains') return true
  return /sleep(ing|er)[\s_-]*train|\bsleeper\b/i.test(service.service_name ?? '')
}

/** The task category a service belongs to, or null for no task at all. */
export function taskCategoryOf(service: ServiceForTasks): string | null {
  const slot = gridSlotOf(service.description)
  if (slot && slot in GRID_SLOT_TO_CATEGORY) return GRID_SLOT_TO_CATEGORY[slot]
  const category = categoryOfType(service.service_type)
  if (category === 'transportation' && isSleeperTrain(service)) return 'accommodation'
  return category
}

export function categoryLabel(category: string): string {
  return TASK_CATEGORIES[category]?.label
    ?? category.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function categoryRule(category: string) {
  return TASK_CATEGORIES[category] ?? DEFAULT_RULE
}

export interface DepartmentForTasks {
  id: string
  name: string
  service_types: string[] | null
}

/**
 * The department a category's task goes to: the first active department that
 * claims it — directly ('accommodation') or through a type that maps to it
 * (a department claiming 'cruise' also takes the Accommodation task when no
 * department claims 'accommodation' itself).
 */
export function departmentFor(category: string, departments: DepartmentForTasks[]): { id: string; name: string } | null {
  const claims = (d: DepartmentForTasks, direct: boolean) =>
    (d.service_types ?? []).some(t =>
      direct ? normalizeServiceType(t) === category : categoryOfType(t) === category)
  const dept = departments.find(d => claims(d, true)) ?? departments.find(d => claims(d, false))
  return dept ? { id: dept.id, name: dept.name } : null
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ============================================
// CHECKLIST ROWS
// ============================================

/** One service (or a run of identical consecutive days) as generated. */
export interface PlannedItem {
  /** Identity across regenerations: the service line as text. */
  key: string
  day_from: number
  day_to: number
  date_from: string | null
  date_to: string | null
  city: string | null
  name: string
  quantity: number
  /** Accommodation rows only: how many nights the row covers. */
  nights: number | null
  supplier: string | null
  notes: string | null
  /** Read from the day, not priced — no service line behind it yet. */
  unpriced?: boolean
}

/** A row as stored on the task: the generated fields plus its booking state. */
export interface ChecklistItem extends PlannedItem {
  booked: boolean
  confirmation: string | null
  booked_at: string | null
  /** Appeared when the itinerary changed after the task was first made. */
  is_new?: boolean
  /** Left the itinerary after it was booked — the booking must be cancelled. */
  removed?: boolean
}

/** What a generated task listed when last written — compared on regenerate. */
export interface GenerationSnapshot {
  header: string
  /** The rows' keys, in order. */
  lines: string[]
}

function paxText(it: ItineraryForTasks): string {
  const n = (v: number | null | undefined) => v ?? 0
  return [
    `${n(it.num_adults)} adult${n(it.num_adults) === 1 ? '' : 's'}`,
    n(it.num_children) > 0 ? `${n(it.num_children)} child${n(it.num_children) === 1 ? '' : 'ren'}` : '',
    n(it.num_infants) > 0 ? `${n(it.num_infants)} infant${n(it.num_infants) === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ')
}

function headerOf(it: ItineraryForTasks): string {
  const first = [it.itinerary_code, it.client_name, it.trip_name].filter(Boolean).join(' · ')
  const dates = it.start_date ? `${it.start_date} → ${it.end_date ?? '?'}` : 'Dates not set'
  return `${first}\n${dates} · ${paxText(it)}`
}

/**
 * One row per service, in day order. Identical services on consecutive days
 * (the same hotel four nights running) collapse into one row with a day range.
 */
export function serviceItems(category: string, services: ServiceForTasks[]): PlannedItem[] {
  const sorted = services
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day_number - b.s.day_number || a.i - b.i)
    .map(x => x.s)

  const sameItem = (a: ServiceForTasks, b: ServiceForTasks) =>
    !!a.unpriced === !!b.unpriced &&
    a.service_name === b.service_name &&
    (a.supplier_name ?? '') === (b.supplier_name ?? '') &&
    (a.quantity ?? 1) === (b.quantity ?? 1) &&
    (a.notes ?? '') === (b.notes ?? '')

  const runs: { first: ServiceForTasks; last: ServiceForTasks; days: number }[] = []
  for (const s of sorted) {
    const run = runs[runs.length - 1]
    if (run && sameItem(run.last, s) && s.day_number === run.last.day_number + 1) {
      run.last = s
      run.days++
    } else {
      runs.push({ first: s, last: s, days: 1 })
    }
  }

  const isBed = category === 'accommodation'
  return runs.map(({ first, last, days }) => {
    // Where the guests SLEEP is what a hotel booking needs; otherwise the city
    // the service happens in.
    const city = (isBed ? first.overnight_city || first.city : first.city) || null
    const quantity = first.quantity ?? 1
    const notes = first.notes ? first.notes.replace(/\s+/g, ' ').trim() : null

    // The key is the row as text — also what the task's plain-text
    // description lists, so it reads naturally anywhere it is shown.
    const dayText = days > 1 ? `Days ${first.day_number}–${last.day_number}` : `Day ${first.day_number}`
    const dateText = days > 1 && first.date && last.date ? `${first.date} → ${last.date}` : first.date
    let item = first.service_name
    if (quantity !== 1) item += ` ×${quantity}`
    if (isBed) item += ` (${days} night${days === 1 ? '' : 's'})`
    let key = `${[dayText, dateText, city].filter(Boolean).join(' · ')} — ${item}`
    if (first.supplier_name) key += ` · Supplier: ${first.supplier_name}`
    if (notes) key += ` · Notes: ${notes}`

    return {
      key,
      day_from: first.day_number,
      day_to: last.day_number,
      date_from: first.date,
      date_to: last.date,
      city,
      name: first.service_name,
      quantity,
      nights: isBed ? days : null,
      supplier: first.supplier_name || null,
      notes,
      ...(first.unpriced ? { unpriced: true } : {}),
    }
  })
}

// ============================================
// DAY NEEDS — what the days call for that no service row covers
// ============================================

/** Label suffix on rows read from the day; part of the row's key. */
export const NOT_PRICED = '(not priced yet)'

/**
 * Needs the days state that no service row covers, as unpriced services.
 *
 * Deliberately conservative — a false row is noise someone must tick:
 *   - a night (hotel, or cabin on a cruise day) on every day but the last,
 *     unless the day is a departure or says no hotel / no overnight /
 *     accommodation "none";
 *   - a flight where the day says it flies;
 *   - a guide only where the day ASKS for one (guide_required) and has
 *     sightseeing — a grid day without a guide sold is a choice, not a gap;
 *   - entrance tickets where the day lists attractions.
 *
 * MEALS ARE NOT READ: a meal included in the hotel or cruise board has no row
 * of its own, so a missing meal row usually means "covered", not "forgotten".
 */
export function dayNeeds(days: DayForTasks[], services: ServiceForTasks[]): ServiceForTasks[] {
  if (days.length === 0) return []
  const lastDay = Math.max(...days.map(d => d.day_number))
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number)

  const has = (n: number, category: string) =>
    services.some(s => s.day_number === n && taskCategoryOf(s) === category)

  const needs: ServiceForTasks[] = []
  const need = (d: DayForTasks, type: string, name: string, city: string | null = d.city) =>
    needs.push({
      day_number: d.day_number, date: d.date, city, overnight_city: d.overnight_city,
      service_type: type, service_name: `${name} ${NOT_PRICED}`, quantity: 1,
      supplier_name: null, notes: null, unpriced: true,
    })

  sorted.forEach((d, i) => {
    const prev = i > 0 ? sorted[i - 1] : null
    const cruise = d.is_cruise_day === true || d.is_sailing_day === true ||
      d.day_type === 'cruise' || d.accommodation_type === 'cruise'
    const sightseeing = d.has_sightseeing ?? ((d.attractions?.length ?? 0) > 0 || d.day_type === 'tour')

    // The night.
    const sleepsHere = d.day_number < lastDay && d.day_type !== 'departure' && d.is_departure !== true &&
      d.overnight !== false && d.accommodation_type !== 'none' &&
      (cruise || (d.hotel_included !== false && !!(d.overnight_city || d.city)))
    if (sleepsHere && !has(d.day_number, 'accommodation')) {
      if (cruise) need(d, 'cruise', 'Nile cruise night', d.overnight_city || d.city)
      else need(d, 'accommodation', 'Hotel night', d.overnight_city || d.city)
    }

    // The flight.
    const flies = d.transport_type === 'flight' || d.intercity === 'flight' || !!d.flight_from || !!d.flight_to
    if (flies && !has(d.day_number, 'flight')) {
      const from = d.flight_from || prev?.city || null
      const to = d.flight_to || d.city || null
      need(d, 'flight', from && to && from !== to ? `Flight ${from} → ${to}` : 'Flight')
    }

    // Sightseeing days: guide and entrance tickets.
    if (sightseeing && d.guide_required === true && !has(d.day_number, 'guide')) need(d, 'guide', 'Guide')
    const sites = (d.attractions ?? []).map(a => a.trim()).filter(Boolean)
    if (sites.length > 0 && !has(d.day_number, 'entrance')) need(d, 'entrance', `Entrance tickets: ${sites.join(', ')}`)
  })
  return needs
}

export function taskDescription(snapshot: GenerationSnapshot): string {
  return `${snapshot.header}\n\n${snapshot.lines.join('\n')}`
}

// ============================================
// PLAN — which tasks the itinerary needs
// ============================================

export interface PlannedTask {
  service_type: string
  label: string
  title: string
  description: string
  items: PlannedItem[]
  snapshot: GenerationSnapshot
  due_date: string | null
  priority: TaskPriority
  department: { id: string; name: string }
  service_count: number
  /** Rows read from the days with no priced service behind them. */
  unpriced_count: number
}

export interface SkippedCategory {
  service_type: string
  label: string
  service_count: number
  reason: 'no_active_department'
}

export interface TaskPlan {
  tasks: PlannedTask[]
  skipped: SkippedCategory[]
}

/**
 * Plan the tasks for an itinerary. `departments` must be the ACTIVE ones: a
 * category no active department handles is skipped entirely — switching a
 * department off means its work is not generated.
 */
export function planItineraryTasks(input: {
  itinerary: ItineraryForTasks
  services: ServiceForTasks[]
  departments: DepartmentForTasks[]
  today: string
  /** The itinerary's days; their needs no service covers become unpriced rows. */
  days?: DayForTasks[]
}): TaskPlan {
  const { itinerary, departments, today } = input
  const services = [...input.services, ...dayNeeds(input.days ?? [], input.services)]

  const byCategory = new Map<string, ServiceForTasks[]>()
  for (const s of services) {
    const category = taskCategoryOf(s)
    if (!category) continue
    ;(byCategory.get(category) ?? byCategory.set(category, []).get(category)!).push(s)
  }

  const order = Object.keys(TASK_CATEGORIES)
  const categories = [...byCategory.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b)
  })

  const header = headerOf(itinerary)
  const tasks: PlannedTask[] = []
  const skipped: SkippedCategory[] = []

  for (const category of categories) {
    const list = byCategory.get(category)!
    const label = categoryLabel(category)
    // The combined Accommodation task goes where 'accommodation' is routed,
    // even when cruises are routed elsewhere — one task, one owner.
    const dept = departmentFor(category, departments)
    if (!dept) {
      skipped.push({ service_type: category, label, service_count: list.length, reason: 'no_active_department' })
      continue
    }

    const rule = categoryRule(category)
    const items = serviceItems(category, list)
    const snapshot: GenerationSnapshot = { header, lines: items.map(i => i.key) }
    let due: string | null = null
    if (itinerary.start_date) {
      due = addDaysISO(itinerary.start_date, -rule.leadDays)
      // A trip booked late: the work is due now, not on a date already past.
      if (due < today) due = today
    }

    tasks.push({
      service_type: category,
      label,
      // Short: the rows, dates and progress are shown by the checklist.
      title: `${label} — ${[itinerary.itinerary_code, itinerary.client_name].filter(Boolean).join(' · ')}`.slice(0, 500),
      description: taskDescription(snapshot),
      items,
      snapshot,
      due_date: due,
      priority: rule.priority,
      department: { id: dept.id, name: dept.name },
      service_count: list.length,
      unpriced_count: items.filter(i => i.unpriced).length,
    })
  }

  return { tasks, skipped }
}

// ============================================
// CHECKLIST STATE — merging on regenerate, ticking, and the task's status
// ============================================

/**
 * Carry each row's booking state over to the newly generated rows.
 *
 * `previous` is the task's stored checklist, or null for a task generated
 * before checklists existed; then `legacyLines` (its snapshot) stands in, and
 * a task that was already done counts every one of its old rows as booked.
 * `isRegenerate` marks genuinely new rows as new — not on first creation.
 */
export function mergeChecklist(input: {
  previous: ChecklistItem[] | null
  legacyLines?: string[] | null
  legacyDone?: boolean
  planned: PlannedItem[]
  isRegenerate: boolean
}): ChecklistItem[] {
  const { planned, isRegenerate } = input
  const previous: ChecklistItem[] = input.previous
    ?? (input.legacyLines ?? []).map(key => ({
      key, day_from: 0, day_to: 0, date_from: null, date_to: null, city: null,
      name: key, quantity: 1, nights: null, supplier: null, notes: null,
      booked: !!input.legacyDone, confirmation: null, booked_at: null,
    }))

  const before = new Map(previous.map(p => [p.key, p]))
  const plannedKeys = new Set(planned.map(p => p.key))

  const rows: ChecklistItem[] = planned.map(p => {
    const prev = before.get(p.key)
    if (prev) {
      return {
        ...p,
        booked: prev.booked,
        confirmation: prev.confirmation,
        booked_at: prev.booked_at,
        ...(prev.is_new && !prev.booked ? { is_new: true } : {}),
      }
    }
    return { ...p, booked: false, confirmation: null, booked_at: null, ...(isRegenerate ? { is_new: true } : {}) }
  })

  // A booked "not priced yet" row that pricing has since filled in is the SAME
  // booking: its tick and confirmation move to the priced row that now covers
  // that day, rather than flagging the booking for cancellation.
  const claimed = new Set<number>()
  for (const prev of previous) {
    if (plannedKeys.has(prev.key) || !prev.booked || !prev.unpriced) continue
    const index = rows.findIndex((r, i) =>
      !claimed.has(i) && !before.has(r.key) && !r.unpriced &&
      r.day_from <= prev.day_from && prev.day_from <= r.day_to)
    if (index < 0) continue
    claimed.add(index)
    const { is_new: _drop, ...row } = rows[index]
    void _drop
    rows[index] = { ...row, booked: true, confirmation: prev.confirmation, booked_at: prev.booked_at }
    plannedKeys.add(prev.key) // handled — not a cancellation
  }

  // Booked rows that left the itinerary stay until the cancellation is done.
  for (const prev of previous) {
    if (plannedKeys.has(prev.key) || !prev.booked) continue
    rows.push({ ...prev, removed: true, is_new: undefined })
  }
  return rows
}

export interface ChecklistProgress {
  total: number
  booked: number
  toCancel: number
  newRows: number
  /** Unbooked rows read from the days, with no priced service yet. */
  unpriced: number
  complete: boolean
}

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const active = items.filter(i => !i.removed)
  const booked = active.filter(i => i.booked).length
  const toCancel = items.filter(i => i.removed).length
  return {
    total: active.length,
    booked,
    toCancel,
    newRows: active.filter(i => i.is_new && !i.booked).length,
    unpriced: active.filter(i => i.unpriced && !i.booked).length,
    complete: active.length > 0 && booked === active.length && toCancel === 0,
  }
}

/** The task status its checklist implies, starting from the current one. */
export function statusFromChecklist(items: ChecklistItem[], current: string | null): string {
  const p = checklistProgress(items)
  if (p.complete) return 'done'
  const started = p.booked > 0 || p.toCancel > 0
  if (current === 'done') return started ? 'in_progress' : 'todo'
  if ((current ?? 'todo') === 'todo' && started) return 'in_progress'
  return current ?? 'todo'
}

/**
 * "Complete" on a checklist task: tick every row, so the status and the rows
 * can never disagree. (Setting only the status used to leave "Done, 0 of 2
 * booked" — and the next tick or regenerate moved it back to To Do.) Refused
 * while a booking still has to be cancelled: completing must not quietly
 * treat a live booking as dealt with.
 */
export function completeChecklist(items: ChecklistItem[], now: string):
  | { ok: true; items: ChecklistItem[] }
  | { ok: false; toCancel: number } {
  const toCancel = items.filter(i => i.removed).length
  if (toCancel > 0) return { ok: false, toCancel }
  return {
    ok: true,
    items: items.map(i => {
      if (i.booked) return i
      const { is_new: _drop, ...row } = i
      void _drop
      return { ...row, booked: true, booked_at: now }
    }),
  }
}

export type ChecklistChange =
  | { key: string; booked: boolean }
  | { key: string; confirmation: string | null }
  /** A removed row's booking has been cancelled: drop the row. */
  | { key: string; cancelled: true }

/** Apply one change a user made. Returns null when the row does not exist. */
export function applyChecklistChange(items: ChecklistItem[], change: ChecklistChange, now: string): ChecklistItem[] | null {
  const index = items.findIndex(i => i.key === change.key)
  if (index < 0) return null
  const row = items[index]
  if ('cancelled' in change) {
    if (!row.removed) return null
    return items.filter((_, i) => i !== index)
  }
  const next = { ...row }
  if ('booked' in change) {
    next.booked = change.booked
    next.booked_at = change.booked ? now : null
    if (change.booked) delete next.is_new
  } else {
    const c = (change.confirmation ?? '').trim().slice(0, 100)
    next.confirmation = c || null
  }
  return items.map((it, i) => (i === index ? next : it))
}

// ============================================
// SYNC — what regenerating does to the tasks already there
// ============================================

export interface ExistingGeneratedTask {
  id: string
  service_type: string
  status: string | null
  archived: boolean | null
  assigned_to: string | null
  generation_snapshot: GenerationSnapshot | null
  checklist: ChecklistItem[] | null
}

export type TaskAction =
  | { kind: 'create'; task: PlannedTask; checklist: ChecklistItem[]; status: string }
  | { kind: 'update' | 'reopen'; id: string; task: PlannedTask; checklist: ChecklistItem[]; status: string; tripChanged: boolean }
  | { kind: 'unchanged'; id: string; task: PlannedTask }

export interface OrphanedTask {
  id: string
  service_type: string
  label: string
  /** 'excluded': its category has no active department now.
   *  'removed': the itinerary no longer has any of its services. */
  reason: 'excluded' | 'removed'
}

export interface SyncPlan {
  actions: TaskAction[]
  orphaned: OrphanedTask[]
}

function isFinished(t: ExistingGeneratedTask): boolean {
  return t.status === 'done' || t.archived === true
}

function sameSnapshot(a: GenerationSnapshot | null, b: GenerationSnapshot): boolean {
  return !!a && a.header === b.header &&
    a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])
}

export function planSync(plan: TaskPlan, existing: ExistingGeneratedTask[]): SyncPlan {
  // Should there ever be two (a double-click), the first is the one kept in sync.
  const byType = new Map<string, ExistingGeneratedTask>()
  for (const t of existing) if (!byType.has(t.service_type)) byType.set(t.service_type, t)

  const actions: TaskAction[] = plan.tasks.map(task => {
    const current = byType.get(task.service_type)
    if (!current) {
      const checklist = mergeChecklist({ previous: [], planned: task.items, isRegenerate: false })
      return { kind: 'create', task, checklist, status: 'todo' }
    }
    // Unchanged — unless it predates checklists, then it is converted once.
    if (current.checklist && sameSnapshot(current.generation_snapshot, task.snapshot)) {
      return { kind: 'unchanged', id: current.id, task }
    }
    const checklist = mergeChecklist({
      previous: current.checklist,
      legacyLines: current.generation_snapshot?.lines ?? null,
      legacyDone: isFinished(current),
      planned: task.items,
      isRegenerate: true,
    })
    const status = statusFromChecklist(checklist, current.status)
    return {
      kind: isFinished(current) && status !== 'done' ? 'reopen' : 'update',
      id: current.id,
      task,
      checklist,
      status,
      tripChanged: (current.generation_snapshot?.header ?? '') !== task.snapshot.header,
    }
  })

  const planned = new Set(plan.tasks.map(t => t.service_type))
  const excluded = new Set(plan.skipped.map(s => s.service_type))
  const orphaned: OrphanedTask[] = []
  for (const [type, t] of byType) {
    if (planned.has(type)) continue
    orphaned.push({ id: t.id, service_type: type, label: categoryLabel(type), reason: excluded.has(type) ? 'excluded' : 'removed' })
  }

  return { actions, orphaned }
}
