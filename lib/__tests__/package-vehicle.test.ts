import { describe, it, expect } from 'vitest'
import { selectVehicleFromPackage } from '@/lib/pricing/package-vehicle'

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
