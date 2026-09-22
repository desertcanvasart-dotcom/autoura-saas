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
//   pricing grid  → supplier_name = the property
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
}

const NOT_THE_NIGHT = /^(hotel supplement|cruise supplement|throughout guide|guide bed|guide cabin|single supplement|triple reduction)\b/i

/** The property named by one service line, or null. */
export function propertyFromService(s: ServiceLike): OvernightProperty | null {
  const type = String(s.service_type ?? '').toLowerCase()
  const kind = type === 'accommodation' || type === 'hotel' ? 'hotel' : type === 'cruise' ? 'cruise' : null
  if (!kind) return null

  const name = String(s.service_name ?? '').trim()
  if (NOT_THE_NIGHT.test(name)) return null

  const supplier = String(s.supplier_name ?? '').trim()
  if (supplier) return { name: supplier, kind }

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
  hotels: ReadonlyArray<{ name: unknown; active: unknown }>
  ships: ReadonlyArray<{ name: unknown; active: unknown }>
}

export function propertyRateStatus(property: OvernightProperty, catalog: RatesCatalog): PropertyRateStatus {
  const key = propertyKey(property.name)
  const rows = (property.kind === 'cruise' ? catalog.ships : catalog.hotels).filter(r => propertyKey(String(r.name ?? '')) === key)
  if (rows.length === 0) return 'not_on_file'
  return rows.some(r => r.active !== false) ? 'on_file' : 'switched_off'
}
