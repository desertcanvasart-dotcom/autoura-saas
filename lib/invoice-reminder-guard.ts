// ============================================
// One payment reminder a week, even when bookkeeping fails
// ============================================
// The automatic reminder runs decide who is due from invoices.next_reminder_date,
// which is moved on only AFTER the email has gone, and the result of that
// update was never checked. If it failed, the invoice was picked up again the
// next day and the client received a second payment demand.
//
// The reminder log (invoice_reminders) is written per send, so it is the
// record to trust: an automatic run skips an invoice that already had a
// reminder SENT within the window, and repairs its next date instead.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/** An automatic run sends at most one reminder per invoice in this many days. */
export const REMINDER_MIN_GAP_DAYS = 6

/** When this invoice last had a reminder sent within the gap, else null. */
export async function recentReminderSentAt(
  db: Db,
  invoiceId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const since = new Date(now.getTime() - REMINDER_MIN_GAP_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from('invoice_reminders')
    .select('sent_at')
    .eq('invoice_id', invoiceId)
    .eq('status', 'sent')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(1)
  // A log that cannot be read must not stop reminders altogether; the
  // next_reminder_date filter still applies.
  if (error) {
    console.error('reminder log check failed:', error.message)
    return null
  }
  return (data?.[0]?.sent_at as string | undefined) ?? null
}

/** The next reminder date (YYYY-MM-DD) a week after a sent one. */
export function nextReminderAfter(sentAt: string): string {
  return new Date(new Date(sentAt).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
}
