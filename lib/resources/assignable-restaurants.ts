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
