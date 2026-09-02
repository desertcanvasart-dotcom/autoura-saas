// ============================================
// Putting the extras back onto the booking
// ============================================
// Ported from travel-ops-pro, adapted to this app's booking columns:
// total_amount (not total_cost), total_paid maintained by the
// record_booking_payment RPC, and no payment_status / deposit_paid columns.
//
// Every route that changes whether an extra is CONFIRMED ends here. Nothing
// else in the codebase is allowed to write extras_total or base_total_cost —
// one writer means the invariant
//   total_amount = base_total_cost + extras_total
// has exactly one place it can be broken.
//
// It is a full recompute from the extras rows, not an increment. Confirm,
// withdraw, re-price and delete all funnel through the same arithmetic, so the
// booking cannot drift out of step with its own extras however it got there.
//
// balance_due is written with the SAME formula the database's trigger and
// record_booking_payment() use — greatest(0, total_amount - total_paid) — so
// the trigger reconciles to the identical figure and nothing flips later.

import { extrasTotal, applyExtras, type BookingExtraLine } from '@/lib/booking-extras'
import type { DbClient } from '@/lib/booking-extras-db'

export type RecomputeResult =
  | {
      ok: true
      total_amount: number
      base_total_cost: number
      extras_total: number
      deposit_amount: number
      balance_due: number
      /** Confirmed extras in another currency: deliberately NOT in the total,
       *  and the caller should say so rather than let them look free. */
      excluded: Array<{ id: string; title: string; currency: string; amount: number }>
    }
  | { ok: false; error: string; status: number }

export async function recomputeBookingExtras(
  admin: DbClient,
  bookingId: string,
  tenantId: string
): Promise<RecomputeResult> {
  // base_total_cost / extras_total are NAMED here on purpose: on a database
  // running ahead of migration 321 the read itself errors, and the recompute
  // fails closed below — loudly, and without touching money.
  const { data: booking, error: readError } = await admin
    .from('bookings')
    .select('id, tenant_id, currency, total_amount, deposit_amount, deposit_percent, total_paid, balance_due, base_total_cost, extras_total')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (readError) {
    return {
      ok: false,
      status: 503,
      error: 'Extras need migration 321_booking_extras, which has not been applied to this database yet.',
    }
  }
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 }

  if (!('base_total_cost' in booking) || !('extras_total' in booking)) {
    // Fail closed. Writing total_amount without somewhere to keep the base
    // would destroy the agreed trip price with no way back.
    return {
      ok: false,
      status: 503,
      error: 'Extras need migration 321_booking_extras, which has not been applied to this database yet.',
    }
  }

  const currency = typeof booking.currency === 'string' ? booking.currency : 'EUR'

  const { data: extras } = await admin
    .from('booking_extras')
    .select('id, title, quantity, unit_price, currency, status')
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)

  const totals = extrasTotal((extras ?? []) as BookingExtraLine[], currency)
  if (!totals.ok) {
    return {
      ok: false,
      status: 409,
      error: `Confirmed but unpriced: ${totals.unpriced.join(', ')}. Price it or withdraw it.`,
    }
  }

  // What has been received is the booking's own ledger figure, kept by
  // record_booking_payment() (refunds and penalties already subtracted, other
  // currencies already left out). Re-deriving it here would be a second
  // opinion on money the RPC owns.
  const totalPaid = Number(booking.total_paid) || 0

  const applied = applyExtras({
    baseTotalCost: booking.base_total_cost,
    totalCost: booking.total_amount,
    extrasTotal: totals.total,
    depositPercent: booking.deposit_percent,
    totalPaid,
    currency,
  })

  const { error } = await admin
    .from('bookings')
    .update({
      base_total_cost: applied.base_total_cost,
      extras_total: applied.extras_total,
      total_amount: applied.total_cost,
      deposit_amount: applied.deposit_amount,
      balance_due: applied.balance_due,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)

  if (error) {
    return { ok: false, status: 500, error: 'Could not update the booking total' }
  }

  return {
    ok: true,
    total_amount: applied.total_cost,
    base_total_cost: applied.base_total_cost,
    extras_total: applied.extras_total,
    deposit_amount: applied.deposit_amount,
    balance_due: applied.balance_due,
    excluded: totals.excluded,
  }
}
