import { describe, it, expect } from 'vitest'
import {
  checkDeliverablePrice,
  checkQuoteRowDeliverable,
  assertDeliverablePrice,
  PriceNotDeliverableError,
} from '@/lib/pricing-guards'

// Layer 2 of the pricing harness: the output gate. See PRICING-HARNESS-PLAN.md.

describe('checkDeliverablePrice', () => {
  const good = {
    complete: true,
    holes: [],
    totalCost: 462,
    sellingPrice: 577.5,
    pricePerPerson: 288.75,
    numPax: 2,
    marginPercent: 25,
    currency: 'EUR',
  }

  it('passes a clean, complete price', () => {
    const r = checkDeliverablePrice(good)
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('blocks a zero selling price', () => {
    const r = checkDeliverablePrice({ ...good, sellingPrice: 0, pricePerPerson: 0 })
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/Selling price is zero/)
  })

  it('blocks a negative price', () => {
    expect(checkDeliverablePrice({ ...good, totalCost: -10 }).ok).toBe(false)
  })

  it('blocks a NaN price', () => {
    expect(checkDeliverablePrice({ ...good, sellingPrice: NaN }).ok).toBe(false)
  })

  it('blocks an incomplete engine result', () => {
    const r = checkDeliverablePrice({ ...good, complete: false })
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/incomplete/i)
  })

  it('blocks when holes are present', () => {
    const r = checkDeliverablePrice({
      ...good,
      holes: [
        {
          kind: 'hotel',
          reason: 'missing',
          tier: 'standard',
          lookupAttempted: 'hotel rate (Cairo, standard)',
          message: 'Add it.',
        },
      ],
    })
    expect(r.ok).toBe(false)
  })

  it('blocks an out-of-range margin', () => {
    expect(checkDeliverablePrice({ ...good, marginPercent: 500 }).ok).toBe(false)
    expect(checkDeliverablePrice({ ...good, marginPercent: -5 }).ok).toBe(false)
  })

  it('blocks a missing currency', () => {
    expect(checkDeliverablePrice({ ...good, currency: '' }).ok).toBe(false)
  })

  it('blocks per-person × pax that does not reconcile with selling price', () => {
    const r = checkDeliverablePrice({ ...good, pricePerPerson: 100, numPax: 2, sellingPrice: 1000 })
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/reconcile/)
  })

  it('tolerates cent-level rounding in per-person × pax', () => {
    // 288.75 × 2 = 577.50; a few cents off should still pass.
    const r = checkDeliverablePrice({ ...good, sellingPrice: 577.49 })
    expect(r.ok).toBe(true)
  })

  it('blocks a fabricated (non-db) service line', () => {
    const r = checkDeliverablePrice({
      ...good,
      services: [{ rateSource: 'db' }, { rateSource: 'default' }],
    })
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/not backed by a real rate/)
  })

  it('allows the fixed water line source', () => {
    expect(
      checkDeliverablePrice({ ...good, services: [{ rateSource: 'db' }, { rateSource: 'fixed' }] }).ok
    ).toBe(true)
  })
})

describe('checkQuoteRowDeliverable', () => {
  it('passes a clean b2c quote row', () => {
    const r = checkQuoteRowDeliverable(
      { selling_price: 577.5, price_per_person: 288.75, num_travelers: 2, currency: 'EUR' },
      'b2c'
    )
    expect(r.ok).toBe(true)
  })

  it('blocks a b2c quote with zero selling price', () => {
    expect(
      checkQuoteRowDeliverable(
        { selling_price: 0, price_per_person: 0, num_travelers: 2, currency: 'EUR' },
        'b2c'
      ).ok
    ).toBe(false)
  })

  it('blocks a b2c quote missing currency', () => {
    expect(
      checkQuoteRowDeliverable(
        { selling_price: 500, price_per_person: 250, num_travelers: 2, currency: null },
        'b2c'
      ).ok
    ).toBe(false)
  })

  it('passes a b2b quote with a populated pricing table', () => {
    expect(
      checkQuoteRowDeliverable(
        { pricing_table: [{ pax: 2, selling_per_person: 300, total: 600 }], currency: 'EUR' },
        'b2b'
      ).ok
    ).toBe(true)
  })

  it('passes a b2b pax-keyed pricing table object', () => {
    expect(
      checkQuoteRowDeliverable({ pricing_table: { '2': { pp: 300 } }, currency: 'EUR' }, 'b2b').ok
    ).toBe(true)
  })

  it('blocks a b2b quote with an empty pricing table', () => {
    expect(checkQuoteRowDeliverable({ pricing_table: [], currency: 'EUR' }, 'b2b').ok).toBe(false)
  })
})

describe('assertDeliverablePrice', () => {
  it('throws PriceNotDeliverableError with violations on a bad price', () => {
    try {
      assertDeliverablePrice({ sellingPrice: 0, currency: '' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PriceNotDeliverableError)
      expect((e as PriceNotDeliverableError).violations.length).toBeGreaterThan(0)
    }
  })

  it('does not throw on a good price', () => {
    expect(() =>
      assertDeliverablePrice({ complete: true, sellingPrice: 100, currency: 'EUR' })
    ).not.toThrow()
  })
})
