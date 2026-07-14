import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  convertCurrency,
  convertWithRate,
  formatCurrency,
  formatCurrencyWithCode,
  getCurrencySymbol,
  getCurrencyName,
  getExchangeRate,
  createCurrencyConverter,
  batchConvert,
  type ExchangeRate,
} from '@/lib/currency'

// LOCKED POLICY (commit 6e83b29): currency code must NEVER fabricate.
// convertCurrency returns null when no rate exists — never the unconverted
// amount passed off as converted. convertAndFormat falls back to formatting
// the ORIGINAL amount in the ORIGINAL currency. These tests lock that.

let seq = 0
function rate(
  base: string,
  target: string,
  r: number,
  active: boolean = true
): ExchangeRate {
  return {
    id: `rate-${++seq}`,
    tenant_id: 'tenant-1',
    base_currency: base,
    target_currency: target,
    rate: r,
    is_active: active,
    last_updated_at: '2026-07-01T00:00:00Z',
  }
}

beforeEach(() => {
  // convertCurrency console.warns on the null path; keep test output clean.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCurrencySymbol / getCurrencyName', () => {
  it('returns known symbols', () => {
    expect(getCurrencySymbol('EUR')).toBe('€')
    expect(getCurrencySymbol('USD')).toBe('$')
    expect(getCurrencySymbol('GBP')).toBe('£')
    expect(getCurrencySymbol('EGP')).toBe('E£')
  })

  it('falls back to the raw code for unknown currencies (never invents a symbol)', () => {
    expect(getCurrencySymbol('JPY')).toBe('JPY')
    expect(getCurrencyName('JPY')).toBe('JPY')
  })

  it('returns known names', () => {
    expect(getCurrencyName('EGP')).toBe('Egyptian Pound')
    expect(getCurrencyName('EUR')).toBe('Euro')
  })
})

describe('convertCurrency — never fabricates', () => {
  it('same currency is identity, even with no rates loaded', () => {
    expect(convertCurrency(123.45, 'EUR', 'EUR', [])).toBe(123.45)
    expect(convertCurrency(0, 'EGP', 'EGP', [])).toBe(0)
    expect(convertCurrency(-50, 'USD', 'USD', [])).toBe(-50)
  })

  it('uses the direct rate when present (multiply)', () => {
    const rates = [rate('EUR', 'EGP', 56)]
    expect(convertCurrency(10, 'EUR', 'EGP', rates)).toBe(560)
  })

  it('uses the reciprocal of the reverse rate when no direct rate exists (divide)', () => {
    // Only EUR→EGP exists; converting EGP→EUR must divide, not multiply.
    const rates = [rate('EUR', 'EGP', 56)]
    expect(convertCurrency(112, 'EGP', 'EUR', rates)).toBe(2)
  })

  it('prefers the direct rate over the reverse rate when both exist', () => {
    const rates = [rate('USD', 'GBP', 0.8), rate('GBP', 'USD', 1.2)]
    // Direct 0.8 wins; the reverse reciprocal would have been 100/1.2 ≈ 83.33.
    expect(convertCurrency(100, 'USD', 'GBP', rates)).toBe(80)
  })

  it('LOCK: returns null when no rate exists — never the unconverted amount', () => {
    const rates = [rate('EUR', 'USD', 1.1)]
    // 1000 EGP rendered as €1,000 would be a ~53× error. Must be null.
    expect(convertCurrency(1000, 'EGP', 'GBP', rates)).toBeNull()
    expect(convertCurrency(1000, 'EGP', 'GBP', rates)).not.toBe(1000)
    expect(convertCurrency(5, 'EUR', 'EGP', [])).toBeNull()
  })

  it('ignores inactive rates entirely', () => {
    expect(convertCurrency(100, 'EUR', 'USD', [rate('EUR', 'USD', 1.1, false)])).toBeNull()
    expect(convertCurrency(100, 'USD', 'EUR', [rate('EUR', 'USD', 1.1, false)])).toBeNull()
  })

  it('falls back to an active reverse rate when the direct rate is inactive', () => {
    const rates = [rate('EUR', 'USD', 99, false), rate('USD', 'EUR', 0.5, true)]
    expect(convertCurrency(10, 'EUR', 'USD', rates)).toBe(20)
  })

  it('handles zero and negative amounts arithmetically (refunds, empty totals)', () => {
    const rates = [rate('EUR', 'USD', 1.2)]
    expect(convertCurrency(0, 'EUR', 'USD', rates)).toBe(0)
    expect(convertCurrency(-100, 'EUR', 'USD', rates)).toBe(-120)
    expect(convertCurrency(-120, 'USD', 'EUR', rates)).toBe(-100)
  })
})

describe('convertWithRate', () => {
  it('multiplies amount by the given rate', () => {
    expect(convertWithRate(100, 1.5)).toBe(150)
    expect(convertWithRate(0, 56)).toBe(0)
    expect(convertWithRate(-10, 2)).toBe(-20)
  })
})

describe('formatCurrency', () => {
  it('formats with symbol and 2 decimals by default', () => {
    expect(formatCurrency(1234.567, 'EUR')).toBe('€1,234.57')
    expect(formatCurrency(1000, 'EGP')).toBe('E£1,000.00')
  })

  it('respects showSymbol=false and custom decimals', () => {
    expect(formatCurrency(1234.5, 'EUR', { showSymbol: false })).toBe('1,234.50')
    expect(formatCurrency(1234.5, 'USD', { decimals: 0 })).toBe('$1,235')
    expect(formatCurrency(1.23456, 'GBP', { decimals: 3 })).toBe('£1.235')
  })

  it('uses the raw code as prefix for unknown currencies', () => {
    expect(formatCurrency(50, 'JPY')).toBe('JPY50.00')
  })

  it('compact notation kicks in at >= 1000', () => {
    expect(formatCurrency(1500, 'USD', { compact: true })).toBe('$1.5K')
    expect(formatCurrency(2_000_000, 'EUR', { compact: true })).toBe('€2M')
  })

  it('compact falls back to full formatting below 1000', () => {
    expect(formatCurrency(999.99, 'USD', { compact: true })).toBe('$999.99')
    // NOTE: the >= 1000 guard means large NEGATIVE amounts are never
    // compacted either — current behavior, locked as-is.
    expect(formatCurrency(-1500, 'USD', { compact: true })).toBe('$-1,500.00')
  })

  it('formats zero and negative amounts', () => {
    expect(formatCurrency(0, 'EUR')).toBe('€0.00')
    expect(formatCurrency(-42.5, 'EUR')).toBe('€-42.50')
  })
})

describe('formatCurrencyWithCode', () => {
  it('appends the currency code after the number', () => {
    expect(formatCurrencyWithCode(1234.5, 'EGP')).toBe('1,234.50 EGP')
    expect(formatCurrencyWithCode(1000, 'EUR', 0)).toBe('1,000 EUR')
  })
})

describe('getExchangeRate', () => {
  it('same currency is 1 without needing rates', () => {
    expect(getExchangeRate('EUR', 'EUR', [])).toBe(1)
  })

  it('returns the direct rate', () => {
    expect(getExchangeRate('EUR', 'EGP', [rate('EUR', 'EGP', 56)])).toBe(56)
  })

  it('returns the reciprocal of the reverse rate', () => {
    expect(getExchangeRate('EGP', 'EUR', [rate('EUR', 'EGP', 56)])).toBe(1 / 56)
  })

  it('returns null when no rate exists (never 1, never a guess)', () => {
    expect(getExchangeRate('EGP', 'GBP', [rate('EUR', 'USD', 1.1)])).toBeNull()
    expect(getExchangeRate('EUR', 'USD', [rate('EUR', 'USD', 1.1, false)])).toBeNull()
  })
})

describe('createCurrencyConverter', () => {
  const rates = [rate('EUR', 'USD', 1.1), rate('EUR', 'EGP', 56)]
  const converter = createCurrencyConverter(rates, 'EUR')

  it('convert uses the default from-currency', () => {
    expect(converter.convert(100, 'USD')).toBeCloseTo(110, 10)
  })

  it('convert honors an explicit from-currency (reverse math)', () => {
    expect(converter.convert(112, 'EUR', 'EGP')).toBe(2)
  })

  it('convert returns null when no rate exists', () => {
    expect(converter.convert(100, 'GBP')).toBeNull()
  })

  it('getRate returns the rate or null', () => {
    expect(converter.getRate('EGP')).toBe(56)
    expect(converter.getRate('GBP')).toBeNull()
  })

  it('format delegates to formatCurrency', () => {
    expect(converter.format(10, 'USD')).toBe('$10.00')
  })

  it('convertAndFormat formats the converted amount in the TARGET currency', () => {
    expect(converter.convertAndFormat(100, 'EGP')).toBe('E£5,600.00')
  })

  it('LOCK: convertAndFormat with no rate falls back to the ORIGINAL amount in the ORIGINAL currency', () => {
    // No EUR↔GBP rate: must show €100.00, NOT £100.00 (mislabeled) and NOT
    // a fabricated conversion.
    expect(converter.convertAndFormat(100, 'GBP')).toBe('€100.00')
    // Explicit from-currency: no EGP↔GBP rate → show the EGP original.
    expect(converter.convertAndFormat(1000, 'GBP', 'EGP')).toBe('E£1,000.00')
  })

  it('convertAndFormat passes format options through on both paths', () => {
    expect(converter.convertAndFormat(100, 'EGP', 'EUR', { decimals: 0 })).toBe('E£5,600')
    expect(converter.convertAndFormat(100, 'GBP', 'EUR', { decimals: 0 })).toBe('€100')
  })
})

describe('batchConvert', () => {
  it('converts every entry with the same pair', () => {
    const rates = [rate('EUR', 'USD', 1.2)]
    expect(batchConvert({ net: 100, gross: 0, refund: -50 }, 'EUR', 'USD', rates)).toEqual({
      net: 120,
      gross: 0,
      refund: -60,
    })
  })

  it('LOCK: yields null per-entry when no rate exists — never the raw values', () => {
    expect(batchConvert({ a: 100, b: 200 }, 'EGP', 'GBP', [])).toEqual({ a: null, b: null })
  })
})
