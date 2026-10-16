import { describe, it, expect } from 'vitest'
import { readbackDays, readbackText } from '@/app/pricing-grid/lib/readback'
import type { GridDay } from '@/app/pricing-grid/types'

const item = (rateId: string, name: string) => ({ rateId, name, rateEur: 1, rateNonEur: 1 })
const day = (n: number, city: string, slots: GridDay['slots']): GridDay =>
  ({ id: `d${n}`, dayNumber: n, title: '', city, description: '', isExpanded: false, slots })

describe('readback', () => {
  const days = [
    day(1, 'Cairo', [
      { slotId: 'route', selectedItems: [item('r1__sedan', 'Cairo Airport Transfer · Airport Transfer')], customAmount: 0 },
      { slotId: 'accommodation', selectedItems: [item('h1', 'Marriott Mena House (luxury | BB)'), item('h1_supp', 'Single Supplement')], customAmount: 0 },
      { slotId: 'entrance_fees', selectedItems: [item('e1', 'Pyramids of Giza'), item('e2', 'Egyptian Museum')], customAmount: 0 },
      { slotId: 'water', selectedItems: [], customAmount: 2 },
    ]),
    day(2, 'Giza', [{ slotId: 'route', selectedItems: [], customAmount: 0 }]),
  ]

  it('reads each day back in the words of an itinerary', () => {
    const [d1, d2] = readbackDays(days)
    expect(d1.title).toBe('Day 1 — Cairo')
    expect(d1.lines).toEqual([
      'Transport: Cairo Airport Transfer · Airport Transfer (sedan)',
      'Hotel: Marriott Mena House (luxury | BB)',
      'Entrances: Pyramids of Giza; Egyptian Museum',
    ])
    expect(d2.lines).toEqual(['Nothing selected'])
  })

  it('copies with the trip header', () => {
    const text = readbackText(days, { packageName: 'Full Package', tier: 'luxury', pax: 2 })
    expect(text.startsWith('Package: Full Package\nTier: luxury\nTravellers: 2\n\nDay 1 — Cairo\n')).toBe(true)
  })
})
