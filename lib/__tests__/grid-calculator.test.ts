import { describe, it, expect } from 'vitest'
import { calculateDay, calculateGrandTotals } from '@/app/pricing-grid/lib/calculator'
import { createEmptySlots } from '@/app/pricing-grid/lib/slot-mapping'
import { DEFAULT_CONFIG, EMPTY_TOTALS, type GridDay, type GridConfig } from '@/app/pricing-grid/types'

// Consolidation Phase E: golden + invariants for the GRID's own money math
// (the bespoke pricing surface). Group costs are shared across pax; per-person
// costs are per head; margin is clamped 0–200%. See PRICING-CONSOLIDATION-PLAN.md.

function makeDay(priced: Record<string, number>): GridDay {
  const slots = createEmptySlots().map((s) => {
    const next: any = { ...s }
    if (priced[s.slotId] !== undefined) {
      next.resolvedRate = priced[s.slotId]
      next.selectedId = 'x'
    }
    return next
  })
  return { id: 'd1', dayNumber: 1, title: '', city: '', description: '', isExpanded: false, slots }
}

const cfg = (over: Partial<GridConfig> = {}): GridConfig => ({ ...DEFAULT_CONFIG, ...over })

describe('calculateDay — group shared, per-person per head', () => {
  // group: route 100 + guide 60 = 160; per-person: accom 55 + entrance 35 + meals 14 + water 2 = 106
  const day = makeDay({ route: 100, guide: 60, accommodation: 55, entrance_fees: 35, meals: 14, water: 2 })

  it('splits group cost across pax and adds per-person (pax=2)', () => {
    const c = calculateDay(day, cfg({ pax: 2, withGuide: true }))
    expect(c.groupTotal).toBe(160)
    expect(c.perPersonTotal).toBe(106)
    expect(c.groupPerPerson).toBe(80) // 160 / 2
    expect(c.dailyPerPerson).toBe(186) // 80 + 106
    expect(c.dailyTotal).toBe(372) // 186 * 2
  })

  it('amortizes group cost as pax grows (pax=4 → lower group-per-person)', () => {
    const c = calculateDay(day, cfg({ pax: 4, withGuide: true }))
    expect(c.groupPerPerson).toBe(40) // 160 / 4
    expect(c.dailyPerPerson).toBe(146) // 40 + 106
  })

  it('excludes the guide when the Guide toggle is off', () => {
    const c = calculateDay(day, cfg({ pax: 2, withGuide: false }))
    expect(c.groupTotal).toBe(100) // guide 60 excluded
    expect(c.dailyPerPerson).toBe(156) // 50 + 106
  })
})

describe('calculateGrandTotals — golden + margin', () => {
  const day = makeDay({ route: 100, guide: 60, accommodation: 55, entrance_fees: 35, meals: 14, water: 2 })

  it('locks the hand-derived totals (1 day, pax=2, 25% margin)', () => {
    const t = calculateGrandTotals([day], cfg({ pax: 2, withGuide: true, marginPercent: 25 }))
    expect(t.costPerPerson).toBe(186)
    expect(t.totalCost).toBe(372) // 186 * 2
    expect(t.sellingPricePerPerson).toBe(232.5) // 186 * 1.25
    expect(t.sellingPriceTotal).toBe(465) // 232.5 * 2
    expect(t.marginAmount).toBe(93) // 465 - 372
  })

  it('sums per-person cost across multiple days', () => {
    const t = calculateGrandTotals([day, day], cfg({ pax: 2, withGuide: true, marginPercent: 0 }))
    expect(t.costPerPerson).toBe(372) // 186 * 2 days
    expect(t.totalCost).toBe(744)
    expect(t.sellingPriceTotal).toBe(744) // 0% margin
    expect(t.marginAmount).toBe(0)
  })

  it('clamps margin to [0, 200]', () => {
    const hi = calculateGrandTotals([day], cfg({ pax: 2, marginPercent: 500 }))
    expect(hi.sellingPricePerPerson).toBe(186 * 3) // clamped to 200% → ×3
    const lo = calculateGrandTotals([day], cfg({ pax: 2, marginPercent: -50 }))
    expect(lo.sellingPricePerPerson).toBe(186) // clamped to 0% → ×1
  })

  it('returns EMPTY_TOTALS for no days', () => {
    expect(calculateGrandTotals([], cfg())).toEqual(EMPTY_TOTALS)
  })
})

describe('calculateGrandTotals — invariants', () => {
  const day = makeDay({ route: 90, guide: 45, accommodation: 60, entrance_fees: 25, meals: 12 })

  for (const pax of [1, 2, 3, 7, 12]) {
    for (const marginPercent of [0, 10, 25, 60]) {
      it(`selling = cost + margin, per-person × pax = total (pax=${pax}, m=${marginPercent})`, () => {
        const t = calculateGrandTotals([day], cfg({ pax, withGuide: true, marginPercent }))
        expect(t.sellingPriceTotal).toBeCloseTo(t.totalCost + t.marginAmount, 6)
        expect(t.costPerPerson * pax).toBeCloseTo(t.totalCost, 6)
        expect(t.sellingPricePerPerson * pax).toBeCloseTo(t.sellingPriceTotal, 6)
        expect(t.marginAmount).toBeGreaterThanOrEqual(0)
        expect(Number.isNaN(t.sellingPriceTotal)).toBe(false)
      })
    }
  }
})
