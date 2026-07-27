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

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

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
