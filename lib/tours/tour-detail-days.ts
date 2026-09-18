// ============================================
// A tour's programme, read from where it actually lives
// ============================================
// The tour detail page read its days out of `variation_daily_itinerary` — a
// table that, across all four tenants on 2026-09-18, held ZERO rows. The days
// operators write (the day editor, the days CSV import) live in
// `tour_templates.itinerary`: 41 of 44 templates have them there.
//
// So this maps a template's days into the shape the detail page reads, and the
// variation table stays what it always was — an override for the rare tour
// whose programme differs per variation.

import { readDayMeals, type DayMeals } from './day-meals'

export interface DetailDay {
  day_number: number
  day_title: string
  day_description: string
  city: string
  overnight_city: string
  breakfast_included: boolean
  lunch_included: boolean
  dinner_included: boolean
}

/** A meal the customer is given — whether it sits inside the hotel rate or we
 *  buy it at a restaurant. Both are on the bill; only 'none' is not. */
const isProvided = (status: string) => status === 'included' || status === 'external'

export function templateDaysToDetail(itinerary: unknown): DetailDay[] {
  if (!Array.isArray(itinerary)) return []
  return itinerary
    .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === 'object')
    .map((d, index) => {
      const meals = readDayMeals(d.meals as DayMeals | undefined)
      const city = typeof d.city === 'string' ? d.city : ''
      return {
        day_number: Number(d.day) || index + 1,
        day_title: typeof d.title === 'string' ? d.title : '',
        day_description: typeof d.description === 'string' ? d.description : '',
        city,
        // A day that says it has no night says so, rather than putting the
        // customer up in the city it toured.
        overnight_city: d.accommodation_type === 'none' ? '' : city,
        breakfast_included: isProvided(meals.breakfast),
        lunch_included: isProvided(meals.lunch),
        dinner_included: isProvided(meals.dinner),
      }
    })
    .sort((a, z) => a.day_number - z.day_number)
}
