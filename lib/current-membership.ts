// ============================================
// The company a person is working in — one answer, from the database
// ============================================
// A person can belong to several companies. Which one is current is decided
// in ONE place, get_user_tenant_id() (migration 414): their chosen company
// (user_profiles.active_tenant_id, set by the company switcher) while they
// are an active member of it, otherwise the oldest active membership. Every
// RLS policy uses that function, so the app asks it too instead of repeating
// the rule — the page, the API and the database cannot disagree about which
// company's data is on screen.

interface MembershipQuery<T> {
  select: (cols: string) => MembershipQuery<T>
  eq: (col: string, value: string) => MembershipQuery<T>
  maybeSingle: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>
}

export interface MembershipDb {
  rpc: (fn: 'get_user_tenant_id') => PromiseLike<{ data: unknown; error: { message?: string } | null }>
  from: (table: 'tenant_members') => unknown
}

/** The current company's id for the signed-in user, or null (no active membership). */
export async function currentTenantId(db: MembershipDb): Promise<{ tenantId: string | null; error: { message?: string } | null }> {
  const { data, error } = await db.rpc('get_user_tenant_id')
  if (error) return { tenantId: null, error }
  return { tenantId: typeof data === 'string' && data ? data : null, error: null }
}

/**
 * The signed-in user's ACTIVE membership in their current company, with the
 * columns asked for. Null when they have none.
 */
export async function currentMembership<T = Record<string, unknown>>(
  db: MembershipDb,
  userId: string,
  columns: string,
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const { tenantId, error } = await currentTenantId(db)
  if (error) return { data: null, error }
  if (!tenantId) return { data: null, error: null }
  const q = db.from('tenant_members') as MembershipQuery<T>
  return await q
    .select(columns)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
}
