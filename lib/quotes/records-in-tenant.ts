// ============================================
// A quote's client and trip must be the tenant's own
// ============================================
// The quote routes insert with the admin client and stored client_id and
// itinerary_id from the request body: the foreign key does not check the
// tenant. The insert's own embed then returned another tenant's client name,
// email and phone, and /send and /send-whatsapp (admin reads by the key) would
// message that client under this tenant's name. Same shape as
// partnerInTenant.

type Db = { from: (table: string) => unknown }
type RowQuery = {
  select: (cols: string) => {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: unknown }>
      }
    }
  }
}

export type RecordsCheck = { ok: true } | { ok: false; status: number; error: string }

/** Each id given (client, itinerary) must be a row of this tenant's. Absent ids pass. */
export async function recordsInTenant(
  db: Db,
  tenantId: string,
  refs: { client_id?: unknown; itinerary_id?: unknown }
): Promise<RecordsCheck> {
  const checks: Array<[string, unknown, string]> = [
    ['clients', refs.client_id, 'Client'],
    ['itineraries', refs.itinerary_id, 'Itinerary'],
  ]
  for (const [table, id, label] of checks) {
    if (id === null || id === undefined || id === '') continue
    if (typeof id !== 'string') return { ok: false, status: 400, error: `${label} id must be an id` }
    const { data, error } = await (db.from(table) as RowQuery).select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    if (error) return { ok: false, status: 500, error: `Could not check the ${label.toLowerCase()}` }
    if (!data) return { ok: false, status: 404, error: `${label} not found` }
  }
  return { ok: true }
}
