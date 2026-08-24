// ============================================
// SHAREABLE ITINERARY LINKS
// ============================================
// The traveller gets a URL instead of (only) a PDF: one branded page that
// always shows the current itinerary. Two invariants live in this file:
//
// 1. TOKENS ARE UNGUESSABLE. 192 bits of crypto randomness, base64url. The
//    public page resolves them through the service role, so revocation cannot
//    be bypassed and the share table itself is never browser-queryable.
//
// 2. THE CLIENT VIEW IS AN ALLOWLIST. toClientItinerary() copies named fields
//    only — it never spreads. Whatever internal columns the queries happen to
//    return (supplier_cost, profit, margin_percent, internal notes, ids), the
//    page receives none of them. A blocklist would silently leak every column
//    added later; an allowlist fails closed. Tests feed it a row containing
//    the whole cost base and assert none of it survives.

export interface ClientItinerary {
  tripName: string
  code: string
  startDate: string | null
  endDate: string | null
  totalDays: number | null
  numAdults: number
  numChildren: number
  currency: string | null
  /** The CLIENT price. This is the one number money-related field shown. */
  totalPrice: number | null
  tier: string | null
  days: ClientDay[]
}

export interface ClientDay {
  dayNumber: number
  date: string | null
  title: string | null
  description: string | null
  city: string | null
  overnightCity: string | null
  attractions: string[]
  lunchIncluded: boolean
  dinnerIncluded: boolean
  hotelIncluded: boolean
  hotelName: string | null
  isArrival: boolean
  isDeparture: boolean
  isFreeDay: boolean
  isCruiseDay: boolean
  flightFrom: string | null
  flightTo: string | null
}

/** 24 crypto-random bytes as base64url — 192 bits, URL-safe, no padding. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Tokens we mint are 32 chars of base64url; reject anything else up front. */
export function isValidShareToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
}

export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/**
 * The traveller-facing projection. Named copies only — see the header.
 * `notes` is deliberately absent: it holds the operator's special-request
 * scratchpad, which is internal even when it started as the client's words.
 */
export function toClientItinerary(
  itinerary: Record<string, unknown>,
  days: Array<Record<string, unknown>>
): ClientItinerary {
  return {
    tripName: str(itinerary.trip_name) ?? 'Your trip',
    code: str(itinerary.itinerary_code) ?? '',
    startDate: str(itinerary.start_date),
    endDate: str(itinerary.end_date),
    totalDays: num(itinerary.total_days),
    numAdults: num(itinerary.num_adults) ?? 0,
    numChildren: num(itinerary.num_children) ?? 0,
    currency: str(itinerary.currency),
    totalPrice: num(itinerary.total_cost),
    tier: str(itinerary.tier),
    days: (days ?? [])
      .slice()
      .sort((a, b) => (num(a.day_number) ?? 0) - (num(b.day_number) ?? 0))
      .map((d) => ({
        dayNumber: num(d.day_number) ?? 0,
        date: str(d.date),
        title: str(d.title),
        description: str(d.description),
        city: str(d.city),
        overnightCity: str(d.overnight_city),
        attractions: Array.isArray(d.attractions)
          ? d.attractions.filter((a): a is string => typeof a === 'string')
          : [],
        lunchIncluded: d.lunch_included === true,
        dinnerIncluded: d.dinner_included === true,
        hotelIncluded: d.hotel_included === true,
        hotelName: str(d.hotel_name),
        isArrival: d.is_arrival === true,
        isDeparture: d.is_departure === true,
        isFreeDay: d.is_free_day === true,
        isCruiseDay: d.is_cruise_day === true,
        flightFrom: str(d.flight_from),
        flightTo: str(d.flight_to),
      })),
  }
}

// ============================================
// THE TRAVELLER'S TEAM — execution layer, phase 0
// ============================================
// Who is actually with you: confirmed assignments from itinerary_resources,
// joined to the people tables for a name, a face and a WhatsApp button.
//
// Same allowlist discipline as toClientItinerary, and the stakes are higher
// here: the source rows carry the operator's COST BASE (cost_eur on the
// assignment, daily_rate/hourly_rate on guides), internal notes, and staff
// EMERGENCY CONTACTS. None of that has any business on a traveller's phone.
// Named copies only; the tests feed a fully poisoned row and assert nothing
// survives but the allowlist.

export type ClientTeamMemberType =
  | 'guide' | 'vehicle' | 'hotel' | 'restaurant'
  | 'cruise' | 'airport_staff' | 'hotel_staff'

export interface ClientTeamMember {
  type: ClientTeamMemberType
  name: string
  /** Vehicles only: the human behind the wheel. */
  driverName: string | null
  phone: string | null
  whatsapp: string | null
  photoUrl: string | null
  startDate: string | null
  endDate: string | null
}

const TEAM_TYPES: ClientTeamMemberType[] = [
  'guide', 'vehicle', 'hotel', 'restaurant', 'cruise', 'airport_staff', 'hotel_staff',
]

export interface TeamContactRows {
  guides?: Array<Record<string, unknown>>
  airportStaff?: Array<Record<string, unknown>>
  hotelStaff?: Array<Record<string, unknown>>
  vehicles?: Array<Record<string, unknown>>
}

/**
 * Assemble the traveller-facing team from CONFIRMED assignment rows plus the
 * matching contact rows. Callers must pass only status='confirmed' resources —
 * a pending assignment is an internal plan, not a promise to the customer.
 */
export function toClientTeam(
  resources: Array<Record<string, unknown>>,
  contacts: TeamContactRows
): ClientTeamMember[] {
  const byId = (rows?: Array<Record<string, unknown>>) => {
    const m = new Map<string, Record<string, unknown>>()
    for (const r of rows ?? []) if (typeof r.id === 'string') m.set(r.id, r)
    return m
  }
  const guides = byId(contacts.guides)
  const airport = byId(contacts.airportStaff)
  const hotelStaff = byId(contacts.hotelStaff)
  const vehicles = byId(contacts.vehicles)

  const out: ClientTeamMember[] = []
  for (const r of resources ?? []) {
    const type = TEAM_TYPES.includes(r.resource_type as ClientTeamMemberType)
      ? (r.resource_type as ClientTeamMemberType)
      : null
    if (!type) continue

    const rid = typeof r.resource_id === 'string' ? r.resource_id : ''
    let name = str(r.resource_name) ?? ''
    let driverName: string | null = null
    let phone: string | null = null
    let whatsapp: string | null = null
    let photoUrl: string | null = null

    if (type === 'guide') {
      const g = guides.get(rid)
      if (g) {
        name = str(g.name) ?? str(g.full_name) ?? name
        phone = str(g.phone)
        whatsapp = str(g.whatsapp)
        photoUrl = str(g.profile_photo_url)
      }
    } else if (type === 'airport_staff') {
      const a = airport.get(rid)
      if (a) { name = str(a.name) ?? name; phone = str(a.phone); whatsapp = str(a.whatsapp) }
    } else if (type === 'hotel_staff') {
      const h = hotelStaff.get(rid)
      if (h) { name = str(h.name) ?? name; phone = str(h.phone); whatsapp = str(h.whatsapp) }
    } else if (type === 'vehicle') {
      const v = vehicles.get(rid)
      if (v) {
        name = str(v.name) ?? str(v.vehicle_type) ?? name
        driverName = str(v.default_driver_name)
        phone = str(v.default_driver_phone)
        photoUrl = str(v.photo_url)
      }
    }
    // hotel / restaurant / cruise: the assignment name and dates are the story.

    if (!name) continue
    out.push({
      type, name, driverName, phone, whatsapp, photoUrl,
      startDate: str(r.start_date), endDate: str(r.end_date),
    })
  }

  return out.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
}

// ============================================
// LIVE TRIP EVENTS — execution layer
// ============================================
// The traveller's view of checkpoints: "Your driver — en route, 08:47".
// Same allowlist as everything on the share page. The source rows carry an
// INTERNAL note field and a free-text actor name; neither crosses. lat/lng DO
// cross — the checkpoint pin is the feature — but they are captured at
// tap-time only, staff-side; the customer is never tracked.

export type ClientTripEventKind =
  | 'departed' | 'en_route' | 'arrived' | 'picked_up' | 'dropped_off'
  | 'checked_in' | 'checked_out' | 'completed' | 'delayed'

export interface ClientTripEvent {
  kind: ClientTripEventKind
  occurredAt: string
  /** The assignment the event concerns, by its customer-visible name. */
  teamMemberName: string | null
  lat: number | null
  lng: number | null
}

const CLIENT_EVENT_KINDS: ClientTripEventKind[] = [
  'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
  'checked_in', 'checked_out', 'completed', 'delayed',
]

/**
 * Traveller-facing projection of trip_events rows. 'note' kind is dropped
 * entirely — internal annotations are not a customer timeline entry — and the
 * note/actor fields never cross regardless of kind.
 */
export function toClientTripEvents(
  events: Array<Record<string, unknown>>,
  resources: Array<Record<string, unknown>>
): ClientTripEvent[] {
  const nameByResourceId = new Map<string, string>()
  for (const r of resources ?? []) {
    if (typeof r.id === 'string' && typeof r.resource_name === 'string') {
      nameByResourceId.set(r.id, r.resource_name)
    }
  }

  const out: ClientTripEvent[] = []
  for (const e of events ?? []) {
    const kind = CLIENT_EVENT_KINDS.includes(e.event_kind as ClientTripEventKind)
      ? (e.event_kind as ClientTripEventKind)
      : null
    const occurredAt = str(e.occurred_at)
    if (!kind || !occurredAt) continue
    out.push({
      kind,
      occurredAt,
      teamMemberName:
        typeof e.itinerary_resource_id === 'string'
          ? nameByResourceId.get(e.itinerary_resource_id) ?? null
          : null,
      lat: num(e.lat),
      lng: num(e.lng),
    })
  }
  // Newest first — the traveller cares about now.
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}
