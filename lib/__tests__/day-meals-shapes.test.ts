import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { readDayMeals } from '@/lib/tours/day-meals'

// ============================================================================
// Two live shapes for a day's meals:
//   string[]  — what the day editor has always written: ["Breakfast"]
//   object    — what the days CSV writes and what the pricing engine calls the
//               new format: { breakfast: 'included', lunch: 'none', … }
//
// parseItinerary() has read both for a long time. The EDITOR read only the
// array, and checked `day.meals.length` — undefined on an object — so every
// day imported from a days sheet showed no meals at all, while the engine was
// reading them correctly the whole time. A display bug that looked like data
// loss.
// ============================================================================

describe('readDayMeals understands both shapes', () => {
  it('reads the legacy array', () => {
    expect(readDayMeals(['Breakfast', 'Dinner'])).toEqual({
      breakfast: 'included', lunch: 'none', dinner: 'included',
    })
  })

  it('is case-insensitive about it', () => {
    expect(readDayMeals(['breakfast'])).toMatchObject({ breakfast: 'included' })
  })

  it('reads the object', () => {
    expect(readDayMeals({ breakfast: 'included', lunch: 'external', dinner: 'none' })).toEqual({
      breakfast: 'included', lunch: 'external', dinner: 'none',
    })
  })

  it('keeps external, which the array cannot express', () => {
    // A restaurant meal the operator prices separately from the hotel.
    // Flattening it to the array form would collapse it into the hotel rate.
    expect(readDayMeals({ lunch: 'external' }).lunch).toBe('external')
  })

  it('treats missing and empty as no meals', () => {
    expect(readDayMeals(undefined)).toEqual({ breakfast: 'none', lunch: 'none', dinner: 'none' })
    expect(readDayMeals([])).toEqual({ breakfast: 'none', lunch: 'none', dinner: 'none' })
    expect(readDayMeals({})).toEqual({ breakfast: 'none', lunch: 'none', dinner: 'none' })
  })
})

describe('the editor no longer assumes an array', () => {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'), 'utf8'
  )
  // Assertions about ABSENCE must read code, not the comment explaining why
  // the thing is absent — which names it.
  const src = raw
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

  it('does not call .length or .join on day.meals', () => {
    // `day.meals.length` is undefined on the object shape, so the whole meals
    // line silently rendered nothing; `.join` would have thrown outright.
    expect(src).not.toContain('day.meals.length')
    expect(src).not.toContain('day.meals.join')
  })

  it('renders through the shared reader', () => {
    expect(src).toContain('readDayMeals(day.meals)')
  })

  it('writes the object shape for new days', () => {
    // So a day added by hand and a day imported from the sheet are stored the
    // same way, and the engine sees one format going forward.
    expect(src).toContain('meals: { ...dayMeals } as DayMeals')
  })
})
