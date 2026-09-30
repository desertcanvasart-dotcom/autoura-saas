import { describe, it, expect } from 'vitest'
import { priceByBasis, unitsFor, toPricingBasis, cleanPricingBasisFields, pricingBasisLabel } from '@/lib/pricing/pricing-basis'

// ============================================================================
// How a rate applies to the group (migration 393) — airport and hotel
// assistance used to be charged once whatever the group size: an Aswan
// meet-and-assist cost the same for 2 travellers as for 20.
// ============================================================================

describe('priceByBasis', () => {
  it('per group: once, whatever the size', () => {
    expect(priceByBasis(700, 'flat', 20)).toEqual({ quantity: 1, lineTotal: 700, isPerPax: false })
    expect(priceByBasis(700, null, 20)).toEqual({ quantity: 1, lineTotal: 700, isPerPax: false })
  })

  it('per person: × the travellers', () => {
    expect(priceByBasis(700, 'per_person', 3)).toEqual({ quantity: 3, lineTotal: 2100, isPerPax: true })
  })

  it('per unit: × the units the group needs', () => {
    expect(priceByBasis(100, 'per_unit', 5, 2)).toEqual({ quantity: 3, lineTotal: 300, isPerPax: false })
    expect(priceByBasis(100, 'per_unit', 5, null)).toEqual({ quantity: 1, lineTotal: 100, isPerPax: false })
  })

  it('unitsFor rounds up, never below one', () => {
    expect(unitsFor(4, 2)).toBe(2)
    expect(unitsFor(1, 6)).toBe(1)
    expect(unitsFor(0, 2)).toBe(1)
  })

  it('a tiered activity counts per person where only one rate is known', () => {
    expect(toPricingBasis('tiered')).toBe('per_person')
    expect(toPricingBasis('nonsense')).toBeNull()
  })

  it('labels', () => {
    expect(pricingBasisLabel('flat')).toBe('Per group')
    expect(pricingBasisLabel('per_unit', 2)).toBe('Per unit of 2')
  })
})

describe('cleanPricingBasisFields (rate writes)', () => {
  it('accepts the three bases and a whole capacity', () => {
    expect(cleanPricingBasisFields({ pricing_type: 'per_unit', max_capacity: '2' })).toEqual({ ok: true, fields: { pricing_type: 'per_unit', max_capacity: 2 } })
  })
  it('clears the capacity for a basis that has none', () => {
    expect(cleanPricingBasisFields({ pricing_type: 'per_person', max_capacity: 4 })).toEqual({ ok: true, fields: { pricing_type: 'per_person', max_capacity: null } })
  })
  it('leaves absent fields out, so a partial update keeps what is stored', () => {
    expect(cleanPricingBasisFields({ rate_eur: 5 })).toEqual({ ok: true, fields: {} })
  })
  it('refuses an unknown basis and a bad capacity', () => {
    expect(cleanPricingBasisFields({ pricing_type: 'per_bag' }).ok).toBe(false)
    expect(cleanPricingBasisFields({ pricing_type: 'per_unit', max_capacity: 0 }).ok).toBe(false)
    expect(cleanPricingBasisFields({ max_capacity: 1.5 }).ok).toBe(false)
  })
})
