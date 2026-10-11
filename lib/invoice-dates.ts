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

// ============================================
// WHICH INVOICES MAY BE CHASED
// ============================================
// The reminder paths (single, bulk, the daily cron) excluded only paid and
// cancelled invoices, so a DRAFT — never sent to the client — got "Payment
// Overdue" in the client's inbox. And a final invoice is created with no due
// date: the single reminder computed new Date(null) and told the client the
// payment was ~20,700 days overdue, due 1 January 1970.

/** The statuses a client has been sent and still owes on. A part-paid
 *  invoice is 'partially_paid' (the invoices status check); 'partial' alone
 *  matched nothing, so part-paid invoices were never chased. 'viewed' is a
 *  sent invoice the client opened. */
export const REMINDABLE_INVOICE_STATUSES = ['sent', 'viewed', 'partially_paid', 'partial', 'overdue'] as const

/** Why an invoice cannot be chased, or null when it can. */
export function reminderBlocker(invoice: { status?: string | null; due_date?: unknown }): string | null {
  if (!(REMINDABLE_INVOICE_STATUSES as readonly string[]).includes(String(invoice.status ?? ''))) {
    return invoice.status === 'draft'
      ? 'This invoice is still a draft. Send it to the client before sending a reminder.'
      : 'Only sent, partly paid or overdue invoices get reminders.'
  }
  if (daysOverdueOrNull(invoice.due_date) === null) {
    return 'This invoice has no due date. Set one before sending a reminder.'
  }
  return null
}

/**
 * Whether the reminder cron may send now. An invoice already on the ladder
 * (next_reminder_date set and reached) is due; one never reminded starts a
 * week before its due date — or at once if that is already past.
 */
export function isFirstReminderDue(nextReminderDate: unknown, daysOverdue: number): boolean {
  if (nextReminderDate != null && nextReminderDate !== '') return true
  return daysOverdue >= -7
}

/**
 * Whole days from a due date to a calendar day (YYYY-MM-DD) — negative before
 * it is due. Calendar arithmetic, so the company's "today" (lib/tenant-today)
 * decides, not the server's UTC instant. Null without a usable due date.
 */
export function daysOverdueOn(dueDate: unknown, todayISO: string): number | null {
  if (dueDate === null || dueDate === undefined || dueDate === '') return null
  const due = Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00Z`)
  const today = Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(due) || !Number.isFinite(today)) return null
  return Math.round((today - due) / 86_400_000)
}
