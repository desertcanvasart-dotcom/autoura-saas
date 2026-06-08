import { describe, it, expect } from 'vitest'
import { buildSlotsFromAI } from '@/app/api/pricing-grid/parse/route'

// Layer 3 of the pricing harness: the AI fence. The model may SELECT validated
// DB rate ids but must never EMIT a price number. See PRICING-HARNESS-PLAN.md.

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
      expect(slots[id].resolvedRate).toBe(0)
      expect(slots[id].customAmount).toBeNull()
      expect(slots[id].needsHumanInput).toBe(true)
      expect(slots[id].aiSuggested).toBeGreaterThan(0) // kept only as a non-binding hint
    }
  })

  it('does not flag water (auto-filled downstream by the code constant)', () => {
    const slots = byId(buildSlotsFromAI({ water: 5 }, rateMap))
    expect(slots.water.resolvedRate).toBe(0)
    expect(slots.water.customAmount).toBeNull()
    expect(slots.water.needsHumanInput).toBe(false)
  })

  it('resolves single-slot rates only from validated DB ids', () => {
    const slots = byId(buildSlotsFromAI({ accommodation: 'acc-1' }, rateMap))
    expect(slots.accommodation.selectedId).toBe('acc-1')
    expect(slots.accommodation.resolvedRate).toBe(55)
  })

  it('ignores a bogus single-slot id — no fabricated price', () => {
    const slots = byId(buildSlotsFromAI({ accommodation: 'does-not-exist' }, rateMap))
    expect(slots.accommodation.selectedId).toBeNull()
    expect(slots.accommodation.resolvedRate).toBe(0)
  })

  it('sums only valid ids in multi-slots, dropping invalid ones', () => {
    const slots = byId(
      buildSlotsFromAI({ entrance_fees: ['ent-1', 'bogus', 'ent-2'] }, rateMap)
    )
    expect(slots.entrance_fees.selectedIds).toEqual(['ent-1', 'ent-2'])
    expect(slots.entrance_fees.resolvedRate).toBe(35)
  })
})
