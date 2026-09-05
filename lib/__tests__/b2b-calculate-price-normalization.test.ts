import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RATE_MONETARY_COLUMNS } from '@/lib/rates/rate-currency'

// ============================================
// The B2B calculator's legacy branch converts at the fetch boundary
// ============================================
// This route read seven rate tables directly and summed the raw numbers
// into one subtotal — an EGP-priced cabin joined a EUR guide as if they
// were the same unit, then the result declared `currency: 'EUR'`. Every
// direct read of a table that can carry rate_currency must pass through
// normalizeRateRows before its number joins a total.

const ROUTE = readFileSync(
  path.join(__dirname, '..', '..', 'app', 'api', 'b2b', 'calculate-price', 'route.ts'),
  'utf8'
)

describe('b2b/calculate-price currency normalization', () => {
  // The tables this route reads directly that the normalizer has a column
  // map for. (vehicles and hotel_contacts carry no rate_currency column —
  // their rows are implicitly in the run currency.)
  const mustNormalize = ['b2b_transport_packages', 'guides', 'nile_cruises', 'meal_rates']

  it.each(mustNormalize)('normalizes %s rows before they join the total', table => {
    expect(RATE_MONETARY_COLUMNS[table], `${table} lost its normalizer column map`).toBeDefined()
    const normalized = new RegExp(
      `normalizeRateRows\\(\\s*(admin|getSupabaseAdmin\\(\\))\\s*,\\s*'${table}'`
    ).test(ROUTE)
    expect(
      normalized,
      `route reads ${table} without normalizeRateRows — raw foreign-currency numbers would join the subtotal`
    ).toBe(true)
  })

  it('declares the tenant run currency, not a hardcoded EUR', () => {
    expect(ROUTE).not.toMatch(/currency:\s*'EUR'/)
  })
})
