// ============================================
// Which mailboxes the scheduled sweep pulls
// ============================================
// Every mailbox that is actually connected — not only the ones whose owner
// happens to be logged in. The whole point is that a customer who writes on
// Friday evening is seen before Monday.
//
// A row without both tokens is not a connection: it is a half-finished OAuth
// that would fail on every run and fill the log with the same error.
//
// WHICH COMPANY A MAILBOX BELONGS TO. This used to be "gmail_tokens.tenant_id,
// or skip it" — and the sign-in that creates the row never wrote that column.
// Checked on production, 2026-09-20: all four connected mailboxes had it NULL,
// so the sweep would have run every ten minutes, synced nothing, and reported
// success. The stored column still wins when it is there; otherwise the
// company is the mailbox owner's own membership, by the rule the rest of the
// app uses for "which company is this person in" (#428): the oldest, and the
// lower id if two were joined at the same instant. An owner in no company
// cannot be written anywhere — that mailbox is skipped AND reported.

export interface MailboxRow {
  user_id?: string | null
  tenant_id?: string | null
  email?: string | null
  access_token?: string | null
  refresh_token?: string | null
}

export interface MembershipRow {
  user_id?: string | null
  tenant_id?: string | null
  joined_at?: string | null
}

export interface Mailbox {
  user_id: string
  tenant_id: string
  email: string | null
}

export interface SkippedMailbox {
  email: string | null
  reason: string
}

/** The company a person's mailbox is filed under. Null = none to file it in. */
export function tenantForUser(
  userId: string,
  storedTenantId: string | null | undefined,
  memberships: readonly MembershipRow[]
): string | null {
  if (storedTenantId) return storedTenantId
  const own = memberships
    .filter(m => m.user_id === userId && m.tenant_id)
    .sort((a, b) =>
      String(a.joined_at ?? '').localeCompare(String(b.joined_at ?? '')) ||
      String(a.tenant_id).localeCompare(String(b.tenant_id)))
  return own[0]?.tenant_id ?? null
}

export function planMailboxSweep(
  rows: readonly MailboxRow[],
  memberships: readonly MembershipRow[] = []
): { mailboxes: Mailbox[]; skipped: SkippedMailbox[] } {
  const seen = new Set<string>()
  const mailboxes: Mailbox[] = []
  const skipped: SkippedMailbox[] = []
  for (const r of rows) {
    const email = r.email ?? null
    if (!r.user_id) { skipped.push({ email, reason: 'the connection has no owner' }); continue }
    if (!r.access_token || !r.refresh_token) { skipped.push({ email, reason: 'the Google sign-in was never finished — reconnect it in Settings → Email' }); continue }
    if (seen.has(r.user_id)) continue
    const tenant_id = tenantForUser(r.user_id, r.tenant_id, memberships)
    if (!tenant_id) { skipped.push({ email, reason: 'its owner belongs to no company, so there is nowhere to file the mail' }); continue }
    seen.add(r.user_id)
    mailboxes.push({ user_id: r.user_id, tenant_id, email })
  }
  return { mailboxes, skipped }
}

/** The mailboxes alone — kept for callers that do not report the skipped. */
export function mailboxesToSync(rows: readonly MailboxRow[], memberships: readonly MembershipRow[] = []): Mailbox[] {
  return planMailboxSweep(rows, memberships).mailboxes
}

// ---- how far back a run looks ----
export const NORMAL_DAYS_BACK = 3
export const MAX_DAYS_BACK = 30

/** Days to look back, given the newest email already stored for the company.
 *  Never less than the normal window; never more than a month in one run. */
export function lookBackDays(newestStoredAt: string | null, now: Date): number {
  if (!newestStoredAt) return MAX_DAYS_BACK
  const then = new Date(newestStoredAt).getTime()
  if (Number.isNaN(then)) return MAX_DAYS_BACK
  const gap = Math.ceil((now.getTime() - then) / 86_400_000) + 1
  return Math.min(MAX_DAYS_BACK, Math.max(NORMAL_DAYS_BACK, gap))
}
