// ============================================
// A day's meals — one reader, one summary
// ============================================
// Meals are a per-day, per-meal fact: they cost money and they are part of the
// agreement with the customer. The only honest home for that is the day
// itself — itinerary[].meals — which is what the pricing engine reads.
//
// tour_templates.meals_included used to be a SECOND, independent list with no
// day attached ("Breakfast" — on which day?), read by nothing customer-facing
// or engine-facing, and wiped by the edit form on every save. It is now
// DERIVED from the days by summarizeMeals() and written on every save and
// every days import, so it can describe the itinerary but never contradict it.
//
// The three statuses mean what the PRICING ENGINE does with them:
//   included  in the hotel/cruise rate (board basis) — inside the room rate
//   external  the operator takes them to a restaurant — a priced per-pax line
//   none      not provided — the customer's own arrangement
// Both 'included' and 'external' are on the bill; only 'none' is not.

export type DayMealStatus = 'included' | 'external' | 'none'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'
export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner']

/** Two shapes are live: the legacy string[] the day editor once wrote
 *  (["Breakfast"]) and the object the days sheet and the engine use. */
export type DayMeals = string[] | Partial<Record<MealSlot, DayMealStatus>>

/** Either shape to the three statuses. */
export function readDayMeals(meals: DayMeals | undefined): Record<MealSlot, DayMealStatus> {
  const out: Record<MealSlot, DayMealStatus> = { breakfast: 'none', lunch: 'none', dinner: 'none' }
  if (!meals) return out
  if (Array.isArray(meals)) {
    const lower = meals.map(m => String(m).toLowerCase())
    for (const k of MEAL_SLOTS) if (lower.includes(k)) out[k] = 'included'
    return out
  }
  for (const k of MEAL_SLOTS) if (meals[k]) out[k] = meals[k]!
  return out
}

const LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

/** How the status reads on a card or in a summary. */
export function mealStatusLabel(status: DayMealStatus): string {
  return status === 'included' ? 'hotel' : status === 'external' ? 'restaurant' : 'not provided'
}

/**
 * The template-level summary, derived from the days and stated BY DAY, with
 * WHERE each meal comes from — because "Breakfast" with no day was the
 * ambiguity this exists to remove, and a hotel breakfast and a restaurant
 * lunch are priced completely differently. Counts everything the operator
 * PROVIDES: 'included' (in the hotel rate) and 'external' (a restaurant,
 * priced separately). Only 'none' is left out, and a day providing nothing
 * is omitted rather than listed as empty.
 *   e.g. ["Day 1: Dinner (restaurant)", "Day 2: Breakfast (hotel), Lunch (restaurant)"]
 */
export function summarizeMeals(itinerary: unknown): string[] {
  if (!Array.isArray(itinerary)) return []
  const out: string[] = []
  itinerary.forEach((raw, i) => {
    const day = (raw ?? {}) as { day?: number; meals?: DayMeals }
    const m = readDayMeals(day.meals)
    const provided = MEAL_SLOTS
      .filter(k => m[k] !== 'none')
      .map(k => `${LABEL[k]} (${mealStatusLabel(m[k])})`)
    if (provided.length) out.push(`Day ${day.day ?? i + 1}: ${provided.join(', ')}`)
  })
  return out
}
