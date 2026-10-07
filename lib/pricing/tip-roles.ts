// ============================================
// Whose tip it is, for a grid line that arrived without saying
// ============================================
// A grid tip carries its role (tipping_rates.role_type) from the rate it was
// picked from, and switching the guide off drops the guide's tips by it
// (app/pricing-grid/lib/guide-rule.ts). A grid tab opened before tips
// carried a role sends them without one; the save fills it in from the rate
// row, so what is stored never depends on how old the browser tab is.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TipRoleReader {
  from(table: 'tipping_rates'): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{ data: Array<{ id: string; role_type: string | null }> | null }>
    }
  }
}

interface TipItem { rateId: string; tipRole?: string | null }
interface DayLike { slots?: Array<{ slotId: string; selectedItems?: TipItem[] | null }> | null }

/** Sets `tipRole` on every tipping item that lacks one and names a rate row. */
export async function fillTipRoles(db: TipRoleReader, days: readonly DayLike[]): Promise<void> {
  const missing = days.flatMap(d => (d.slots ?? [])
    .filter(s => s.slotId === 'tipping')
    .flatMap(s => (s.selectedItems ?? []).filter(i => !i.tipRole && UUID_RE.test(String(i.rateId)))))
  if (missing.length === 0) return
  const ids = [...new Set(missing.map(i => String(i.rateId)))]
  const { data } = await db.from('tipping_rates').select('id, role_type').in('id', ids)
  // A failed lookup leaves the items as they are: the rule then falls back
  // to the item's id, as it always did.
  const roleOf = new Map((data ?? []).map(r => [r.id, r.role_type]))
  for (const item of missing) {
    const role = roleOf.get(String(item.rateId))
    if (role) item.tipRole = role
  }
}
