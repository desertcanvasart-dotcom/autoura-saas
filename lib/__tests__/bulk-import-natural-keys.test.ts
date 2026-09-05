import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RATE_TABLE_CONFIGS, importRowKey, partitionImportRows } from '@/lib/bulk-rate-service'

// ============================================
// Bulk import: the natural key is a decision, and matching honours it
// ============================================
// The sibling lost live data to single-column matching ("13 creates, 0
// inserts": a second train on the same route replaced the first train's
// price). Three guarantees pinned here:
//   1. Each table's uniqueKey is the list somebody DECIDED — changing one
//      must be deliberate, so this test names them all.
//   2. Matching happens on the FULL key (the route may not regress to
//      uniqueKey[0]).
//   3. Rows in one file that collide on the key are refused, not
//      last-row-wins.

describe('uniqueKey per table is a pinned decision', () => {
  it('matches the reviewed list exactly', () => {
    const keys = Object.fromEntries(
      Object.entries(RATE_TABLE_CONFIGS).map(([t, c]) => [t, c.uniqueKey])
    )
    expect(keys).toEqual({
      accommodation_rates: ['service_code'],
      // The full natural key: a route NAME is a human label two distinct
      // rows legitimately share (same route as transfer and as day tour).
      transportation_rates: ['route_name', 'service_type', 'city'],
      guide_rates: ['service_code'],
      meal_rates: ['service_code'],
      entrance_fees: ['service_code'],
      flight_rates: ['service_code'],
      activity_rates: ['service_code'],
      tipping_rates: ['service_code'],
      airport_staff_rates: ['service_code'],
      hotel_staff_rates: ['service_code'],
      nile_cruises: ['cruise_code'],
      train_rates: ['service_code'],
      sleeping_train_rates: ['service_code'],
      // An extra's identity is its name (per tenant) — same key the extras
      // page itself de-duplicates on (2026-09-05 sweep: CSV added).
      extras_catalogue: ['name'],
      fixed_costs: ['cost_type'],
    })
  })

  it('the import route matches on the full key, not uniqueKey[0]', () => {
    const src = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'api', 'rates', 'bulk', 'import', 'route.ts'),
      'utf8'
    )
    expect(src).toContain('partitionImportRows(')
    expect(src).toContain('importRowKey(')
    // The tenant-scoped existence check must not regress either.
    expect(src).toMatch(/\.in\(uniqueKeyColumn, keyValues\)\s*\n?\s*\.eq\('tenant_id', tenant_id\)/)
  })
})

describe('importRowKey', () => {
  it('builds a case/space-insensitive composite key', () => {
    const key = importRowKey(
      { route_name: ' Cairo–Luxor ', service_type: 'Transfer', city: 'Cairo' },
      ['route_name', 'service_type', 'city']
    )
    expect(key).toBe('cairo–luxor\u0000transfer\u0000cairo')
  })

  it('any missing part means no key (the row always inserts)', () => {
    expect(importRowKey({ route_name: 'X' }, ['route_name', 'service_type'])).toBeNull()
    expect(importRowKey({ route_name: 'X', service_type: '' }, ['route_name', 'service_type'])).toBeNull()
  })
})

describe('partitionImportRows', () => {
  const key = ['route_name', 'service_type']

  it('keeps distinct rows and refuses in-file collisions with a named message', () => {
    const rows = [
      { route_name: 'Cairo–Luxor', service_type: 'transfer', rate: 100 },
      { route_name: 'Cairo–Luxor', service_type: 'day_tour', rate: 200 },
      { route_name: 'cairo–luxor ', service_type: 'Transfer', rate: 999 },
    ]
    const p = partitionImportRows(rows, key)
    expect(p.rows).toHaveLength(2)
    expect(p.duplicates).toHaveLength(1)
    expect(p.duplicates[0].record.rate).toBe(999)
    expect(p.duplicates[0].message).toMatch(/share the same route_name \+ service_type/)
    expect(p.duplicates[0].message).toMatch(/silently overwrite/)
  })

  it('rows without a full key pass through untouched', () => {
    const rows = [{ route_name: 'X' }, { route_name: 'X' }]
    const p = partitionImportRows(rows, key)
    expect(p.rows).toHaveLength(2)
    expect(p.duplicates).toHaveLength(0)
  })
})
