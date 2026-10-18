// ============================================
// A B2B quote's partner must be the tenant's own
// ============================================
// The quote routes stored partner_id from the request body. When the partner
// lookup (RLS) came back empty — another tenant's partner — the quote was
// inserted anyway: the foreign key does not check the tenant. /pdf and /send
// then read the partner through the admin client, printed another tenant's
// partner on the quote and emailed it to them.

// The one query this makes, typed by its shape. The client is taken loosely
// (an RLS or admin client) and narrowed here: matching it structurally
// against SupabaseClient's generics is too deep for the compiler.
type Db = { from: (table: 'b2b_partners') => unknown }
type PartnerQuery = {
  select: (cols: string) => {
    eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => PromiseLike<{ data: { id: string; default_margin_percent: number | null } | null; error: unknown }>
        }
      }
    }
}

export type PartnerCheck =
  | { ok: true; partner: { id: string; default_margin_percent: number | null } | null }
  | { ok: false; status: number; error: string }

/** No partner given: ok with null. Given: it must be this tenant's. */
export async function partnerInTenant(db: Db, partnerId: unknown, tenantId: string): Promise<PartnerCheck> {
  if (partnerId === null || partnerId === undefined || partnerId === '') return { ok: true, partner: null }
  if (typeof partnerId !== 'string') return { ok: false, status: 400, error: 'partner_id must be a partner id' }
  const { data, error } = await (db.from('b2b_partners') as PartnerQuery)
    .select('id, default_margin_percent')
    .eq('id', partnerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: 'Could not check the partner' }
  if (!data) return { ok: false, status: 404, error: 'Partner not found' }
  return { ok: true, partner: data }
}
