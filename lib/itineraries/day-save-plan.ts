// ============================================
// Saving the itinerary editor's days
// ============================================
// The editor saved each day in place and nothing else: a removed day was
// never deleted (it came back on reload, its services still priced), a
// reordered day kept its date, and a service added to a new day was filed by
// a day number gone stale after a reorder. This works out what a save must
// do, so the page only carries it out. Pure: the page and the tests share it.

import { shiftDateISO } from '@/lib/today'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A day already in the database (a new one carries a placeholder id). */
export const isSavedDayId = (id: string) => UUID.test(id)

export interface PlanDay {
  id: string
  day_number: number
  /** The number the database holds for it, when it is saved. */
  saved_number?: number
}

export interface DaySavePlan {
  /** Saved days the operator removed: deleted, with their services. */
  toDelete: string[]
  /** Saved days whose number changes: parked out of the way first, so no two
   *  days share a number mid-save (itinerary_days is unique on it). */
  toPark: Array<{ id: string; parkNumber: number }>
  /** Each day's date, from the trip's start; null when the trip has none. */
  dateOf: (dayNumber: number) => string | null
  /** The last day's date. */
  endDate: string | null
}

export function daySavePlan(input: { days: PlanDay[]; removedIds: string[]; startDate: string | null | undefined }): DaySavePlan {
  const kept = new Set(input.days.map(d => d.id))
  const toDelete = input.removedIds.filter(id => isSavedDayId(id) && !kept.has(id))
  const moving = input.days.filter(d => isSavedDayId(d.id) && d.saved_number !== d.day_number)
  // Above any number the trip can reach, and each its own.
  const base = Math.max(input.days.length, ...input.days.map(d => d.saved_number ?? 0)) + 1000
  const toPark = moving.map((d, i) => ({ id: d.id, parkNumber: base + i }))
  const start = /^\d{4}-\d{2}-\d{2}/.test(String(input.startDate ?? '')) ? String(input.startDate).slice(0, 10) : null
  const dateOf = (n: number) => (start ? shiftDateISO(start, n - 1) : null)
  return { toDelete, toPark, dateOf, endDate: input.days.length ? dateOf(input.days.length) : null }
}

/** Renumber days 1..n in their order, as new objects. */
export function renumberDays<D extends { day_number: number }>(days: D[]): D[] {
  return days.map((d, i) => (d.day_number === i + 1 ? d : { ...d, day_number: i + 1 }))
}
