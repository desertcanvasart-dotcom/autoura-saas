// ============================================
// Every client of a company, not the first 1000
// ============================================
// PostgREST returns at most `max_rows` (1000 by default) rows per request, and
// a plain select gives no sign it stopped. The email auto-link and the sync's
// known-sender list read a company's clients that way, so in a company with
// more than 1000 clients, mail from the rest was neither linked to its client
// nor rescued from Gmail's Promotions/Social/Forums tabs.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export const CLIENT_PAGE_SIZE = 1000

/** All of a tenant's clients that have an email, paged by id. */
export async function tenantClientEmails(db: Db, tenantId: string): Promise<Array<{ id: string; email: string }>> {
  const out: Array<{ id: string; email: string }> = []
  for (let from = 0; ; from += CLIENT_PAGE_SIZE) {
    const { data, error } = await db
      .from('clients')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + CLIENT_PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: string; email: string }>
    out.push(...rows)
    if (rows.length < CLIENT_PAGE_SIZE) return out
  }
}
