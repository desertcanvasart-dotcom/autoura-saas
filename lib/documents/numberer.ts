// ============================================
// Supplier-document numbers (PREFIX-YYYY-NNNN)
// ============================================
// document_number is UNIQUE across the whole table — every tenant shares one
// sequence per prefix and year. Two ways numbering broke that:
//
//   * POST /api/supplier-documents read the highest number through the
//     caller's RLS client, so it saw only its own tenant's numbers and handed
//     out one another tenant already had: the insert failed on the UNIQUE
//     constraint.
//   * generate-documents kept a module-level offset per type that was never
//     reset. The server is one long-running process, so every batch counted
//     on from every earlier batch (numbers skipped further each time), and
//     overlapping requests advanced each other's counters.
//
// Each request now owns a numberer that reads the highest number across ALL
// tenants (pass the service-role client: only the number is read), and an
// insert that still collides (another request took the number in between)
// is renumbered and retried. Ported from travel-ops-pro (sweep H8).

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const SUPPLIER_DOCUMENT_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  activity_voucher: 'AV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV',
}

export const supplierDocumentPrefix = (docType: string) => SUPPLIER_DOCUMENT_PREFIXES[docType] || 'SD'

/** Numbers for one request: counts on from each prefix's highest number, read once. */
export function createDocumentNumberer(
  db: Db,
  prefixFor: (docType: string) => string = supplierDocumentPrefix,
  year: number = new Date().getFullYear()
): (docType: string) => Promise<string> {
  const next: Record<string, number> = {}
  return async (docType: string) => {
    const prefix = prefixFor(docType)
    if (next[prefix] === undefined) {
      const { data } = await db
        .from('supplier_documents')
        .select('document_number')
        .like('document_number', `${prefix}-${year}-%`)
        .order('document_number', { ascending: false })
        .limit(1)
      const match = (data?.[0]?.document_number as string | undefined)?.match(/-(\d+)$/)
      next[prefix] = match ? parseInt(match[1], 10) + 1 : 1
    }
    const n = next[prefix]++
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`
  }
}

const UNIQUE_VIOLATION = '23505'

/**
 * Insert rows numbered by `numbersFrom` (the service-role client), retrying
 * with fresh numbers when another request took one in between. `insert` does
 * the actual insert, with whichever client the caller writes through.
 */
export async function insertNumbered<T extends { document_type: string; document_number?: string }, R>(
  rows: T[],
  numbersFrom: Db,
  insert: (rows: T[]) => PromiseLike<{ data: R | null; error: { code?: string; message: string } | null }>,
  attempts = 3
): Promise<{ data: R | null; error: { code?: string; message: string } | null }> {
  const number = async () => {
    const next = createDocumentNumberer(numbersFrom)
    for (const row of rows) row.document_number = await next(row.document_type)
  }
  await number()
  let result = await insert(rows)
  for (let i = 0; result.error?.code === UNIQUE_VIOLATION && i < attempts; i++) {
    await number()
    result = await insert(rows)
  }
  return result
}
