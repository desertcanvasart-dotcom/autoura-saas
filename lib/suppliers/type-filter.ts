// ============================================
// "Is this supplier a guide?" — any of its roles
// ============================================
// A supplier fills SEVERAL roles since migration 340 (`types` text[]), but
// the guide picker and the vehicle list still asked the single legacy
// `supplier_type`: a transport company that also guides, or a guide whose
// main type is "driver", never appeared (documents audit, round 12).
// /api/suppliers already matches on `types`; this is the same rule as a
// PostgREST .or() string, keeping the legacy column for rows written
// before `types` was back-filled.

/** Keys reach a filter string: only slug characters, never PostgREST syntax. */
function cleanKeys(keys: string[]): string[] {
  return [...new Set(keys.map(k => String(k ?? '').trim()).filter(k => /^[A-Za-z0-9_-]+$/.test(k)))]
}

/**
 * The .or() filter matching a supplier whose `types` overlaps `keys`, or
 * whose legacy `supplier_type` is one of them. Null when no usable key is
 * given (the caller should then match nothing rather than everything).
 */
export function supplierTypesOrFilter(keys: string[]): string | null {
  const clean = cleanKeys(keys)
  if (clean.length === 0) return null
  return `types.ov.{${clean.join(',')}},supplier_type.in.(${clean.join(',')})`
}
