import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildFxIndex, type FxSnapshotRow } from '@/lib/fx-conversion'
import {
  resolveReportingCurrency,
  collectCurrencies,
  convertMoneyRows,
  normalizeCurrencyCode,
  type FxContext,
} from '@/lib/fx-report'

// Shared by the P&L, analytics and financial-reports endpoints. If these
// three disagree about currency, an operator comparing two screens cannot
// tell which number to believe — so the conversion rules live here once.

function snapshot(base: string, target: string, rate: number, capturedAt: string): FxSnapshotRow {
  return { base_currency: base, target_currency: target, rate, captured_at: capturedAt, source: 'er-api' }
}

const RATES = buildFxIndex([
  snapshot('EUR', 'EGP', 60, '2026-01-01T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 50, '2026-04-01T00:00:00.000Z'),
  snapshot('EUR', 'USD', 1.2, '2026-01-01T00:00:00.000Z'),
])

function ctx(overrides: Partial<FxContext> = {}): FxContext {
  return {
    fxIndex: RATES,
    reportingCurrency: 'EUR',
    snapshotCount: 3,
    historyAvailable: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveReportingCurrency', () => {
  it('honours an explicit request', () => {
    expect(resolveReportingCurrency([{ currency: 'EGP' }, { currency: 'EGP' }], 'USD')).toBe('USD')
  })

  it('normalises the requested code', () => {
    expect(resolveReportingCurrency([], ' usd ')).toBe('USD')
  })

  it('defaults to the currency most rows already use', () => {
    const rows = [{ currency: 'EGP' }, { currency: 'EGP' }, { currency: 'EUR' }]
    expect(resolveReportingCurrency(rows)).toBe('EGP')
  })

  it('does not silently default an EGP-only book to euros', () => {
    expect(resolveReportingCurrency([{ currency: 'EGP' }])).toBe('EGP')
  })

  it('falls back to EUR only when there is nothing to go on', () => {
    expect(resolveReportingCurrency([])).toBe('EUR')
    expect(resolveReportingCurrency([{ currency: null }])).toBe('EUR')
  })

  it('breaks ties deterministically rather than by insertion order', () => {
    const a = resolveReportingCurrency([{ currency: 'USD' }, { currency: 'EGP' }])
    const b = resolveReportingCurrency([{ currency: 'EGP' }, { currency: 'USD' }])
    expect(a).toBe(b)
  })
})

describe('collectCurrencies', () => {
  it('unions across row sets and ignores blanks', () => {
    const result = collectCurrencies(
      [{ currency: 'EGP' }, { currency: null }],
      [{ currency: 'usd' }],
      undefined,
      null
    )
    expect([...result].sort()).toEqual(['EGP', 'USD'])
  })
})

describe('normalizeCurrencyCode', () => {
  it('upper-cases and trims', () => {
    expect(normalizeCurrencyCode(' egp ')).toBe('EGP')
  })
  it('returns empty for nullish', () => {
    expect(normalizeCurrencyCode(null)).toBe('')
    expect(normalizeCurrencyCode(undefined)).toBe('')
  })
})

describe('convertMoneyRows', () => {
  interface Invoice {
    invoice_number: string
    currency: string | null
    issue_date: string | null
    paid_at: string | null
    total_amount: number
    amount_paid: number
    status?: string
  }

  const spec = {
    currency: (r: Invoice) => r.currency,
    date: (r: Invoice) => r.paid_at || r.issue_date,
    fields: [{ name: 'total_amount', date: (r: Invoice) => r.issue_date }, 'amount_paid'],
    kind: 'invoice' as const,
    reference: (r: Invoice) => `Invoice ${r.invoice_number}`,
  }

  function invoice(o: Partial<Invoice> = {}): Invoice {
    return {
      invoice_number: 'INV-1',
      currency: 'EGP',
      issue_date: '2026-01-10',
      paid_at: '2026-04-10T00:00:00.000Z',
      total_amount: 60000,
      amount_paid: 60000,
      ...o,
    }
  }

  it('converts each field at its own date', () => {
    const { rows } = convertMoneyRows(ctx(), [invoice()], spec)
    // total_amount at the January rate of 60 -> 1000
    expect(rows[0].total_amount).toBe(1000)
    // amount_paid at the April rate of 50 -> 1200
    expect(rows[0].amount_paid).toBe(1200)
  })

  it('leaves non-money fields untouched', () => {
    const { rows } = convertMoneyRows(ctx(), [invoice({ status: 'paid' })], spec)
    expect(rows[0].invoice_number).toBe('INV-1')
    expect(rows[0].status).toBe('paid')
    expect(rows[0].currency).toBe('EGP')
  })

  it('passes through rows already in the reporting currency', () => {
    const { rows, fx } = convertMoneyRows(
      ctx(),
      [invoice({ currency: 'EUR', total_amount: 1234.567, amount_paid: 0 })],
      spec
    )
    expect(rows[0].total_amount).toBe(1234.57)
    expect(fx.same_currency).toBe(1)
    expect(fx.all_historical).toBe(true)
  })

  it('treats a missing currency as the reporting currency', () => {
    const { rows } = convertMoneyRows(ctx(), [invoice({ currency: null, total_amount: 500, amount_paid: 0 })], spec)
    expect(rows[0].total_amount).toBe(500)
  })

  it('drops the whole row when any single field cannot convert', () => {
    // JPY has no rate at all — a row with a converted total but an
    // unconverted paid amount would corrupt the collection rate.
    const { rows, holes, complete } = convertMoneyRows(
      ctx(),
      [invoice({ currency: 'JPY' })],
      spec
    )
    expect(rows).toHaveLength(0)
    expect(complete).toBe(false)
    expect(holes[0].reference).toBe('Invoice INV-1')
    expect(holes[0].kind).toBe('invoice')
    expect(holes[0].fromCurrency).toBe('JPY')
  })

  it('keeps convertible rows alongside a dropped one', () => {
    const { rows, holes } = convertMoneyRows(
      ctx(),
      [invoice({ invoice_number: 'OK' }), invoice({ invoice_number: 'BAD', currency: 'JPY' })],
      spec
    )
    expect(rows.map(r => r.invoice_number)).toEqual(['OK'])
    expect(holes).toHaveLength(1)
  })

  it('counts the FX tally once per row, not once per field', () => {
    const { fx } = convertMoneyRows(ctx(), [invoice()], spec)
    expect(fx.historical + fx.live + fx.same_currency + fx.unconverted).toBe(1)
  })

  it('describes a row by its weakest field', () => {
    // total_amount resolves historically; amount_paid predates all history
    // and needs the live rate. The row must read as 'live', not 'historical'.
    const { fx } = convertMoneyRows(
      ctx({ liveRate: () => 1 / 55 }),
      [invoice({ issue_date: '2026-01-10', paid_at: '2019-01-01T00:00:00.000Z' })],
      spec
    )
    expect(fx.live).toBe(1)
    expect(fx.historical).toBe(0)
    expect(fx.all_historical).toBe(false)
  })

  it('uses the live fallback when history is too young', () => {
    const { rows, fx } = convertMoneyRows(
      ctx({ liveRate: () => 1 / 50 }),
      [invoice({ issue_date: '2019-01-01', paid_at: null, total_amount: 5000, amount_paid: 0 })],
      spec
    )
    expect(rows[0].total_amount).toBe(100)
    expect(fx.live).toBe(1)
  })

  it('treats a non-numeric amount as zero rather than NaN', () => {
    const { rows } = convertMoneyRows(
      ctx(),
      [invoice({ currency: 'EUR', total_amount: 'abc' as unknown as number, amount_paid: 0 })],
      spec
    )
    expect(rows[0].total_amount).toBe(0)
  })

  it('handles an empty input set', () => {
    const { rows, holes, complete, fx } = convertMoneyRows(ctx(), [] as Invoice[], spec)
    expect(rows).toEqual([])
    expect(holes).toEqual([])
    expect(complete).toBe(true)
    expect(fx.all_historical).toBe(true)
  })

  it('resolves a cross rate through the pivot', () => {
    // USD -> EUR -> EGP, both legs dated 1 Jan.
    const { rows } = convertMoneyRows(
      ctx({ reportingCurrency: 'EGP' }),
      [invoice({ currency: 'USD', issue_date: '2026-02-01', paid_at: null, total_amount: 100, amount_paid: 0 })],
      spec
    )
    expect(rows[0].total_amount).toBeCloseTo(5000, 6)
  })
})

describe('loadFxContext', () => {
  it('skips the snapshot query entirely when only one currency is in play', async () => {
    const from = vi.fn()
    const { loadFxContext } = await import('@/lib/fx-report')

    const context = await loadFxContext({ from }, {
      currencies: ['EUR'],
      reportingCurrency: 'EUR',
    })

    expect(from).not.toHaveBeenCalled()
    expect(context.reportingCurrency).toBe('EUR')
    expect(context.historyAvailable).toBe(false)
    expect(context.snapshotCount).toBe(0)
  })

  it('degrades to live rates when the snapshots table errors', async () => {
    vi.resetModules()
    vi.doMock('@/lib/currency-service', () => ({
      fetchExchangeRates: async () => ({ base: 'EUR', date: '2026-07-26', rates: { EUR: 1, EGP: 55 } }),
      getExchangeRate: (from: string, to: string) => (from === 'EUR' && to === 'EGP' ? 55 : null),
    }))
    const { loadFxContext } = await import('@/lib/fx-report')

    const supabase = {
      from: () => ({
        select: () => ({
          in: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'relation does not exist' } }),
              }),
            }),
          }),
        }),
      }),
    }

    const context = await loadFxContext(supabase, {
      currencies: ['EGP', 'EUR'],
      reportingCurrency: 'EUR',
    })

    expect(context.historyAvailable).toBe(false)
    expect(context.liveRate?.('EUR', 'EGP')).toBe(55)
    vi.doUnmock('@/lib/currency-service')
  })

  it('indexes returned snapshots and reports history as available', async () => {
    vi.resetModules()
    vi.doMock('@/lib/currency-service', () => ({
      fetchExchangeRates: async () => ({ base: 'EUR', date: '2026-07-26', rates: { EUR: 1 } }),
      getExchangeRate: () => null,
    }))
    const { loadFxContext } = await import('@/lib/fx-report')

    const supabase = {
      from: () => ({
        select: () => ({
          in: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({
                  data: [snapshot('EUR', 'EGP', 50, '2026-04-01T00:00:00.000Z')],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const context = await loadFxContext(supabase, {
      currencies: ['EGP'],
      reportingCurrency: 'EUR',
    })

    expect(context.snapshotCount).toBe(1)
    expect(context.historyAvailable).toBe(true)
    expect(context.fxIndex.has('EUR>EGP')).toBe(true)
    vi.doUnmock('@/lib/currency-service')
  })

  it('never throws when the query itself blows up', async () => {
    vi.resetModules()
    vi.doMock('@/lib/currency-service', () => ({
      fetchExchangeRates: async () => { throw new Error('network down') },
      getExchangeRate: () => null,
    }))
    const { loadFxContext } = await import('@/lib/fx-report')

    const supabase = { from: () => { throw new Error('boom') } }

    const context = await loadFxContext(supabase, {
      currencies: ['EGP'],
      reportingCurrency: 'EUR',
    })

    // A report that renders and labels its gaps beats one that 500s.
    expect(context.snapshotCount).toBe(0)
    expect(context.liveRate).toBeUndefined()
    vi.doUnmock('@/lib/currency-service')
  })
})
