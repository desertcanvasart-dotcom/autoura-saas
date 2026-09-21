// ============================================
// Saving an edited day — what changes, and what must NOT
// ============================================
// The day editor used to build a brand-new day from its form and put it in
// place of the old one. Anything the form does not show was deleted on Save:
//
//   - the day's `services` block — airport arrival and departure, hotel
//     check-in and check-out, the guide — which only the days sheet, the AI
//     builder and the template creator write;
//   - attractions that arrived as WORDS (the form only loads picked ones);
//   - a city or a night the operator left blank in the form — under a comment
//     that read "an empty city or night leaves the day exactly as it was";
//   - any key the form has never heard of.
//
// Found 2026-09-21, the day after the operator was asked to press Edit on 21
// live days to correct their city. Each of those days has attractions and a
// services block. Pure and import-free (the editor is a client component).

export interface PickedAttraction { id: string; name: string }

export interface DayForm {
  title: string
  description: string
  meals: Record<string, unknown>
  /** Attractions picked from the fee sheet. */
  picked: PickedAttraction[]
  /** '' = road. */
  transportType: string
  transportRateId: string
  /** '' = leave as it was. */
  city: string
  /** '' = leave as it was. */
  night: string
  cityTransfer: boolean
  /** '' = a day tour, as before. */
  length: string
  propertiesByTier: Record<string, string>
  /** "No guided sightseeing on this day". */
  noSightseeing: boolean
}

type Day = Record<string, unknown>

const drop = (day: Day, ...keys: string[]) => { for (const k of keys) delete day[k] }

/**
 * The day to store. `existing` is the day being edited, or null for a new one.
 * Everything the form does not own is carried over untouched.
 */
export function applyDayForm(existing: Day | null, form: DayForm, dayNumber: number): Day {
  const day: Day = { ...(existing ?? {}) }

  day.day = dayNumber
  day.title = form.title.trim()
  day.description = form.description.trim()
  day.meals = { ...form.meals }

  // Attractions. Picks replace whatever was there — an id is a decision and
  // the engine prices ids over wording. With NO picks: a day that HAD picks
  // has had them removed, so they go; a day that only ever had WORDS keeps
  // them, because the form never showed them and so cannot have removed them.
  if (form.picked.length > 0) {
    day.attractions = form.picked.map(a => a.name)
    day.attraction_ids = form.picked.map(a => a.id)
  } else if (Array.isArray(existing?.attraction_ids) && (existing!.attraction_ids as unknown[]).length > 0) {
    drop(day, 'attractions', 'attraction_ids')
  }

  if (form.transportType) {
    day.transport_type = form.transportType
    if (form.transportRateId) day.transport_rate_id = form.transportRateId
    else drop(day, 'transport_rate_id')
  } else {
    drop(day, 'transport_type', 'transport_rate_id')
  }

  // Blank means "leave it", which is now true as well as written.
  if (form.city.trim()) day.city = form.city.trim()
  if (form.night) day.accommodation_type = form.night

  if (form.cityTransfer) day.city_transfer = true
  else drop(day, 'city_transfer')

  if (form.length) day.sightseeing_length = form.length
  else drop(day, 'sightseeing_length')

  const chosen = Object.fromEntries(Object.entries(form.propertiesByTier).filter(([, id]) => Boolean(id)))
  if (Object.keys(chosen).length > 0) day.property_by_tier = chosen
  else drop(day, 'property_by_tier')

  // "No guided sightseeing" and "visits these" cannot both be true. The
  // attractions win: a day that names a sight has sightseeing, whatever the
  // box says.
  const hasAttractions =
    (Array.isArray(day.attractions) && day.attractions.length > 0) ||
    (Array.isArray(day.attraction_ids) && day.attraction_ids.length > 0)
  if (form.noSightseeing && !hasAttractions) day.sightseeing = 'none'
  else drop(day, 'sightseeing')

  return day
}

/** Attractions a day names in WORDS only — the form cannot show or edit these,
 *  so it says they are there and that they are kept. */
export function wordedAttractions(day: Day | null | undefined): string[] {
  if (!day) return []
  const ids = Array.isArray(day.attraction_ids) ? day.attraction_ids : []
  if (ids.length > 0) return []
  return Array.isArray(day.attractions) ? day.attractions.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : []
}
