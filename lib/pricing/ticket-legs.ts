// ============================================
// Ticket legs — flights, day trains, sleeping trains (B-item 2)
// ============================================
// Itinerary days carried no travel mode, so every city change priced as a
// road vehicle and the ticket catalogues were never read. A day may now
// carry `transport_type` ('flight' | 'train' | 'sleeping_train'; absent =
// road, exactly as before) and `transport_rate_id` — the EXACT ticket row
// when several serve a route.
//
// The selection rule, everywhere: a NAMED row wins; else exactly one
// active match auto-resolves; else a HOLE listing the candidates by name
// ("pick the exact train on the day") — never a guess. A named-but-
// deleted row is its own hole.

export type TicketMode = 'flight' | 'train' | 'sleeping_train'

export interface TicketLegDay {
  day: number
  city: string
  transport_type?: TicketMode
  transport_rate_id?: string
}

export interface TicketLeg {
  mode: TicketMode
  from: string
  to: string
  dayNumber: number
  namedRateId?: string
}

// Cairo ↔ Giza are one STATION city: the sleeper "to Giza" serves Cairo.
// Used by the engine AND the picker, so the two can never disagree.
export const STATION_CITY_ALIASES: Record<string, string> = {
  giza: 'cairo',
}

export function normalizeStationCity(city: string | null | undefined): string {
  const c = (city || '').trim().toLowerCase()
  return STATION_CITY_ALIASES[c] || c
}

/**
 * Collect the ticket legs an itinerary implies.
 *
 * - flight / day train: only on an actual city change — the leg runs from
 *   the PREVIOUS day's city to this day's city. A marked day without a
 *   city change is not a leg (nothing to ride).
 * - sleeping train: board tonight, wake there — the leg runs from THIS
 *   day's city to the NEXT day's city.
 * - An unmarked city change stays a road transfer, exactly as before.
 */
export function collectTicketLegs(days: TicketLegDay[]): TicketLeg[] {
  const legs: TicketLeg[] = []
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    if (!day.transport_type) continue
    if (day.transport_type === 'sleeping_train') {
      const next = days[i + 1]
      if (!next) continue
      if (normalizeStationCity(day.city) === normalizeStationCity(next.city)) continue
      legs.push({
        mode: 'sleeping_train',
        from: day.city,
        to: next.city,
        dayNumber: day.day,
        namedRateId: day.transport_rate_id,
      })
      continue
    }
    const prev = days[i - 1]
    if (!prev) continue
    if (normalizeStationCity(prev.city) === normalizeStationCity(day.city)) continue
    legs.push({
      mode: day.transport_type,
      from: prev.city,
      to: day.city,
      dayNumber: day.day,
      namedRateId: day.transport_rate_id,
    })
  }
  return legs
}

/** Does a catalogue row serve this leg's route (station-alias-aware)? */
export function rowServesRoute(
  row: { origin_city?: string | null; destination_city?: string | null; route_from?: string | null; route_to?: string | null },
  leg: { from: string; to: string }
): boolean {
  const from = normalizeStationCity(row.origin_city ?? row.route_from)
  const to = normalizeStationCity(row.destination_city ?? row.route_to)
  return from === normalizeStationCity(leg.from) && to === normalizeStationCity(leg.to)
}

export type TicketSelection<T> =
  | { kind: 'row'; row: T }
  | { kind: 'named_missing'; namedId: string }
  | { kind: 'no_rate' }
  | { kind: 'ambiguous'; candidates: string[] }

/**
 * Pick THE row for a leg. Named row wins; exactly one candidate
 * auto-resolves; anything else is a hole shape the caller names.
 */
export function selectTicketRow<T extends { id: string }>(
  candidates: T[],
  namedRateId: string | undefined,
  labelOf: (row: T) => string
): TicketSelection<T> {
  if (namedRateId) {
    const named = candidates.find(r => r.id === namedRateId)
    // A named-but-gone row is ITS OWN hole — the operator picked something
    // that no longer exists; re-pick, never silently fall back.
    return named ? { kind: 'row', row: named } : { kind: 'named_missing', namedId: namedRateId }
  }
  if (candidates.length === 0) return { kind: 'no_rate' }
  if (candidates.length === 1) return { kind: 'row', row: candidates[0] }
  return { kind: 'ambiguous', candidates: candidates.map(labelOf) }
}

// ── Sleeping trains: the ticket IS the bed ─────────────────────────────
// One TRAIN is its cabin-row PAIR (a shared/half-twin cabin row and a
// single cabin row) sharing route, operator/supplier and validity.
// Everyone prices at the half-twin rate per person; the night joins the
// rooming list as { ppd: halfTwin, singleSupp: single − halfTwin } so a
// solo traveller automatically pays the single-cabin gap.

export interface SleeperCabinRow {
  id: string
  cabin_type: string
  rate_oneway_eur: number | null
  guide_rate?: number | null
  origin_city: string
  destination_city: string
  operator_name?: string | null
  supplier_id?: string | null
  rate_valid_from?: string | null
  rate_valid_to?: string | null
}

export interface SleeperTrain {
  key: string
  label: string
  halfTwin?: SleeperCabinRow
  single?: SleeperCabinRow
  rows: SleeperCabinRow[]
}

export function isSingleCabin(cabinType: string | null | undefined): boolean {
  return /single/i.test(cabinType || '')
}

export function groupSleeperTrains(rows: SleeperCabinRow[]): SleeperTrain[] {
  const byKey = new Map<string, SleeperTrain>()
  for (const row of rows) {
    const key = [
      normalizeStationCity(row.origin_city),
      normalizeStationCity(row.destination_city),
      (row.operator_name || '').trim().toLowerCase(),
      row.supplier_id || '',
      row.rate_valid_from || '',
      row.rate_valid_to || '',
    ].join('|')
    let train = byKey.get(key)
    if (!train) {
      train = {
        key,
        label: row.operator_name?.trim() || `${row.origin_city} → ${row.destination_city}`,
        rows: [],
      }
      byKey.set(key, train)
    }
    train.rows.push(row)
    if (isSingleCabin(row.cabin_type)) {
      if (!train.single) train.single = row
    } else if (!train.halfTwin) {
      train.halfTwin = row
    }
  }
  return [...byKey.values()]
}

/** The train a named cabin row belongs to, if any. */
export function trainForNamedRow(trains: SleeperTrain[], namedRateId: string): SleeperTrain | null {
  return trains.find(t => t.rows.some(r => r.id === namedRateId)) ?? null
}
