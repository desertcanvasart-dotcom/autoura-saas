// ============================================
// The operator name a train rate DISPLAYS
// ============================================
// `operator_name` is denormalized: the rates list and the CSV export read it,
// and neither joins suppliers. It used to be typed into the form from a
// hardcoded list — which is how a rate came to name an operator that was not
// its supplier, and how a rate saved WITH a supplier but without touching that
// control ended up with a blank column.
//
// The form no longer offers the field. The supplier IS the operator, so the
// name is stamped here on every write: whatever a client sends, a rate that
// names a supplier gets that supplier's name and the two cannot drift. Rows
// heal on their next save, whichever screen performs it.
//
// TENANT SCOPE IS PART OF THE LOOKUP, not an afterthought: this runs on an
// admin client, so an id from another tenant's roster would otherwise resolve
// to that tenant's supplier name and write it into this tenant's rate.
//
// With no supplier the caller's value stands, which keeps CSV imports and
// legacy rows intact.

// Structural chain covering exactly the calls below, so both the admin client
// and test stubs fit without `any` (lib/suppliers/resolve-property.ts does the
// same — the lint ratchet counts every new one).
// The real client's from() is generic over table names and does not match a
// hand-written chain, so the boundary is `unknown` and narrowed once here.
// That keeps both the admin client and test stubs working without `any`.
interface SupplierChain {
  select(cols: string): SupplierChain
  eq(col: string, v: string): SupplierChain
  maybeSingle(): PromiseLike<{ data: { name: string } | null; error?: unknown }>
}
interface Db {
  from(table: string): unknown
}

export async function operatorNameForSupplier(
  db: Db,
  opts: {
    tenantId: string
    supplierId: string | null | undefined
    fallback: unknown
  }
): Promise<string | null> {
  const given =
    typeof opts.fallback === 'string' && opts.fallback.trim() ? opts.fallback.trim() : null
  if (!opts.supplierId) return given

  const { data } = await (db.from('suppliers') as SupplierChain)
    .select('name')
    .eq('id', opts.supplierId)
    .eq('tenant_id', opts.tenantId)
    .maybeSingle()

  // A supplier we cannot read — missing, or another tenant's — must not blank
  // a name the row already carried.
  return data?.name || given
}
