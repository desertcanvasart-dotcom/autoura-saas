import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import { summarizeMeals } from '@/lib/tours/day-meals'
import { parseTemplatesCsv, serializeTemplatesCsv, TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const codeOnly = (src: string) => src.split('\n').filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') }).join('\n')

// ============================================================================
// Meals are a per-day, per-meal fact — a cost line and part of the agreement
// with the customer. tour_templates.meals_included was a SECOND, independent
// list with no day attached ("Breakfast" — on which day?), read by nothing,
// and wiped by the edit form on every save. It is derived from the days now.
// ============================================================================

describe('summarizeMeals states meals BY DAY', () => {
  const days = [
    { day: 1, meals: { breakfast: 'none', lunch: 'none', dinner: 'included' } },
    { day: 2, meals: { breakfast: 'included', lunch: 'external', dinner: 'none' } },
    { day: 3, meals: { breakfast: 'included', lunch: 'none', dinner: 'none' } },
    { day: 4, meals: { breakfast: 'none', lunch: 'none', dinner: 'none' } },
  ]

  it('names the day AND the source for every meal', () => {
    // A hotel breakfast and a restaurant lunch are priced completely
    // differently; "Breakfast" with no day and no source said neither.
    expect(summarizeMeals(days)).toEqual([
      'Day 1: Dinner (hotel)',
      'Day 2: Breakfast (hotel), Lunch (restaurant)',
      'Day 3: Breakfast (hotel)',
    ])
  })

  it('counts a restaurant meal — it is on the bill, priced from meal rates', () => {
    expect(summarizeMeals(days).join(' ')).toContain('Lunch (restaurant)')
  })

  it('leaves out a day that includes nothing rather than listing it empty', () => {
    expect(summarizeMeals(days).some(s => s.startsWith('Day 4'))).toBe(false)
  })

  it('reads the legacy array shape too', () => {
    // The array shape can only mean included-with-the-hotel.
    expect(summarizeMeals([{ day: 1, meals: ['Breakfast', 'Dinner'] }])).toEqual(['Day 1: Breakfast (hotel), Dinner (hotel)'])
  })

  it('is empty for no days — no days, no meals, no claim', () => {
    expect(summarizeMeals([])).toEqual([])
    expect(summarizeMeals(null)).toEqual([])
  })
})

describe('the template sheet cannot set meals independently any more', () => {
  it('marks Meals Included read-only', () => {
    expect(TEMPLATE_CSV_COLUMNS.find(c => c.name === 'meals_included')?.readOnly).toBe(true)
  })

  it('still exports it, so the sheet describes the tour', () => {
    const header = serializeTemplatesCsv([{ template_code: 'X', template_name: 'T', tour_type: 'day_tour', duration_days: 1, meals_included: ['Day 1: Lunch'] }])
      .split('\n')[0]
    expect(header).toContain('Meals Included')
  })

  it('ignores it on import — a typed value could contradict the days', () => {
    const csv = 'Code,Name,Type,Duration Days,Meals Included\nX,T,day_tour,1,Breakfast; Dinner\n'
    const { records } = parseTemplatesCsv(csv, papa)
    expect(records[0]).not.toHaveProperty('meals_included')
  })
})

describe('the form neither edits nor wipes the summary', () => {
  const form = codeOnly(read('app/tours/manage/TourManagerContent.tsx'))

  it('derives it from the days on save', () => {
    expect(form).toContain('meals_included: summarizeMeals(formData.itinerary)')
  })

  it('no longer has a hand editor for it', () => {
    // The old toggleMeal that edited meals_included was never even rendered.
    expect(form).not.toMatch(/meals_included: prev\.meals_included/)
  })

  it('loads the three fields it used to hard-code on edit', () => {
    // meals_included: [] / pickup_required: true / age_suitability: 'all_ages'
    // were literals in the edit loader while every neighbour read the
    // template — so Update Template silently reset them.
    expect(form).toContain("meals_included: template.meals_included || []")
    expect(form).toContain('pickup_required: template.pickup_required ?? true')
    expect(form).toContain("age_suitability: template.age_suitability || 'all_ages'")
  })

  it('the day editor names the three states by what the engine does', () => {
    // Checkboxes could only say included-or-nothing. And 'external' is a
    // restaurant meal the operator PRICES — calling it "own expense" would
    // have had operators marking the costed one as free.
    expect(form).toContain('<option value="included">In hotel rate</option>')
    expect(form).toContain('<option value="external">Restaurant (priced)</option>')
    expect(form).toContain('<option value="none">Not provided</option>')
  })
})

describe('meals are visible where a tour is read', () => {
  const form = codeOnly(read('app/tours/manage/TourManagerContent.tsx'))

  it('the day list states all three, never hiding "not provided"', () => {
    // A day that says "lunch not provided" must not look the same as a day
    // that never said anything about lunch — that was the whole confusion.
    expect(form).not.toContain(".filter(k => m[k] !== 'none')")
    expect(form).toContain("MEAL_SLOTS.map(k => `${k[0].toUpperCase() + k.slice(1)}: ${mealStatusLabel(m[k], day.accommodation_type)}`)")
  })

  it('the tour card shows meals by day, derived live from the itinerary', () => {
    // Not from meals_included, which only refreshes on save and can lag.
    expect(form).toContain('summarizeMeals(template.itinerary)')
  })
})

describe('the days import keeps the summary in step', () => {
  it('writes meals_included in the same update as the itinerary', () => {
    const route = codeOnly(read('app/api/tours/bulk/import-days/route.ts'))
    expect(route).toContain('.update({ itinerary, meals_included: summarizeMeals(itinerary) })')
  })
})
