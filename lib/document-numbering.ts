/**
 * Shared generator for year-scoped business document identifiers.
 *
 * Prior implementations independently:
 *   - called rpc('nextval', { seq_name }) — which NEVER existed, because
 *     Postgres's built-in nextval(regclass) takes an unnamed argument that
 *     PostgREST cannot bind by name. Every call returned PGRST202.
 *   - fell back to `COUNT(*) + 1` — RACY, and wrong after any deletion
 *   - silently emitted `${PREFIX}-${year}-001` on the first failure —
 *     a guaranteed-collision default
 *
 * The sequence path was removed in migration 258 rather than repaired: the
 * sequences are global while these are PER-TENANT identifiers, so a shared
 * sequence would number the second tenant's first invoice INV-2026-002 —
 * gaps that read as lost paperwork. The tenant-scoped scan gives each tenant
 * its own 001.
 *
 * So there is one path:
 *   Take the NUMERIC max over the current year's values
 *   (`SELECT … WHERE col LIKE 'PREFIX-YYYY-%'`, counter parsed in code).
 *   Year-scoped, tolerates row deletions, and survives 4-digit counters
 *   (a lexicographic DESC put '999' above '1000').
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

  // There is no sequence path. This used to call rpc('nextval', { seq_name }),
  // which has NEVER existed: Postgres's built-in nextval(regclass) takes an
  // unnamed argument, so PostgREST cannot bind `seq_name` and every call
  // returned PGRST202. The scan below has therefore always been the real
  // implementation.
  //
  // Removing the call rather than creating the function, because the function
  // would be WRONG here: the sequences (invoice_number_seq, expense_number_seq)
  // are global, while these are per-tenant identifiers. A shared sequence
  // means the second tenant's first invoice is numbered INV-2026-002 — gaps
  // that look like lost paperwork to an operator. The tenant-scoped scan
  // gives every tenant their own 001.
  //
  // Year-scoped NUMERIC max. The prior count-based fallback
  // produced duplicates whenever a row was deleted OR two requests landed
  // concurrently; a lexicographic `ORDER BY col DESC LIMIT 1` breaks at four
  // digits ('999' sorts above '1000', regenerating a used number until the
  // unique-retry loop deadlocks). So: scan the year's values and take the
  // numeric max in code. Fallback-only path; the cap is far above any
  // realistic yearly volume and prevents an unbounded read.
  const likeNeedle = `${opts.prefix}-${year}-%`
  const { data: rows, error: scanError } = await opts.supabase
    .from(opts.table)
    .select(opts.column)
    .like(opts.column, likeNeedle)
    .limit(10000)
  if (scanError) {
    throw new Error(`Failed to generate ${opts.prefix} number: scan failed (${scanError.message})`)
  }

  // Counter is read ONLY from well-formed values: anchored to this prefix and
  // year, numeric counter, optional '-DEP'/'-FIN' style suffix. A loose
  // suffix regex used to backtrack on legacy values like 'INV-2026-LEGACY'
  // and capture the YEAR as the counter (next number: 'INV-2026-2027').
  const counterRe = new RegExp(
    `^${opts.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${year}-(\\d+)(?:-[A-Z]+)?$`
  )
  let next = 1
  for (const row of rows ?? []) {
    const value = (row as unknown as Record<string, unknown>)[opts.column]
    if (typeof value !== 'string') continue
    const m = value.match(counterRe)
    if (m) next = Math.max(next, parseInt(m[1], 10) + 1)
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
