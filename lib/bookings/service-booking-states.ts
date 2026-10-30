// ============================================
// Service booking states — the one place that knows them
// ============================================
// docs/supplier-network/PLAN.md §4 (D1 applied). A service booking (a row of
// booking_supplier_status, migration 446) moves
//
//   pending → requested → accepted → assigned (car plate / guide named) → done
//
// with side exits declined, expired (no reply by the deadline → back to the
// operator) and cancelled (the operator, at any stage). The agency's own cars,
// guides and staff skip the request: pending → assigned, straight away.
//
// Rows written before 446 use the old words; until they are rewritten they
// are read through LEGACY_STATUS (contacted = requested, confirmed = accepted,
// no_response = expired). Pure, so tested.

export const SERVICE_BOOKING_STATUSES = [
  'pending', 'requested', 'accepted', 'assigned', 'done', 'declined', 'expired', 'cancelled',
] as const
export type ServiceBookingStatus = (typeof SERVICE_BOOKING_STATUSES)[number]

export const LEGACY_STATUS: Record<string, ServiceBookingStatus> = {
  contacted: 'requested',
  confirmed: 'accepted',
  no_response: 'expired',
}

/** Every word the database accepts for now (446): the new states and the old ones. */
export const STORED_STATUSES: readonly string[] = [...SERVICE_BOOKING_STATUSES, ...Object.keys(LEGACY_STATUS)]

/** A stored status read as a new state; unknown or empty = pending. */
export function normalizeStatus(status: string | null | undefined): ServiceBookingStatus {
  const s = (status ?? '').trim().toLowerCase()
  if ((SERVICE_BOOKING_STATUSES as readonly string[]).includes(s)) return s as ServiceBookingStatus
  return LEGACY_STATUS[s] ?? 'pending'
}

/**
 * Covered = someone has said yes: accepted, assigned (car or guide named) or
 * done. This is what "confirmed" meant before 446 — the booking's backing and
 * the supplier expense both count these.
 */
export function isCovered(status: string | null | undefined): boolean {
  const s = normalizeStatus(status)
  return s === 'accepted' || s === 'assigned' || s === 'done'
}

/** The line is no longer needed (and does not count). */
export function isCancelled(status: string | null | undefined): boolean {
  return normalizeStatus(status) === 'cancelled'
}

export type CoveredBy = 'own' | 'supplier' | 'network'

/**
 * Where a line may go next. `cancelled` is reachable from every state except
 * done; a cancelled, declined or expired line can be put back to pending to
 * find someone else. Own resources are assigned directly (no request).
 */
const NEXT: Record<ServiceBookingStatus, readonly ServiceBookingStatus[]> = {
  pending: ['requested', 'assigned', 'cancelled'],
  requested: ['accepted', 'assigned', 'declined', 'expired', 'cancelled', 'pending'],
  accepted: ['assigned', 'cancelled', 'pending'],
  assigned: ['done', 'cancelled', 'pending'],
  done: [],
  declined: ['pending', 'requested', 'cancelled'],
  expired: ['pending', 'requested', 'accepted', 'cancelled'],
  cancelled: ['pending'],
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string }

export function canTransition(
  from: string | null | undefined,
  to: ServiceBookingStatus,
  coveredBy: CoveredBy = 'supplier',
): TransitionCheck {
  const f = normalizeStatus(from)
  if (f === to) return { ok: false, reason: `already ${STATUS_LABEL[to].toLowerCase()}` }
  // An own car or guide is never asked: it is assigned or not.
  if (coveredBy === 'own' && (to === 'requested' || to === 'accepted' || to === 'declined' || to === 'expired')) {
    return { ok: false, reason: 'your own cars, guides and staff are assigned directly, not requested' }
  }
  if (!NEXT[f].includes(to)) {
    return { ok: false, reason: `a line that is ${STATUS_LABEL[f].toLowerCase()} cannot become ${STATUS_LABEL[to].toLowerCase()}` }
  }
  return { ok: true }
}

/** Plain words for the operator. */
export const STATUS_LABEL: Record<ServiceBookingStatus, string> = {
  pending: 'To arrange',
  requested: 'Requested',
  accepted: 'Accepted',
  assigned: 'Assigned',
  done: 'Done',
  declined: 'Declined',
  expired: 'No reply',
  cancelled: 'Not needed',
}

// ============================================
// The reply deadline (operator, 2026-10-30)
// ============================================
// 4 hours to answer a request; 1 hour when the service is within 48 hours.

export const REPLY_HOURS = 4
export const REPLY_HOURS_SOON = 1
export const SOON_HOURS = 48

/**
 * When a request sent at `requestedAt` must be answered. `serviceStart` is
 * the service's date (and time when known); without one, the normal 4 hours.
 */
export function replyDeadline(requestedAt: Date, serviceStart: Date | null): Date {
  const soon = serviceStart !== null
    && serviceStart.getTime() - requestedAt.getTime() <= SOON_HOURS * 3_600_000
  const hours = soon ? REPLY_HOURS_SOON : REPLY_HOURS
  return new Date(requestedAt.getTime() + hours * 3_600_000)
}
