// ============================================
// Duplicating an itinerary — what the copy keeps and what it leaves behind
// ============================================
// The copy is a new DRAFT of the same trip: its days, its services and their
// prices, the client and travellers. What belongs to the original trip's life
// stays behind:
//
//   · its identity — id, code, timestamps, the AI run and conversation that
//     made it (an idempotency key or thread id would collide or mislead);
//   · where it got to — status, sent / cancelled, payments, revenue, the PDF;
//   · who was assigned — the assigned_* columns are DERIVED from
//     itinerary_resources (migration 289) and the database refuses writes —
//     and the notes written for them;
//   · the exchange rates frozen at confirmation (fx_frozen): the copy is
//     priced afresh when it is confirmed.
//
// The columns copied are LISTED, not "all but": a column added later (a
// token, a status) is not carried into copies until someone decides it
// should be. lib/__tests__/itinerary-duplicate.test.ts holds each list to the
// database types. Bookings, invoices, payments, resources, tasks, expenses
// and share links are separate tables keyed to the original; nothing here
// touches them. Pure: the route and the tests share it.

type Row = Record<string, unknown>

export const ITINERARY_COPY_COLUMNS = [
  'client_id', 'client_name', 'client_email', 'client_phone', 'trip_name', 'travel_date',
  'start_date', 'end_date', 'total_days', 'num_adults', 'num_children', 'num_infants', 'num_travelers',
  'package_type', 'tier', 'total_cost', 'supplier_cost', 'profit', 'margin_percent', 'selling_price',
  'currency', 'cost_mode', 'notes', 'internal_notes', 'source', 'ai_model', 'generation_mode',
  'nationality', 'language', 'is_euro_passport', 'pickup_location', 'pickup_time', 'destinations',
  'partner_id', 'partner_commission_percent', 'partner_commission_amount', 'inclusions', 'exclusions',
  'assigned_to',
] as const

export const DAY_COPY_COLUMNS = [
  'day_number', 'date', 'title', 'description', 'city', 'overnight_city', 'is_arrival', 'is_departure',
  'is_free_day', 'guide_required', 'transport_type', 'accommodation_type', 'hotel_id', 'hotel_name',
  'attractions', 'lunch_included', 'dinner_included', 'hotel_included', 'flight_from', 'flight_to',
  'is_cruise_day', 'is_sailing_day', 'is_transfer_only', 'day_type', 'overnight', 'has_sightseeing',
  'airport_arrival', 'airport_departure', 'hotel_check_in', 'hotel_check_out', 'intercity',
] as const

/** commission_status is left out: back to its default ('pending'), the copy has earned nothing yet. */
export const SERVICE_COPY_COLUMNS = [
  'day_id', 'itinerary_day_id', 'service_type', 'service_name', 'description', 'supplier_id', 'supplier_name',
  'quantity', 'unit_cost', 'total_cost', 'service_date', 'is_included', 'client_price', 'rate_eur',
  'rate_non_eur', 'notes', 'commission_percent', 'commission_amount', 'commission_rate',
  'is_preferred_supplier', 'vehicle_type', 'is_optional', 'service_code', 'selling_price', 'cost',
  'currency', 'pickup_location', 'dropoff_location', 'pickup_time', 'supplier_currency',
  'supplier_cost_original', 'exchange_rate_used', 'cost_per_unit', 'sold_by_supplier_id', 'rate_table', 'rate_id',
] as const

/** The select lists: what is copied, plus the ids the copy is wired by. */
export const ITINERARY_SELECT = ['id', 'itinerary_code', ...ITINERARY_COPY_COLUMNS].join(', ')
export const DAY_SELECT = ['id', ...DAY_COPY_COLUMNS].join(', ')
export const SERVICE_SELECT = ['id', ...SERVICE_COPY_COLUMNS].join(', ')

const pick = (row: Row, columns: readonly string[]): Row => {
  const out: Row = {}
  for (const c of columns) if (c in row) out[c] = row[c]
  return out
}

/** A new code in the original's style: "ITN-S-2026-8987" → "ITN-S-<this year>-<4 digits>". */
export function copyCode(original: string | null | undefined, year: number, random: number): string {
  const m = String(original ?? '').match(/^([A-Z]+(?:-[A-Z]+)?)-\d{4}-\d+$/)
  const prefix = m ? m[1] : 'ITN'
  return `${prefix}-${year}-${random}`
}

export function copyItinerary(row: Row, code: string): Row {
  return {
    ...pick(row, ITINERARY_COPY_COLUMNS),
    itinerary_code: code,
    status: 'draft',
    trip_name: `${String(row.trip_name ?? 'Itinerary').trim()} (copy)`,
  }
}

export function copyDay(row: Row, itineraryId: string): Row {
  return { ...pick(row, DAY_COPY_COLUMNS), itinerary_id: itineraryId }
}

/**
 * A service, pointed at the copy's days. A line whose day is not among the
 * copied days is left out (null), rather than attached to the wrong one.
 */
export function copyService(row: Row, itineraryId: string, dayIds: ReadonlyMap<string, string>): Row | null {
  const oldDay = (row.itinerary_day_id ?? row.day_id) as string | null | undefined
  const newDay = oldDay ? dayIds.get(oldDay) : undefined
  if (oldDay && !newDay) return null
  const out: Row = { ...pick(row, SERVICE_COPY_COLUMNS), itinerary_id: itineraryId }
  if ('itinerary_day_id' in row) out.itinerary_day_id = row.itinerary_day_id ? newDay ?? null : null
  if ('day_id' in row) out.day_id = row.day_id ? dayIds.get(String(row.day_id)) ?? null : null
  return out
}
