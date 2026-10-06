import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  B2B_SHEET_PAX, gridSheetCosts, cleanSheetCosts, keyedPricingTable,
} from '@/app/pricing-grid/lib/b2b-rate-sheet'
import { buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import type { GridConfig, GridDay, RateOption } from '@/app/pricing-grid/types'

// ============================================================================
// A B2B save from the grid stored ONE row, as a list, in pricing_table — the
// quote page, email and PDF read a table keyed by group size and showed a
// single "0 pax" column with no price. And a save with a partner made TWO
// quotes. The grid now sends its cost at every sheet size; the one quote
// (quote-from-itinerary) stores them, keyed, at its margin.
// ============================================================================

const ROUTE_OPTIONS: RateOption[] = [
  { id: 'T1__sedan', name: 'Sedan', rateEur: 100, rateNonEur: 100, capacity_min: 1, capacity_max: 2 },
  { id: 'T1__minivan', name: 'Minivan', rateEur: 150, rateNonEur: 150, capacity_min: 3, capacity_max: 7 },
  { id: 'T1__bus', name: 'Bus', rateEur: 400, rateNonEur: 400, capacity_min: 8, capacity_max: 40 },
]
const day: GridDay = {
  id: 'd1', dayNumber: 1, title: 'Cairo', city: 'Cairo', description: '', isExpanded: false,
  slots: [
    { slotId: 'route', selectedItems: [{ rateId: 'T1__sedan', name: 'Sedan', rateEur: 100, rateNonEur: 100 }], customAmount: 0 },
    { slotId: 'guide', selectedItems: [{ rateId: 'g1', name: 'Guide', rateEur: 60, rateNonEur: 60 }], customAmount: 0 },
    { slotId: 'entrance_fees', selectedItems: [{ rateId: 'e1', name: 'Pyramids', rateEur: 20, rateNonEur: 20 }], customAmount: 0 },
  ],
}
const config = { pax: 3, passport: 'eu', withGuide: true, marginPercent: 25, guideMode: 'spot' } as unknown as GridConfig
const tiers = buildTransportTierIndex(ROUTE_OPTIONS)

describe('gridSheetCosts', () => {
  const costs = gridSheetCosts([day], config, tiers)

  it('prices every standard size and the trip’s own (3)', () => {
    expect(costs.map(c => c.pax)).toEqual([2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30])
    expect(B2B_SHEET_PAX).not.toContain(3)
  })

  it('at cost, with the vehicle re-chosen for each size', () => {
    const at = (pax: number) => costs.find(c => c.pax === pax)!.totalCost
    expect(at(2)).toBe(100 + 60 + 20 * 2) // sedan
    expect(at(4)).toBe(150 + 60 + 20 * 4) // minivan
    expect(at(10)).toBe(400 + 60 + 20 * 10) // bus
  })

  it('the throughout guide adds his extras and a seat in every vehicle', () => {
    const t = gridSheetCosts([day], { ...config, guideMode: 'throughout' } as GridConfig, tiers, { groupExtraEur: 50 })
    // 2 guests + the guide = 3 seats → the minivan.
    expect(t.find(c => c.pax === 2)!.totalCost).toBe(150 + 60 + 20 * 2 + 50)
  })
})

describe('cleanSheetCosts', () => {
  it('accepts whole sizes with real costs, sorted', () => {
    expect(cleanSheetCosts([{ pax: 4, totalCost: 10 }, { pax: 2, totalCost: 5 }])).toEqual([
      { pax: 2, totalCost: 5 }, { pax: 4, totalCost: 10 },
    ])
  })
  it.each([
    ['not a list', { pax: 2 }],
    ['empty', []],
    ['a fractional size', [{ pax: 2.5, totalCost: 1 }]],
    ['a zero size', [{ pax: 0, totalCost: 1 }]],
    ['a repeated size', [{ pax: 2, totalCost: 1 }, { pax: 2, totalCost: 2 }]],
    ['a negative cost', [{ pax: 2, totalCost: -1 }]],
    ['a missing cost', [{ pax: 2 }]],
    ['too many rows', Array.from({ length: 41 }, (_, i) => ({ pax: i + 1, totalCost: 1 }))],
  ])('refuses %s', (_label, raw) => {
    expect(cleanSheetCosts(raw)).toBeNull()
  })
})

describe('keyedPricingTable', () => {
  it('keyed by group size at the margin; the quote’s own size shows its selling price exactly', () => {
    const table = keyedPricingTable(
      [{ pax: 2, totalCost: 200 }, { pax: 4, totalCost: 300 }, { pax: 3, totalCost: 250 }],
      25,
      { pax: 3, sellingPrice: 312.51, pricePerPerson: 104.17 },
    )
    expect(table).toEqual({
      '2': { pp: 125, total: 250 },
      '3': { pp: 104.17, total: 312.51 },
      '4': { pp: 93.75, total: 375 },
    })
  })
  it('no sheet: the quote lists its own size, keyed', () => {
    expect(keyedPricingTable([], 25, { pax: 2, sellingPrice: 500, pricePerPerson: 250 })).toEqual({ '2': { pp: 250, total: 500 } })
  })
})

describe('one B2B quote per grid save', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')
  it('the save route no longer makes a B2B quote of its own', () => {
    expect(read('app', 'api', 'pricing-grid', 'save', 'route.ts')).not.toMatch(/generate_b2b_quote_number|from\('b2b_quotes'\)/)
  })
  it('quote-from-itinerary stores the keyed table, never a list', () => {
    const route = read('app', 'api', 'b2b', 'quote-from-itinerary', 'route.ts')
    expect(route).toMatch(/pricing_table: keyedPricingTable\(/)
    expect(route).not.toMatch(/pricing_table: \[/)
  })
  it('the grid sends its sheet with the quote request', () => {
    expect(read('app', 'pricing-grid', 'page.tsx')).toMatch(/rate_sheet_costs: gridSheetCosts\(/)
  })
})
