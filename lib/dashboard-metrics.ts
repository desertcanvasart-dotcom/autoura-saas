// ============================================
// OPERATOR DASHBOARD — the rules, as pure functions
// ============================================
// The dashboard answers an operator's morning questions: what departs soon,
// who owes me money, what needs a reply, who has read my proposal, and which
// quotes are going cold. The queries live in the API route; the DECISIONS
// live here, because they are where the bugs are:
//
//   * a null due_date must never count as overdue (the "Final Notice — now
//     NaN days overdue" class of bug, fixed in lib/invoice-dates.ts)
//   * "departing soon" must not include trips that already left
//   * money must be summed from a numeric that arrives as a string
//
// Everything here is total: no input shape can throw.

export const DEPARTURE_WINDOW_DAYS = 14
export const STALE_QUOTE_DAYS = 5

/** Statuses that still represent money the operator expects to receive. */
export const OPEN_INVOICE_STATUSES = ['sent', 'viewed', 'partially_paid', 'overdue'] as const

/** A booking is "live" until it is completed or cancelled. */
export const LIVE_BOOKING_STATUSES = ['pending_deposit', 'confirmed', 'paid_full', 'in_progress'] as const

/** A quote is awaiting the client in these states. */
export const AWAITING_CLIENT_QUOTE_STATUSES = ['sent', 'viewed'] as const

/** Postgres numerics arrive as strings; anything unusable is 0, never NaN. */
export function money(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Whole days from today until `date`. Null for an unusable date — never NaN.
 *
 * Anchored to UTC midnight, deliberately. start_date and due_date are DATE
 * columns with no timezone, and this runs on a server whose local zone is
 * incidental (Railway is UTC, a laptop is not). Using local midnight made the
 * SAME trip read as departing "today" or "tomorrow" depending on where the
 * code happened to run — a dashboard that disagrees with itself by host.
 */
export function daysUntil(date: unknown, now: number = Date.now()): number | null {
  if (date === null || date === undefined || date === '') return null
  const t = new Date(date as string).getTime()
  if (!Number.isFinite(t)) return null
  const startOfToday = new Date(now)
  startOfToday.setUTCHours(0, 0, 0, 0)
  const target = new Date(t)
  target.setUTCHours(0, 0, 0, 0)
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000)
}

export interface DepartureRow {
  start_date?: unknown
  status?: unknown
}

/**
 * Departing within the window, not already gone.
 *
 * A missing start_date is EXCLUDED: an unscheduled trip has no deadline, and
 * showing it under "departing soon" would be a false alarm on the one card
 * meant to be trusted.
 */
export function isDepartingSoon(
  row: DepartureRow,
  now: number = Date.now(),
  windowDays: number = DEPARTURE_WINDOW_DAYS
): boolean {
  const d = daysUntil(row.start_date, now)
  if (d === null) return false
  return d >= 0 && d <= windowDays
}

export interface InvoiceRow {
  status?: unknown
  balance_due?: unknown
  due_date?: unknown
}

export interface OutstandingSummary {
  /** Total still owed across open invoices. */
  total: number
  /** How many open invoices there are. */
  count: number
  /** Subset already past their due date. */
  overdueCount: number
  overdueTotal: number
}

/**
 * What is owed, and what is late.
 *
 * The distinction that matters: an invoice with NO due date is outstanding
 * but is never late. Treating null as "overdue" is how a blank field turns
 * into a final-notice-grade alarm.
 */
export function summariseOutstanding(
  rows: InvoiceRow[] | null | undefined,
  now: number = Date.now()
): OutstandingSummary {
  const out: OutstandingSummary = { total: 0, count: 0, overdueCount: 0, overdueTotal: 0 }
  for (const r of rows ?? []) {
    const balance = money(r.balance_due)
    if (balance <= 0) continue
    out.total += balance
    out.count += 1

    const d = daysUntil(r.due_date, now)
    if (d !== null && d < 0) {
      out.overdueCount += 1
      out.overdueTotal += balance
    }
  }
  // Cents, not floating dust: 0.1 + 0.2 must not surface as 0.30000000000000004.
  out.total = Math.round(out.total * 100) / 100
  out.overdueTotal = Math.round(out.overdueTotal * 100) / 100
  return out
}

export interface QuoteRow {
  status?: unknown
  sent_at?: unknown
  valid_until?: unknown
}

export interface QuoteAttention {
  /** Sent and unanswered for longer than STALE_QUOTE_DAYS. */
  staleCount: number
  /** Past valid_until — the client can no longer act on the price. */
  expiredCount: number
  /** Everything still awaiting a client decision. */
  awaitingCount: number
}

/**
 * Which quotes deserve a nudge.
 *
 * Stale is measured from sent_at, not created_at: a quote drafted three weeks
 * ago and sent this morning is not stale. A quote with no sent_at has not
 * reached the client, so it cannot be waiting on them.
 */
export function summariseQuotes(
  rows: QuoteRow[] | null | undefined,
  now: number = Date.now()
): QuoteAttention {
  const out: QuoteAttention = { staleCount: 0, expiredCount: 0, awaitingCount: 0 }
  for (const r of rows ?? []) {
    out.awaitingCount += 1

    const sentDays = daysUntil(r.sent_at, now)
    if (sentDays !== null && sentDays <= -STALE_QUOTE_DAYS) out.staleCount += 1

    const validDays = daysUntil(r.valid_until, now)
    if (validDays !== null && validDays < 0) out.expiredCount += 1
  }
  return out
}

export interface ShareRow {
  view_count?: unknown
  last_viewed_at?: unknown
  revoked_at?: unknown
}

/**
 * A proposal the client has actually opened, on a live share link.
 *
 * This is the signal no other card can give: the operator learns which client
 * is reading, and can call THAT one. A revoked link is excluded — the link is
 * dead, so its view history is history.
 */
export function isEngagedProposal(row: ShareRow): boolean {
  if (row.revoked_at) return false
  const views = money(row.view_count)
  return views > 0
}

/** Newest view first; never-viewed last. Stable for equal timestamps. */
export function byMostRecentlyViewed(a: ShareRow, b: ShareRow): number {
  const at = a.last_viewed_at ? new Date(a.last_viewed_at as string).getTime() : 0
  const bt = b.last_viewed_at ? new Date(b.last_viewed_at as string).getTime() : 0
  return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0)
}
