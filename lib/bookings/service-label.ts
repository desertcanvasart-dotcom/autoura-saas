// ============================================
// How a service line is named on screen and in messages
// ============================================
// Lines are built from itinerary services, whose names are often the rate
// sheet's codes ("day_tour sedan Cairo", "full_service CAI"). Shown to a
// supplier or a client — or the office — they read as words. And a line with
// no supplier yet has none: it never borrows the service name as a supplier
// (the 2026-10-30 click-through found "Hello day_tour," in a request).

/** "day_tour sedan Cairo" → "Day tour sedan Cairo"; plain names unchanged. */
export function humanService(name: string | null | undefined): string | null {
  const s = (name ?? '').trim()
  if (!s) return null
  if (!s.includes('_')) return s
  const spaced = s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const TYPE_WORD: Record<string, string> = {
  transport: 'Transfer', guide: 'Guide', restaurant: 'Meal', hotel: 'Hotel', cruise: 'Cruise',
  activity_provider: 'Activity', airport_staff: 'Airport assistance', hotel_staff: 'Hotel assistance',
}

/** What the line is: its description, else the kind of service. */
export function lineService(l: { service_description?: string | null; supplier_type?: string | null }): string {
  return humanService(l.service_description) ?? TYPE_WORD[(l.supplier_type ?? '').trim()] ?? humanService(l.supplier_type) ?? 'Service'
}

/** Who covers it, or null when nobody is chosen yet. */
export function lineSupplier(l: { supplier_name?: string | null }): string | null {
  const s = (l.supplier_name ?? '').trim()
  return s || null
}

/** The supplier kinds (suppliers.supplier_type / types) that can cover a line of this kind. */
export const SUPPLIER_KINDS_FOR_LINE: Record<string, readonly string[]> = {
  transport: ['transport_company', 'transport', 'driver'],
  guide: ['guide'],
  restaurant: ['restaurant'],
  hotel: ['hotel', 'hotel_management_company'],
  cruise: ['cruise', 'nile_cruise_operator'],
  activity_provider: ['activity_provider', 'attraction', 'tour_operator'],
  airport_staff: ['ground_handler', 'dmc'],
  hotel_staff: ['ground_handler', 'dmc'],
}
