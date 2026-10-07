// ============================================
// The hotel or ship a day's night is spent at, read off its services
// ============================================
// An itinerary day stores only its overnight CITY, so the itinerary page, the
// PDF and the client's share page all said "Overnight in Cairo" and never
// named the hotel. The property is on the day's accommodation (or cruise)
// service line, in whichever shape the path that created it uses:
//
//   AI generator  → supplier_name = the property, "<hotel> (2 persons)",
//                   "<ship> - Full Board (…)"
//   pricing grid  → no supplier_name; description "[pricing-grid:accommodation]"
//                   or "[pricing-grid:cruise]", service_name = the rate option
//                   ("<hotel> <city> (standard | BB)", "<ship> (3N, cabin)")
//   engine line   → "Hotel - Steigenberger Nile Palace (Cairo)",
//                   "Nile Cruise - Al Farida (3 nights)"
//
// A placeholder that names no property ("Hotel (Cairo)") claims nothing.
// Supplement and guide-bed lines share the service type but are not the night.
//
// Ported from the sibling app (travel-ops-pro #455).

export interface OvernightProperty {
  name: string
  kind: 'hotel' | 'cruise'
}

export type ServiceLike = {
  service_type?: string | null
  service_name?: string | null
  supplier_name?: string | null
  description?: string | null
}

/** The grid tags its lines "[pricing-grid:<slot>] …" — its night slots. */
const GRID_NIGHT = /^\[pricing-grid:(accommodation|cruise)\]/

const NOT_THE_NIGHT = /^(hotel supplement|cruise supplement|throughout guide|guide bed|guide cabin|single supplement|triple reduction)\b/i

/** The property named by one service line, or null. */
export function propertyFromService(s: ServiceLike): OvernightProperty | null {
  const type = String(s.service_type ?? '').toLowerCase()
  const grid = String(s.description ?? '').match(GRID_NIGHT)
  // The grid saves a cruise as service_type 'accommodation'; its tag says which.
  const kind = grid ? (grid[1] === 'cruise' ? 'cruise' : 'hotel')
    : type === 'accommodation' || type === 'hotel' ? 'hotel' : type === 'cruise' ? 'cruise' : null
  if (!kind) return null

  const name = String(s.service_name ?? '').trim()
  if (NOT_THE_NIGHT.test(name)) return null

  const supplier = String(s.supplier_name ?? '').trim()
  if (supplier) return { name: supplier, kind }

  // A grid line: the rate option's name, without its "(tier | board)" /
  // "(3N, cabin)" detail.
  if (grid) {
    const option = name.replace(/\s*\([^()]*\)\s*$/, '').trim()
    return option ? { name: option, kind } : null
  }

  // "Hotel - <name> (Cairo)" / "Nile Cruise - <ship> (3 nights)"
  const engine = name.match(/^(?:Hotel|Nile Cruise|Cruise)\s+-\s+(.+?)\s*\([^()]*\)\s*$/i)
  if (engine) return { name: engine[1].trim(), kind }
  const fullBoard = name.match(/^(.+?)\s+-\s+Full Board\b/i)
  if (fullBoard) return { name: fullBoard[1].trim(), kind }
  const persons = name.match(/^(.+?)\s*\(\d+\s+persons?\)\s*$/i)
  if (persons) return { name: persons[1].trim(), kind }
  return null
}

/** The property a day's night is spent at, or null when its lines name none. */
export function overnightProperty(services: readonly ServiceLike[] | null | undefined): OvernightProperty | null {
  for (const s of services ?? []) {
    const found = propertyFromService(s)
    if (found) return found
  }
  return null
}

/** "Steigenberger Nile Palace, Cairo" — or whichever of the two is known. */
export function overnightLabel(property: OvernightProperty | null, city: string | null | undefined): string {
  const c = String(city ?? '').trim()
  if (!property) return c
  return c && property.kind === 'hotel' && !property.name.toLowerCase().includes(c.toLowerCase())
    ? `${property.name}, ${c}`
    : property.name
}

// ── Is the named property still in the rates? (sibling #456) ────────────────
// An itinerary keeps the lines it was sold with, so a hotel deleted from Rates
// later — or switched off — still names the night, and nothing said so. Staff
// see a warning on the itinerary page; the client never does (the share page
// and the PDFs do not carry the status).

export type PropertyRateStatus = 'on_file' | 'switched_off' | 'not_on_file'

/** Names compare ignoring case, spacing and the edges: a rate row stored as
 *  "Kempinski Nile Hotel " (trailing space) is the same hotel. */
export const propertyKey = (name: string | null | undefined): string =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

export interface RatesCatalog {
  /** id and city are optional: with them, a line pinned to its rate row is
   *  judged by that row, and "<hotel> <city>" names still find the hotel. */
  hotels: ReadonlyArray<{ name: unknown; active: unknown; id?: unknown; city?: unknown }>
  ships: ReadonlyArray<{ name: unknown; active: unknown; id?: unknown; city?: unknown }>
}

/** The rate row a line was priced from (migration 353), when it says. */
export interface RatePin {
  rate_table?: string | null
  rate_id?: string | null
}

/** Separators a line's name carries around the hotel — "Marriott Mena House
 *  | Cairo", "Hotel - X, Luxor" — read as spaces, so only the words compare. */
const looseKey = (name: string | null | undefined): string =>
  propertyKey(String(name ?? '').replace(/[|,;/()\[\]–—-]+/g, ' '))

/**
 * Is the night's hotel or ship still in the rates?
 *
 *   1. A line pinned to its rate row (the Pricing Grid saves rate_table and
 *      rate_id) is judged by THAT row: there and on, switched off, or gone.
 *      Its name is never re-read — so a name that drifts from the rate's
 *      ("Marriott Mena House | Cairo" for "Marriott Mena House") can no longer
 *      read as "removed after this trip was priced".
 *   2. Otherwise by name, loosely: case, spacing and separators aside, and
 *      "<hotel> <city>" counts as <hotel> in that city.
 */
export function propertyRateStatus(property: OvernightProperty, catalog: RatesCatalog, pin?: RatePin | null): PropertyRateStatus {
  const rows = property.kind === 'cruise' ? catalog.ships : catalog.hotels
  const table = property.kind === 'cruise' ? 'nile_cruises' : 'accommodation_rates'
  if (pin?.rate_id && pin.rate_table === table && rows.some(r => r.id !== undefined)) {
    const row = rows.find(r => String(r.id) === pin.rate_id)
    if (!row) return 'not_on_file'
    return row.active !== false ? 'on_file' : 'switched_off'
  }
  const key = looseKey(property.name)
  const matches = rows.filter(r => {
    const name = looseKey(String(r.name ?? ''))
    if (!name) return false
    if (name === key) return true
    const city = looseKey(String(r.city ?? ''))
    return !!city && (key === `${name} ${city}` || key === `${city} ${name}`)
  })
  if (matches.length === 0) return 'not_on_file'
  return matches.some(r => r.active !== false) ? 'on_file' : 'switched_off'
}
