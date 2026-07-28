// ============================================
// INVOICE DATE ARITHMETIC
// ============================================
// invoices.due_date is NULLABLE, and the dunning ladder compares a computed
// "days overdue" against thresholds. `new Date(null).getTime()` is NaN, and
// every comparison with NaN is false — so an invoice with no due date fell
// past every rung to the harshest one and emailed the client:
//
//   "Final Notice ... Your payment is now NaN days overdue."
//
// The worst possible default for a money communication, produced by the
// friendliest possible input (someone left a field blank).

/**
 * Whole days between the due date and now — negative before it is due.
 * Returns null when there is no usable due date, so callers must decide
 * explicitly rather than inheriting NaN's silent fall-through.
 */
export function daysOverdueOrNull(dueDate: unknown, now: number = Date.now()): number | null {
  if (dueDate === null || dueDate === undefined || dueDate === '') return null
  const t = new Date(dueDate as string).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / (1000 * 60 * 60 * 24))
}
