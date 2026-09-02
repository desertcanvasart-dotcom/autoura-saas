// Ported from travel-ops-pro (__tests__/lib/optional-pricing.test.ts) so the
// shared implementation is pinned by the same numbers in both apps.

import { describe, it, expect } from 'vitest'
import {
  serviceQuantity,
  optionalContribution,
  composeQuoteTotals,
} from '@/lib/b2b/optional-pricing'

describe('serviceQuantity', () => {
  const base = { quantityValue: 1, numPax: 4, durationDays: 8 }

  it('scales per pax', () => {
    expect(serviceQuantity({ ...base, quantityMode: 'per_pax' })).toBe(4)
  })

  it('scales per day, and per night is one fewer', () => {
    expect(serviceQuantity({ ...base, quantityMode: 'per_day' })).toBe(8)
    expect(serviceQuantity({ ...base, quantityMode: 'per_night' })).toBe(7)
  })

  it('never returns zero nights for a one-day trip — that would price the line at nothing', () => {
    expect(serviceQuantity({ ...base, durationDays: 1, quantityMode: 'per_night' })).toBe(1)
  })

  it('rounds rooms up — three people need two', () => {
    expect(serviceQuantity({ ...base, numPax: 3, quantityMode: 'per_room' })).toBe(2)
  })

  it('leaves fixed and per-group alone', () => {
    expect(serviceQuantity({ ...base, quantityValue: 2, quantityMode: 'fixed' })).toBe(2)
    expect(serviceQuantity({ ...base, quantityValue: 2, quantityMode: 'per_group' })).toBe(2)
  })

  it('multiplies the stated value, not just the scale', () => {
    expect(serviceQuantity({ ...base, quantityValue: 2, quantityMode: 'per_pax' })).toBe(8)
  })

  it('treats missing input as one rather than zero', () => {
    expect(serviceQuantity({ quantityMode: 'per_pax', quantityValue: null, numPax: 0, durationDays: 0 })).toBe(1)
  })
})

describe('optionalContribution', () => {
  it('marks an un-priced option up with everything else', () => {
    expect(optionalContribution({ lineTotal: 100, override: null, quantity: 1 }))
      .toEqual({ marginable: 100, fixedPrice: 0, cost: 100 })
  })

  it('takes the operator price off-margin, and still counts the cost', () => {
    // The whole point: 140 is the price, not a number to mark up. But we still
    // pay 100, and leaving that out would report the option as pure profit.
    expect(optionalContribution({ lineTotal: 100, override: 140, quantity: 1 }))
      .toEqual({ marginable: 0, fixedPrice: 140, cost: 100 })
  })

  it('multiplies the operator price by the quantity', () => {
    expect(optionalContribution({ lineTotal: 400, override: 140, quantity: 4 }).fixedPrice).toBe(560)
  })

  it('treats a zero or blank override as no price at all, not as free', () => {
    for (const override of [0, null, undefined, '', 'abc']) {
      expect(optionalContribution({ lineTotal: 100, override, quantity: 1 }).marginable).toBe(100)
    }
  })
})

describe('composeQuoteTotals', () => {
  const marginPercent = 25

  it('is unchanged when no options are chosen', () => {
    expect(composeQuoteTotals({ subtotalCost: 1000, optionals: [], marginPercent })).toEqual({
      costTotal: 1000, marginBase: 1000, marginAmount: 250,
      baseSellingPrice: 1250, optionalSellingTotal: 0,
    })
  })

  it('marks up an option with no price of its own', () => {
    const t = composeQuoteTotals({
      subtotalCost: 1000,
      optionals: [{ marginable: 100, fixedPrice: 0, cost: 100 }],
      marginPercent,
    })
    expect(t.marginBase).toBe(1100)
    expect(t.baseSellingPrice).toBe(1375)
    expect(t.optionalSellingTotal).toBe(125)
  })

  it('keeps an operator-priced option out of the margin, and sells it at that price', () => {
    const t = composeQuoteTotals({
      subtotalCost: 1000,
      optionals: [{ marginable: 0, fixedPrice: 140, cost: 100 }],
      marginPercent,
    })
    expect(t.marginBase).toBe(1000)      // the option is not marked up
    expect(t.marginAmount).toBe(250)
    expect(t.baseSellingPrice).toBe(1390) // 1250 + 140, not 1250 + 175
    expect(t.optionalSellingTotal).toBe(140)
    expect(t.costTotal).toBe(1100)        // we still pay for it
  })

  it('handles both kinds in one quote', () => {
    const t = composeQuoteTotals({
      subtotalCost: 1000,
      optionals: [
        { marginable: 100, fixedPrice: 0, cost: 100 },
        { marginable: 0, fixedPrice: 140, cost: 100 },
      ],
      marginPercent,
    })
    expect(t.costTotal).toBe(1200)
    expect(t.marginBase).toBe(1100)
    expect(t.baseSellingPrice).toBe(1515) // 1375 + 140
    expect(t.optionalSellingTotal).toBe(265) // 125 + 140
  })

  it('never lets an off-margin option inflate the cost figure with its price', () => {
    // costTotal is what the itinerary stores as supplier_cost at conversion.
    const t = composeQuoteTotals({
      subtotalCost: 0,
      optionals: [{ marginable: 0, fixedPrice: 900, cost: 100 }],
      marginPercent,
    })
    expect(t.costTotal).toBe(100)
  })

  it('passes a zero margin straight through', () => {
    const t = composeQuoteTotals({
      subtotalCost: 1000,
      optionals: [{ marginable: 100, fixedPrice: 0, cost: 100 }],
      marginPercent: 0,
    })
    expect(t.baseSellingPrice).toBe(1100)
  })
})
