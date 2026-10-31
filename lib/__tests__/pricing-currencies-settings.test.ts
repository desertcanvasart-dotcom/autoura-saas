import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sellingPrice, marginFromMarkup, markupForMargin, pct, displayWithBuffer, SEASON_FORMULA } from '@/lib/pricing/markup-wording'
import { currencyName, PREFERRED_FIRST } from '@/lib/currency-names'
import { displayRate } from '@/app/pricing-grid/lib/display-rate'
import { SUPPORTED_CURRENCIES, type ExchangeRate } from '@/lib/currency'

// ============================================
// Settings › Pricing defaults and Currencies & rates (navigation brief §4–5,
// migration 456). The markup is labelled for what the engine does —
// cost × (1 + markup) — and the buffer only touches what is SHOWN.
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('the markup, in numbers', () => {
  it('the brief’s example: 25% on 100 sells at 125, a 20% margin; a 25% margin needs 33.3%', () => {
    expect(sellingPrice(100, 25).toFixed(2)).toBe('125.00')
    expect(pct(marginFromMarkup(25))).toBe('20')
    expect(pct(markupForMargin(25)!)).toBe('33.3')
  })

  it('the mockup’s: 27.5% → 127.50, a 21.6% margin; a 27.5% margin needs 37.9%', () => {
    expect(sellingPrice(100, 27.5).toFixed(2)).toBe('127.50')
    expect(pct(marginFromMarkup(27.5))).toBe('21.6')
    expect(pct(markupForMargin(27.5)!)).toBe('37.9')
    expect(markupForMargin(100)).toBeNull()
  })

  it('is what the engine computes (cost × (1 + m)), not cost / (1 − m)', () => {
    expect(src('app/pricing-grid/lib/calculator.ts')).toContain('const marginMultiplier = 1 + safeMargin / 100')
  })

  it('seasonal premiums are stated as the engine applies them: after markup, on the selling price', () => {
    expect(SEASON_FORMULA).toBe('peak-date price = selling price × (1 + premium)')
    expect(src('lib/pricing/season-uplift.ts')).toMatch(/AFTER margin, on the selling price/)
  })
})

describe('the conversion buffer', () => {
  it('the brief’s example: 1,000 EUR at 1.1162 with 2% reads 1,138.52 USD instead of 1,116.20', () => {
    expect(displayWithBuffer(1000, 1.1162, 2).toFixed(2)).toBe('1138.52')
    expect(displayWithBuffer(1000, 1.1162, 0).toFixed(2)).toBe('1116.20')
  })

  it('the Quote Builder shows prices at rate × (1 + buffer); no buffer = the plain rate', () => {
    const rates = [{ base_currency: 'EUR', target_currency: 'USD', rate: 1.1162, is_active: true }] as unknown as ExchangeRate[]
    expect(displayRate('EUR', 'USD', rates)).toEqual({ ok: true, rate: 1.1162 })
    const shown = displayRate('EUR', 'USD', rates, 2)
    expect(shown.ok && shown.rate !== null && shown.rate.toFixed(6)).toBe((1.1162 * 1.02).toFixed(6))
    expect(displayRate('EUR', 'EUR', rates, 2)).toEqual({ ok: true, rate: null })
  })

  it('only display: the run currency is what the grid prices and saves in', () => {
    const page = src('app/pricing-grid/page.tsx')
    expect(page).toContain('displayRate(runCurrency, config.currency, fxRates, buffer)')
    // convertAmount is only ever used to SHOW (header, rows, summary, the message text).
    expect(src('app/pricing-grid/lib/calculator.ts')).toMatch(/export function convertAmount\(eurAmount: number, exchangeRate: number \| null\)/)
  })
})

describe('currency names', () => {
  it('every supported currency has a full name — no "AED ()"', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      const name = currencyName(c)
      expect(name, c).not.toBe(c)
      expect(name, c).not.toMatch(/\(\s*\)/)
      expect(name.length, c).toBeGreaterThan(3)
    }
    for (const c of ['AED', 'JOD', 'KES', 'MAD', 'SAR', 'TND', 'TZS', 'ZAR']) expect(currencyName(c)).toMatch(/[a-z]/)
  })

  it('pickers list EUR, USD and EGP first', () => {
    expect(PREFERRED_FIRST).toEqual(['EUR', 'USD', 'EGP'])
  })
})

describe('server side', () => {
  it('pricing defaults: everyone reads, only owners and admins change', () => {
    const r = src('app/api/settings/pricing/route.ts')
    expect(r).toContain("roleDenied(auth.role, 'admin')")
    expect(r.indexOf("roleDenied(auth.role, 'admin')")).toBeGreaterThan(r.indexOf('export async function PATCH'))
  })

  it('currencies: owners and admins only, every override and reset logged', () => {
    const r = src('app/api/settings/currencies/route.ts')
    expect(r.match(/roleDenied\(auth\.role, 'admin'\)/g)?.length).toBe(2)
    expect(r).toContain("action: 'override'")
    expect(r).toContain("action: 'reset'")
    expect(r).toContain("from('exchange_rate_events').insert(events)")
    expect(r).toContain('set_by: userId, set_at: nowIso')
  })

  it('new itineraries start in the COMPANY’s cost mode', () => {
    expect(src('lib/itineraries/default-cost-mode.ts')).toContain("db.from('tenants').select('default_cost_mode')")
    for (const f of ['app/api/itineraries/route.ts', 'app/api/pricing-grid/save/route.ts']) {
      expect(src(f), f).toContain('defaultCostMode(supabase, authResult.tenant_id)')
    }
  })

  it('migration 456: the quote currency is NOT the billing currency, and the buffer is capped', () => {
    const m = src('supabase/migrations/456_company_pricing_defaults_and_currencies.sql')
    expect(m).toContain('ADD COLUMN IF NOT EXISTS default_quote_currency text')
    expect(m).not.toMatch(/SET\s+default_currency\s*=/)
    expect(m).toContain('CHECK (conversion_buffer_percent >= 0 AND conversion_buffer_percent <= 20)')
    expect(m).toContain('CREATE TABLE IF NOT EXISTS public.exchange_rate_events')
    expect(m).toContain('ENABLE ROW LEVEL SECURITY')
  })
})
