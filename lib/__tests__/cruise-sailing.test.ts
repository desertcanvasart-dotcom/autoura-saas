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
