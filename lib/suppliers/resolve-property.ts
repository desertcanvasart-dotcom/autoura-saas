// ============================================
// Find-or-create the property behind a rate row
// ============================================
// The invariant of supplier-HAS-properties: every rate saved with a supplier
// and a property name ends up LINKED to a
// supplier_properties row — from the form's picker, an older client that only
// sends ship_name, or a payload with no property_id at all. The rate keeps its
// denormalized ship_name; this keeps the link true alongside it.
//
// Tenant-scoped port: reads ride the caller's RLS client, and the insert
// carries tenant_id explicitly (the column is NOT NULL and the tenant policy
// checks it).

// Structural chain covering exactly the calls below, so both the RLS client
// and test stubs fit without `any`.
interface PropertyChain {
  select(cols: string): PropertyChain
  eq(col: string, v: string): PropertyChain
  ilike(col: string, v: string): PropertyChain
  limit(n: number): PropertyChain
  insert(row: Record<string, unknown>): PropertyChain
  single(): PromiseLike<{ data: { id: string; name: string } | null; error: unknown }>
  maybeSingle(): PromiseLike<{ data: { id: string; name: string; supplier_id?: string } | null; error?: unknown }>
}
interface Db {
  from(table: string): PropertyChain
}

export async function resolveRateProperty(
  // `unknown`, cast once below — the same seam run-currency.ts uses, so the
  // typed RLS client and test stubs both fit without dragging the generated
  // query-builder types through.
  dbIn: unknown,
  opts: {
    tenantId: string
    /** 'ship' for cruises, 'hotel' for accommodation, 'train' for phase 3. */
    propertyType: 'ship' | 'hotel' | 'train'
    supplierId: string | null | undefined
    name: string | null | undefined
    propertyId?: string | null
  }
): Promise<{ property_id: string | null; name?: string }> {
  const db = dbIn as Db
  // An explicit property wins; its canonical name overwrites whatever the
  // payload spelled, so the row and the property cannot disagree.
  if (opts.propertyId) {
    const { data } = await db
      .from('supplier_properties')
      .select('id, name, supplier_id')
      .eq('id', opts.propertyId)
      .maybeSingle()
    if (data) return { property_id: data.id, name: data.name }
    // A stale/foreign id falls through to name resolution rather than saving
    // a broken reference.
  }

  const name = String(opts.name ?? '').trim()
  if (!opts.supplierId || !name) return { property_id: null }

  const { data: existing } = await db
    .from('supplier_properties')
    .select('id, name')
    .eq('supplier_id', opts.supplierId)
    .eq('property_type', opts.propertyType)
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (existing) return { property_id: existing.id, name: existing.name }

  const { data: created, error } = await db
    .from('supplier_properties')
    .insert({ tenant_id: opts.tenantId, supplier_id: opts.supplierId, property_type: opts.propertyType, name })
    .select('id, name')
    .single()
  // Best-effort: a failed create (e.g. losing the unique race) must not block
  // saving the rate itself.
  if (error || !created) return { property_id: null }
  return { property_id: created.id, name: created.name }
}
