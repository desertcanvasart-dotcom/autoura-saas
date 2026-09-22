import { describe, it, expect } from 'vitest'
import { selectVehicleFromPackage, packageVehicles } from '@/lib/pricing/package-vehicle'
import type { VehicleBand } from '@/lib/vocabulary'

// ============================================================================
// A transport package with an empty rate column must not price at zero.
//
// The Bus branch returned `pkg.bus_rate || pkg.minibus_rate`. With neither
// filled in that is null, the caller computed `null * quantity` = 0, and its
// "no rate" check tested `unitCost === 0` — which null is not. The line was
// emitted as a b2b_package rate, costing nothing, with no hole: a cruise
// sightseeing day given away free on the quote.
// ============================================================================

const full = {
  sedan_capacity: 3, sedan_rate: 100,
  minivan_capacity: 7, minivan_rate: 150,
  van_capacity: 12, van_rate: 200,
  minibus_capacity: 20, minibus_rate: 300,
  bus_rate: 500,
}

describe('selectVehicleFromPackage', () => {
  it('picks the smallest vehicle the group fits in', () => {
    expect(selectVehicleFromPackage(full, 2)).toEqual({ rate: 100, vehicle: 'Sedan' })
    expect(selectVehicleFromPackage(full, 7)).toEqual({ rate: 150, vehicle: 'Minivan' })
    expect(selectVehicleFromPackage(full, 12)).toEqual({ rate: 200, vehicle: 'Van' })
    expect(selectVehicleFromPackage(full, 20)).toEqual({ rate: 300, vehicle: 'Minibus' })
    expect(selectVehicleFromPackage(full, 40)).toEqual({ rate: 500, vehicle: 'Bus' })
  })

  it('skips a size whose rate is blank rather than pricing it at 0', () => {
    expect(selectVehicleFromPackage({ ...full, sedan_rate: null }, 2)).toEqual({ rate: 150, vehicle: 'Minivan' })
    expect(selectVehicleFromPackage({ ...full, sedan_rate: 0 }, 2)).toEqual({ rate: 150, vehicle: 'Minivan' })
  })

  it('falls back to the minibus rate for a big group when there is no bus rate', () => {
    // Unchanged from before: the line still reads "Bus", which is what the
    // package charges for. Only the missing-rate case behaves differently.
    expect(selectVehicleFromPackage({ ...full, bus_rate: null }, 40)).toEqual({ rate: 300, vehicle: 'Bus' })
  })

  it('returns null when neither bus nor minibus has a rate — the $0 line', () => {
    expect(selectVehicleFromPackage({ ...full, bus_rate: null, minibus_rate: null }, 40)).toBeNull()
    expect(selectVehicleFromPackage({}, 2)).toBeNull()
  })

  it('never returns a zero or missing rate', () => {
    const packages = [full, { ...full, bus_rate: 0, minibus_rate: 0 }, { ...full, sedan_rate: null }, {}]
    for (const pkg of packages) {
      for (const pax of [1, 3, 8, 15, 30, 60]) {
        const picked = selectVehicleFromPackage(pkg, pax)
        if (picked) expect(picked.rate, `${pax} pax`).toBeGreaterThan(0)
      }
    }
  })
})

// ============================================================================
// With the agency's vehicle vocabulary, a package prices like a transportation
// rate: the vehicle is the one the vocabulary sizes for the group, and its rate
// comes from the package's own list — not from five fixed columns that may name
// vehicles the agency does not run.
// ============================================================================

// Travel2Egypt's fleet: sedan / suv / 4x4 / minivan — none of them a "Van",
// "Minibus" or "Bus". The old fixed columns could not express it.
const bands: VehicleBand[] = [
  { key: 'sedan', min_pax: 1, max_pax: 2 },
  { key: 'suv', min_pax: 3, max_pax: 7 },
  { key: '4x4', min_pax: 8, max_pax: 12 },
  { key: 'minivan', min_pax: 13, max_pax: 45 },
]

const pkg = { vehicles: [
  { vehicle_type: 'sedan', rate: 90 },
  { vehicle_type: 'suv', rate: 140 },
  { vehicle_type: '4x4', rate: 220 },
  { vehicle_type: 'minivan', rate: 400 },
] }

describe('selectVehicleFromPackage with the agency vocabulary', () => {
  it('prices the vehicle the vocabulary sizes for the group', () => {
    expect(selectVehicleFromPackage(pkg, 2, bands)).toEqual({ rate: 90, vehicle: 'sedan' })
    expect(selectVehicleFromPackage(pkg, 5, bands)).toEqual({ rate: 140, vehicle: 'suv' })
    expect(selectVehicleFromPackage(pkg, 10, bands)).toEqual({ rate: 220, vehicle: '4x4' })
    expect(selectVehicleFromPackage(pkg, 30, bands)).toEqual({ rate: 400, vehicle: 'minivan' })
  })

  it('is a hole, not a $0 line, when the package has no rate for that vehicle', () => {
    const partial = { vehicles: [{ vehicle_type: 'sedan', rate: 90 }] }
    expect(selectVehicleFromPackage(partial, 2, bands)).toEqual({ rate: 90, vehicle: 'sedan' })
    expect(selectVehicleFromPackage(partial, 10, bands)).toBeNull()
    expect(selectVehicleFromPackage({ vehicles: [{ vehicle_type: 'suv', rate: 0 }] }, 5, bands)).toBeNull()
  })

  it('reads a legacy row (fixed columns, no list) through its columns', () => {
    // A row entered before migration 381 still prices: the columns are read as
    // a vehicles list keyed by the Egypt-preset words.
    const egyptBands: VehicleBand[] = [
      { key: 'sedan', min_pax: 1, max_pax: 3 },
      { key: 'minivan', min_pax: 4, max_pax: 7 },
    ]
    expect(selectVehicleFromPackage(full, 2, egyptBands)).toEqual({ rate: 100, vehicle: 'sedan' })
    expect(selectVehicleFromPackage(full, 6, egyptBands)).toEqual({ rate: 150, vehicle: 'minivan' })
  })
})

describe('packageVehicles', () => {
  it('returns the package list when present', () => {
    expect(packageVehicles(pkg)).toHaveLength(4)
  })
  it('reads legacy columns as a list, in fleet order, skipping blanks', () => {
    expect(packageVehicles({ sedan_rate: 100, van_rate: 200 })).toEqual([
      { vehicle_type: 'sedan', rate: 100 },
      { vehicle_type: 'van', rate: 200 },
    ])
  })
})
