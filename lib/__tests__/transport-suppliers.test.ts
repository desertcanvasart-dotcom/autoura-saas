import { describe, it, expect } from 'vitest'
import { resolveTransportSuppliers, suppliersNeedingNames } from '@/lib/pricing/transport-suppliers'
import { findTransportRate, transportHoleMessage } from '@/lib/auto-pricing-service'
import { groupVehicleRowsToTiers } from '@/lib/pricing/grid-rates'
import { importRowKey, partitionImportRows, RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'
import { PREFERRED_SCOPES } from '@/lib/rates/preferred'

// Operator, 2026-11-05: two transport companies sell Alexandria → Cairo by
// sedan at different prices (migration 460).
const row = (over: Record<string, unknown>) => ({
  id: String(over.id), service_type: 'intercity_day_trip', city: 'Alexandria', origin_city: null,
  destination_city: 'Cairo', duration: null, area: null, vehicle_type: 'sedan', route_name: 'ALEXANDRIA-TO-CAIRO',
  base_rate_eur: 100, base_rate_non_eur: 100, capacity_min: null, capacity_max: null, is_active: true,
  service_code: '', supplier_id: null as string | null, is_preferred: false, created_at: '2026-11-01',
  ...over,
})
const names: Record<string, string> = { a: 'Nile Cars', b: 'Delta Limo' }
const nameOf = (id: string | null) => (id && names[id]) || 'no supplier'

describe('several companies on one route — resolveTransportSuppliers', () => {
  it('one company: rows untouched (incl. one company\'s several named routes in a city)', () => {
    const rows = [row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'a', route_name: 'Other name' })]
    const out = resolveTransportSuppliers(rows, nameOf)
    expect(out.map(r => r.id)).toEqual(['1', '2'])
    expect(out.every(r => !r.ambiguity)).toBe(true)
  })

  it('two companies, one starred: only the starred company remains', () => {
    const rows = [row({ id: '1', supplier_id: 'a', base_rate_eur: 100 }), row({ id: '2', supplier_id: 'b', base_rate_eur: 80, is_preferred: true })]
    const out = resolveTransportSuppliers(rows, nameOf)
    expect(out.map(r => r.id)).toEqual(['2'])
  })

  it('two companies, none starred: every row is ambiguous and names both', () => {
    const rows = [row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b' })]
    const out = resolveTransportSuppliers(rows, nameOf)
    expect(out).toHaveLength(2)
    expect(out[0].ambiguity).toEqual({ count: 2, names: ['Nile Cars', 'Delta Limo'], preferredCount: 0 })
  })

  it('two companies both starred: still ambiguous', () => {
    const rows = [row({ id: '1', supplier_id: 'a', is_preferred: true }), row({ id: '2', supplier_id: 'b', is_preferred: true })]
    expect(resolveTransportSuppliers(rows, nameOf)[0].ambiguity?.preferredCount).toBe(2)
  })

  it('a different vehicle is a different journey', () => {
    const rows = [row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b', vehicle_type: 'van' })]
    expect(resolveTransportSuppliers(rows, nameOf).some(r => r.ambiguity)).toBe(false)
    expect(suppliersNeedingNames(rows)).toEqual([])
  })

  it('names are only needed where companies share a journey', () => {
    expect(suppliersNeedingNames([row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b' })]).sort()).toEqual(['a', 'b'])
  })
})

describe('engine lookup — never a guess between companies', () => {
  const cacheOf = (rows: ReturnType<typeof row>[]) => {
    const cache = new Map<string, Parameters<typeof findTransportRate>[0] extends Map<string, infer V> ? V : never>()
    for (const r of resolveTransportSuppliers(rows, nameOf)) {
      cache.set(['intercity_day_trip', 'alexandria', 'cairo', 'sedan'].join('|'), r)
    }
    return cache
  }
  const ask = { serviceType: 'intercity_day_trip' as never, city: 'Cairo', duration: '' as never, area: null, vehicleType: 'sedan' as never, originCity: 'Alexandria', destinationCity: 'Cairo' }

  it('starred company is a definite price', () => {
    const m = findTransportRate(cacheOf([row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b', base_rate_eur: 80, is_preferred: true })]), ask)
    expect(m?.source).toBe('db')
    expect(m?.rate.base_rate_eur).toBe(80)
  })

  it('no star: ambiguous, and the hole names the companies', () => {
    const m = findTransportRate(cacheOf([row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b' })]), ask)
    expect(m?.source).toBe('ambiguous')
    const msg = transportHoleMessage(m, 'sedan Alexandria → Cairo', 'fallback')
    expect(msg).toContain('Nile Cars')
    expect(msg).toContain('Delta Limo')
    expect(msg).toContain('Rates → Transportation')
  })

  it('no match keeps the old message', () => {
    expect(transportHoleMessage(null, 'x', 'fallback')).toBe('fallback')
  })
})

describe('pricing grid — one option per company', () => {
  it('splits a route two companies price, and names the company', () => {
    const opts = groupVehicleRowsToTiers(
      [row({ id: '1', supplier_id: 'a' }), row({ id: '2', supplier_id: 'b', base_rate_eur: 80, is_preferred: true })],
      undefined, undefined, id => names[id] ?? null,
    )
    expect(opts).toHaveLength(2)
    expect(opts.map(o => o.rateEur).sort((x, y) => x - y)).toEqual([80, 100])
    expect(opts.find(o => o.rateEur === 80)!.name).toContain('Delta Limo ★')
    expect(opts.find(o => o.rateEur === 100)!.name).toContain('Nile Cars')
  })

  it('a route only one company prices keeps its name unchanged', () => {
    const [opt] = groupVehicleRowsToTiers([row({ id: '1', supplier_id: 'a' })], undefined, undefined, id => names[id] ?? null)
    expect(opt.name).not.toContain('Nile Cars')
  })
})

describe('CSV import — the company is part of the key', () => {
  const cfg = RATE_TABLE_CONFIGS.transportation_rates
  const csv = (supplier: string) => ({ route_name: 'ALEXANDRIA-TO-CAIRO', service_type: 'intercity_day_trip', city: 'Alexandria', vehicle_type: 'sedan', supplier_id: supplier })

  it('two companies\' rows are two rates, not a duplicate', () => {
    expect(cfg.optionalKey).toEqual(['supplier_id'])
    expect(importRowKey(csv('a'), cfg.uniqueKey, cfg.optionalKey)).not.toBe(importRowKey(csv('b'), cfg.uniqueKey, cfg.optionalKey))
    expect(partitionImportRows([csv('a'), csv('b')], cfg.uniqueKey, cfg.optionalKey).duplicates).toHaveLength(0)
  })

  it('a blank company still has a key (never null)', () => {
    expect(importRowKey(csv(''), cfg.uniqueKey, cfg.optionalKey)).not.toBeNull()
  })

  it('the same company twice in one file is refused', () => {
    expect(partitionImportRows([csv('a'), csv('a')], cfg.uniqueKey, cfg.optionalKey).duplicates).toHaveLength(1)
  })

  it('the export carries the star', () => {
    expect(cfg.columns.some(c => c.name === 'is_preferred')).toBe(true)
  })
})

describe('preferred scope for transport', () => {
  it('is the journey — not the route name or the company', () => {
    const cols = PREFERRED_SCOPES.transportation_rates.columns
    expect(cols).toContain('vehicle_type')
    expect(cols).not.toContain('route_name')
    expect(cols).not.toContain('supplier_id')
  })
})
