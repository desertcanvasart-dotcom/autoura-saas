// ============================================
// WHAT A CLIENT MAY WRITE TO `payments`
// ============================================
// /api/payments inserted `{ tenant_id, ...body }` — an unbounded spread of the
// request body straight into the table. Two consequences, both real:
//
//   1. Any column became client-settable. A caller could send `id`,
//      `created_at`, or a `status` outside the CHECK. RLS still confined it to
//      their own tenant, but within that tenant they could write fields the UI
//      never exposes.
//
//   2. Any column that DOESN'T exist made the whole insert fail. That is how
//      recording a payment stayed broken: the UI sends `payment_status`, which
//      is not a column, so PostgREST answered PGRST204 and the route 500'd.
//
// An allowlist fixes both directions at once: unknown fields are dropped
// instead of poisoning the insert, and only these columns are writable.
//
// `payment_status` is deliberately MAPPED rather than added — `payments.status`
// already carries exactly those values (migration 257 explains why a second
// status column would be a bug, not a feature).

export const PAYMENT_METHODS = [
  'bank_transfer', 'cash', 'credit_card', 'paypal', 'stripe', 'other',
] as const

export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const

export const PAYMENT_TYPES = [
  'deposit', 'installment', 'balance', 'full_payment', 'refund', 'penalty',
] as const

export interface CleanPayment {
  itinerary_id?: string | null
  client_id?: string | null
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference?: string | null
  status: string
  payment_type: string
  due_date?: string | null
  notes?: string | null
}

export type PaymentInputError = { field: string; message: string }

/**
 * Map what the payment forms actually submit onto the stored vocabulary.
 *
 * The dropdowns carry the deposit PERCENTAGE in the value ("deposit_30"), and
 * spell the others differently from the column ("full", "final"). Normalising
 * here rather than in each form means every caller — both payment pages, and
 * anything added later — agrees with the CHECK constraint by default.
 */
export function normalisePaymentType(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v.startsWith('deposit')) return 'deposit'   // deposit_10 … deposit_50
  if (v === 'full') return 'full_payment'
  if (v === 'final') return 'balance'             // "Final Payment" = the balance
  return v
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Validate and narrow a payment request body.
 *
 * Returns either the exact row to insert or the reasons it cannot be. Money is
 * parsed here rather than trusted: `amount` arrives as a string from the form,
 * and NaN reaching a DECIMAL column is a 500 the operator cannot interpret.
 */
export function parsePaymentInput(
  body: Record<string, unknown>
): { ok: true; value: CleanPayment } | { ok: false; errors: PaymentInputError[] } {
  const errors: PaymentInputError[] = []

  const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''))
  if (!Number.isFinite(amount)) {
    errors.push({ field: 'amount', message: 'Amount must be a number' })
  } else if (amount <= 0) {
    // A zero or negative payment is a refund, which has its own payment_type.
    errors.push({ field: 'amount', message: 'Amount must be greater than zero' })
  }

  const method = str(body.payment_method)
  if (!method) errors.push({ field: 'payment_method', message: 'Payment method is required' })
  else if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    errors.push({ field: 'payment_method', message: `Unknown payment method "${method}"` })
  }

  const paymentDate = str(body.payment_date)
  if (!paymentDate) errors.push({ field: 'payment_date', message: 'Payment date is required' })
  else if (!Number.isFinite(new Date(paymentDate).getTime())) {
    errors.push({ field: 'payment_date', message: 'Payment date is not a valid date' })
  }

  // The UI calls it payment_status; the column is `status`. Accept either, and
  // reject a value the CHECK would refuse rather than letting it 500 at insert.
  const rawStatus = str(body.status) ?? str(body.payment_status) ?? 'completed'
  if (!(PAYMENT_STATUSES as readonly string[]).includes(rawStatus)) {
    errors.push({ field: 'status', message: `Unknown status "${rawStatus}"` })
  }

  const rawType = normalisePaymentType(str(body.payment_type)) ?? 'full_payment'
  if (!(PAYMENT_TYPES as readonly string[]).includes(rawType)) {
    errors.push({ field: 'payment_type', message: `Unknown payment type "${rawType}"` })
  }

  const dueDate = str(body.due_date)
  if (dueDate && !Number.isFinite(new Date(dueDate).getTime())) {
    errors.push({ field: 'due_date', message: 'Due date is not a valid date' })
  }

  const currency = (str(body.currency) ?? 'EUR').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push({ field: 'currency', message: 'Currency must be a 3-letter code' })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      itinerary_id: str(body.itinerary_id),
      client_id: str(body.client_id),
      amount: Math.round(amount * 100) / 100, // cents, never floating dust
      currency,
      payment_method: method!,
      payment_date: paymentDate!,
      transaction_reference: str(body.transaction_reference),
      status: rawStatus,
      payment_type: rawType,
      due_date: dueDate,
      notes: str(body.notes),
    },
  }
}
