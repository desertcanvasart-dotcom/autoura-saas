import { describe, it, expect } from 'vitest'
import { flowRank, sortByItineraryFlow, isBookableLine } from '@/lib/pricing/breakdown-order'

// ============================================
// The cost breakdown reads like the day runs
// ============================================
// The engine emitted lines in the order it computed them, and the old sort put
// every fixed cost ahead of every per-person one on top of that — so a day read
// as a shuffled list and an operator checking a quote against the programme
// could not see what was missing.

const line = (id: string, category: string, dayNumber: number | null) => ({ id, category, dayNumber })

describe('the order inside one day', () => {
  it('runs breakfast → leaving → travel → arriving → guide & sights → meals → the night → tips', () => {
    const day = [
      line('day2-tips', 'tips', 2),
      line('day2-hotel', 'accommodation', 2),
      line('day2-dinner', 'meal', 2),
      line('entrance-karnak', 'entrance', 2),
      line('day2-guide', 'guide', 2),
      line('day2-hotel-checkin', 'hotel_service', 2),
      line('day2-transport', 'transportation', 2),
      line('day2-flight-abc', 'flight', 2),
      line('day2-hotel-checkout', 'hotel_service', 2),
      line('day2-breakfast', 'meal', 2),
    ]
    expect(sortByItineraryFlow(day, l => l).map(l => l.id)).toEqual([
      'day2-breakfast',
      'day2-hotel-checkout',
      'day2-flight-abc',
      'day2-transport',
      'day2-hotel-checkin',
      'day2-guide',
      'entrance-karnak',
      'day2-dinner',
      'day2-hotel',
      'day2-tips',
    ])
  })

  it('puts the guide’s own ticket just after the traveller’s', () => {
    expect(flowRank(line('day3-guide-flight-x', 'flight', 3)))
      .toBeGreaterThan(flowRank(line('day3-flight-x', 'flight', 3)))
  })

  it('keeps leaving the ship before boarding one — "disembark" contains "embark"', () => {
    expect(flowRank(line('day5-cruise-disembark', 'cruise', 5)))
      .toBeLessThan(flowRank(line('day5-cruise-embark', 'cruise', 5)))
  })

  it('puts a night supplement and the guide’s bed after the night itself', () => {
    const night = flowRank(line('day2-hotel', 'accommodation', 2))
    expect(flowRank(line('day2-hotel-supp-single', 'accommodation', 2))).toBeGreaterThan(night)
    expect(flowRank(line('day2-guide-bed', 'accommodation', 2))).toBeGreaterThan(night)
  })
})

describe('the order across the trip', () => {
  it('is day by day', () => {
    const lines = [line('day3-guide', 'guide', 3), line('day1-guide', 'guide', 1), line('day2-guide', 'guide', 2)]
    expect(sortByItineraryFlow(lines, l => l).map(l => l.dayNumber)).toEqual([1, 2, 3])
  })

  it('puts whole-trip lines last, whatever their category', () => {
    const lines = [line('water-all-days', 'water', null), line('day2-guide', 'guide', 2)]
    expect(sortByItineraryFlow(lines, l => l).map(l => l.id)).toEqual(['day2-guide', 'water-all-days'])
  })

  it('is stable: same rank, same day keeps the engine’s order', () => {
    const lines = [line('entrance-a', 'entrance', 1), line('entrance-b', 'entrance', 1), line('entrance-c', 'entrance', 1)]
    expect(sortByItineraryFlow(lines, l => l).map(l => l.id)).toEqual(['entrance-a', 'entrance-b', 'entrance-c'])
  })
})

describe('isBookableLine', () => {
  it('keeps an ordinary priced line', () => {
    expect(isBookableLine({})).toBe(true)
  })

  it('keeps a NO-RATE line: it is still a service someone must book', () => {
    expect(isBookableLine({ unpriced: true, issue: 'No standard hotel in Aswan.' })).toBe(true)
  })

  it('drops a line that is already paid for inside another', () => {
    expect(isBookableLine({ included: true, issue: 'Breakfast is in the hotel rate.' })).toBe(false)
  })

  it('drops a note-only line, which would convert into a zero-cost booking', () => {
    expect(isBookableLine({ issue: 'No entrance fee matched "free site".' })).toBe(false)
  })
})
