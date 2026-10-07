// ============================================
// Which suppliers a service line can be booked with
// ============================================
// The itinerary editor's supplier list offered every supplier for every line:
// its filter knew supplier types by old names ('transport'), not the agency's
// own types or what they "behave as" (Settings → Your vocabulary), so a
// transport line found no match and fell through to "All Other Suppliers" —
// airlines, cruise lines and restaurants for a car. And it never looked at
// the city.
//
// Now a line asks for its KIND of supplier — as supplier-type behaviours
// (lib/vocabulary SUPPLIER_BEHAVIORS), which /api/suppliers resolves to the
// agency's own types, any of a supplier's several types — in its CITY:
// where the day is spent, or where the night is for a hotel or a ship.

/** Service type (itinerary_services.service_type) → supplier behaviours. */
const KINDS: Record<string, string[]> = {
  accommodation: ['hotel'],
  hotel: ['hotel'],
  cruise: ['cruise'],
  transportation: ['transport_company', 'driver'],
  transport: ['transport_company', 'driver'],
  // Airport meet & assist and transfers: the car, or the people at the airport.
  transfer: ['transport_company', 'driver', 'ground_handler'],
  train: ['train_operator'],
  sleeping_train: ['train_operator'],
  guide: ['guide'],
  tour_guide: ['guide'],
  meal: ['restaurant'],
  restaurant: ['restaurant'],
  entrance: ['attraction'],
  entrance_fee: ['attraction'],
  activity: ['activity_provider'],
  flight: ['airline'],
  tip: ['ground_handler', 'other'],
  tips: ['ground_handler', 'other'],
  supplies: ['ground_handler', 'other'],
  service_fee: ['ground_handler', 'other'],
  other: ['ground_handler', 'other'],
}

/** The supplier behaviours a service line is booked with; [] = no kind known. */
export function supplierBehaviorsForService(serviceType: string | null | undefined): string[] {
  return KINDS[String(serviceType ?? '').trim().toLowerCase()] ?? []
}

const NIGHT_KINDS = new Set(['accommodation', 'hotel', 'cruise'])
const ON_BOARD = /^on board\b/i

/** The city a service line's supplier should be in: the night's for a hotel
 *  or ship, the day's for everything else. Null when the day names none. */
export function supplierCityForService(
  serviceType: string | null | undefined,
  day: { city?: string | null; overnight_city?: string | null },
): string | null {
  const city = String(day.city ?? '').trim() || null
  const night = String(day.overnight_city ?? '').trim()
  if (NIGHT_KINDS.has(String(serviceType ?? '').trim().toLowerCase()) && night && !ON_BOARD.test(night)) return night
  return city
}

export interface SupplierOption {
  id: string
  name: string
  city: string | null
}

/** The list in two groups: in the city first, then the same kind elsewhere. */
export function groupSuppliersByCity(
  inCity: readonly SupplierOption[],
  ofKind: readonly SupplierOption[],
): { inCity: SupplierOption[]; otherCities: SupplierOption[] } {
  const byName = (a: SupplierOption, b: SupplierOption) => a.name.localeCompare(b.name)
  const here = new Set(inCity.map(s => s.id))
  return {
    inCity: [...inCity].sort(byName),
    otherCities: ofKind
      .filter(s => !here.has(s.id))
      .sort((a, b) => (a.city ?? '￿').localeCompare(b.city ?? '￿') || byName(a, b)),
  }
}
