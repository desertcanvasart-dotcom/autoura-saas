// ============================================
// A service that has happened is Done (Phase 1, step 6)
// ============================================
// docs/supplier-network/PLAN.md §5 step 6: "day becomes done after the
// service date (cron)". Once a day, every line that was covered — Accepted
// (a restaurant or hotel names nobody) or Assigned (a car or guide named) —
// whose service date is before today becomes Done, through the one writer.
// Done stays covered, so the supplier's expense is untouched. A line still
// To arrange / Requested / No reply after its date is left as it is: that is
// for the office to see, not for a job to tidy away.

export const DONE_FROM: readonly string[] = ['accepted', 'assigned']

/** Today's date (UTC) as YYYY-MM-DD: lines dated before it have happened. */
export function doneBefore(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function hasHappened(line: { status: string | null; service_date: string | null }, now: Date): boolean {
  if (!line.status || !DONE_FROM.includes(line.status) || !line.service_date) return false
  return line.service_date.slice(0, 10) < doneBefore(now)
}
