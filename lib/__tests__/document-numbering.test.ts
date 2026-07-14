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
    order: [] as { column: string; options: unknown }[],
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
                order: (column2: string, options: unknown) => {
                  calls.order.push({ column: column2, options })
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
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const baseOpts = {
  prefix: 'INV',
  sequenceName: 'invoice_number_seq',
  table: 'invoices',
  column: 'invoice_number',
  year: 2026,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('nextDocumentNumber — sequence (primary) path', () => {
  it('formats PREFIX-YYYY-NNN with 3-digit zero padding', async () => {
    const { client, calls } = mockSupabase({ rpc: { data: 7, error: null } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-007')
    expect(calls.rpc).toEqual([{ fn: 'nextval', args: { seq_name: 'invoice_number_seq' } }])
    // Sequence succeeded — the fallback scan must not run.
    expect(calls.from).toHaveLength(0)
  })

  it('pads 2-digit sequence values to 3 digits', async () => {
    const { client } = mockSupabase({ rpc: { data: 42, error: null } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-042')
  })

  it('does not truncate sequence values above 999', async () => {
    const { client } = mockSupabase({ rpc: { data: 1234, error: null } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-1234')
  })

  it('treats sequence value 0 as legitimate (seqData != null), emitting -000', async () => {
    const { client, calls } = mockSupabase({ rpc: { data: 0, error: null } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-000')
    expect(calls.from).toHaveLength(0)
  })

  it('uses the prefix verbatim (per-type isolation: EXP vs INV never overlap)', async () => {
    const { client } = mockSupabase({ rpc: { data: 7, error: null } })
    await expect(
      nextDocumentNumber({ ...baseOpts, supabase: client, prefix: 'EXP' }),
    ).resolves.toBe('EXP-2026-007')
  })

  it('defaults to the current year when no year override is given', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2031-03-15T12:00:00Z'))
    const { client } = mockSupabase({ rpc: { data: 5, error: null } })
    await expect(
      nextDocumentNumber({ ...baseOpts, year: undefined, supabase: client }),
    ).resolves.toBe('INV-2031-005')
  })
})

describe('nextDocumentNumber — fallback scan path (sequence RPC fails)', () => {
  const rpcFail = { data: null, error: { message: 'function nextval does not exist' } }

  it('starts at 001 for an empty year', async () => {
    const { client, calls } = mockSupabase({ rpc: rpcFail, rows: [] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
    expect(calls.from).toEqual(['invoices'])
    expect(calls.select).toEqual(['invoice_number'])
    // Year-scoped LIKE needle — this is what isolates 2026 from 2027 and
    // INV from EXP in the fallback.
    expect(calls.like).toEqual([{ column: 'invoice_number', pattern: 'INV-2026-%' }])
    expect(calls.order).toEqual([{ column: 'invoice_number', options: { ascending: false } }])
    expect(calls.limit).toEqual([1])
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

  // NOTE: observed behavior — when the highest existing value does not match
  // the numeric-suffix regex at all (e.g. a lowercase suffix), the fallback
  // silently restarts at 001, which can COLLIDE with an existing INV-2026-001.
  // The UNIQUE constraint + insertWithUniqueRetry is the only safety net.
  it('restarts at 001 when the last value is unparseable (collision risk absorbed by retry layer)', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, rows: [{ invoice_number: 'INV-2026-042-dep' }] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-001')
  })

  // NOTE: observed behavior — when the trailing token is non-numeric (legacy
  // free-form value 'INV-2026-LEGACY'), the /-(\d+)(?:-[A-Z]+)?$/ regex
  // backtracks and captures the YEAR (2026) as the sequence counter, treating
  // 'LEGACY' as the suffix. The next number becomes year+1, silently jumping
  // the counter to 2027 for the rest of the year.
  it('misparses the year as the counter for a non-numeric legacy value (documented gap)', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, rows: [{ invoice_number: 'INV-2026-LEGACY' }] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-2027')
  })

  // NOTE: observed behavior — the fallback relies on LEXICOGRAPHIC ordering,
  // and 'INV-2026-999' sorts ABOVE 'INV-2026-1000' as a string. Once a year
  // passes 999 documents, a DB ordered scan returns '...-999' as the "max",
  // and the module regenerates 'INV-2026-1000' — a duplicate of the existing
  // row. Only the unique constraint + retry loop prevents a silent dup, and
  // the retry regenerates the SAME number, so all 5 attempts fail.
  it('regenerates an already-used number when lexicographic max lags the true max (>999 docs/year)', async () => {
    // Simulate what Postgres ORDER BY ... DESC returns when both
    // INV-2026-999 and INV-2026-1000 exist: '999' sorts first.
    const { client } = mockSupabase({ rpc: rpcFail, rows: [{ invoice_number: 'INV-2026-999' }] })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).resolves.toBe('INV-2026-1000')
  })

  it('throws (never emits a guaranteed-duplicate default) when both paths fail', async () => {
    const { client } = mockSupabase({ rpc: rpcFail, scanError: { message: 'permission denied' } })
    await expect(nextDocumentNumber({ ...baseOpts, supabase: client })).rejects.toThrow(
      /Failed to generate INV number.*function nextval does not exist.*permission denied/,
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
