import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

// lib/document-numbering.ts generates year-scoped invoice/receipt/document
// numbers (`PREFIX-YYYY-NNN`). Duplicate numbers are a financial/legal bug,
// so these tests lock: format, zero-padding, sequence-primary path, the
// year-scoped fallback scan, and the 23505 unique-violation retry loop.

interface MockOpts {
  /** Result of supabase.rpc('nextval', ...) */
  rpc?: { data: unknown; error: { message: string } | null }
  /** Rows returned by the fallback scan. */
  rows?: Record<string, unknown>[] | null
  /** Error returned by the fallback scan. */
  scanError?: { message: string } | null
}

/** Minimal SupabaseClient stand-in covering exactly the calls the module makes. */
function mockSupabase(opts: MockOpts) {
  const calls = {
    rpc: [] as { fn: string; args: unknown }[],
    from: [] as string[],
    select: [] as string[],
    like: [] as { column: string; pattern: string }[],
    limit: [] as number[],
  }
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.rpc.push({ fn, args })
      return Promise.resolve(opts.rpc ?? { data: null, error: { message: 'no sequence' } })
    },
    from: (table: string) => {
      calls.from.push(table)
      return {
        select: (col: string) => {
          calls.select.push(col)
          return {
            like: (column: string, pattern: string) => {
              calls.like.push({ column, pattern })
              return {
                limit: (n: number) => {
                  calls.limit.push(n)
                  return Promise.resolve({ data: opts.rows ?? [], error: opts.scanError ?? null })
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const baseOpts = {
  prefix: 'INV',
  table: 'invoices',
  column: 'invoice_number',
  year: 2026,
}

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// The sequence path is GONE (migration 258), and its tests with it.
//
// They passed for months while the feature was broken, because they mocked
// rpc('nextval', { seq_name }) as returning a value. It never could: Postgres's
// nextval(regclass) takes an unnamed argument that PostgREST cannot bind by
// name, so every real call returned PGRST202 and the scan below was always the
// actual implementation. A mock proved the code handled a response the database
// would never send.
//
// It was removed rather than repaired because the sequences are global while
// these are per-tenant identifiers — a shared sequence numbers the second
// tenant's first invoice INV-2026-002.
// ============================================================================

describe('the sequence path no longer exists', () => {
  it('never calls an RPC — the scan is the only path', async () => {
    const { client, calls } = mockSupabase({ rows: [] })
    await nextDocumentNumber({ ...baseOpts, supabase: client })
    expect(calls.rpc).toEqual([])
  })

  it('numbers the first document of the year 001, per tenant', async () => {
    // The scan is RLS-scoped, so "no rows" means none for THIS tenant —
    // which is exactly why every tenant gets its own 001.
    const { client } = mockSupabase({ rows: [] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
  })
})

describe('nextDocumentNumber — the scan path (now the only path)', () => {
  const rpcFail = { data: null, error: { message: 'function nextval does not exist' } }

  it('starts at 001 for an empty year', async () => {
    const { client, calls } = mockSupabase({ rpc: rpcFail, rows: [] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
    expect(calls.from).toEqual(['invoices'])
    expect(calls.select).toEqual(['invoice_number'])
    // Year-scoped LIKE needle — this is what isolates 2026 from 2027 and
    // INV from EXP in the fallback.
    expect(calls.like).toEqual([{ column: 'invoice_number', pattern: 'INV-2026-%' }])
    expect(calls.limit).toEqual([10000])
  })

  it('increments past the highest existing number for the year', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, rows: [{ invoice_number: 'INV-2026-042' }] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-043')
  })

  it('parses numbers with deposit/final suffixes (INV-2026-042-DEP -> 043)', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, rows: [{ invoice_number: 'INV-2026-042-DEP' }] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-043')
  })

  it('scopes the needle to the requested year (rollover: 2027 restarts independently)', async () => {
    const { client, calls } = mockSupabase({ rpc: rpcFail, rows: [] })
    await expect(
      nextDocumentNumber({ ...baseOpts, supabase: client, year: 2027 }),
    ).resolves.toBe('INV-2027-001')
    expect(calls.like).toEqual([{ column: 'invoice_number', pattern: 'INV-2027-%' }])
  })

  it('handles a null rows payload as an empty year', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, rows: null })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
  })

  it('takes the numeric max across unordered rows (not the first or last row)', async () => {
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [
        { invoice_number: 'INV-2026-042' },
        { invoice_number: 'INV-2026-007' },
        { invoice_number: 'INV-2026-013' },
      ],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-043')
  })

  it('skips non-numeric legacy values instead of misparsing the year as the counter', async () => {
    // The old loose suffix regex backtracked on 'INV-2026-LEGACY' and captured
    // the YEAR as the counter (next: 'INV-2026-2027'). The anchored regex now
    // skips it; with only unparseable values the counter restarts at 001
    // (collision risk absorbed by the unique constraint + retry layer).
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [{ invoice_number: 'INV-2026-LEGACY' }, { invoice_number: 'INV-2026-042-dep' }],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
  })

  it('skips legacy values but still honors parseable siblings in the same scan', async () => {
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [{ invoice_number: 'INV-2026-LEGACY' }, { invoice_number: 'INV-2026-042' }],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-043')
  })

  it('survives 4-digit counters (>999 docs/year): 999 + 1000 present -> 1001', async () => {
    // The old lexicographic ORDER BY DESC LIMIT 1 put '999' above '1000' and
    // regenerated the already-used 'INV-2026-1000'. The numeric max fixes it.
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [{ invoice_number: 'INV-2026-999' }, { invoice_number: 'INV-2026-1000' }],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-1001')
  })

  it('ignores rows from other prefixes/years that leak into the scan (anchored regex)', async () => {
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [
        { invoice_number: 'EXP-2026-099' },
        { invoice_number: 'INV-2025-500' },
        { invoice_number: 'INV-2026-004' },
      ],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-005')
  })

  it('regex-escapes the prefix (a dotted prefix cannot wildcard-match other prefixes)', async () => {
    const { client } = mockSupabase({
      rpc: rpcFail,
      rows: [{ invoice_number: 'INVX-2026-050' }],
    })
    // Prefix 'INV.' must not treat '.' as a regex wildcard matching 'INVX'.
    await expect(
      nextDocumentNumber({ ...baseOpts, supabase: client, prefix: 'INV.' }),
    ).resolves.toBe('INV.-2026-001')
  })

  it('throws (never emits a guaranteed-duplicate default) when both paths fail', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, scanError: { message: 'permission denied' } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).rejects.toThrow(
      /Failed to generate INV number.*scan failed.*permission denied/,
    )
  })

  it('falls back when the RPC "succeeds" with a null value', async () => {
    const { client } = mockSupabase({
      rpc: { data: null, error: null },
      rows: [{ invoice_number: 'INV-2026-009' }],
    })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-010')
  })
})

describe('insertWithUniqueRetry — 23505 collision handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns the successful result on the first attempt without retrying', async () => {
    const generateRow = vi.fn(async () => ({ invoice_number: 'INV-2026-001' }))
    const insert = vi.fn(async () => ({ data: { id: 1 }, error: null }))
    const result = await insertWithUniqueRetry({ generateRow, insert })
    expect(result).toEqual({ data: { id: 1 }, error: null })
    expect(generateRow).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('returns a non-23505 error immediately (no blind retry on unrelated failures)', async () => {
    const generateRow = vi.fn(async () => ({}))
    const err = { code: '42501', message: 'permission denied' }
    const insert = vi.fn(async () => ({ data: null, error: err }))
    const result = await insertWithUniqueRetry({ generateRow, insert })
    expect(result.error).toBe(err)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('regenerates a FRESH row after a 23505 collision and succeeds', async () => {
    let n = 0
    const generateRow = vi.fn(async () => ({ invoice_number: `INV-2026-00${++n}` }))
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
      .mockResolvedValueOnce({ data: { id: 2 }, error: null })
    const result = await insertWithUniqueRetry({ generateRow, insert })
    expect(result.data).toEqual({ id: 2 })
    // The colliding number must NOT be reused — a new row is generated.
    expect(generateRow).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(1, { invoice_number: 'INV-2026-001' })
    expect(insert).toHaveBeenNthCalledWith(2, { invoice_number: 'INV-2026-002' })
  })

  it('gives up after maxAttempts and surfaces the last 23505 error', async () => {
    const generateRow = vi.fn(async () => ({}))
    const err = { code: '23505', message: 'duplicate key' }
    const insert = vi.fn(async () => ({ data: null, error: err }))
    const result = await insertWithUniqueRetry({ generateRow, insert, maxAttempts: 3 })
    expect(result).toEqual({ data: null, error: err })
    expect(insert).toHaveBeenCalledTimes(3)
  })

  it('defaults to 5 attempts', async () => {
    const generateRow = vi.fn(async () => ({}))
    const insert = vi.fn(async () => ({ data: null, error: { code: '23505' } }))
    await insertWithUniqueRetry({ generateRow, insert })
    expect(insert).toHaveBeenCalledTimes(5)
  })
})
