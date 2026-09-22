import { describe, it, expect } from 'vitest'
import { priceDayActivity, type ActivityRow } from '@/lib/pricing/day-activity'

// ============================================================================
// An activity attached to a day (Philae's motorboat, a felucca) is priced from
// its catalogue row, by the row's own pricing model. No rate = a hole.
// ============================================================================

const row = (over: Partial<ActivityRow>): ActivityRow =>
  ({ id: 'a1', activity_name: 'Motorboat', base_rate_eur: 800, ...over })

describe('priceDayActivity', () => {
  it('per_unit charges one unit for a group that fits, at the unit rate', () => {
    // Philae's motorboat: E£800 the boat, holds 10. A group of 4 = one boat.
    const line = priceDayActivity(row({ pricing_type: 'per_unit', max_capacity: 10, unit_label: 'motorboat' }), 4, true, 'E£')
    expect(line).toMatchObject({ lineTotal: 800, isPerPax: false, quantityMode: 'fixed' })
    expect(line!.note).toContain('1 × motorboat')
  })

  it('per_unit adds a second unit when the group exceeds one unit capacity', () => {
    const line = priceDayActivity(row({ pricing_type: 'per_unit', max_capacity: 10 }), 14, true, 'E£')
    expect(line!.lineTotal).toBe(1600) // ceil(14/10) = 2 boats
    expect(line!.isPerPax).toBe(false)
  })

  it('per_person scales with the group', () => {
    const line = priceDayActivity(row({ pricing_type: 'per_person', base_rate_eur: 25 }), 4, true, 'E£')
    expect(line).toMatchObject({ unitCost: 25, lineTotal: 100, isPerPax: true, quantityMode: 'per_pax' })
  })

  it('flat charges once regardless of group', () => {
    const line = priceDayActivity(row({ pricing_type: 'flat', base_rate_eur: 300 }), 9, true, 'E£')
    expect(line).toMatchObject({ lineTotal: 300, isPerPax: false, quantityMode: 'fixed' })
  })

  it('tiered takes the band for the group, per person', () => {
    const tiers = [
      { min_pax: 1, max_pax: 3, rate_eur: 40 },
      { min_pax: 4, max_pax: 10, rate_eur: 30 },
    ]
    const line = priceDayActivity(row({ pricing_type: 'tiered', tiers }), 6, true, 'E£')
    expect(line).toMatchObject({ unitCost: 30, lineTotal: 180, isPerPax: true })
  })

  it('uses the non-EU rate for a non-EU passport, falling back to the EU rate', () => {
    expect(priceDayActivity(row({ pricing_type: 'per_person', base_rate_eur: 25, base_rate_non_eur: 30 }), 2, false, 'E£')!.lineTotal).toBe(60)
    expect(priceDayActivity(row({ pricing_type: 'per_person', base_rate_eur: 25, base_rate_non_eur: null }), 2, false, 'E£')!.lineTotal).toBe(50)
  })

  it('is a HOLE (null), never a zero line, when the row has no usable rate', () => {
    expect(priceDayActivity(row({ pricing_type: 'per_unit', base_rate_eur: null }), 4, true, 'E£')).toBeNull()
    expect(priceDayActivity(row({ pricing_type: 'per_person', base_rate_eur: 0 }), 4, true, 'E£')).toBeNull()
    expect(priceDayActivity(row({ pricing_type: 'tiered', tiers: [] }), 4, true, 'E£')).toBeNull()
  })

  it('defaults an unknown/absent pricing type to per person', () => {
    const line = priceDayActivity(row({ pricing_type: null, base_rate_eur: 10 }), 3, true, 'E£')
    expect(line).toMatchObject({ lineTotal: 30, isPerPax: true })
  })
})
