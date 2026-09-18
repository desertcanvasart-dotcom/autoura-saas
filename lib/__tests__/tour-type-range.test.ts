import { describe, it, expect } from 'vitest'
import { dayRange, coversDays, isSingleDayType, suggestTourType, durationForType } from '@/lib/tours/tour-type'

// ============================================
// A tour type is the operator's decision
// ============================================
// The form rewrote the TYPE from the duration — `if (days >= 2) tour_type =
// 'multi_day'` — so every agency-added type was wiped the moment someone
// edited the duration. On production Sawa Tours and the Sandbox both have
// "Package", "OverDay Trip" and "OverNight Trip": setting a Package tour to 5
// days silently made it a Multi-Day Tour. The single-day list was hardcoded
// too, so "OverDay Trip" — a day trip — was held to 2 days and a night.

const DAY = { key: 'day_tour', meta: { min_days: 1, max_days: 1 } }
const STOPOVER = { key: 'stopover', meta: { min_days: 1, max_days: 1 } }
const MULTI = { key: 'multi_day', meta: { min_days: 2 } }
/** What an agency adds in Settings: a word, no range. */
const PACKAGE = { key: 'package', meta: {} }
const OVERDAY = { key: 'overday_trip', meta: {} }
const ITEMS = [DAY, MULTI, STOPOVER, PACKAGE, OVERDAY]

describe('dayRange', () => {
  it('reads the range the vocabulary carries', () => {
    expect(dayRange(DAY)).toEqual({ min: 1, max: 1 })
    expect(dayRange(MULTI)).toEqual({ min: 2, max: null })
  })

  it('is unknown for an agency’s own type', () => {
    expect(dayRange(PACKAGE)).toEqual({ min: null, max: null })
    expect(dayRange(undefined)).toEqual({ min: null, max: null })
    expect(dayRange({ key: 'x', meta: { min_days: 'nonsense', max_days: 0 } })).toEqual({ min: null, max: null })
  })
})

describe('coversDays', () => {
  it('is the range, inclusive', () => {
    expect(coversDays(DAY, 1)).toBe(true)
    expect(coversDays(DAY, 2)).toBe(false)
    expect(coversDays(MULTI, 2)).toBe(true)
    expect(coversDays(MULTI, 30)).toBe(true)
    expect(coversDays(MULTI, 1)).toBe(false)
  })

  it('an unknown range covers nothing, so it is never auto-picked', () => {
    expect(coversDays(PACKAGE, 1)).toBe(false)
    expect(coversDays(PACKAGE, 5)).toBe(false)
  })
})

describe('isSingleDayType', () => {
  it('is a type that covers at most one day — whatever it is called', () => {
    expect(isSingleDayType(DAY)).toBe(true)
    expect(isSingleDayType(STOPOVER)).toBe(true)
    expect(isSingleDayType({ key: 'overday_trip', meta: { min_days: 1, max_days: 1 } })).toBe(true)
  })

  it('is not a type with no range, and not an open-ended one', () => {
    expect(isSingleDayType(PACKAGE)).toBe(false)
    expect(isSingleDayType(MULTI)).toBe(false)
  })
})

describe('suggestTourType', () => {
  it('suggests a type that fits when the current one cannot', () => {
    expect(suggestTourType(5, 'day_tour', ITEMS)).toBe('multi_day')
    expect(suggestTourType(1, 'multi_day', ITEMS)).toBe('day_tour')
  })

  it('leaves a type alone when it already fits', () => {
    expect(suggestTourType(1, 'day_tour', ITEMS)).toBeNull()
    expect(suggestTourType(1, 'stopover', ITEMS)).toBeNull()
    expect(suggestTourType(9, 'multi_day', ITEMS)).toBeNull()
  })

  it('NEVER overwrites an agency’s own type — the bug', () => {
    expect(suggestTourType(5, 'package', ITEMS)).toBeNull()
    expect(suggestTourType(1, 'package', ITEMS)).toBeNull()
    expect(suggestTourType(2, 'overday_trip', ITEMS)).toBeNull()
  })

  it('suggests nothing when nothing covers the duration', () => {
    expect(suggestTourType(3, 'day_tour', [DAY, STOPOVER])).toBeNull()
  })

  it('ignores a switched-off type', () => {
    const items = [DAY, { ...MULTI, is_active: false }]
    expect(suggestTourType(4, 'day_tour', items)).toBeNull()
  })

  it('refuses nonsense durations', () => {
    for (const days of [0, -2, 1.5, NaN]) expect(suggestTourType(days, 'day_tour', ITEMS), String(days)).toBeNull()
  })
})

describe('durationForType', () => {
  it('holds a single-day type to its one day', () => {
    expect(durationForType(DAY, 6)).toEqual({ duration_days: 1, duration_nights: 0 })
  })

  it('raises a multi-day type to its minimum', () => {
    expect(durationForType(MULTI, 1)).toEqual({ duration_days: 2, duration_nights: 1 })
  })

  it('leaves a duration that already fits', () => {
    expect(durationForType(MULTI, 7)).toBeNull()
    expect(durationForType(DAY, 1)).toBeNull()
  })

  it('says nothing about an agency’s own type — it sets its own duration', () => {
    expect(durationForType(PACKAGE, 1)).toBeNull()
    expect(durationForType(PACKAGE, 30)).toBeNull()
  })
})
