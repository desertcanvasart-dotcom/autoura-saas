// ============================================
// Which days have the people and vehicles they need
// ============================================
// The Operations tab listed every resource type (Nile cruises, airport staff,
// hotel staff …) on every trip, and a type with nothing assigned looked the
// same whether the trip needed it or not: "Drivers 0" on a trip whose
// vehicle comes with a driver, and "Guides 0" on a trip with three guided
// days, read alike.
//
// This reads both sides per day:
//   · what the day NEEDS, from its service lines — by the same categories the
//     operations tasks use (lib/tasks/itinerary-tasks), so a guide line needs
//     a guide, a transport line a vehicle, an airport service airport staff;
//   · what is ASSIGNED, from the itinerary's resource assignments — one day
//     when the assignment names its day, else every day in its date range.
//
// Only guides, vehicles and airport staff are ever "needed": a hotel or a
// ship is booked through the booking's suppliers, and a driver often comes
// with the vehicle, so those show when assigned and are never called missing.
//
// Pure: the page and the tests share it.

import { taskCategoryOf } from '@/lib/tasks/itinerary-tasks'

export type CoverageType = 'guide' | 'vehicle' | 'driver' | 'airport_staff' | 'hotel' | 'cruise' | 'restaurant' | 'hotel_staff'

export const COVERAGE_LABELS: Record<CoverageType, string> = {
  guide: 'Guide',
  vehicle: 'Vehicle',
  driver: 'Driver',
  airport_staff: 'Airport staff',
  hotel: 'Hotel',
  cruise: 'Nile cruise',
  restaurant: 'Restaurant',
  hotel_staff: 'Hotel staff',
}

const ORDER: CoverageType[] = ['guide', 'vehicle', 'driver', 'airport_staff', 'hotel', 'cruise', 'restaurant', 'hotel_staff']

/** The task category whose lines need a resource of this type. */
const NEEDED_BY: Partial<Record<string, CoverageType>> = {
  guide: 'guide',
  transportation: 'vehicle',
  airport_service: 'airport_staff',
}

export interface CoverageDay {
  id?: string
  day_number: number
  date: string | null
  services: { service_type?: string | null; service_name?: string | null; description?: string | null }[]
}

export interface CoverageAssignment {
  resource_type: string
  resource_name?: string | null
  itinerary_day_id?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
}

export type CellState = 'assigned' | 'missing' | 'not_needed'

export interface CoverageCell {
  day: number
  state: CellState
  /** Who is assigned that day. */
  names: string[]
}

export interface CoverageRow {
  type: CoverageType
  label: string
  cells: CoverageCell[]
  /** Days that need this type and have nobody. */
  missing: number[]
}

const day = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)

function isType(t: string): t is CoverageType {
  return (ORDER as string[]).includes(t)
}

/** The resource types a day's lines need. */
export function dayNeeds(services: CoverageDay['services']): Set<CoverageType> {
  const out = new Set<CoverageType>()
  for (const s of services) {
    const category = taskCategoryOf({
      service_type: s.service_type ?? null,
      service_name: s.service_name ?? '',
      description: s.description ?? null,
    } as Parameters<typeof taskCategoryOf>[0])
    const type = category ? NEEDED_BY[category] : undefined
    if (type) out.add(type)
  }
  return out
}

function covers(a: CoverageAssignment, d: CoverageDay): boolean {
  if (a.itinerary_day_id) return a.itinerary_day_id === d.id
  const date = day(d.date)
  const start = day(a.start_date)
  if (!date || !start) return false
  const end = day(a.end_date) ?? start
  return start <= date && date <= end
}

/**
 * One row per resource type the trip uses — needed on some day, or assigned
 * — in a steady order, each with a cell per day.
 */
export function tripCoverage(days: readonly CoverageDay[], assignments: readonly CoverageAssignment[]): CoverageRow[] {
  const live = assignments.filter(a => isType(a.resource_type) && String(a.status ?? '').toLowerCase() !== 'cancelled')
  const needs = new Map(days.map(d => [d.day_number, dayNeeds(d.services)]))
  const used = new Set<CoverageType>()
  for (const set of needs.values()) set.forEach(t => used.add(t))
  for (const a of live) used.add(a.resource_type as CoverageType)

  return ORDER.filter(t => used.has(t)).map(type => {
    const cells = days.map(d => {
      const names = live
        .filter(a => a.resource_type === type && covers(a, d))
        .map(a => String(a.resource_name ?? '').trim())
        .filter(Boolean)
      const state: CellState = names.length > 0 ? 'assigned' : needs.get(d.day_number)?.has(type) ? 'missing' : 'not_needed'
      return { day: d.day_number, state, names: [...new Set(names)] }
    })
    return { type, label: COVERAGE_LABELS[type], cells, missing: cells.filter(c => c.state === 'missing').map(c => c.day) }
  })
}

export interface DayResource {
  type: CoverageType
  label: string
  state: Exclude<CellState, 'not_needed'>
  names: string[]
}

/** One day's column of the grid, for its day card: who is assigned, what is missing. */
export function dayResources(rows: readonly CoverageRow[], dayNumber: number): DayResource[] {
  return rows.flatMap(r => {
    const cell = r.cells.find(c => c.day === dayNumber)
    return cell && cell.state !== 'not_needed' ? [{ type: r.type, label: r.label, state: cell.state, names: cell.names }] : []
  })
}
