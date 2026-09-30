import { describe, it, expect } from 'vitest'
import { validateImportData, RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

// Migration 393: airport / hotel assistance CSVs carry the pricing basis.
describe('airport / hotel assistance CSV pricing type', () => {
  const config = RATE_TABLE_CONFIGS.airport_staff_rates
  const row = (extra: Record<string, string>) => ({
    service_code: 'A1', airport_code: 'ASW', service_type: 'full_service', direction: 'both', rate_eur: '700', ...extra,
  })

  it('accepts the three bases; blank is left to the default (per group)', () => {
    const res = validateImportData([row({ pricing_type: 'per_person' }), row({ pricing_type: 'per_unit', max_capacity: '2' }), row({ pricing_type: '' })], config)
    expect(res.errors).toEqual([])
    expect(res.validRows).toBe(3)
    expect(res.sampleData.map(r => [r.pricing_type, r.max_capacity])).toEqual([['per_person', undefined], ['per_unit', 2], [undefined, undefined]])
  })

  it('refuses anything else, naming the choices', () => {
    const res = validateImportData([row({ pricing_type: 'per_bag' })], config)
    expect(res.errors[0].message).toContain('per_person')
  })
})
