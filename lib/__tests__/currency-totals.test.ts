import { describe, it, expect } from 'vitest'
import {
  sumByCurrency,
  addToTotals,
  formatTotals,
  emptyTotals,
  currencySymbol,
} from '@/lib/currency-totals'

// ============================================================================
// The payments dashboard added $10,000 + £5,000 and showed "€15,000". Money
// in different currencies does not add; these keep the sums separate and
// invent no FX rate.
// ============================================================================

describe('sumByCurrency', () => {
  const rows = [
    { amount: '100.50', currency: 'EUR' },
    { amount: 200, currency: 'EUR' },
    { amount: '5000', currency: 'USD' },
    { amount: '30', currency: 'gbp' }, // lower-case normalises
  ]
  const t = sumByCurrency(rows, (r) => r.amount, (r) => r.currency)

  it('keeps each currency in its own bucket', () => {
    expect(t.EUR).toBe(300.5)
    expect(t.USD).toBe(5000)
    expect(t.GBP).toBe(30)
  })

  it('never merges currencies into one number', () => {
    expect(Object.keys(t).sort()).toEqual(['EUR', 'GBP', 'USD'])
  })

  it('rounds each bucket to cents (no floating dust)', () => {
    const d = sumByCurrency(
      [{ a: 0.1, c: 'EUR' }, { a: 0.2, c: 'EUR' }],
      (r) => r.a, (r) => r.c
    )
    expect(d.EUR).toBe(0.3)
  })

  it('treats blank/garbage currency as EUR, and bad amounts as 0', () => {
    const t2 = sumByCurrency(
      [{ a: 'abc', c: 'EUR' }, { a: 50, c: '' }, { a: 10, c: 'not-a-code' }],
      (r) => r.a, (r) => r.c
    )
    expect(t2.EUR).toBe(60) // 0 + 50 + 10, all defaulted to EUR
  })

  it('handles null/empty input', () => {
    expect(sumByCurrency(null, (r: any) => r.a, (r: any) => r.c)).toEqual({})
    expect(sumByCurrency([], (r: any) => r.a, (r: any) => r.c)).toEqual({})
  })
})

describe('formatTotals', () => {
  it('renders a single currency', () => {
    const t = emptyTotals()
    addToTotals(t, 1200, 'EUR')
    expect(formatTotals(t)).toBe('€1,200.00')
  })

  it('renders mixed currencies, dominant first', () => {
    const t = emptyTotals()
    addToTotals(t, 300, 'USD')
    addToTotals(t, 12400, 'EUR')
    expect(formatTotals(t)).toBe('€12,400.00 + $300.00')
  })

  it('shows a real zero rather than a blank tile', () => {
    expect(formatTotals(emptyTotals())).toBe('€0.00')
    expect(formatTotals(emptyTotals(), { defaultCurrency: 'USD' })).toBe('$0.00')
  })

  it('drops zero buckets but keeps non-zero ones', () => {
    const t = emptyTotals()
    addToTotals(t, 0, 'USD')
    addToTotals(t, 500, 'EUR')
    expect(formatTotals(t)).toBe('€500.00')
  })
})

describe('currencySymbol', () => {
  it('maps known currencies and passes unknowns through', () => {
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('GBP')).toBe('£')
    expect(currencySymbol('JPY')).toBe('JPY')
  })
})
