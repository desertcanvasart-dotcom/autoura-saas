// The one invariant of supplier-HAS-properties (Phase 1): a cruise rate saved
// with a supplier and a ship name always ends up linked to a
// supplier_properties row — found case-insensitively, or created — and the
// property's canonical name wins over the payload spelling.
import { describe, it, expect } from 'vitest'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'

// Minimal chainable stub: each from() call replays a scripted result.
function db(results: Array<{ data: unknown; error?: unknown }>) {
  let i = 0
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const make = (table: string) => {
    const step = results[i++] ?? { data: null }
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    for (const m of ['select', 'eq', 'ilike', 'limit', 'insert']) {
      chain[m] = (...args: unknown[]) => { calls.push({ table, op: m, args }); return chain }
    }
    chain.maybeSingle = async () => step
    chain.single = async () => step
    return chain
  }
  return { from: make, calls }
}

describe('resolveRateProperty', () => {
  it('an explicit property wins, and its canonical name is returned', async () => {
    const d = db([{ data: { id: 'p1', name: 'MS Mayfair', supplier_id: 's1' } }])
    const out = await resolveRateProperty(d, { tenantId: 't1', propertyType: 'ship', supplierId: 's1', name: 'ms mayfair', propertyId: 'p1' })
    expect(out).toEqual({ property_id: 'p1', name: 'MS Mayfair' })
  })

  it('a stale property id falls back to name resolution instead of saving a broken link', async () => {
    const d = db([
      { data: null },                                  // property lookup misses
      { data: { id: 'p2', name: 'MS Nile Style' } },   // name match hits
    ])
    const out = await resolveRateProperty(d, { tenantId: 't1', propertyType: 'ship', supplierId: 's1', name: 'MS NILE STYLE', propertyId: 'gone' })
    expect(out).toEqual({ property_id: 'p2', name: 'MS Nile Style' })
  })

  it('creates the ship under the supplier when the name is new', async () => {
    const d = db([
      { data: null },                                  // no existing match
      { data: { id: 'p3', name: 'MS Farah' } },        // insert returns the row
    ])
    const out = await resolveRateProperty(d, { tenantId: 't1', propertyType: 'ship', supplierId: 's1', name: '  MS Farah  ' })
    expect(out).toEqual({ property_id: 'p3', name: 'MS Farah' })
    const insert = d.calls.find(c => c.op === 'insert')
    expect(insert?.args[0]).toMatchObject({ tenant_id: 't1', supplier_id: 's1', property_type: 'ship', name: 'MS Farah' })
  })

  it('no supplier or no name → no property, and no writes', async () => {
    for (const opts of [
      { supplierId: null, name: 'MS Farah' },
      { supplierId: 's1', name: '   ' },
    ]) {
      const d = db([])
      expect(await resolveRateProperty(d, { tenantId: 't1', propertyType: 'ship', ...opts })).toEqual({ property_id: null })
      expect(d.calls.filter(c => c.op === 'insert')).toHaveLength(0)
    }
  })

  it('hotel resolution creates a hotel property, not a ship', async () => {
    const d = db([
      { data: null },
      { data: { id: 'h1', name: 'Kempinski Nile' } },
    ])
    const out = await resolveRateProperty(d, { tenantId: 't1', propertyType: 'hotel', supplierId: 's1', name: 'Kempinski Nile' })
    expect(out).toEqual({ property_id: 'h1', name: 'Kempinski Nile' })
    const insert = d.calls.find(c => c.op === 'insert')
    expect(insert?.args[0]).toMatchObject({ tenant_id: 't1', property_type: 'hotel' })
  })

  it('a failed create never blocks the rate: null link, rate saves anyway', async () => {
    const d = db([
      { data: null },
      { data: null, error: { code: '23505' } },
    ])
    const out = await resolveRateProperty(d, { tenantId: 't1', propertyType: 'ship', supplierId: 's1', name: 'MS Farah' })
    expect(out).toEqual({ property_id: null })
  })
})
