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

/** A read that failed — never to be taken for "there are no rows". */
export class RowReadError extends Error {
  constructor(public readonly table: string, public readonly readError: unknown) {
    const detail = (readError as { message?: string } | null)?.message ?? String(readError)
    super(`Could not read ${table}: ${detail}`)
    this.name = 'RowReadError'
  }
}

/** The slice of a PostgREST filter builder this needs (single-use, so built per page). */
interface PagedQuery {
  range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }>
  order(column: string, opts?: { ascending?: boolean }): PagedQuery
}

/**
 * Every row of an UNORDERED read, in the order it reads today, and an error
 * thrown (RowReadError) rather than handed back as an empty list.
 *
 * `build()` makes a fresh query with the caller's filters and no order. The
 * first page is that same query, so a table under one page comes back
 * exactly as the plain select returned it. Only a full first page — the
 * point where a plain select silently stopped — is read again in pages
 * ordered by `tiebreak` (a unique column), because an unordered read is not
 * stable across .range() pages and a row could fall between two of them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchEveryRow<T = any>(
  table: string,
  build: () => PagedQuery,
  opts: { pageSize?: number; tiebreak?: string } = {},
): Promise<T[]> {
  const size = Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE))
  const first = await build().range(0, size - 1)
  if (first.error) throw new RowReadError(table, first.error)
  const firstRows = (first.data ?? []) as T[]
  if (firstRows.length < size) return firstRows

  const tiebreak = opts.tiebreak ?? 'id'
  const { data, error } = await fetchAllPages<T>(
    (from, to) => build().order(tiebreak, { ascending: true }).range(from, to) as PromiseLike<PageResult<T, unknown>>,
    size,
  )
  if (error) throw new RowReadError(table, error)
  return data
}
