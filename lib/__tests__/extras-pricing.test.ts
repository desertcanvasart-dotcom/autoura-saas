import { describe, it, expect } from 'vitest'
import { priceExtras, addExtrasToMoney, OPTION_SOURCE, type CatalogueExtra } from '@/lib/pricing/extras-pricing'

// Extras at quote time: cost is the truth, the quote's margin is the house
// rule, selling_price is an explicit pin. See lib/pricing/extras-pricing.ts.

const fastTrack: CatalogueExtra = {
  id: 'ft', name: 'Airport fast-track', supplier_cost: 20, selling_price: null, unit: 'per_person',
}
const lateCheckout: CatalogueExtra = {
  id: 'lc', name: 'Late check-out', supplier_cost: 30, selling_price: 45, unit: 'per_booking',
}
const luggagePinnedNoCost: CatalogueExtra = {
  id: 'lg', name: 'Extra luggage', supplier_cost: null, selling_price: 15, unit: 'per_person',
}
const unpriced: CatalogueExtra = {
  id: 'un', name: 'Mystery', supplier_cost: null, selling_price: null, unit: 'per_booking',
}
const catalogue = [fastTrack, lateCheckout, luggagePinnedNoCost, unpriced]

const base = { totalCost: 400, marginAmount: 100, sellingPrice: 500, pricePerPerson: 250 } // 2 pax @ 25%

describe('priceExtras', () => {
  it('cost-only per-person extra scales with pax and takes the quote margin', () => {
    const p = priceExtras(catalogue, [{ id: 'ft' }], 4)
    expect(p.holes).toEqual([])
    expect(p.lines).toHaveLength(1)
    const l = p.lines[0]
    expect(l.quantity).toBe(4)
    expect(l.unit_cost).toBe(20)
    expect(l.line_total).toBe(80)
    expect(l.quantity_mode).toBe('per_pax')
    expect(l.rate_source).toBe('extras_catalogue')
    expect(l.extra.pinned).toBe(false)
    expect(p.cost_total).toBe(80)
    expect(p.margined_cost).toBe(80)
    expect(p.pinned_margin).toBe(0)
    expect(p.pinned_sell).toBe(0)
  })

  it('pinned per-booking extra: charged once, margin is price − cost, never stacked', () => {
    const p = priceExtras(catalogue, [{ id: 'lc' }], 6)
    expect(p.holes).toEqual([])
    const l = p.lines[0]
    expect(l.quantity).toBe(1)
    expect(l.quantity_mode).toBe('fixed')
    expect(l.line_total).toBe(30)
    expect(l.extra.pinned).toBe(true)
    expect(l.extra.sell_total).toBe(45)
    expect(l.extra.margin_total).toBe(15)
    expect(p.cost_total).toBe(30)
    expect(p.margined_cost).toBe(0)
    expect(p.pinned_margin).toBe(15)
    expect(p.pinned_sell).toBe(45)
  })

  it('pinned price with unknown cost is priced but flagged as a hole', () => {
    const p = priceExtras(catalogue, [{ id: 'lg' }], 2)
    expect(p.holes).toHaveLength(1)
    expect(p.holes[0].kind).toBe('extra')
    expect(p.holes[0].message).toMatch(/no supplier cost/)
    const l = p.lines[0]
    expect(l.unit_cost).toBe(0)
    expect(l.line_total).toBe(0)
    expect(l.extra.cost_known).toBe(false)
    expect(l.extra.sell_total).toBe(30)
    expect(p.pinned_sell).toBe(30)
    expect(p.pinned_margin).toBe(30)
  })

  it('no cost and no price is a hole and contributes nothing', () => {
    const p = priceExtras(catalogue, [{ id: 'un' }], 2)
    expect(p.holes).toHaveLength(1)
    expect(p.holes[0].message).toMatch(/cannot be priced/)
    expect(p.cost_total).toBe(0)
    expect(p.pinned_sell).toBe(0)
    expect(p.lines[0].pricing_note).toMatch(/unpriced/)
  })

  it('an unknown id is a hole, not silently dropped', () => {
    const p = priceExtras(catalogue, [{ id: 'nope' }], 2)
    expect(p.lines).toEqual([])
    expect(p.holes).toHaveLength(1)
    expect(p.holes[0].message).toMatch(/not found/)
  })

  it('a variation option rides the same math, stamped with its own source', () => {
    // Same money as the pinned late check-out above; only the labels differ.
    const p = priceExtras(catalogue, [{ id: 'lc' }], 6, OPTION_SOURCE)
    const l = p.lines[0]
    expect(l.rate_source).toBe('variation_option')
    expect(l.service_category).toBe('option')
    expect(l.rate_type).toBe('option')
    expect(l.line_total).toBe(30)
    expect(l.extra.sell_total).toBe(45)
    expect(p.pinned_margin).toBe(15)
    // Hole messages name the thing correctly.
    const h = priceExtras(catalogue, [{ id: 'nope' }], 2, OPTION_SOURCE)
    expect(h.holes[0].message).toMatch(/^Option nope was not found/)
  })

  it('never reads a NULL or negative rate as a number', () => {
    const p = priceExtras(
      [{ id: 'neg', name: 'Bad', supplier_cost: -5, selling_price: null, unit: 'per_booking' }],
      [{ id: 'neg' }], 2
    )
    expect(p.holes).toHaveLength(1)
    expect(p.cost_total).toBe(0)
  })

  it('pax below 1 is clamped so a per-person extra is never zero-quantity', () => {
    const p = priceExtras(catalogue, [{ id: 'ft' }], 0)
    expect(p.lines[0].quantity).toBe(1)
  })
})

describe('addExtrasToMoney', () => {
  it('cost-only extra: margin applied at the quote rate', () => {
    // 2 pax fast-track: cost 40, margin 25% → +10, sell +50
    const p = priceExtras(catalogue, [{ id: 'ft' }], 2)
    const m = addExtrasToMoney(base, p, 2, 25)
    expect(m).toEqual({ totalCost: 440, marginAmount: 110, sellingPrice: 550, pricePerPerson: 275 })
  })

  it('pinned extra: price lands as-is, no quote margin stacked on it', () => {
    // late check-out: cost 30, pinned 45 → cost +30, margin +15, sell +45
    const p = priceExtras(catalogue, [{ id: 'lc' }], 2)
    const m = addExtrasToMoney(base, p, 2, 25)
    expect(m).toEqual({ totalCost: 430, marginAmount: 115, sellingPrice: 545, pricePerPerson: 272.5 })
    // Had the 25% been stacked, selling would be 430 + 107.5 = 537.5 or 556.25; it is neither.
  })

  it('mixed selection: each line follows its own rule', () => {
    const p = priceExtras(catalogue, [{ id: 'ft' }, { id: 'lc' }], 2)
    const m = addExtrasToMoney(base, p, 2, 25)
    // cost 400+40+30 = 470; margin 100 + 10 + 15 = 125; sell 595
    expect(m).toEqual({ totalCost: 470, marginAmount: 125, sellingPrice: 595, pricePerPerson: 297.5 })
  })

  it('0% margin is honoured: a cost-only extra sells at cost', () => {
    const p = priceExtras(catalogue, [{ id: 'ft' }], 2)
    const m = addExtrasToMoney({ totalCost: 400, marginAmount: 0, sellingPrice: 400, pricePerPerson: 200 }, p, 2, 0)
    expect(m).toEqual({ totalCost: 440, marginAmount: 0, sellingPrice: 440, pricePerPerson: 220 })
  })

  it('re-evaluates cleanly for other pax counts (rate-sheet rows)', () => {
    const p6 = priceExtras(catalogue, [{ id: 'ft' }, { id: 'lc' }], 6)
    // fast-track 6×20 = 120 (margined), late check-out once: cost 30, pin 45
    expect(p6.cost_total).toBe(150)
    expect(p6.margined_cost).toBe(120)
    expect(p6.pinned_margin).toBe(15)
    const m = addExtrasToMoney({ totalCost: 0, marginAmount: 0, sellingPrice: 0, pricePerPerson: 0 }, p6, 6, 25)
    expect(m).toEqual({ totalCost: 150, marginAmount: 45, sellingPrice: 195, pricePerPerson: 32.5 })
  })
})
