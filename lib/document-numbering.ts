/**
 * Shared generator for year-scoped business document identifiers.
 *
 * Prior implementations independently:
 *   - rpc('nextval', { seq_name }) — works when the sequence exists
 *   - fell back to `COUNT(*) + 1` on RPC failure — RACY
 *   - silently emitted `${PREFIX}-${year}-001` on the very first failure —
 *     a guaranteed-collision default
 *   - rejected a legitimate 0 sequence value via `if (seqData)` truthiness
 *
 * This helper centralizes the safer pattern:
 *   1. Try `nextval` (sequence is the source of truth when healthy).
 *   2. On RPC failure, look at the highest existing document for the current
 *      year using lexicographic ordering — `SELECT … WHERE col LIKE 'PREFIX-YYYY-%'
 *      ORDER BY col DESC LIMIT 1`. This is year-scoped (the sequence was
 *      previously global, so 2027 kept climbing from 2026's count) and
 *      tolerates row deletions (count-based fallback regressed when rows
 *      were deleted).
 *   3. Use `seqData != null` so sequence value 0 is treated as legitimate.
 *
 * The matching DB migration (20260626_unique_document_numbers.sql) adds
 * UNIQUE constraints on each column. Callers should wrap the INSERT in
 * `insertWithUniqueRetry` so a 23505 collision regenerates the number and
 * retries instead of crashing the request.
 *
 * Ported from sibling app lib/document-numbering.ts.
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface NextDocumentNumberOpts {
  /** A SupabaseClient that can read the target table (service-role admin). */
  supabase: SupabaseClient
  /** Prefix, e.g. 'EXP', 'INV', 'SI'. */
  prefix: string
  /** Sequence name passed to the nextval RPC. */
  sequenceName: string
  /** Table to scan when the sequence RPC fails. */
  table: string
  /** Column containing the document number — used for the fallback MAX. */
  column: string
  /** Optional override for the year (defaults to current year). */
  year?: number
}

/**
 * Returns a year-scoped document number string in the shape `PREFIX-YYYY-NNN`.
 * Throws when neither the sequence nor the fallback yields a usable value
 * (rather than silently emitting a guaranteed-duplicate '-001').
 */
export async function nextDocumentNumber(opts: NextDocumentNumberOpts): Promise<string> {
  const year = opts.year ?? new Date().getFullYear()

  // Primary path — the sequence is the source of truth. `seqData != null`
  // accepts 0 as a legitimate value.
  const { data: seqData, error: seqError } = await opts.supabase
    .rpc('nextval', { seq_name: opts.sequenceName })
  if (!seqError && seqData != null) {
    return `${opts.prefix}-${year}-${String(seqData).padStart(3, '0')}`
  }

  // Fallback — year-scoped lexicographic MAX. The prior count-based fallback
  // produced duplicates whenever a row was deleted OR two requests landed
  // concurrently. Scoping by year additionally keeps each year's sequence
  // starting at 1 (the global sequence used to climb forever).
  const likeNeedle = `${opts.prefix}-${year}-%`
  const { data: rows, error: scanError } = await opts.supabase
    .from(opts.table)
    .select(opts.column)
    .like(opts.column, likeNeedle)
    .order(opts.column, { ascending: false })
    .limit(1)
  if (scanError) {
    throw new Error(`Failed to generate ${opts.prefix} number: sequence RPC failed (${seqError?.message || 'unknown'}) and fallback scan failed (${scanError.message})`)
  }

  let next = 1
  if (rows && rows.length > 0) {
    const last = (rows[0] as unknown as Record<string, unknown>)[opts.column] as string | undefined
    if (last) {
      // Accept suffixes like '-DEP' or '-FIN' that follow the numeric portion
      // (used by the deposit/final invoice variants).
      const m = last.match(/-(\d+)(?:-[A-Z]+)?$/)
      if (m) next = parseInt(m[1], 10) + 1
    }
  }
  return `${opts.prefix}-${year}-${String(next).padStart(3, '0')}`
}

interface InsertWithUniqueRetryOpts<T> {
  /** Called each attempt to (re)compute the row to insert. The function will
   *  typically include a call to nextDocumentNumber, so a 23505 retry
   *  generates a fresh number rather than reusing the colliding one. */
  generateRow: () => Promise<T>
  /** Called with each generated row; returns Supabase's `{ data, error }`. */
  insert: (row: T) => Promise<{ data: any; error: any }>
  /** Maximum attempts (default 5). */
  maxAttempts?: number
}

/**
 * Postgres unique_violation = SQLSTATE 23505. We retry the row generation +
 * insert combo so concurrent writers don't collide on the same identifier.
 */
const PG_UNIQUE_VIOLATION = '23505'

export async function insertWithUniqueRetry<T>(
  opts: InsertWithUniqueRetryOpts<T>,
): Promise<{ data: any; error: any }> {
  const maxAttempts = opts.maxAttempts ?? 5
  let lastError: any = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await opts.generateRow()
    const result = await opts.insert(row)
    if (!result.error) return result
    lastError = result.error
    if (result.error?.code !== PG_UNIQUE_VIOLATION) return result
    console.warn(`[document-numbering] unique-violation retry ${attempt + 1}/${maxAttempts}`)
  }
  return { data: null, error: lastError ?? new Error('exceeded unique-retry attempts') }
}
