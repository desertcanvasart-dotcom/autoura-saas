// ============================================
// What an operator may set a booking's status to
// ============================================
// The booking page had no status control: a booking could not be cancelled,
// started or completed. (travel-ops-pro has one; compared 2026-09-25.)
//
// The PAYMENT statuses — pending_deposit, confirmed, paid_full — are not
// chosen, they follow the money (migration 388). So the operator picks:
//   active      — back to the payment status the money justifies (reopens a
//                 cancelled booking; never lets anyone type "paid in full")
//   in_progress — the trip has started
//   completed   — the trip is over
//   cancelled
// Moving to in_progress or completed needs every still-needed supplier
// confirmed (supplierBacking). The operator may go ahead anyway with an
// explicit acknowledgement, which is recorded (bookings.status_override).

import { supplierBacking, type SupplierBacking } from '@/lib/bookings/booking-suppliers'

export const OPERATOR_STATUS_CHOICES = ['active', 'in_progress', 'completed', 'cancelled'] as const
export type OperatorStatusChoice = (typeof OPERATOR_STATUS_CHOICES)[number]

export const PAYMENT_STATUSES = ['pending_deposit', 'confirmed', 'paid_full'] as const

/** The choice a stored status corresponds to. */
export function statusChoiceOf(status: string | null | undefined): OperatorStatusChoice {
  if (status === 'in_progress' || status === 'completed' || status === 'cancelled') return status
  return 'active'
}

/** Old API callers sent a payment status; they all mean "active". */
export function normalizeStatusChoice(raw: unknown): OperatorStatusChoice | null {
  if (typeof raw !== 'string') return null
  if ((PAYMENT_STATUSES as readonly string[]).includes(raw)) return 'active'
  return (OPERATOR_STATUS_CHOICES as readonly string[]).includes(raw) ? (raw as OperatorStatusChoice) : null
}

export type StatusChangeCheck =
  | { ok: true; backing: SupplierBacking; overridden: boolean }
  | { ok: false; code: 'supplier_status_unbacked'; backing: SupplierBacking; message: string }

/** Whether the change may go ahead, given the booking's supplier rows. */
export function checkStatusChange(
  to: OperatorStatusChoice,
  supplierRows: { status: string | null }[] | null | undefined,
  overrideAcknowledged: boolean,
): StatusChangeCheck {
  const backing = supplierBacking(supplierRows)
  const needsBacking = to === 'in_progress' || to === 'completed'
  if (!needsBacking || backing.backed) return { ok: true, backing, overridden: false }
  if (overrideAcknowledged) return { ok: true, backing, overridden: true }
  const message = backing.total === 0
    ? 'This booking has no suppliers listed. Sync them from the itinerary first, or go ahead anyway.'
    : `${backing.confirmed} of ${backing.total} suppliers are confirmed. Confirm the rest, or go ahead anyway.`
  return { ok: false, code: 'supplier_status_unbacked', backing, message }
}
