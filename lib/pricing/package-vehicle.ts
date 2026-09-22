// ============================================================================
// Which vehicle a transport package prices for a group, and at what rate.
// ============================================================================
// Lives here, not in the route, so it can be tested: a Next route file may
// only export its handlers.
//
// A package prices its vehicles the same way a transportation rate does: from
// the agency's own vehicle_type vocabulary. The `vehicles` list holds one rate
// per vocabulary key; which vehicle seats a group is read from the vocabulary
// bands (vehicleForPax), never from a capacity stored on the package. The five
// fixed columns (sedan/minivan/van/minibus/bus) are the old shape, kept only so
// a legacy row still prices until it is re-entered.

import { vehicleForPax, type VehicleBand } from '@/lib/vocabulary'

/** One priced vehicle on a package, keyed by the agency's vehicle_type vocab. */
export interface PackageVehicle {
  vehicle_type: string
  rate?: number | null
}

export interface PackageVehicleRates {
  // The current shape: the agency's own vehicles, sized from its vocabulary.
  vehicles?: PackageVehicle[] | null
  // Legacy fixed columns (dormant; a row entered before migration 381).
  sedan_capacity?: number | null
  sedan_rate?: number | null
  minivan_capacity?: number | null
  minivan_rate?: number | null
  van_capacity?: number | null
  van_rate?: number | null
  minibus_capacity?: number | null
  minibus_rate?: number | null
  minibus_capacity_max?: number | null
  bus_rate?: number | null
}

// The five legacy columns, in fleet order, as a vehicles-shaped list. Used to
// price a row that predates `vehicles`, and as the ladder the no-vocabulary
// fallback walks.
const LEGACY_ORDER: Array<{ key: string; rate: keyof PackageVehicleRates; cap: keyof PackageVehicleRates | null }> = [
  { key: 'sedan', rate: 'sedan_rate', cap: 'sedan_capacity' },
  { key: 'minivan', rate: 'minivan_rate', cap: 'minivan_capacity' },
  { key: 'van', rate: 'van_rate', cap: 'van_capacity' },
  { key: 'minibus', rate: 'minibus_rate', cap: 'minibus_capacity' },
  { key: 'bus', rate: 'bus_rate', cap: null },
]

/** The package's priced vehicles: its own list, or — for a legacy row that has
 *  none — the fixed columns read as one. */
export function packageVehicles(pkg: PackageVehicleRates): PackageVehicle[] {
  if (Array.isArray(pkg.vehicles) && pkg.vehicles.length > 0) {
    return pkg.vehicles.filter(v => v && typeof v.vehicle_type === 'string')
  }
  return LEGACY_ORDER
    .map(({ key, rate }) => ({ vehicle_type: key, rate: pkg[rate] as number | null | undefined }))
    .filter(v => v.rate != null)
}

// The vehicle a package prices for this group, or null when the package has no
// rate for that size — a hole, never a $0 line (the caller multiplied a missing
// rate out to nothing and its `unitCost === 0` check never caught it).
//
// With the agency's vehicle bands, the vehicle is the one the vocabulary sizes
// for the group (exactly as transportation rates are matched); its rate is read
// from the package's `vehicles` list. Without bands — old callers, or a tenant
// with no vehicle vocabulary — it falls back to the fixed capacity ladder.
export function selectVehicleFromPackage(
  pkg: PackageVehicleRates,
  numPax: number,
  bands?: readonly VehicleBand[] | null,
): { rate: number; vehicle: string } | null {
  const vehicles = packageVehicles(pkg)

  if (bands && bands.length > 0) {
    const key = vehicleForPax(bands, numPax)
    if (!key) return null
    const match = vehicles.find(v => v.vehicle_type === key)
    return match && match.rate ? { rate: match.rate, vehicle: key } : null
  }

  // No vocabulary to size from: walk the legacy capacity ladder.
  for (const { key, rate, cap } of LEGACY_ORDER) {
    if (cap === null) break
    const capacity = (pkg[cap] as number | null | undefined) ?? 0
    const price = pkg[rate] as number | null | undefined
    if (numPax <= capacity && price) return { rate: price, vehicle: legacyLabel(key) }
  }
  const busRate = pkg.bus_rate ?? pkg.minibus_rate
  return busRate ? { rate: busRate, vehicle: 'Bus' } : null
}

function legacyLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/** Clean a vehicles list off a request body: keep the entries that name a
 *  vehicle_type and carry a positive rate, drop the rest. A blank rate is not
 *  stored — a vehicle the package does not price is a hole, not a zero line. */
export function sanitizePackageVehicles(input: unknown): PackageVehicle[] {
  if (!Array.isArray(input)) return []
  const out: PackageVehicle[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const key = typeof e.vehicle_type === 'string' ? e.vehicle_type.trim() : ''
    const rate = typeof e.rate === 'number' ? e.rate : Number(e.rate)
    if (!key || seen.has(key) || !Number.isFinite(rate) || rate <= 0) continue
    seen.add(key)
    out.push({ vehicle_type: key, rate })
  }
  return out
}
