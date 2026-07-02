import { describe, it, expect } from 'vitest'
import { buildSlotsFromAI } from '@/app/api/pricing-grid/parse/route'

// Layer 3 of the pricing harness: the AI fence. The model may SELECT validated
// DB rate ids but must never EMIT a price number. See PRICING-HARNESS-PLAN.md.
//
// Slots now carry the passport-aware `selectedItems` model (rateEur/rateNonEur),
// matching app/pricing-grid/types — the calculator picks the rate by passport.

const rateMap = new Map([
  ['acc-1', { rate: 55, rateNonEur: 50, label: 'Cairo Grand', table: 'accommodation_rates' }],
  ['ent-1', { rate: 20, rateNonEur: 10, label: 'Pyramids', table: 'entrance_fees' }],
  ['ent-2', { rate: 15, rateNonEur: 8, label: 'Museum', table: 'entrance_fees' }],
])

const byId = (slots: any[]) => Object.fromEntries(slots.map((s) => [s.slotId, s]))

describe('buildSlotsFromAI — AI fence', () => {
  it('never turns an AI-emitted number into a price (other_pp / other_group)', () => {
    const slots = byId(buildSlotsFromAI({ other_pp: 250, other_group: 99 }, rateMap))
    for (const id of ['other_pp', 'other_group']) {
      expect(slots[id].selectedItems).toEqual([])
      expect(slots[id].customAmount).toBe(0)
      expect(slots[id].needsHumanInput).toBe(true)
      expect(slots[id].aiSuggested).toBeGreaterThan(0) // kept only as a non-binding hint
    }
  })

  it('does not flag water (auto-filled downstream by the code constant)', () => {
    const slots = byId(buildSlotsFromAI({ water: 5 }, rateMap))
    expect(slots.water.selectedItems).toEqual([])
    expect(slots.water.customAmount).toBe(0)
    expect(slots.water.needsHumanInput).toBe(false)
  })

  it('resolves single-slot rates only from validated DB ids (both passports)', () => {
    const slots = byId(buildSlotsFromAI({ accommodation: 'acc-1' }, rateMap))
    expect(slots.accommodation.selectedItems).toHaveLength(1)
    expect(slots.accommodation.selectedItems[0]).toMatchObject({
      rateId: 'acc-1', rateEur: 55, rateNonEur: 50,
    })
  })

  it('ignores a bogus single-slot id — no fabricated price', () => {
    const slots = byId(buildSlotsFromAI({ accommodation: 'does-not-exist' }, rateMap))
    expect(slots.accommodation.selectedItems).toEqual([])
  })

  it('keeps only valid ids in multi-slots, dropping invalid ones', () => {
    const slots = byId(
      buildSlotsFromAI({ entrance_fees: ['ent-1', 'bogus', 'ent-2'] }, rateMap)
    )
    expect(slots.entrance_fees.selectedItems.map((it: any) => it.rateId)).toEqual(['ent-1', 'ent-2'])
    // EUR rates 20 + 15 = 35 ; non-EUR 10 + 8 = 18 — the calculator sums by passport.
    const eur = slots.entrance_fees.selectedItems.reduce((s: number, it: any) => s + it.rateEur, 0)
    const nonEur = slots.entrance_fees.selectedItems.reduce((s: number, it: any) => s + it.rateNonEur, 0)
    expect(eur).toBe(35)
    expect(nonEur).toBe(18)
  })
})
