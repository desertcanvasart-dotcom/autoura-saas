// ============================================
// Mail already stored on the wrong side
// ============================================
// Before the office rule, a reply a colleague sent from another address on the
// agency's domain was stored as INBOUND — the customer writing. Fixing the
// rule going forward leaves those rows wrong, and since migration 366 a wrong
// row has a visible cost: the conversation shows "Waiting on us" for an answer
// that already went.
//
// So every sync repairs what it can see. Cheap: two narrow queries against the
// tenant's own mail, and only the conversations that actually changed are
// recomputed.

import type { OfficeRule } from './office-addresses'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any; rpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown> }

export interface RepairResult {
  repaired: number
  conversations: string[]
}

/**
 * Mark as ours the stored messages that came from an office address.
 *
 * Returns what changed. A failure is reported as nothing repaired rather than
 * thrown: a sync that pulled mail successfully must not fail because a tidy-up
 * query did.
 */
export async function repairOfficeDirections(
  db: Db,
  tenantId: string,
  office: OfficeRule
): Promise<RepairResult> {
  const conversations = new Set<string>()
  let repaired = 0

  const apply = async (build: (q: unknown) => unknown) => {
    try {
      const base = db
        .from('email_messages')
        .update({ direction: 'outbound' })
        .eq('tenant_id', tenantId)
        .eq('direction', 'inbound')
      const { data, error } = (await (build(base) as Promise<{ data: unknown; error: unknown }>)) ?? {}
      if (error) return
      for (const row of (data ?? []) as Array<{ unified_conversation_id?: string | null }>) {
        repaired++
        if (row.unified_conversation_id) conversations.add(row.unified_conversation_id)
      }
    } catch {
      // A tidy-up that fails must not fail the sync that found the mail.
    }
  }

  if (office.addresses.length > 0) {
    await apply(q => (q as { in: (c: string, v: string[]) => { select: (s: string) => unknown } })
      .in('from_email', office.addresses)
      .select('unified_conversation_id'))
  }
  for (const domain of office.domains) {
    await apply(q => (q as { ilike: (c: string, v: string) => { select: (s: string) => unknown } })
      .ilike('from_email', `%@${domain}`)
      .select('unified_conversation_id'))
  }

  // The counts and the waiting clock are derived from the messages, so the
  // conversations that changed are recomputed rather than left stale.
  if (db.rpc) {
    for (const id of conversations) {
      try {
        await db.rpc('update_unified_conversation_stats', { p_unified_id: id })
      } catch {
        // Same reasoning: a stale count is better than a failed sync.
      }
    }
  }

  return { repaired, conversations: [...conversations] }
}
