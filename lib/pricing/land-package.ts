// ============================================================================
// Land packages — one price per person for several days (migration 462)
// ============================================================================
// Operator, 2026-11-07: the Bahariya desert trip is bought from one provider
// as one package (car from Cairo and back, 4x4, a night in the camp or a
// hotel, guide, meals, the protected-area ticket) at one price per person,
// whatever the group's size. Priced piece by piece, the same days charged a
// road transfer, a guide, meals, a night and entrance fees on top of the
// package — or, with the package nowhere, everything but it.
//
// The rule, in one place for both pricing paths (the tour engine and the
// Quote Builder):
//   · the package is charged ONCE — price per person × travellers — on the
//     day it is put on;
//   · it covers that day and the next (duration_days − 1) days;
//   · on those days, what it includes is not charged again: the road (both
//     the drive out and the drive back to its start city), the guide, the
//     meals it lists for each day, the nights it lists, and the entrance
//     fees (all of them, or only the sights it names);
//   · anything it does NOT include is priced as usual.
// A package that runs past the end of the trip, or one that is gone, is a
// gap — never a guess.
//
// Pure: the engine, the grid and the tests call it.

export type NightPlace = 'camp' | 'hotel' | 'other'
export interface DayMeals { breakfast: boolean; lunch: boolean; dinner: boolean }

export interface LandPackageRow {
  id: string
  package_name: string
  city?: string | null
  start_city?: string | null
  duration_days: number
  night_places: string[]
  meals: unknown
  includes_transport: boolean
  includes_local_vehicle?: boolean
  includes_guide: boolean
  includes_entrance: boolean
  covered_attractions: string[]
  vehicle_capacity?: number | null
  base_rate_eur: number | string | null
  base_rate_non_eur?: number | string | null
  description?: string | null
}

const NO_MEALS: DayMeals = { breakfast: false, lunch: false, dinner: false }

/** The package's meals, one entry per day, always `duration_days` long. */
export function packageMeals(pkg: Pick<LandPackageRow, 'meals' | 'duration_days'>): DayMeals[] {
  const list = Array.isArray(pkg.meals) ? pkg.meals : []
  return Array.from({ length: Math.max(0, pkg.duration_days) }, (_, i) => {
    const m = list[i] as Partial<DayMeals> | undefined
    return m && typeof m === 'object'
      ? { breakfast: m.breakfast === true, lunch: m.lunch === true, dinner: m.dinner === true }
      : { ...NO_MEALS }
  })
}

/** The price per person (non-EU passports read their own column when set). */
export function packagePricePerPerson(pkg: LandPackageRow, isEurPassport = true): number | null {
  const pick = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v) : v
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
  }
  return (isEurPassport ? null : pick(pkg.base_rate_non_eur)) ?? pick(pkg.base_rate_eur)
}

const NIGHT_WORD: Record<string, string> = { camp: 'desert camp', hotel: 'hotel', other: 'night' }

/** "2 days / 1 night" */
export function packageLength(pkg: Pick<LandPackageRow, 'duration_days'>): string {
  const d = pkg.duration_days, n = Math.max(0, d - 1)
  return `${d} day${d === 1 ? '' : 's'}${n ? ` / ${n} night${n === 1 ? '' : 's'}` : ''}`
}

/** What the package includes, in words — the line a client reads on a quote. */
export function packageInclusions(pkg: LandPackageRow): string[] {
  const out: string[] = []
  if (pkg.includes_transport) out.push(pkg.start_city ? `Car from and back to ${pkg.start_city}` : 'Transport')
  if (pkg.includes_local_vehicle) out.push(`4x4${pkg.vehicle_capacity ? ` (up to ${pkg.vehicle_capacity} per car)` : ''}`)
  const nights = (pkg.night_places ?? []).map(p => NIGHT_WORD[p] ?? p)
  if (nights.length) out.push(`${nights.length} night${nights.length === 1 ? '' : 's'}: ${nights.join(', then ')}`)
  if (pkg.includes_guide) out.push('Guide')
  const meals = packageMeals(pkg).flatMap((m, i) =>
    (['breakfast', 'lunch', 'dinner'] as const).filter(k => m[k]).map(k => `${k} day ${i + 1}`))
  if (meals.length) out.push(`Meals: ${meals.join(', ')}`)
  if (pkg.includes_entrance) {
    out.push(pkg.covered_attractions?.length ? `Entrance: ${pkg.covered_attractions.join(', ')}` : 'Entrance fees')
  }
  return out
}

/** The quote line's name: "Bahariya desert safari — 2 days / 1 night". */
export function packageLineName(pkg: LandPackageRow): string {
  return /\bday/i.test(pkg.package_name) ? pkg.package_name : `${pkg.package_name} — ${packageLength(pkg)}`
}

const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Is this worded sight covered by the package's ticket? */
export function sightCovered(pkg: Pick<LandPackageRow, 'includes_entrance' | 'covered_attractions'>, sight: string): boolean {
  if (!pkg.includes_entrance) return false
  const list = pkg.covered_attractions ?? []
  return list.length === 0 || list.some(c => norm(c) === norm(sight))
}

/** What the package switches off on ONE of the days it covers. */
export interface CoveredDay {
  packageId: string
  packageName: string
  /** 0-based day of the package. */
  index: number
  /** Last day of the package. */
  last: boolean
  /** The road is the package's (out on the first day, back on the last). */
  transport: boolean
  guide: boolean
  /** Meals the package gives on this day. */
  meals: DayMeals
  /** This day's night is the package's (camp or hotel) — no bed charged. */
  night: NightPlace | null
  /** The package returns to its start city at the end of its last day. */
  endsIn: string | null
}

/** What the package covers on its day `index` (0 = the day it starts). */
export function coverDay(pkg: LandPackageRow, index: number): CoveredDay {
  const last = index >= pkg.duration_days - 1
  return {
    packageId: pkg.id,
    packageName: pkg.package_name,
    index,
    last,
    transport: pkg.includes_transport,
    guide: pkg.includes_guide,
    meals: packageMeals(pkg)[index] ?? { ...NO_MEALS },
    night: last ? null : ((pkg.night_places?.[index] as NightPlace | undefined) ?? 'other'),
    endsIn: last && pkg.includes_transport ? (pkg.start_city ?? null) : null,
  }
}

/** The Quote Builder's option id for a package (never confused with an
 *  activity's id, so a saved line is never pinned to the wrong table). */
export const landPackageOptionId = (id: string) => `lp:${id}`

/** Something a day needs in order to carry a package. */
export interface PackageDayRef { day: number; land_package_id?: string | null }

export interface Coverage {
  /** day number → what the package covers on it. */
  covered: Map<number, CoveredDay>
  /** The packages to charge, once each, on the day they start. */
  charges: Array<{ day: number; pkg: LandPackageRow }>
  /** Gaps: a package that is gone, or runs past the end of the trip. */
  holes: Array<{ day: number; message: string }>
}

/**
 * Which days each package covers. `days` in trip order; a day carries
 * `land_package_id` on the day its package STARTS. Two packages may not
 * cover the same day — the second is a gap.
 */
export function landPackageCoverage(days: readonly PackageDayRef[], packages: ReadonlyMap<string, LandPackageRow>): Coverage {
  const covered = new Map<number, CoveredDay>()
  const charges: Coverage['charges'] = []
  const holes: Coverage['holes'] = []
  days.forEach((d, i) => {
    const id = d.land_package_id
    if (!id) return
    const pkg = packages.get(id)
    if (!pkg) {
      holes.push({ day: d.day, message: `Day ${d.day}'s package is no longer in Rates → Land packages (or is inactive). Pick it again.` })
      return
    }
    const span = days.slice(i, i + pkg.duration_days)
    if (span.length < pkg.duration_days) {
      holes.push({ day: d.day, message: `"${pkg.package_name}" is ${packageLength(pkg)}, but the trip ends ${span.length} day${span.length === 1 ? '' : 's'} after it starts. Add the days, or pick a shorter package.` })
      return
    }
    const clash = span.find(s => covered.has(s.day))
    if (clash) {
      holes.push({ day: d.day, message: `Day ${clash.day} is already covered by "${covered.get(clash.day)!.packageName}" — two packages cannot cover the same day.` })
      return
    }
    span.forEach((s, k) => covered.set(s.day, coverDay(pkg, k)))
    charges.push({ day: d.day, pkg })
  })
  return { covered, charges, holes }
}
