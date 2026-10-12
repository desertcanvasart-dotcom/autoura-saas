// ============================================
// Day-tour and multi-day transport packages: which days a package covers
// ============================================
// Tours → Transport Packages offers four kinds. The two cruise kinds were
// priced; Day Tour and Multi-Day were stored and read by nothing. They are
// the road counterpart of the cruise sightseeing package (cruise-package.ts):
// one vehicle price for a stretch of the programme, used instead of the
// per-day rates for the days it covers.
//
//   - a package is a route over a number of DAYS: it starts in its origin city
//     and ends in its destination (blank destination = back in the origin);
//   - a Day Tour package covers ONE day that has sightseeing, in the origin
//     city — or, for a day trip, staying in the origin and touring the
//     destination (lib/pricing/day-trip) — the vehicle for that day's touring;
//   - a Multi-Day package covers that many CONSECUTIVE road days: the first
//     in the origin or leaving it (the day before was there), the last in the
//     destination;
//   - only road days count: a cruise night, a day in the air, a flight or
//     train day, or a day the operator gave its own transport list breaks the
//     stretch; a day already covered (by a sailing's package) is not taken;
//   - two packages fitting the same days is a choice the engine does not
//     make: reported, and those days keep their per-day rates.
//
// Longer stretches are placed first, then left to right, never overlapping.
// Pure and import-free.

export interface RoadPackageDay {
  day: number
  /** Where the party is staying (a day trip's base). */
  city?: string | null
  /** A day trip's destination: toured and back the same day. */
  day_trip_to?: string | null
  accommodation_type?: string | null
  transport_type?: string | null
  transport_lines?: unknown
  in_transit?: boolean
}

export interface RoadPackage {
  package_type?: string | null
  origin_city?: string | null
  destination_city?: string | null
  duration_days?: number | null
}

export interface RoadPackageCoverage<P> {
  /** Each package placed, with the day numbers it covers (in order). */
  covered: Array<{ pkg: P; days: number[] }>
  /** Stretches more than one package fits: left to the per-day rates. */
  ambiguous: Array<{ days: number[]; count: number }>
}

const norm = (c: unknown) => String(c ?? '').trim().toLowerCase()

function isRoadDay(d: RoadPackageDay): boolean {
  return d.accommodation_type !== 'cruise' &&
    d.accommodation_type !== 'in_the_air' &&
    !d.in_transit &&
    (!d.transport_type || d.transport_type === 'road') &&
    d.transport_lines == null
}

/** How many days a package spans: a Day Tour is one day whatever it says. */
export function roadPackageLength(pkg: RoadPackage): number {
  if (pkg.package_type === 'day_tour') return 1
  const n = Number(pkg.duration_days)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export function roadPackageCoverage<P extends RoadPackage>(
  days: readonly RoadPackageDay[],
  packages: readonly P[],
  opts: { taken?: ReadonlySet<number>; sightseeingDays?: ReadonlySet<number> } = {},
): RoadPackageCoverage<P> {
  const taken = new Set(opts.taken ?? [])
  const usable = days.map(d => isRoadDay(d) && !taken.has(d.day))

  // Every stretch each package fits, keyed by the days it would cover.
  const fits = new Map<string, { start: number; length: number; pkgs: P[] }>()
  for (const pkg of packages) {
    if (pkg.package_type !== 'day_tour' && pkg.package_type !== 'multi_day') continue
    const origin = norm(pkg.origin_city)
    if (!origin) continue
    const destination = norm(pkg.destination_city) || origin
    const length = roadPackageLength(pkg)
    for (let i = 0; i + length <= days.length; i++) {
      if (!usable.slice(i, i + length).every(Boolean)) continue
      const first = days[i], last = days[i + length - 1]
      // Consecutive day numbers only: a gap in the programme is not a stretch.
      if (last.day - first.day !== length - 1) continue
      if (length === 1) {
        // One day: staying in the origin, touring the destination (the same
        // city unless it is a day trip).
        if (norm(first.city) !== origin) continue
        if ((norm(first.day_trip_to) || norm(first.city)) !== destination) continue
      } else {
        const before = i > 0 ? days[i - 1] : null
        const startsIn = norm(first.city) === origin || (before != null && norm(before.city) === origin)
        if (!startsIn || norm(last.city) !== destination) continue
      }
      if (pkg.package_type === 'day_tour' && opts.sightseeingDays && !opts.sightseeingDays.has(first.day)) continue
      const key = `${i}:${length}`
      const entry = fits.get(key)
      if (entry) entry.pkgs.push(pkg)
      else fits.set(key, { start: i, length, pkgs: [pkg] })
    }
  }

  const covered: RoadPackageCoverage<P>['covered'] = []
  const ambiguous: RoadPackageCoverage<P>['ambiguous'] = []
  const placed = new Set<number>()
  const order = [...fits.values()].sort((a, b) => b.length - a.length || a.start - b.start)
  for (const f of order) {
    const idx = Array.from({ length: f.length }, (_, k) => f.start + k)
    if (idx.some(i => placed.has(i))) continue
    const dayNumbers = idx.map(i => days[i].day)
    if (f.pkgs.length > 1) {
      ambiguous.push({ days: dayNumbers, count: f.pkgs.length })
      continue
    }
    idx.forEach(i => placed.add(i))
    covered.push({ pkg: f.pkgs[0], days: dayNumbers })
  }
  covered.sort((a, b) => a.days[0] - b.days[0])
  return { covered, ambiguous }
}
