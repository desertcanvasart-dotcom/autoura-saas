// One meal price, for several meals (migration 467).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  mealTypesOf, rateServesMeal, mealsOverlap, coversMeals, mealRateLists, touchesMeals,
  mealOptionId, mealRateRowId, perMealEntries,
} from '@/lib/meals/meal-rate-meals'
import { ratePin } from '@/lib/pricing/rate-pin'
import { sameService, rateColumns } from '@/lib/bookings/cover-options'
import { clearPreferredSiblings, describeScope } from '@/lib/rates/preferred'
import { exportCellValue, RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

const ID = '11111111-2222-3333-4444-555555555555'
const both = { id: ID, meal_type: 'lunch', other_meal_types: ['dinner'] }

describe('the meals one price covers', () => {
  it('lists the first meal, then the rest — no blanks, no repeats', () => {
    expect(mealTypesOf(both)).toEqual(['lunch', 'dinner'])
    expect(mealTypesOf({ meal_type: 'lunch', other_meal_types: ['Lunch', ' ', 'dinner', 'dinner'] })).toEqual(['lunch', 'dinner'])
    expect(mealTypesOf({ meal_type: null, other_meal_types: null })).toEqual([])
    expect(mealTypesOf({ meal_type: 'dinner' })).toEqual(['dinner'])
  })
  it('serves a meal when it is the first meal or a further one', () => {
    expect(rateServesMeal(both, 'lunch')).toBe(true)
    expect(rateServesMeal(both, 'dinner')).toBe(true)
    expect(rateServesMeal(both, 'breakfast')).toBe(false)
    expect(rateServesMeal({ meal_type: 'set_lunch' }, 'lunch')).toBe(true)
    expect(rateServesMeal({ meal_type: null }, 'lunch')).toBe(false)
  })
  it('two prices compete when they share a meal', () => {
    expect(mealsOverlap(both, { meal_type: 'dinner' })).toBe(true)
    expect(mealsOverlap({ meal_type: 'lunch' }, { meal_type: 'dinner' })).toBe(false)
    expect(mealsOverlap({ meal_type: 'dinner', other_meal_types: ['lunch'] }, both)).toBe(true)
  })
  it('a price stands in for another only when it serves every meal the other does', () => {
    expect(coversMeals({ meal_type: 'lunch' }, both)).toBe(true)
    expect(coversMeals(both, { meal_type: 'lunch' })).toBe(false)
  })
})

describe('what the form saves', () => {
  it('takes the whole list, or the row\'s own shape', () => {
    expect(mealRateLists({ meal_types: ['lunch', 'dinner', 'lunch'] })).toEqual({ meal_type: 'lunch', other_meal_types: ['dinner'] })
    expect(mealRateLists({ meal_type: 'lunch', other_meal_types: ['dinner'] })).toEqual({ meal_type: 'lunch', other_meal_types: ['dinner'] })
    expect(mealRateLists({ meal_types: [] })).toEqual({ meal_type: null, other_meal_types: [] })
    // Further meals with no first meal are not a price for anything.
    expect(mealRateLists({ meal_type: '', other_meal_types: ['dinner'] })).toEqual({ meal_type: null, other_meal_types: [] })
  })
  it('knows when a body speaks about the meals', () => {
    expect(touchesMeals({ meal_types: [] })).toBe(true)
    expect(touchesMeals({ notes: 'x' })).toBe(false)
  })
  it('both routes write the list, and the form sends it', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
    expect(read('app', 'api', 'rates', 'meals', 'route.ts')).toMatch(/other_meal_types: meals\.other_meal_types/)
    expect(read('app', 'api', 'rates', 'meals', '[id]', 'route.ts')).toMatch(/updateData\.other_meal_types = meals\.other_meal_types/)
    expect(read('app', 'rates', 'meals', 'meal-rates-content.tsx')).toMatch(/meal_types: mealTypesOf\(rate\)/)
  })
})

describe('the pricing grid lists a price once per meal', () => {
  it('the first meal keeps the row id; a further meal has its own entry', () => {
    const entries = perMealEntries({ ...both, restaurant_name: 'Sofra' })
    expect(entries.map(e => [e.id, e.meal_type])).toEqual([[ID, 'lunch'], [`${ID}~dinner`, 'dinner']])
    expect(perMealEntries({ id: ID, meal_type: 'lunch' })).toHaveLength(1)
    expect(perMealEntries({ id: ID, meal_type: null })).toEqual([{ id: ID, meal_type: null }])
    expect(mealOptionId(ID, 'lunch', 0)).toBe(ID)
    expect(mealRateRowId(`${ID}~dinner`)).toBe(ID)
    expect(mealRateRowId(ID)).toBe(ID)
  })
  it('every entry is pinned to the one row', () => {
    expect(ratePin('meals', `${ID}~dinner`)).toEqual({ rate_table: 'meal_rates', rate_id: ID })
    expect(ratePin('meals', ID)).toEqual({ rate_table: 'meal_rates', rate_id: ID })
    // Only meals: another slot's synthetic id is still not a pin.
    expect(ratePin('accommodation', `${ID}~dinner`)).toEqual({})
  })
})

describe('cover options', () => {
  it('reads the further meals and asks for every meal to be covered', () => {
    expect(rateColumns('meal_rates')).toContain('other_meal_types')
    const base = { supplier_id: 's', city: 'Cairo', tier: 'standard' }
    const lunch = { id: 'a', ...base, meal_type: 'lunch' }
    const lunchDinner = { id: 'b', ...base, meal_type: 'dinner', other_meal_types: ['lunch'] }
    expect(sameService('meal_rates', lunch, lunchDinner)).toBe(true)
    expect(sameService('meal_rates', lunchDinner, lunch)).toBe(false)
    expect(sameService('meal_rates', lunch, { ...lunchDinner, city: 'Luxor' })).toBe(false)
  })
})

describe('the preferred star is one per tier and meal', () => {
  function mealClient(starred: Array<Record<string, unknown>>) {
    const calls: Array<[string, unknown[]]> = []
    const reader: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'is', 'ilike']) reader[m] = (...a: unknown[]) => { calls.push([m, a]); return reader }
    reader.then = (f: (r: unknown) => unknown) => Promise.resolve(f({ data: starred, error: null }))
    const writer: Record<string, unknown> = {}
    for (const m of ['eq', 'in']) writer[m] = (...a: unknown[]) => { calls.push([`w.${m}`, a]); return writer }
    writer.then = (f: (r: unknown) => unknown) => Promise.resolve(f({ error: null }))
    return { calls, client: { from: () => ({ select: () => reader, update: (v: unknown) => { calls.push(['update', [v]]); return writer } }) } }
  }
  it('a lunch-and-dinner star clears the lunch star and the dinner star, not the breakfast one', async () => {
    const { client, calls } = mealClient([
      { id: 'lunch-only', meal_type: 'lunch', other_meal_types: [] },
      { id: 'dinner-too', meal_type: 'breakfast', other_meal_types: ['dinner'] },
      { id: 'breakfast', meal_type: 'breakfast', other_meal_types: [] },
    ])
    const r = await clearPreferredSiblings(client, 'meal_rates', 't1', { tier: 'standard', ...both }, ID)
    expect(r.error).toBeNull()
    expect(calls).toContainEqual(['ilike', ['tier', 'standard']])
    expect(calls).toContainEqual(['update', [{ is_preferred: false }]])
    expect(calls).toContainEqual(['w.in', ['id', ['lunch-only', 'dinner-too']]])
  })
  it('writes nothing when no starred price shares a meal', async () => {
    const { client, calls } = mealClient([{ id: 'breakfast', meal_type: 'breakfast', other_meal_types: [] }])
    await clearPreferredSiblings(client, 'meal_rates', 't1', { tier: null, ...both }, ID)
    expect(calls).toContainEqual(['is', ['tier', null]])
    expect(calls.some(c => c[0] === 'update')).toBe(false)
  })
  it('the toast names every meal', () => {
    expect(describeScope('meal_rates', { tier: 'standard', ...both })).toBe('standard · lunch · dinner')
  })
})

describe('the spreadsheet', () => {
  it('carries the further meals in one cell', () => {
    expect(RATE_TABLE_CONFIGS.meal_rates.columns.map(c => c.name)).toContain('other_meal_types')
    expect(exportCellValue('meal_rates', { other_meal_types: ['dinner', 'breakfast'] }, 'other_meal_types')).toBe('dinner; breakfast')
    expect(exportCellValue('meal_rates', { other_meal_types: [] }, 'other_meal_types')).toBe('')
  })
})

describe('migration 467', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '467_meal_price_several_meals.sql'), 'utf8')
  it('adds the list, never NULL, and refuses further meals with no first meal', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS other_meal_types TEXT\[\] NOT NULL DEFAULT '\{\}'/)
    expect(sql).toMatch(/meal_rates_other_meals_need_meal/)
  })
})
