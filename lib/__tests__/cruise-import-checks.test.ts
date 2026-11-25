import { describe, it, expect } from 'vitest'
import { cruiseImportWarnings } from '@/lib/rates/cruise-import-checks'
import { ratePeriodCapError } from '@/lib/rates/rate-seasons'

const row = (cruise_code: string, cabin_type = '') => ({
  cruise_code, cabin_type, ship_name: 'MS Darakum', route_name: 'Aswan - Cairo', duration_nights: '12',
})

describe('cruise import warnings', () => {
  it('says when codes differ only by a date', () => {
    const w = cruiseImportWarnings([row('DAR-ASCA-20270212-JS', 'suite'), row('DAR-ASCA-20270310-JS', 'suite')])
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('"DAR-ASCA-JS"')
  })

  it('says when several records of one sailing have no cabin type', () => {
    const w = cruiseImportWarnings([row('DAR-ASCA-JS'), row('DAR-ASCA-PS')])
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('no Cabin Type')
  })

  it('is quiet for a well-formed sheet', () => {
    expect(cruiseImportWarnings([row('DAR-ASCA-JS', 'junior'), row('DAR-ASCA-PS', 'presidential')])).toEqual([])
    expect(cruiseImportWarnings([row('DAR-ASCA')])).toEqual([])
  })
})

describe('cruises hold a year of departures; hotels stay at six', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => {
    const m = String((i % 12) + 1).padStart(2, '0')
    return { from: `2027-${m}-01`, to: `2027-${m}-12`, rates: {} }
  })
  it('caps', () => {
    expect(ratePeriodCapError(many(24), 'cruise')).toBeNull()
    expect(ratePeriodCapError(many(25), 'cruise')).toContain('at most 24')
    expect(ratePeriodCapError(many(7), 'accommodation')).toContain('at most 6')
  })
})
