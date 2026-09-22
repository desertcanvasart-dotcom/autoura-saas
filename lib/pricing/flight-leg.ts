// ============================================
// A day's flight or train leg: its own route, and airport assistance at each end
// ============================================
// A ticket leg always ran FROM the previous day's city TO this day's city (a
// sleeper: this day's → the next day's). That cannot say a CONNECTION: the
// party lands in Cairo on the international flight and flies straight on to
// Luxor the same day. It is day 1 — there is no previous city — so the Cairo →
// Luxor ticket was never asked for, and the only airport help the engine knew
// was one meet & greet at the day's city.
//
// So a day may name its leg's own route (`leg_from` / `leg_to`) and whether it
// wants assistance at each airport (`leg_assist`). Ported from the sibling
// product (travel-ops-pro #458).
//
// Pure and import-free: the engine, the days sheet and the day editor — a
// client component — all read this one file.

export interface LegAssist {
  /** Assistance at the airport the leg DEPARTS from. */
  from?: boolean
  /** Assistance at the airport the leg ARRIVES at. */
  to?: boolean
}

export const AIRPORT_CODES: Record<string, string> = {
  cairo: 'CAI',
  luxor: 'LXR',
  aswan: 'ASW',
  hurghada: 'HRG',
  'sharm el-sheikh': 'SSH',
  sharm: 'SSH',
  alexandria: 'ALY',
  'abu simbel': 'ABS',
}

/** The airport code for a city, or null when the city has no airport on file.
 *  Never Cairo for an unknown place: callers record a gap that names it. */
export function knownAirportCode(city: string | null | undefined): string | null {
  return AIRPORT_CODES[String(city ?? '').trim().toLowerCase()] ?? null
}

/** The airport a typed route end names: a city on file, or a typed
 *  three-letter code (NRT, CDG). null = no airport — a gap naming the place. */
export function routeAirportCode(place: string | null | undefined): string | null {
  const known = knownAirportCode(place)
  if (known) return known
  const typed = String(place ?? '').trim()
  return /^[A-Za-z]{3}$/.test(typed) ? typed.toUpperCase() : null
}

/** A route end as stored: trimmed, at most 80 characters, or nothing. */
export function sanitizeLegPlace(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  return s || undefined
}

/** Only real booleans survive; an empty object is nothing. */
export function sanitizeLegAssist(v: unknown): LegAssist | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const out: LegAssist = {}
  if (typeof r.from === 'boolean') out.from = r.from
  if (typeof r.to === 'boolean') out.to = r.to
  return Object.keys(out).length ? out : undefined
}

/**
 * Whether each end of a FLIGHT leg gets assistance.
 *
 * On the ARRIVAL day — the first day of the programme — a flight leg is a
 * connection: the party is met where the international flight lands (the
 * leg's origin; that IS the day's Meet & Greet) and again where the connection
 * lands. Both default ON. On any other flight day both default OFF, which is
 * what every existing programme priced. A day that says so explicitly wins.
 */
export function legAssistance(assist: LegAssist | undefined, isArrivalDay: boolean): { from: boolean; to: boolean } {
  return { from: assist?.from ?? isArrivalDay, to: assist?.to ?? isArrivalDay }
}

/** A day spent entirely IN THE AIR — the overnight flight out. Nothing is sold
 *  on it: no bed, no vehicle, no guide, no meal, no airport help. The day
 *  editor's Night option "In the air" stores it (sibling #456). */
export function isInTransit(day: unknown): boolean {
  return !!day && typeof day === 'object' && (day as { in_transit?: unknown }).in_transit === true
}

/** The arrival day: the first day ON THE GROUND — the first day not spent in
 *  the air. One function, so the day editor's assistance boxes and the engine
 *  can never disagree about which day that is. -1 when there is none. */
export function arrivalDayIndex(days: ReadonlyArray<unknown>): number {
  return days.findIndex(d => !isInTransit(d))
}

/** The last day on the ground — where a departure belongs. -1 when none. */
export function departureDayIndex(days: ReadonlyArray<unknown>): number {
  for (let i = days.length - 1; i >= 0; i--) if (!isInTransit(days[i])) return i
  return -1
}

/** The nearest day ON THE GROUND before / after index i — a day in the air is
 *  not a place the party came from or is going to. */
export function groundedNeighbour<T>(days: ReadonlyArray<T>, i: number, step: -1 | 1): T | null {
  for (let j = i + step; j >= 0 && j < days.length; j += step) if (!isInTransit(days[j])) return days[j]
  return null
}

export type LegMode = 'flight' | 'train' | 'sleeping_train'

/** The route a day's leg runs, and where each end came from — for the editor's
 *  placeholders and the engine alike. A sleeper boards tonight and wakes in
 *  the NEXT day's city; everything else left YESTERDAY's city for today's. */
export function legRoute(
  mode: LegMode,
  day: { city?: string | null; leg_from?: unknown; leg_to?: unknown },
  previous: { city?: string | null } | null | undefined,
  next: { city?: string | null } | null | undefined
): { from: string; to: string; fromStated: boolean; toStated: boolean } {
  const statedFrom = sanitizeLegPlace(day.leg_from)
  const statedTo = sanitizeLegPlace(day.leg_to)
  const from = statedFrom ?? String((mode === 'sleeping_train' ? day.city : previous?.city) ?? '').trim()
  const to = statedTo ?? String((mode === 'sleeping_train' ? next?.city : day.city) ?? '').trim()
  return { from, to, fromStated: !!statedFrom, toStated: !!statedTo }
}
