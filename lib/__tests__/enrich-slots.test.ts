import { describe, it, expect } from 'vitest'
import { enrichSlots } from '@/app/pricing-grid/lib/enrich-slots'

const rateMap = new Map<string, any>([
  ['hotel-1', { rateId: 'hotel-1', name: 'Cairo Hotel', rateEur: 85 }],
  ['guide-1', { rateId: 'guide-1', name: 'English Guide', rateEur: 75 }],
])

describe('enrichSlots — AI fence (Layer 3)', () => {
  it('NEVER turns an AI-emitted catch-all number into a price', () => {
    const out = enrichSlots({ other_pp: 250, other_group: 400 }, rateMap)
    for (const slot of ['other_pp', 'other_group']) {
      expect(out[slot].customAmount).toBe(0) // not priced
      expect(out[slot].needsHumanInput).toBe(true) // flagged for manual entry
      expect(out[slot].selectedItems).toEqual([])
    }
    // The AI figure is preserved only as a non-binding hint.
    expect(out.other_pp.aiSuggested).toBe(250)
    expect(out.other_group.aiSuggested).toBe(400)
  })

  it('does not flag a zero catch-all amount', () => {
    const out = enrichSlots({ other_pp: 0 }, rateMap)
    expect(out.other_pp.needsHumanInput).toBe(false)
    expect(out.other_pp.aiSuggested).toBeNull()
    expect(out.other_pp.customAmount).toBe(0)
  })

  it('resolves AI-selected rate IDs against the validated rate map', () => {
    const out = enrichSlots({ accommodation: ['hotel-1'], guide: ['guide-1'] }, rateMap)
    expect(out.accommodation.selectedItems).toHaveLength(1)
    expect(out.accommodation.selectedItems[0].rateId).toBe('hotel-1')
    expect(out.accommodation.customAmount).toBe(0)
    expect(out.accommodation.needsHumanInput).toBeUndefined()
  })

  it('drops rate IDs the AI invented that are not in the rate map', () => {
    const out = enrichSlots({ accommodation: ['hotel-1', 'made-up-id'] }, rateMap)
    expect(out.accommodation.selectedItems).toHaveLength(1)
    expect(out.accommodation.selectedItems[0].rateId).toBe('hotel-1')
  })
})
