// ============================================
// NEEDS ATTENTION — the dashboard's exceptions list (C4)
// ============================================
// A dashboard that shows totals tells an operator how the month is going. It
// does not tell them what will go wrong on Tuesday. This scans upcoming
// departures for the things that must be fixed BEFORE a group flies, each
// with a deep link to the screen that fixes it:
//
//   * balance unpaid with its deadline reached or close
//   * traveller details missing for some passengers
//   * no guide assigned on the linked itinerary
//   * a portal change request still pending — a customer is waiting
//
// The logic is PURE and lives here rather than in the route, so every rule is
// testable without a database: these are judgements about someone's trip, and
// "surfaced too late" is indistinguishable from "not surfaced at all".

export const HORIZON_DAYS = 45
/** Chasing a customer payment takes days, so a balance deadline surfaces
 *  earlier than a departure does. */
export const BALANCE_SOON_DAYS = 14
export const URGENT_DAYS = 7

export type AttentionType = 'balance_due' | 'details_missing' | 'no_guide' | 'change_request' | 'extra_request'
export type Severity = 'urgent' | 'soon'

export interface AttentionItem {
  type: AttentionType
  severity: Severity
  bookingId: string
  bookingNumber: string | null
  tripName: string | null
  clientName: string | null
  startDate: string | null
  detail: Record<string, unknown>
  href: string
}

export interface AttentionBooking {
  id: string
  booking_number?: string | null
  trip_name?: string | null
  client_id?: string | null
  start_date?: string | null
  status?: string | null
  itinerary_id?: string | null
  balance_due?: number | string | null
  payment_deadline?: string | null
}

export interface AttentionPassenger {
  booking_id: string
  passport_number?: string | null
  date_of_birth?: string | null
}

export interface AttentionChangeRequest {
  booking_id: string
  kind?: string | null
  requested_count?: number | null
  created_at?: string | null
}

/** An option a traveller asked for or accepted from the portal (migration
 *  321). Both wait on the office: 'requested' needs a price, 'accepted' needs
 *  the thing secured before it can be confirmed and billed. */
export interface AttentionExtraRequest {
  booking_id: string
  title?: string | null
  status?: string | null
  created_at?: string | null
}

export interface AttentionInput {
  /** Bookings inside the departure horizon. */
  departing: AttentionBooking[]
  /** Bookings whose balance deadline is near — a deadline can bite long
   *  before the trip enters the departure window. */
  balanceDue: AttentionBooking[]
  passengers: AttentionPassenger[]
  changeRequests: AttentionChangeRequest[]
  /** Portal extras waiting on the office. Optional: absent before migration 321. */
  extraRequests?: AttentionExtraRequest[]
  /** itinerary id → assigned guide (null when unassigned). */
  guideByItinerary: Map<string, string | null>
  /** client id → display name. */
  clientNames?: Map<string, string>
  /** Injected for testability; defaults to today. */
  today?: string
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** A passenger counts as complete once we hold the two things a trip cannot
 *  be operated without: who they are on their passport, and their date of
 *  birth. Derived from the data rather than a "submitted" flag, so travellers
 *  whose details were entered by the office — or before the portal existed —
 *  are not reported as outstanding for ever. */
export function passengerComplete(p: AttentionPassenger): boolean {
  return Boolean(p.passport_number && String(p.passport_number).trim()) &&
    Boolean(p.date_of_birth)
}

export function buildAttentionItems(input: AttentionInput): {
  items: AttentionItem[]
  scannedBookings: number
} {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const in7 = addDays(today, URGENT_DAYS)
  const in14 = addDays(today, BALANCE_SOON_DAYS)

  // A booking can appear in both windows; keep one row per booking.
  const byId = new Map<string, AttentionBooking>()
  for (const b of [...input.departing, ...input.balanceDue]) byId.set(b.id, b)
  const rows = [...byId.values()]
  const inDepartureWindow = new Set(input.departing.map(b => b.id))

  const paxByBooking = new Map<string, { total: number; complete: number }>()
  for (const p of input.passengers) {
    const e = paxByBooking.get(p.booking_id) ?? { total: 0, complete: 0 }
    e.total += 1
    if (passengerComplete(p)) e.complete += 1
    paxByBooking.set(p.booking_id, e)
  }

  const crByBooking = new Map<string, AttentionChangeRequest[]>()
  for (const cr of input.changeRequests) {
    const list = crByBooking.get(cr.booking_id) ?? []
    list.push(cr)
    crByBooking.set(cr.booking_id, list)
  }

  const items: AttentionItem[] = []
  const extraByBooking = new Map<string, AttentionExtraRequest[]>()
  for (const ex of input.extraRequests ?? []) {
    const list = extraByBooking.get(ex.booking_id) ?? []
    list.push(ex)
    extraByBooking.set(ex.booking_id, list)
  }

  for (const b of rows) {
    if (b.status === 'cancelled') continue
    const departsSoon = Boolean(b.start_date && b.start_date <= in7)
    const base = {
      bookingId: b.id,
      bookingNumber: b.booking_number ?? null,
      tripName: b.trip_name ?? null,
      clientName: (b.client_id && input.clientNames?.get(b.client_id)) ?? null,
      startDate: b.start_date ?? null,
    }

    // 1. Balance outstanding.
    const balance = Number(b.balance_due)
    if (Number.isFinite(balance) && balance > 0) {
      const deadline = b.payment_deadline ?? null
      const overdue = Boolean(deadline && deadline <= today)
      const dueUrgent = Boolean(deadline && deadline <= in7)
      const dueSoon = Boolean(deadline && deadline <= in14)
      if (overdue || dueSoon || departsSoon) {
        items.push({
          ...base,
          type: 'balance_due',
          severity: overdue || dueUrgent || departsSoon ? 'urgent' : 'soon',
          detail: { balanceDue: balance, deadline, overdue },
          href: `/bookings/${b.id}`,
        })
      }
    }

    // 2. Traveller details outstanding — only for trips actually departing.
    const pax = inDepartureWindow.has(b.id) ? paxByBooking.get(b.id) : undefined
    if (pax && pax.total > 0 && pax.complete < pax.total) {
      items.push({
        ...base,
        type: 'details_missing',
        severity: departsSoon ? 'urgent' : 'soon',
        detail: { complete: pax.complete, total: pax.total },
        href: `/bookings/${b.id}`,
      })
    }

    // 3. No guide on the linked itinerary. Only flagged when the itinerary
    //    was actually looked up — an absent entry means "unknown", which is
    //    not the same as "unassigned" and must not raise a false alarm.
    if (
      inDepartureWindow.has(b.id) &&
      b.itinerary_id &&
      input.guideByItinerary.has(b.itinerary_id) &&
      !input.guideByItinerary.get(b.itinerary_id)
    ) {
      items.push({
        ...base,
        type: 'no_guide',
        severity: departsSoon ? 'urgent' : 'soon',
        detail: {},
        href: `/itineraries/${b.itinerary_id}/edit`,
      })
    }

    // 3b. Portal extras waiting on the office — always urgent: a customer
    //     has asked (or accepted) and is waiting.
    for (const ex of extraByBooking.get(b.id) ?? []) {
      items.push({
        ...base,
        type: 'extra_request',
        severity: 'urgent',
        detail: { title: ex.title ?? null, status: ex.status ?? null, requestedAt: ex.created_at ?? null },
        href: `/bookings/${b.id}`,
      })
    }

    // 4. Pending change requests — always urgent: a customer is waiting on
    //    an answer they asked for themselves.
    for (const cr of crByBooking.get(b.id) ?? []) {
      items.push({
        ...base,
        type: 'change_request',
        severity: 'urgent',
        detail: { kind: cr.kind ?? null, requestedCount: cr.requested_count ?? null, requestedAt: cr.created_at ?? null },
        href: `/bookings/${b.id}`,
      })
    }
  }

  // Urgent first, then soonest departure. A stable secondary sort matters:
  // the list is read top-down and re-ordering it between refreshes would
  // make the same list look like new news.
  items.sort((a, z) => {
    if (a.severity !== z.severity) return a.severity === 'urgent' ? -1 : 1
    const ad = a.startDate ?? '9999-12-31'
    const zd = z.startDate ?? '9999-12-31'
    return ad < zd ? -1 : ad > zd ? 1 : 0
  })

  return { items, scannedBookings: rows.length }
}
