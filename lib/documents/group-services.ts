// ============================================
// Supplier documents from an itinerary — one per kind of service, per place
// ============================================
// "Generate documents" on an itinerary writes the vouchers and orders sent to
// suppliers. A service with a supplier on it is grouped with that supplier's
// other services, as before. Everything else is grouped here, the way the
// operations tasks are (lib/tasks/itinerary-tasks): by WHAT it is and WHERE
// the party is based, so a four-day Cairo trip gets one transport voucher, one
// hotel voucher, one entrance-fee order — not one per day.
//
// It used to key on each day's own city, so (live ITN-S-2026-8987):
//   - a day in Giza and a day in Cairo were two Transportation vouchers;
//   - the Alexandria day trip from the Cairo hotel had its own "Alexandria"
//     transport voucher — and its Cairo hotel night an "Alexandria Hotel"
//     voucher, split from the other Cairo nights;
// and regenerating made every one of them again (the duplicate check built
// its key differently from the group's).
//
// WHERE a service belongs:
//   - a night (hotel, cruise) — where the bed is: the day's overnight city;
//   - transport and the guide — where the party is based that day: the
//     overnight city as well, so a day trip's vehicle and guide go with the
//     stay they leave from (the agency's Cairo driver drives to Alexandria);
//   - meals and entrance fees — where they are consumed: the day's own city
//     (the Alexandria restaurant, the Alexandria sites).
// Cities a short drive apart (Giza and Cairo, ~10 km) are one place: the
// first named on the trip names the group (lib/pricing/day-trip).
//
// Entrance fees name their sites. The AI builder writes a day's fees as ONE
// line, "Entrance Fees (non-EUR)", with the sites only in its notes — and the
// PDF never printed notes, so no document said which sites were booked.
//
// Pure: the route and the tests share it.

import { citiesFarApart } from '@/lib/pricing/day-trip'
import { resolveCityCoordinates } from '@/lib/constants/egypt-city-coordinates'

export type DocCategory = 'meals' | 'entrance' | 'assistance'

export interface ServiceMapping {
  docType: string | null
  category?: DocCategory
}

/** Service type → the document it goes on; docType null = no document. */
export const SERVICE_TO_DOC_TYPE: Record<string, ServiceMapping> = {
  transportation: { docType: 'transport_voucher' },
  transport: { docType: 'transport_voucher' },
  transfer: { docType: 'transport_voucher' },
  guide: { docType: 'guide_assignment' },
  meal: { docType: 'service_order', category: 'meals' },
  lunch: { docType: 'service_order', category: 'meals' },
  dinner: { docType: 'service_order', category: 'meals' },
  breakfast: { docType: 'service_order', category: 'meals' },
  entrance: { docType: 'service_order', category: 'entrance' },
  // What the Pricing Grid saves. Unlisted, every grid-priced trip's entrance
  // fees were skipped silently (live ITN-S-2026-6386: 5 fees, no order).
  entrance_fee: { docType: 'service_order', category: 'entrance' },
  activity: { docType: 'service_order', category: 'entrance' },
  tour: { docType: 'service_order', category: 'entrance' },
  excursion: { docType: 'service_order', category: 'entrance' },
  accommodation: { docType: 'hotel_voucher' },
  hotel: { docType: 'hotel_voucher' },
  cruise: { docType: 'cruise_voucher' },
  // Meet & assist at the airport and the hotel: the representative's own
  // order, not the driver's voucher (what the AI builder writes).
  airport_service: { docType: 'service_order', category: 'assistance' },
  hotel_service: { docType: 'service_order', category: 'assistance' },
  // No document: tips, water, supplies, a flight (ticketed by the airline).
  tips: { docType: null },
  tip: { docType: null },
  flight: { docType: null },
  other: { docType: null },
  supplies: { docType: null },
  water: { docType: null },
  service_fee: { docType: null },
}

const GRID_ASSISTANCE = /^\[pricing-grid:(airport_services|hotel_services)\]/

/** What a service line goes on; undefined / docType null = no document. */
export function docMappingFor(service: { service_type?: string | null; description?: string | null }): ServiceMapping | undefined {
  // The grid saves a cruise as 'accommodation' (its slot tag says cruise) —
  // that is a cruise voucher, not a hotel voucher.
  const description = String(service.description ?? '')
  if (description.startsWith('[pricing-grid:cruise]')) return SERVICE_TO_DOC_TYPE.cruise
  // The grid saves its airport services as 'transfer' and its hotel services
  // (check-in / check-out assist, porters) as 'other'. Typed by the type alone,
  // the airport meet & assist went on the driver's transport voucher and the
  // hotel assist on no document (live ITN-S-2026-8987). Both are the meet &
  // assist representative's.
  if (GRID_ASSISTANCE.test(description)) return SERVICE_TO_DOC_TYPE.airport_service
  return service.service_type ? SERVICE_TO_DOC_TYPE[service.service_type] : undefined
}

const clean = (s: unknown): string => String(s ?? '').trim()
const ON_BOARD = /^on board\b/i

/**
 * The city a service belongs to, by what it is: a night, transport and the
 * guide go where the party is based (the overnight city); meals and sites
 * where they are.
 */
export function serviceCity(
  mapping: ServiceMapping,
  day: { city?: string | null; overnight_city?: string | null },
  fallback = 'Cairo',
): string {
  const city = clean(day.city)
  const night = clean(day.overnight_city)
  const based = night && !ON_BOARD.test(night) ? night : ''
  if (mapping.category) return city || based || fallback
  return based || city || fallback
}

/** Folds cities a short drive apart into one: the first one seen names it. */
export class PlaceNames {
  private seen: string[] = []
  name(city: string): string {
    const c = clean(city)
    const same = this.seen.find(s => s.toLowerCase() === c.toLowerCase())
    if (same) return same
    const near = this.seen.find(s => onFile(s) && onFile(c) && !citiesFarApart(s, c))
    if (near) return near
    this.seen.push(c)
    return c
  }
}

// A city with no coordinates is only ever itself: citiesFarApart says "not
// far" for an unknown city, which must not fold every unknown place into the
// first one.
const onFile = (city: string): boolean => !!resolveCityCoordinates(city)

const GENERIC_ENTRANCE = /^entrance fees?\b/i

/**
 * The name an entrance line goes out under: its own when it names a site;
 * the sites from its notes ("Sites: …", "Inside: … | Photo stops: …") or the
 * day's attractions when it is the generic "Entrance Fees" line.
 */
export function entranceLineName(
  service: { service_name?: string | null; notes?: string | null },
  dayAttractions: readonly unknown[] | null | undefined,
): string {
  const name = clean(service.service_name)
  if (name && !GENERIC_ENTRANCE.test(name)) return name
  const notes = clean(service.notes)
  const fromNotes = notes.match(/(?:Sites|Inside):\s*([^|]+)/i)?.[1]?.trim()
  const sites = fromNotes || (dayAttractions ?? []).map(a => clean(a)).filter(Boolean).join(', ')
  if (!sites) return name || 'Entrance Fees'
  return `${name || 'Entrance Fees'} — ${sites}`
}

/** The key of a document with no supplier: what it is, and its title (which
 *  names the place and the kind). Also how an existing one is recognised. */
export const unassignedDocKey = (docType: string, supplierName: string): string =>
  `${docType}|${supplierName.trim().toLowerCase()}`

/** "Generate" may be asked for some document types only. The button sent
 *  `documentTypes` while the route read `document_types`, so asking for hotel
 *  vouchers made every kind. Either name is accepted. */
export function requestedDocTypes(body: unknown): string[] | null {
  const b = (body ?? {}) as Record<string, unknown>
  const list = b.document_types ?? b.documentTypes
  return Array.isArray(list) && list.length > 0 ? list.map(String) : null
}
