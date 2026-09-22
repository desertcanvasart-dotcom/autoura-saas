import { describe, it, expect } from 'vitest'
import { sanitizeSailingDays, sailsOn, sailingDaysLabel, dayOfDate, dayName } from '@/lib/rates/cruise-sailing'

// ============================================================================
// A Nile ship leaves on set weekdays. A sailing that departs Mondays and
// Fridays cannot serve a Wednesday itinerary — the price is right and the
// booking is impossible. This records the days and alarms on a mismatch.
// EMPTY = no fixed day (the default), and checks nothing. (sibling parity)
// ============================================================================

describe('sailing days', () => {
  it('keeps known keys, in week order, once each', () => {
    expect(sanitizeSailingDays(['fri', 'mon', 'fri', 'nope', 7])).toEqual(['mon', 'fri'])
    expect(sanitizeSailingDays('mon')).toEqual([])
    expect(sanitizeSailingDays(null)).toEqual([])
  })

  it('names the weekday a date falls on', () => {
    expect(dayOfDate('2026-09-21')).toBe('mon')
    expect(dayOfDate('2026-09-23')).toBe('wed')
    expect(dayOfDate('not a date')).toBeNull()
  })

  it('reads as a sentence', () => {
    expect(sailingDaysLabel(['mon'])).toBe('Mondays')
    expect(sailingDaysLabel(['fri', 'mon'])).toBe('Mondays and Fridays')
    expect(sailingDaysLabel(['fri', 'mon', 'wed'])).toBe('Mondays, Wednesdays and Fridays')
    expect(sailingDaysLabel([])).toBe('')
  })

  it('spells the day name', () => {
    expect(dayName('thu')).toBe('Thursday')
  })
})

describe('sailsOn is silent until the operator says otherwise', () => {
  it('lets a Monday sailing start on a Monday', () => {
    expect(sailsOn(['mon', 'fri'], '2026-09-21')).toBe(true)
  })

  it('catches the Wednesday it cannot start on', () => {
    expect(sailsOn(['mon', 'fri'], '2026-09-23')).toBe(false)
  })

  it('says yes when the ship has NO fixed day', () => {
    expect(sailsOn([], '2026-09-23')).toBe(true)
    expect(sailsOn(undefined, '2026-09-23')).toBe(true)
  })

  it('says yes when there is no date to check', () => {
    expect(sailsOn(['mon'], null)).toBe(true)
    expect(sailsOn(['mon'], '')).toBe(true)
  })
})

import { cruiseSailingNotes } from '@/lib/rates/cruise-sailing'

describe('cruiseSailingNotes for a built itinerary', () => {
  const ships = new Map([
    ['ship-monfri', { ship_name: 'MS Sunrise', sailing_days: ['mon', 'fri'] }],
    ['ship-anyday', { ship_name: 'MS Anytime', sailing_days: [] }],
  ])
  const day = (n: number, over: Record<string, unknown> = {}) => ({
    day_number: n, date: null, accommodation_type: 'hotel', is_cruise_day: false, itinerary_services: [], ...over,
  })
  const boardsMonFri = (date: string) => [
    day(1),
    day(2, { accommodation_type: 'cruise', date, itinerary_services: [{ rate_table: 'nile_cruises', rate_id: 'ship-monfri' }] }),
    day(3, { accommodation_type: 'cruise', date: null }),
    day(4),
  ]

  it('notes a cruise that boards on a day the ship does not sail', () => {
    const notes = cruiseSailingNotes(boardsMonFri('2026-11-11'), ships) // Wednesday
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('MS Sunrise departs Mondays and Fridays')
    expect(notes[0]).toContain('day 2 boards on 2026-11-11')
  })

  it('is silent when the boarding day matches', () => {
    expect(cruiseSailingNotes(boardsMonFri('2026-11-13'), ships)).toEqual([]) // Friday
  })

  it('is silent when the ship has no fixed day', () => {
    const days = boardsMonFri('2026-11-11').map(d =>
      d.day_number === 2 ? { ...d, itinerary_services: [{ rate_table: 'nile_cruises', rate_id: 'ship-anyday' }] } : d)
    expect(cruiseSailingNotes(days, ships)).toEqual([])
  })

  it('is silent when no cruise day names a nile_cruises rate', () => {
    const days = boardsMonFri('2026-11-11').map(d =>
      d.day_number === 2 ? { ...d, itinerary_services: [] } : d)
    expect(cruiseSailingNotes(days, ships)).toEqual([])
  })
})
