import { describe, it, expect } from 'vitest'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

// ============================================
// Bulk CSV configs carry what the forms capture (2026-09-05 sweep)
// ============================================
// A CSV column set that lags the form silently loses data on every
// round-trip — the worst case found was flights importing without TAX
// (every imported flight underpriced on every quote). This pins the
// fields the sweep added, and the price-bearing columns generally, so a
// future form field with money on it fails here until the config learns
// it.

const names = (table: string) => new Set(RATE_TABLE_CONFIGS[table].columns.map(c => c.name))

describe('bulk config fidelity', () => {
  it('flights: tax, guide fare, and IATA code travel with the fare', () => {
    const cols = names('flight_rates')
    for (const c of ['tax_eur', 'tax_non_eur', 'guide_rate', 'airline_code', 'base_rate_eur']) {
      expect(cols.has(c), `flight_rates CSV missing ${c}`).toBe(true)
    }
  })

  it('hotels: tier (the engine matches BY tier), suites, supplier, notes', () => {
    const cols = names('accommodation_rates')
    for (const c of [
      'tier', 'supplier_name', 'notes',
      'suite_rate_eur', 'high_season_suite_eur', 'peak_season_suite_eur',
    ]) {
      expect(cols.has(c), `accommodation_rates CSV missing ${c}`).toBe(true)
    }
  })

  it('train + sleeping-train tickets carry the guide fare (B-item 2)', () => {
    expect(names('train_rates').has('guide_rate')).toBe(true)
    expect(names('sleeping_train_rates').has('guide_rate')).toBe(true)
  })

  it('meals: is_preferred exists in both directions', () => {
    expect(names('meal_rates').has('is_preferred')).toBe(true)
  })

  it('extras catalogue is bulk-capable with its natural key', () => {
    const cfg = RATE_TABLE_CONFIGS['extras_catalogue']
    expect(cfg).toBeDefined()
    expect(cfg.uniqueKey).toEqual(['name'])
    const cols = names('extras_catalogue')
    for (const c of ['name', 'category', 'supplier_cost', 'selling_price', 'unit']) {
      expect(cols.has(c), `extras_catalogue CSV missing ${c}`).toBe(true)
    }
  })

  it('every config still names a unique key that is one of its own columns', () => {
    for (const [table, cfg] of Object.entries(RATE_TABLE_CONFIGS)) {
      expect(cfg.uniqueKey.length, `${table} has no natural key`).toBeGreaterThan(0)
      const cols = names(table)
      for (const k of cfg.uniqueKey) {
        expect(cols.has(k), `${table} unique key ${k} is not a config column`).toBe(true)
      }
    }
  })
})
