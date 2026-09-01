// averageRateInOneCurrency: average within ONE currency, or refuse.
//
// The rates tiles summed every row's raw amount, divided by the row count and
// rendered the result with the viewer's symbol. For a list of EGP rows that
// produced a euro figure nobody had entered.
import { describe, it, expect } from 'vitest'
import { averageRateInOneCurrency } from '@/lib/currency-totals'

const rows = (...rs: [number | null, string | null][]) =>
  rs.map(([rate_eur, rate_currency]) => ({ rate_eur, rate_currency }))

const avg = (rs: { rate_eur: number | null; rate_currency: string | null }[]) =>
  averageRateInOneCurrency(rs, r => r.rate_eur, r => r.rate_currency)

describe('averageRateInOneCurrency', () => {
  it('averages an all-EGP list in EGP, not in the tenant currency', () => {
    expect(avg(rows([500, 'EGP'], [700, 'EGP']))).toEqual({ amount: 600, currency: 'EGP' })
  })

  it('refuses to average across currencies', () => {
    expect(avg(rows([500, 'EGP'], [700, 'GBP']))).toBeNull()
  })

  it('averages the tenant-currency rows when any row uses the tenant currency', () => {
    // Mixed, but with a real tenant-currency population: report that one
    // rather than a dash. Rows carrying their own currency stay out of it.
    expect(avg(rows([10, null], [20, null], [9999, 'EGP']))).toEqual({ amount: 15, currency: null })
  })

  it('excludes unpriced rows from the count, not just the sum', () => {
    // A blank rate is a hole. (100 + 0) / 2 = 50 reports a rate nobody charges.
    expect(avg(rows([100, 'EGP'], [null, 'EGP']))).toEqual({ amount: 100, currency: 'EGP' })
    expect(avg(rows([100, null], [0, null]))).toEqual({ amount: 100, currency: null })
  })

  it('returns null for an empty or wholly unpriced list', () => {
    expect(avg([])).toBeNull()
    expect(avg(rows([null, 'EGP'], [0, null]))).toBeNull()
  })

  it('treats a blank or whitespace currency as the tenant currency', () => {
    expect(avg(rows([10, ''], [20, '  ']))).toEqual({ amount: 15, currency: null })
  })

  it('is case-insensitive about the currency code', () => {
    expect(avg(rows([10, 'egp'], [20, 'EGP']))).toEqual({ amount: 15, currency: 'EGP' })
  })

  it('rounds to cents', () => {
    expect(avg(rows([10, 'EGP'], [10, 'EGP'], [11, 'EGP']))?.amount).toBe(10.33)
  })
})
