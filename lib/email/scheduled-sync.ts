// ============================================
// Which mailboxes the scheduled sweep pulls
// ============================================
// Every mailbox that is actually connected — not only the ones whose owner
// happens to be logged in. The whole point is that a customer who writes on
// Friday evening is seen before Monday.
//
// A row without both tokens is not a connection: it is a half-finished OAuth
// that would fail on every run and fill the log with the same error. A row
// with no tenant cannot be written anywhere, so it is skipped too.

export interface MailboxRow {
  user_id?: string | null
  tenant_id?: string | null
  email?: string | null
  access_token?: string | null
  refresh_token?: string | null
}

export interface Mailbox {
  user_id: string
  tenant_id: string
  email: string | null
}

export function mailboxesToSync(rows: readonly MailboxRow[]): Mailbox[] {
  const seen = new Set<string>()
  const out: Mailbox[] = []
  for (const r of rows) {
    if (!r.user_id || !r.tenant_id) continue
    if (!r.access_token || !r.refresh_token) continue
    if (seen.has(r.user_id)) continue
    seen.add(r.user_id)
    out.push({ user_id: r.user_id, tenant_id: r.tenant_id, email: r.email ?? null })
  }
  return out
}
