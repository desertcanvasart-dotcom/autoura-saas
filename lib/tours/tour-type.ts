// ============================================
// How long a tour type lasts
// ============================================
// The form used to rewrite the tour's TYPE from its duration —
// `if (duration_days >= 2) tour_type = 'multi_day'` — and decide "measured in
// hours?" from a hardcoded key list. Both are wrong the moment an agency adds
// a type of its own: on production Sawa Tours has "Package", "OverDay Trip"
// and "OverNight Trip". Setting a Package tour to 5 days silently made it a
// Multi-Day Tour, and OverDay Trip (a day trip) was held to 2 days and a night.
//
// The range lives on the vocabulary entry, beside the agency's own word for it
// (migration 363): meta.min_days, and meta.max_days where absent means
// open-ended. An agency-added type has NO range, and that means "the operator
// decided this": never suggested, never overwritten.
//
// Pure: no database, no framework.

export interface TourTypeItem {
  key: string
  meta?: Record<string, unknown> | null
  is_active?: boolean
}

export interface DayRange {
  min: number | null
  max: number | null
}

const positiveInt = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/** The days a type covers. Both null = the agency's own type, range unknown. */
export function dayRange(item: TourTypeItem | undefined | null): DayRange {
  return { min: positiveInt(item?.meta?.min_days), max: positiveInt(item?.meta?.max_days) }
}

const find = (items: readonly TourTypeItem[], key: string | null | undefined) =>
  key ? items.find(i => i.key === key) : undefined

/** Does this type cover a tour of `days` days? Unknown range covers nothing. */
export function coversDays(item: TourTypeItem | undefined | null, days: number): boolean {
  const { min, max } = dayRange(item)
  if (min === null && max === null) return false
  if (min !== null && days < min) return false
  if (max !== null && days > max) return false
  return true
}

/** A type measured in HOURS rather than days: one day at most. */
export function isSingleDayType(item: TourTypeItem | undefined | null): boolean {
  return dayRange(item).max === 1
}

/**
 * The type to suggest when the duration changes — or null to leave it alone.
 *
 * Left alone when: the current type already covers the new duration, or its
 * range is unknown (an agency's own type is a decision, not a guess), or
 * nothing in the list covers the duration.
 */
export function suggestTourType(
  days: number,
  currentKey: string | null | undefined,
  items: readonly TourTypeItem[]
): string | null {
  if (!Number.isInteger(days) || days < 1) return null
  const current = find(items, currentKey)
  const { min, max } = dayRange(current)
  if (min === null && max === null && currentKey) return null
  if (coversDays(current, days)) return null
  const match = items.find(i => i.is_active !== false && coversDays(i, days))
  return match && match.key !== currentKey ? match.key : null
}

/**
 * The duration to hold a tour to when its TYPE changes — or null to leave it.
 * Only a type with a known range says anything about duration.
 */
export function durationForType(
  item: TourTypeItem | undefined | null,
  currentDays: number
): { duration_days: number; duration_nights: number } | null {
  const { min, max } = dayRange(item)
  if (min === null && max === null) return null
  if (coversDays(item, currentDays)) return null
  if (max !== null && currentDays > max) return { duration_days: max, duration_nights: Math.max(0, max - 1) }
  if (min !== null && currentDays < min) return { duration_days: min, duration_nights: Math.max(0, min - 1) }
  return null
}
