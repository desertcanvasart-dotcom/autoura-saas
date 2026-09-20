// ============================================
// A day is in ONE city
// ============================================
// Every rate the engine looks up for a day is keyed by that day's city: the
// hotel for the night, the vehicle for the sightseeing, the airport, and the
// road transfer in from wherever the day before ended.
//
// Found on live data, 2026-09-20: 21 of 144 template days store a LIST there —
// "Cairo; Luxor", "Abu Simbel; Aswan", "Cairo; Giza; Memphis; Saqqara". The
// day editor asks for one city; these arrived through imported sheets. The
// engine looked each list up as if it were the name of a place, found nothing,
// and told the operator to add a sedan rate "in Cairo; Luxor".
//
// WHY THE LIST IS NOT SPLIT AND READ BY POSITION. It was tried against the 21
// rows and no rule survives them:
//   - "last place = where the night is" puts the hotel of
//     "Cairo; Giza; Memphis; Saqqara" in Saqqara;
//   - the same day — out to Abu Simbel and back — is written
//     "Abu Simbel; Aswan" by one agency and "Aswan; Abu Simbel" by another;
//   - the sightseeing is the first place on some days and the last on others.
// A wrong hotel city is a wrong price, so the day is refused until it says
// one. Pure: no database, no framework — the engine, the days import and the
// day editor all read this one rule.

/** The separators this app's own sheets use for a list. */
const LIST_SEPARATOR = /[;|]/

/** The places a day's city names — one, for a day that is priceable. */
export function placesNamed(city: unknown): string[] {
  if (typeof city !== 'string') return []
  return city.split(LIST_SEPARATOR).map(p => p.trim()).filter(Boolean)
}

export function namesSeveralPlaces(city: unknown): boolean {
  return placesNamed(city).length > 1
}

/** What to tell whoever is looking at the day. One wording, three surfaces. */
export function severalPlacesReason(city: unknown): string {
  const places = placesNamed(city)
  return (
    `City names ${places.length} places (${places.join(', ')}). A day is priced in ONE city — ` +
    `where the night is, or where the sightseeing is on a day with no night. ` +
    `The journey in is read from the day before, so it does not need listing here`
  )
}
