// ============================================================================
// Which vehicle a transport package prices for a group, and at what rate.
// ============================================================================
// Lives here, not in the route, so it can be tested: a Next route file may
// only export its handlers.

export interface PackageVehicleRates {
  sedan_capacity?: number | null
  sedan_rate?: number | null
  minivan_capacity?: number | null
  minivan_rate?: number | null
  van_capacity?: number | null
  van_rate?: number | null
  minibus_capacity?: number | null
  minibus_rate?: number | null
  bus_rate?: number | null
}

// The vehicle a package prices for this group, or null when the package has no
// rate for that size. The Bus branch used to fall back to
// `pkg.bus_rate || pkg.minibus_rate`, which is null when neither is filled in.
// The caller multiplied that null out to a $0 line, and its hole check tested
// `unitCost === 0` — which null is not — so the service was sold for nothing,
// silently. Returning null makes the caller record a hole.
export function selectVehicleFromPackage(pkg: PackageVehicleRates, numPax: number): { rate: number; vehicle: string } | null {
  if (numPax <= (pkg.sedan_capacity ?? 0) && pkg.sedan_rate) {
    return { rate: pkg.sedan_rate, vehicle: 'Sedan' }
  } else if (numPax <= (pkg.minivan_capacity ?? 0) && pkg.minivan_rate) {
    return { rate: pkg.minivan_rate, vehicle: 'Minivan' }
  } else if (numPax <= (pkg.van_capacity ?? 0) && pkg.van_rate) {
    return { rate: pkg.van_rate, vehicle: 'Van' }
  } else if (numPax <= (pkg.minibus_capacity ?? 0) && pkg.minibus_rate) {
    return { rate: pkg.minibus_rate, vehicle: 'Minibus' }
  }
  const busRate = pkg.bus_rate ?? pkg.minibus_rate
  return busRate ? { rate: busRate, vehicle: 'Bus' } : null
}
