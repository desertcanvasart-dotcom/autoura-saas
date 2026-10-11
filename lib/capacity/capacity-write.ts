import { shiftDateISO } from '@/lib/today'

// ============================================
// OPERATOR CAPACITY — WHAT A SAVE MAY WRITE
// ============================================
// The capacity routes upsert on (tenant_id, date). They used to build the row
// with `booked_groups: x ?? 0`, `status: x || 'available'`, `max_groups: x ?? 3`
// and `notes: x` — so a save that only changed the status reset the day's
// booked groups, guides and vehicles to 0, its max back to 3, and blanked the
// notes it did not send (documents audit, round 12). A save now writes only
// the columns the request actually carries; a new row gets the table defaults
// (status 'available', max_groups 3, booked counts 0).

/** Default groups per day: the operator_capacity.max_groups column default. */
export const DEFAULT_MAX_GROUPS = 3

export const CAPACITY_STATUSES = ['available', 'limited', 'busy', 'blackout'] as const

const COUNT_FIELDS = [
  'max_groups', 'booked_groups',
  'max_guides', 'booked_guides',
  'max_vehicles', 'booked_vehicles',
] as const
// Only max_groups / booked_groups are NOT NULL; the guide and vehicle columns
// are optional (NULL = not tracked) and a GET hands them back as null.
const NULLABLE_COUNTS = new Set<string>(['max_guides', 'booked_guides', 'max_vehicles', 'booked_vehicles'])
const TEXT_FIELDS = ['notes', 'internal_notes', 'reason'] as const

export type CapacityWriteValue = string | number | null
/** The writable operator_capacity columns, as an upsert payload accepts them. */
export interface CapacityFields {
  status?: string
  max_groups?: number
  booked_groups?: number
  max_guides?: number | null
  booked_guides?: number | null
  max_vehicles?: number | null
  booked_vehicles?: number | null
  notes?: string | null
  internal_notes?: string | null
  reason?: string | null
}
export type CapacityWrite =
  | { ok: true; fields: CapacityFields }
  | { ok: false; error: string }

const has = (o: Record<string, unknown>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined

/**
 * The capacity columns a request body supplies, validated. Keys the caller
 * did not send are left out entirely, so the upsert keeps what the row holds.
 */
export function buildCapacityWrite(input: Record<string, unknown>): CapacityWrite {
  const fields: Record<string, CapacityWriteValue> = {}

  if (has(input, 'status')) {
    const s = input.status
    if (typeof s !== 'string' || !(CAPACITY_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: `Invalid status. Must be one of: ${CAPACITY_STATUSES.join(', ')}` }
    }
    fields.status = s
  }

  for (const key of COUNT_FIELDS) {
    if (!has(input, key)) continue
    const v = input[key]
    if (v === null && NULLABLE_COUNTS.has(key)) {
      fields[key] = null
      continue
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return { ok: false, error: `${key} must be a whole number of 0 or more` }
    }
    fields[key] = v
  }

  for (const key of TEXT_FIELDS) {
    if (!has(input, key)) continue
    const v = input[key]
    if (v !== null && typeof v !== 'string') {
      return { ok: false, error: `${key} must be text` }
    }
    fields[key] = v
  }

  return { ok: true, fields: fields as CapacityFields }
}

/**
 * Split rows into batches that share the same set of columns. A bulk upsert
 * sends the union of every row's keys, and a row missing one of them has it
 * filled with NULL/default — which would reset exactly the columns that row
 * meant to leave alone.
 */
export function groupByColumns<T extends object>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const sig = Object.keys(row).sort().join(',')
    const list = groups.get(sig)
    if (list) list.push(row)
    else groups.set(sig, [row])
  }
  return Array.from(groups.values())
}

/**
 * Free group slots on a day. A day with no capacity row has the default
 * capacity and nothing booked; never below 0, even when a day is overbooked.
 */
export function freeGroupSlots(
  row?: { max_groups?: number | null; booked_groups?: number | null } | null
): number {
  const max = row?.max_groups ?? DEFAULT_MAX_GROUPS
  const booked = row?.booked_groups ?? 0
  return Math.max(0, max - booked)
}

/**
 * Every YYYY-MM-DD from start to end inclusive, by calendar arithmetic (no
 * local-time Date stepping). Returns null when the range is longer than
 * maxDays; an end before the start gives an empty list.
 */
export function capacityDateRange(start: string, end: string, maxDays = 366): string[] | null {
  const dates: string[] = []
  for (let d = start.slice(0, 10); d <= end.slice(0, 10); d = shiftDateISO(d, 1)) {
    if (dates.length >= maxDays) return null
    dates.push(d)
  }
  return dates
}
