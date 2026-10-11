// ============================================
// Read every row, not the first 1000
// ============================================
// PostgREST caps a plain select at its max-rows setting (1000 on Supabase),
// silently: a tenant with 1,400 rates exported 1,000 of them, and an import
// checked names against the first 1,000 suppliers only (documents audit,
// round 12). This pages with .range() until a short page comes back.
//
// The caller builds the query per page — a PostgREST builder is single-use —
// and should order it on a unique column (or end with one) so no row falls
// between two pages.

export const DEFAULT_PAGE_SIZE = 1000
/** A runaway guard: 1000 pages of 1000 is far beyond any tenant's table. */
const MAX_PAGES = 1000

export interface PageResult<T, E> {
  data: T[] | null
  error: E | null
}

/**
 * Calls `fetchPage(from, to)` (inclusive bounds, as .range() takes them) until
 * a page returns fewer than `pageSize` rows. The first error stops the loop
 * and is returned with the rows read so far.
 */
export async function fetchAllPages<T, E = unknown>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T, E>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ data: T[]; error: E | null }> {
  const size = Math.max(1, Math.floor(pageSize))
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * size
    const { data, error } = await fetchPage(from, from + size - 1)
    if (error) return { data: rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < size) break
  }
  return { data: rows, error: null }
}
