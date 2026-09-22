// ============================================
// The shape of a road move between cities, read from the days (sibling #462)
// ============================================
// The same road route costs differently ONE WAY, THERE AND BACK THE SAME DAY,
// and BACK THE NEXT DAY — and this app's agencies file them under three
// service types: intercity_dropoff, intercity_day_trip, intercity_overnight
// (939 rows on production). The engine asked for the drop-off on every city
// change, so an overnight return — out on day N, back on day N+1 — was
// charged as two one-way drop-offs, and the 72 overnight rows never priced.
//
//   - OVERNIGHT RETURN: the day after a city change comes BACK to where the
//     party left from — by road, or drives back to fly out (its leg's From).
//     Charged ONCE, on the day out, at the overnight rate; the day back is
//     listed as included.
//   - ONE WAY: any other city change by road.
//   - A SAME-DAY return cannot be said by a day yet (a day has one city, where
//     it is based); it stays a day tour in that city until the operator gives
//     days a "day trip to" field. Not derived — never a guess.
//
// Pure and import-free.

export interface RoadDay {
  city?: string | null
  transport_type?: string | null
  accommodation_type?: string | null
  in_transit?: boolean
  leg_from?: string | null
}

export type RoadShape =
  | { kind: 'one_way'; from: string; to: string }
  | { kind: 'overnight_return'; from: string; to: string }
  /** The day back of an overnight return: priced on the day out. */
  | { kind: 'return_included'; from: string; to: string; pricedOnIndex: number }

const key = (v: unknown): string => String(v ?? '').trim().toLowerCase()
const byRoad = (d: RoadDay | undefined): boolean => !!d && !d.transport_type && d.accommodation_type !== 'cruise' && !d.in_transit

/** Does `day` arrive by road from a different city than `prev`? (The
 *  engine's own intercity rule: no ticket on the day, no sleeper the night
 *  before, neither day aboard a ship, neither in the air.) */
function movesByRoad(prev: RoadDay | undefined, day: RoadDay | undefined): boolean {
  return !!prev && !!day && byRoad(day) && prev.transport_type !== 'sleeping_train' && prev.accommodation_type !== 'cruise' && !prev.in_transit &&
    !!key(prev.city) && !!key(day.city) && key(prev.city) !== key(day.city)
}

/** The shape of day i's road move, or null when the day makes none. */
export function roadShapeAt(days: readonly RoadDay[], i: number): RoadShape | null {
  const prev = days[i - 1], day = days[i], next = days[i + 1]
  if (!movesByRoad(prev, day)) return null
  const from = String(prev!.city).trim(), to = String(day.city).trim()

  // The day back of an overnight return: the day before came out from here.
  const before = days[i - 2]
  if (before && key(before.city) === key(to) && movesByRoad(before, prev) && roadShapeAt(days, i - 1)?.kind === 'overnight_return') {
    return { kind: 'return_included', from, to, pricedOnIndex: i - 1 }
  }

  // Out today, back tomorrow: by road to where we left from — or a drive back
  // to fly out from there (the flight's own From, sibling #458).
  const backByRoad = movesByRoad(day, next) && key(next!.city) === key(from)
  const backToFly = !!next && next.transport_type === 'flight' && key(next.leg_from) === key(from) && key(next.leg_from) !== key(to)
  if (backByRoad || backToFly) return { kind: 'overnight_return', from, to }

  return { kind: 'one_way', from, to }
}
