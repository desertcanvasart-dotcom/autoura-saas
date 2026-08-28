// ============================================
// Re-price a booking when travellers are added (C1c, ported)
// ============================================
// The booking's total is the price the customer AGREED — a negotiated
// amount, not an engine output. Re-running the pricing engine would both
// guess and discard the negotiation. Instead we extend the exact per-person
// rate the customer already accepted: newTotal = oldTotal / oldPax × newPax.
// Transparent ("the same per-person rate as your booking"), never touches
// the negotiated base, and the operator approves it.
//
// Linear, so it does not discount the fixed costs a larger group shares
// (guide, vehicle) — it errs slightly in the operator's favour, and the
// operator can still adjust afterwards.
//
// Composition with the FX freeze (P4): this adjusts the CLIENT side of a
// booking (total, deposit, balance). fx_frozen governs supplier-side costs
// on the itinerary and is deliberately untouched — the two never fight.
//
// Balance preserves whatever has been paid: new_balance = old_balance + delta.

export type AddTravellerReprice =
  | { method: 'manual'; reason: string }
  | {
      method: 'per_person'
      perPerson: number
      oldTotal: number
      newTotal: number
      delta: number
      newDepositAmount: number
      newBalanceDue: number
    }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeAddTravellerReprice(input: {
  oldTotal: number | null | undefined
  oldPax: number
  addedPax: number
  depositPercent: number | null | undefined
  oldBalanceDue: number | null | undefined
}): AddTravellerReprice {
  const oldTotal = Number(input.oldTotal)
  const oldPax = Math.floor(input.oldPax)
  const addedPax = Math.floor(input.addedPax)

  if (!Number.isFinite(oldTotal) || oldTotal <= 0 || oldPax <= 0) {
    // No priced base to extend — leave the money alone, flag for the operator.
    return { method: 'manual', reason: 'no per-person price to extend from' }
  }
  if (addedPax <= 0) return { method: 'manual', reason: 'no travellers added' }

  const perPerson = oldTotal / oldPax
  const newPax = oldPax + addedPax
  const newTotal = round2(perPerson * newPax)
  const delta = round2(newTotal - oldTotal)
  const depositPercent = Number(input.depositPercent) || 0
  const newDepositAmount = round2(newTotal * (depositPercent / 100))
  const oldBalance = Number(input.oldBalanceDue)
  // Preserve payments: the outstanding balance rises by exactly the delta.
  const newBalanceDue = round2((Number.isFinite(oldBalance) ? oldBalance : oldTotal) + delta)

  return {
    method: 'per_person',
    perPerson: round2(perPerson),
    oldTotal: round2(oldTotal),
    newTotal,
    delta,
    newDepositAmount,
    newBalanceDue,
  }
}
