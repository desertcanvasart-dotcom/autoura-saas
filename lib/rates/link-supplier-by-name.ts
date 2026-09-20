// ============================================
// The company a rate NAMES, linked to the company it MEANS
// ============================================
// Three things can say which supplier a rate belongs to: supplier_id (the
// form's dropdown writes it), supplier_code (the portable key between
// installs), and supplier_name — the column a human fills in, and the one the
// sample sheet and the export both offer. The bulk import resolved the first
// two and ignored the third.
//
// Found live on 2026-09-18: Travel2Egypt's 11 hotel rates each named a
// company, 10 of those companies already existed as suppliers in the same
// workspace, and not one row was linked. The page showed a table full of
// company names above a card reading "Linked to Company 0", its company
// filter (which matches on supplier_id) found nothing, and the property link
// could not resolve either, because a property hangs off its supplier.
// 57 rows across hotels, activities and meals were in that state.
//
// This resolves a link that already exists. It never creates a supplier from a
// rate sheet: a company is a business relationship, not a side effect of a
// spreadsheet.

export interface SupplierRow {
  id: string
  name: string | null
}

export interface SupplierNameGap<T> {
  row: T
  name: string
  /** No supplier by that name here, or more than one. */
  reason: 'unknown' | 'ambiguous'
  matches: number
}

export interface SupplierNameLinkResult<T> {
  linked: number
  gaps: Array<SupplierNameGap<T>>
}

/** name (lowercased, trimmed) → every supplier id with that name. */
export function indexSuppliersByName(suppliers: readonly SupplierRow[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const supplier of suppliers) {
    const key = String(supplier.name ?? '').trim().toLowerCase()
    if (!key) continue
    index.set(key, [...(index.get(key) ?? []), supplier.id])
  }
  return index
}

/**
 * Fill in supplier_id on rows that name a supplier but do not link to one.
 *
 * Rows already carrying a supplier_id are left exactly as they are — an
 * explicit link, or one resolved from a supplier_code, always wins over a
 * name. A name matching no supplier, or several, is reported and the row is
 * imported unlinked: the rate is worth keeping, and a guessed company is not.
 */
export function linkRowsBySupplierName<T extends Record<string, unknown>>(
  rows: T[],
  suppliers: readonly SupplierRow[]
): SupplierNameLinkResult<T> {
  const index = indexSuppliersByName(suppliers)
  const gaps: Array<SupplierNameGap<T>> = []
  let linked = 0

  for (const row of rows) {
    if (row.supplier_id) continue
    const name = String(row.supplier_name ?? '').trim()
    if (!name) continue

    const matches = index.get(name.toLowerCase()) ?? []
    if (matches.length === 1) {
      ;(row as Record<string, unknown>).supplier_id = matches[0]
      linked++
    } else {
      gaps.push({
        row,
        name,
        reason: matches.length === 0 ? 'unknown' : 'ambiguous',
        matches: matches.length,
      })
    }
  }

  return { linked, gaps }
}

/** What the operator is told about one unresolved name. */
export function supplierNameGapMessage(gap: SupplierNameGap<unknown>): string {
  return gap.reason === 'unknown'
    ? `no supplier named "${gap.name}" in this workspace — the rate is imported, the company link is not`
    : `${gap.matches} suppliers are named "${gap.name}" — the rate is imported, the company link is left for you to pick`
}
