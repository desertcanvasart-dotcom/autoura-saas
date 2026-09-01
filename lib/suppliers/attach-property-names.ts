// ============================================
// Name the property each rate row points at
// ============================================
// A rate carries `property_id` — which ship, which train — but every list that
// shows rates reads plain columns, so the link existed in the database and
// appeared on no screen. A fleet could be recorded and never seen.
//
// This resolves those ids in ONE extra query rather than through a PostgREST
// embed. An embed needs a real foreign key, and when it is missing PostgREST
// fails the WHOLE query with PGRST200 rather than just omitting the join —
// which has already broken invitations, and would here turn "the train name is
// absent" into "the rates page is empty". A separate lookup degrades to no
// names, never to no rates.

// Boundary is `unknown` and narrowed once — see operator-name.ts.
interface PropertyNameChain {
  select(cols: string): PropertyNameChain
  in(col: string, values: string[]): PromiseLike<{ data: { id: string; name: string }[] | null; error: unknown }>
}
interface Db {
  from(table: string): unknown
}

export async function attachPropertyNames<T extends { property_id?: string | null }>(
  db: Db,
  rows: T[] | null | undefined
): Promise<(T & { property_name?: string | null })[]> {
  const list = rows ?? []
  const ids = [...new Set(list.map(r => r.property_id).filter(Boolean))] as string[]
  if (ids.length === 0) return list

  const { data, error } = await (db.from('supplier_properties') as PropertyNameChain)
    .select('id, name')
    .in('id', ids)
  if (error) return list // names are a nicety; the rates are the point

  const byId = new Map((data ?? []).map(p => [p.id, p.name]))
  return list.map(r => (r.property_id ? { ...r, property_name: byId.get(r.property_id) ?? null } : r))
}
