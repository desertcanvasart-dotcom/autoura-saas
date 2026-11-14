// ============================================
// One meal price, for several meals (migration 467)
// ============================================
// Operator, 2026-11-14: the same menu at the same restaurant at the same
// price is often served at lunch AND at dinner, and had to be entered twice —
// one row per meal. A meal price is now ONE row: its first meal in
// `meal_type`, the further meals the same price covers in `other_meal_types`
// (the way a guide price lists its cities and languages, migration 463).
//
// One rule, read by everything that asks "does this price serve that meal":
// the engine, the pricing grid's list, the preferred star, the cover options.
//
// Pure: the routes, the engine and the tests all call it.

export interface MealRateMeals {
  meal_type?: string | null
  other_meal_types?: readonly string[] | null
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The values in order, trimmed, blanks and repeats (any case) dropped. */
function uniqueList(values: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of values) {
    const s = clean(v)
    const k = s.toLowerCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Every meal one price covers, first first. Empty = no meal stated. */
export function mealTypesOf(r: MealRateMeals): string[] {
  return uniqueList([r.meal_type, ...asArray(r.other_meal_types)])
}

/**
 * Does this price serve the meal the engine asks for (breakfast / lunch /
 * dinner)? A meal type is the agency's own key, so the match is the one the
 * engine has always used: the key contains the meal's word ("set_lunch").
 */
export function rateServesMeal(r: MealRateMeals, kind: string): boolean {
  const wanted = kind.trim().toLowerCase()
  if (!wanted) return false
  return mealTypesOf(r).some(m => m.toLowerCase().includes(wanted))
}

/** Do two prices share a meal? The preferred star is one per tier and meal. */
export function mealsOverlap(a: MealRateMeals, b: MealRateMeals): boolean {
  const mine = new Set(mealTypesOf(a).map(m => m.toLowerCase()))
  // A price with no meal stated only competes with another such price.
  if (mine.size === 0) return mealTypesOf(b).length === 0
  return mealTypesOf(b).some(m => mine.has(m.toLowerCase()))
}

/** Does `b` serve every meal `a` does (so it can stand in for it)? */
export function coversMeals(a: MealRateMeals, b: MealRateMeals): boolean {
  const theirs = new Set(mealTypesOf(b).map(m => m.toLowerCase()))
  const mine = mealTypesOf(a)
  if (mine.length === 0) return theirs.size === 0
  return mine.every(m => theirs.has(m.toLowerCase()))
}

export interface MealRateLists {
  meal_type: string | null
  other_meal_types: string[]
}

/**
 * The meals a form body asks for, as the row stores them. Accepts the list
 * either as `meal_types` (the form: every meal) or as `meal_type` +
 * `other_meal_types` (the row's own shape, the CSV).
 */
export function mealRateLists(body: {
  meal_type?: unknown
  other_meal_types?: unknown
  meal_types?: unknown
}): MealRateLists {
  const meals = Array.isArray(body.meal_types)
    ? uniqueList(body.meal_types)
    : clean(body.meal_type) ? uniqueList([body.meal_type, ...asArray(body.other_meal_types)]) : []
  return { meal_type: meals[0] ?? null, other_meal_types: meals.slice(1) }
}

/** Does the body say anything about the meals (a PUT may not)? */
export const touchesMeals = (b: Record<string, unknown>) =>
  'meal_types' in b || 'meal_type' in b || 'other_meal_types' in b

// ---- The pricing grid's list ------------------------------------------------
// A day may take lunch AND dinner from the one price, so the grid lists a
// price once per meal it covers. The first meal keeps the row's own id (every
// saved quote still finds it); a further meal's entry is `<row id>~<meal>`.

export const MEAL_OPTION_SEP = '~'

/** The grid entry id for one meal of a price. */
export function mealOptionId(rowId: string, meal: string, index: number): string {
  return index === 0 ? rowId : `${rowId}${MEAL_OPTION_SEP}${meal}`
}

/** The meal_rates row a grid entry id belongs to. */
export function mealRateRowId(optionId: string): string {
  const sep = optionId.indexOf(MEAL_OPTION_SEP)
  return sep === -1 ? optionId : optionId.slice(0, sep)
}

/**
 * A price as the grid lists it: one entry per meal it covers, each with the
 * entry id and that one meal in `meal_type`. A price with no meal stated
 * stays one entry.
 */
export function perMealEntries<T extends MealRateMeals & { id: string }>(row: T): Array<T & { meal_type: string | null }> {
  const meals = mealTypesOf(row)
  if (meals.length === 0) return [{ ...row, meal_type: row.meal_type ?? null }]
  return meals.map((meal, i) => ({ ...row, id: mealOptionId(row.id, meal, i), meal_type: meal }))
}
