import { describe, it, expect } from 'vitest'
import { groupByDay } from '@/components/pricing/DayBand'

// ============================================
// A band where each day starts
// ============================================
// Every breakdown was a flat list — the calculator's table, the tour page, and
// the saved quote page, which showed category totals and never the lines at
// all. Finding where day 4 began meant counting rows.

const line = (day: number | null, name: string) => ({ day, name })

describe('groupByDay', () => {
  it('opens a band at each day, keeping the order it was given', () => {
    const groups = groupByDay(
      [line(1, 'a'), line(1, 'b'), line(2, 'c'), line(3, 'd')],
      l => l.day
    )
    expect(groups.map(g => g.day)).toEqual([1, 2, 3])
    expect(groups[0].lines.map(l => l.name)).toEqual(['a', 'b'])
  })

  it('gathers whole-trip lines at the end, however they arrived', () => {
    const groups = groupByDay(
      [line(null, 'cruise package'), line(1, 'a'), line(null, 'water'), line(2, 'b')],
      l => l.day
    )
    expect(groups.map(g => g.day)).toEqual([1, 2, null, null])
    expect(groups.at(-1)?.lines.map(l => l.name)).toEqual(['water'])
  })

  it('treats a missing, zero or negative day as whole-trip', () => {
    const groups = groupByDay(
      [{ day: undefined }, { day: 0 }, { day: -1 }],
      l => l.day as number | null
    )
    expect(groups.every(g => g.day === null)).toBe(true)
  })

  it('does not merge days that are not adjacent — the order is the engine’s', () => {
    // sortByItineraryFlow has already ordered these; a day appearing twice
    // means the list was not ordered, and the bands say so rather than hiding
    // it by regrouping.
    const groups = groupByDay([line(1, 'a'), line(2, 'b'), line(1, 'c')], l => l.day)
    expect(groups.map(g => g.day)).toEqual([1, 2, 1])
  })

  it('is empty for no lines', () => {
    expect(groupByDay([], () => null)).toEqual([])
  })
})
