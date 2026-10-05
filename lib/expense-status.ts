// ============================================
// An expense's status, and what moving it writes
// ============================================
// pending (recorded) → approved (to pay) → paid; or rejected. The payment
// date follows: set when it becomes paid (today unless given), cleared when
// it is no longer paid — Payables and cash flow read both.

export const EXPENSE_STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const

/** The columns a status change writes; null for an unknown status. */
export function expenseStatusUpdate(status: unknown, paymentDate?: unknown): Record<string, unknown> | null {
  if (typeof status !== 'string' || !(EXPENSE_STATUSES as readonly string[]).includes(status)) return null
  if (status === 'paid') {
    const date = typeof paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(paymentDate) ? paymentDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
    return { status, payment_date: date }
  }
  return { status, payment_date: null }
}
