// ============================================
// DEPARTURE SEATS — WHAT AN EDIT MAY SET
// ============================================
// PUT /api/departures/[id] copied max_pax / min_pax straight from the body, so
// a departure with 12 seats booked could be cut to 8 (status trigger then
// marks it 'full' with -4 seats left), and "abc", -3 or 2.5 reached the
// database as pax counts (documents audit, round 12).

export interface DeparturePaxRow {
  max_pax: number
  min_pax: number | null
  booked_pax: number
}

export type PaxCheck =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string }

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0

/** Shape checks that need no stored row: whole numbers, 0 or more. */
export function validatePaxFields(update: Record<string, unknown>): PaxCheck {
  if (update.max_pax !== undefined && (!isCount(update.max_pax) || update.max_pax < 1)) {
    return { ok: false, status: 400, error: 'max_pax must be a whole number of 1 or more' }
  }
  if (update.min_pax !== undefined && update.min_pax !== null && !isCount(update.min_pax)) {
    return { ok: false, status: 400, error: 'min_pax must be a whole number of 0 or more' }
  }
  return { ok: true }
}

/**
 * Checks against the stored departure: the new max can't drop below the seats
 * already booked, and min can't exceed max (with whichever side is unchanged
 * taken from the row).
 */
export function checkPaxAgainstRow(update: Record<string, unknown>, current: DeparturePaxRow): PaxCheck {
  const shape = validatePaxFields(update)
  if (!shape.ok) return shape

  const maxPax = update.max_pax !== undefined ? (update.max_pax as number) : current.max_pax
  const minPax = update.min_pax !== undefined ? (update.min_pax as number | null) : current.min_pax

  if (update.max_pax !== undefined && maxPax < current.booked_pax) {
    return {
      ok: false,
      status: 409,
      error: `Max seats (${maxPax}) can't be lower than the ${current.booked_pax} seat(s) already booked`,
    }
  }
  if (minPax != null && minPax > maxPax) {
    return { ok: false, status: 400, error: `Min pax (${minPax}) can't be more than max pax (${maxPax})` }
  }
  return { ok: true }
}
