// ============================================
// Restaurants an itinerary can be assigned
// ============================================
// Restaurants live in two places: the Restaurants directory
// (restaurant_contacts) and Rates → Meals (meal_rates), which is where most
// operators actually enter them — with a city and a price per meal. The
// itinerary's Resource Assignment picker read only the directory, so an
// operator whose restaurants were all under Rates → Meals saw "All Cities (0)"
// and could assign nothing (reported 2026-10-06).
//
// This merges both into one list, one entry per restaurant per city:
//   * a directory contact is listed as-is;
//   * meal rates are grouped — a restaurant has a row per meal and season —
//     and a group that names the same restaurant in the same city as a
//     directory contact is dropped in favour of the contact;
//   * a group linked to a supplier takes the SUPPLIER's id, because the
//     WhatsApp notify route looks the assigned id up in `suppliers`.
// Pure, so the grouping rules are testable without a database.

export interface RestaurantContactRow {
  id: string
  name: string | null
  city: string | null
  cuisine_type?: string | null
  phone?: string | null
  whatsapp?: string | null
  is_active?: boolean | null
}

export interface MealRateRow {
  id: string
  restaurant_name: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  city: string | null
  cuisine_type?: string | null
  is_active?: boolean | null
}

export interface AssignableRestaurant {
  id: string
  name: string
  city: string | null
  cuisine_type: string | null
  phone: string | null
  /** Where it came from: the directory, or Rates → Meals. */
  source: 'directory' | 'meal_rates'
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const sameKey = (name: string | null | undefined, city: string | null | undefined) => `${norm(name)}|${norm(city)}`

export function assignableRestaurants(
  contacts: readonly RestaurantContactRow[],
  mealRates: readonly MealRateRow[]
): AssignableRestaurant[] {
  const out: AssignableRestaurant[] = []
  const seen = new Set<string>()

  for (const c of contacts) {
    if (c.is_active === false) continue
    const name = c.name?.trim()
    if (!name) continue
    const key = sameKey(name, c.city)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: c.id,
      name,
      city: c.city?.trim() || null,
      cuisine_type: c.cuisine_type?.trim() || null,
      phone: c.phone?.trim() || c.whatsapp?.trim() || null,
      source: 'directory',
    })
  }

  for (const r of mealRates) {
    if (r.is_active === false) continue
    const name = (r.restaurant_name || r.supplier_name)?.trim()
    if (!name) continue
    const key = sameKey(name, r.city)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: r.supplier_id || r.id,
      name,
      city: r.city?.trim() || null,
      cuisine_type: r.cuisine_type?.trim() || null,
      phone: null,
      source: 'meal_rates',
    })
  }

  return out.sort((a, z) =>
    (a.city ?? '').localeCompare(z.city ?? '') || a.name.localeCompare(z.name)
  )
}

// ============================================
// Hotels and Nile cruises — same shape of problem
// ============================================
// The hotel and cruise pickers read RATE tables: accommodation_rates holds a
// row per room type and season, nile_cruises a row per cabin and season. The
// picker expected one named row per hotel/ship and read `name` — which neither
// table has — so it listed "undefined - Abu Simbel" twice, and 88 cruise rows
// as "undefined - <ship>" (reported 2026-10-06).
//
// Grouped to one entry per hotel per city / per ship per route. The id is the
// linked property (supplier_properties, migration 311) when there is one, else
// the group's smallest row id — STABLE either way, because conflict detection
// (two itineraries holding the same ship) compares assignments by resource id.

export interface AccommodationRateRow {
  id: string
  property_id?: string | null
  property_name?: string | null
  hotel_name?: string | null
  supplier_name?: string | null
  city?: string | null
  star_rating?: number | null
  is_active?: boolean | null
}

export interface AssignableHotel {
  id: string
  name: string
  city: string | null
  star_rating: number | null
}

export interface NileCruiseRow {
  id: string
  property_id?: string | null
  ship_name?: string | null
  route_name?: string | null
  embark_city?: string | null
  disembark_city?: string | null
  is_active?: boolean | null
}

export interface AssignableCruise {
  id: string
  name: string
  /** A known route key (luxor_aswan, aswan_luxor, round_trip) or the route as written. */
  route: string | null
}

/** Groups rows by key; per group keeps the property id, else the smallest row id. */
function stableIds<R extends { id: string; property_id?: string | null }>(rows: R[]): string {
  const prop = rows.find(r => r.property_id)?.property_id
  return prop || rows.map(r => r.id).sort()[0]
}

export function assignableHotels(rows: readonly AccommodationRateRow[]): AssignableHotel[] {
  const groups = new Map<string, { name: string; city: string | null; star: number | null; rows: AccommodationRateRow[] }>()
  for (const r of rows) {
    if (r.is_active === false) continue
    const name = (r.property_name || r.hotel_name || r.supplier_name)?.trim()
    if (!name) continue
    const city = r.city?.trim() || null
    const key = r.property_id || sameKey(name, city)
    const g = groups.get(key) ?? { name, city, star: null, rows: [] }
    g.rows.push(r)
    if (g.star == null && r.star_rating != null) g.star = r.star_rating
    groups.set(key, g)
  }
  return [...groups.values()]
    .map(g => ({ id: stableIds(g.rows), name: g.name, city: g.city, star_rating: g.star }))
    .sort((a, z) => (a.city ?? '').localeCompare(z.city ?? '') || a.name.localeCompare(z.name))
}

/** "Luxor to Aswan", "LXR-ASW", embark Luxor → disembark Aswan … → luxor_aswan. */
export function cruiseRouteKey(r: Pick<NileCruiseRow, 'route_name' | 'embark_city' | 'disembark_city'>): string | null {
  const text = norm(r.route_name)
  const from = norm(r.embark_city)
  const to = norm(r.disembark_city)
  if (/round|7\s*n|return/.test(text) || (from && from === to)) return 'round_trip'
  const lux = /luxor|lxr/, asw = /aswan|asw/
  const fromEnds = from && to ? [from, to] : null
  if (fromEnds) {
    if (lux.test(fromEnds[0]) && asw.test(fromEnds[1])) return 'luxor_aswan'
    if (asw.test(fromEnds[0]) && lux.test(fromEnds[1])) return 'aswan_luxor'
  }
  const li = text.search(lux), ai = text.search(asw)
  if (li >= 0 && ai >= 0) return li < ai ? 'luxor_aswan' : 'aswan_luxor'
  return r.route_name?.trim() || null
}

export function assignableCruises(rows: readonly NileCruiseRow[]): AssignableCruise[] {
  const groups = new Map<string, { name: string; route: string | null; rows: NileCruiseRow[] }>()
  for (const r of rows) {
    if (r.is_active === false) continue
    const name = r.ship_name?.trim()
    if (!name) continue
    const route = cruiseRouteKey(r)
    const key = `${r.property_id || norm(name)}|${norm(route)}`
    const g = groups.get(key) ?? { name, route, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  // One ship on two routes shares a property id; a dropdown needs distinct
  // values, so the second route falls back to its own smallest row id.
  const used = new Set<string>()
  return [...groups.values()]
    .sort((a, z) => a.name.localeCompare(z.name) || (a.route ?? '').localeCompare(z.route ?? ''))
    .map(g => {
      let id = stableIds(g.rows)
      if (used.has(id)) id = g.rows.map(r => r.id).sort()[0]
      used.add(id)
      return { id, name: g.name, route: g.route }
    })
}
