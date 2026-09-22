// ============================================
// A day's transport, as the operator sets it (sibling #454)
// ============================================
// Every day's transport is DERIVED and was never shown: an airport transfer on
// arrival, a road transfer on a city change, a day tour by the sightseeing —
// and the only sign of it was a red "No rate" line after pricing. Attractions
// can be seen and changed on the day; transport could not.
//
// `transport_lines` on the day is the operator's own list.
//   ABSENT  = the rules decide, exactly as before.
//   PRESENT (even empty) = exactly these lines and nothing derived beside
//             them — not the day's vehicle, not the dinner or local transfer,
//             not the road legs of a ticket. The list is what the editor showed
//             and the operator changed; nothing is added behind their back.
//   "Reset to automatic" removes the field.
//
// Tickets (flights, trains, sleepers) and airport ASSISTANCE are not vehicles
// and are untouched by the list.
//
// A line's service type is a key of the agency's OWN `transport_service_type`
// vocabulary — the same words Rates → Transportation is filed under. A road
// move between cities is its ROUTE (from → to); everything else is booked in a
// city. Pure and import-free: the engine, the preview route and the day
// editor — a client component — read this one file.

export interface TransportLine {
  service_type: string
  /** Where the vehicle is booked; absent = the day's city. */
  city?: string
  /** A road move between cities: its route; absent = yesterday's city → today's. */
  from?: string
  to?: string
}

export const MAX_TRANSPORT_LINES = 12

/** The service types that are a road move between two cities, keyed by route. */
export const isIntercityType = (t: string): boolean => t.startsWith('intercity')

const place = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  return s || undefined
}
const key = (v: unknown): string => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')

/** The stored list, cleaned. undefined = not set (the rules decide); [] = the
 *  operator removed every line (no transport that day). */
export function sanitizeTransportLines(input: unknown): TransportLine[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: TransportLine[] = []
  for (const raw of input.slice(0, MAX_TRANSPORT_LINES)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const type = key(r.service_type)
    if (!type) continue
    const line: TransportLine = { service_type: type }
    if (isIntercityType(type)) {
      // A road move is its route; a city on it means nothing.
      const from = place(r.from), to = place(r.to)
      if (from) line.from = from
      if (to) line.to = to
    } else {
      const city = place(r.city)
      if (city) line.city = city
    }
    out.push(line)
  }
  return out
}

/** The days sheet cell: "day_tour@Luxor; intercity_dropoff:Luxor>Aswan". An
 *  empty list is the word "none"; not set is blank. */
export function transportLinesToCell(lines: TransportLine[] | undefined): string {
  if (lines === undefined) return ''
  if (lines.length === 0) return 'none'
  return lines.map(l => isIntercityType(l.service_type)
    ? `${l.service_type}${l.from || l.to ? `:${l.from ?? ''}>${l.to ?? ''}` : ''}`
    : `${l.service_type}${l.city ? `@${l.city}` : ''}`).join('; ')
}

export function transportLinesFromCell(cell: unknown): TransportLine[] | undefined {
  const s = typeof cell === 'string' ? cell.trim() : ''
  if (!s) return undefined
  if (s.toLowerCase() === 'none') return []
  return sanitizeTransportLines(s.split(/[;|]/).map(part => {
    const p = part.trim()
    const route = p.match(/^([^:@]+):([^>]*)>(.*)$/)
    if (route) return { service_type: route[1], from: route[2], to: route[3] }
    const at = p.match(/^([^:@]+)@(.+)$/)
    if (at) return { service_type: at[1], city: at[2] }
    return { service_type: p }
  }))
}
