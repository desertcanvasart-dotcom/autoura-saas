// ============================================
// TRANSPORT RATE UTILITIES
// Shared helper for tiered vehicle rate selection
// ============================================

export type VehicleTier = 'sedan' | 'minivan' | 'van' | 'minibus' | 'bus'

export interface VehicleRateResult {
  vehicleType: string
  rateEur: number
  rateNonEur: number
  capacityMin: number
  capacityMax: number
  tier: VehicleTier
}

const VEHICLE_TIERS: VehicleTier[] = ['sedan', 'minivan', 'van', 'minibus', 'bus']

function getDefaultCapacity(tier: VehicleTier): { min: number; max: number } {
  switch (tier) {
    case 'sedan': return { min: 1, max: 2 }
    case 'minivan': return { min: 3, max: 7 }
    case 'van': return { min: 8, max: 12 }
    case 'minibus': return { min: 13, max: 20 }
    case 'bus': return { min: 21, max: 45 }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Get the appropriate vehicle rate for a given pax count.
 * Finds the smallest vehicle that fits, falls back to next larger.
 */
export function getTransportRateForPax(
  rate: any,
  pax: number,
): VehicleRateResult | null {
  const tiers: { tier: VehicleTier; rateEur: number; rateNonEur: number; min: number; max: number }[] = []

  for (const tier of VEHICLE_TIERS) {
    const rateEur = rate[`${tier}_rate_eur`]
    const rateNonEur = rate[`${tier}_rate_non_eur`]
    const min = rate[`${tier}_capacity_min`] ?? getDefaultCapacity(tier).min
    const max = rate[`${tier}_capacity_max`] ?? getDefaultCapacity(tier).max

    if (rateEur != null && rateEur > 0) {
      tiers.push({ tier, rateEur, rateNonEur: rateNonEur ?? rateEur, min, max })
    }
  }

  if (tiers.length === 0) {
    // Backward compat: use old base_rate fields
    if (rate.base_rate_eur != null && rate.base_rate_eur > 0) {
      return {
        vehicleType: rate.vehicle_type || 'Vehicle',
        rateEur: rate.base_rate_eur,
        rateNonEur: rate.base_rate_non_eur ?? rate.base_rate_eur,
        capacityMin: rate.capacity_min ?? 1,
        capacityMax: rate.capacity_max ?? 45,
        tier: 'sedan',
      }
    }
    return null
  }

  // Exact fit
  const exactFit = tiers.find(t => pax >= t.min && pax <= t.max)
  if (exactFit) {
    return { vehicleType: capitalize(exactFit.tier), rateEur: exactFit.rateEur, rateNonEur: exactFit.rateNonEur, capacityMin: exactFit.min, capacityMax: exactFit.max, tier: exactFit.tier }
  }

  // Next larger
  const largerFit = tiers.find(t => t.max >= pax)
  if (largerFit) {
    return { vehicleType: capitalize(largerFit.tier), rateEur: largerFit.rateEur, rateNonEur: largerFit.rateNonEur, capacityMin: largerFit.min, capacityMax: largerFit.max, tier: largerFit.tier }
  }

  // Largest available
  const largest = tiers[tiers.length - 1]
  return { vehicleType: capitalize(largest.tier), rateEur: largest.rateEur, rateNonEur: largest.rateNonEur, capacityMin: largest.min, capacityMax: largest.max, tier: largest.tier }
}

/**
 * Get all available vehicle tiers from a rate record (for UI display)
 */
export function getAllVehicleTiers(rate: any): VehicleRateResult[] {
  const results: VehicleRateResult[] = []
  for (const tier of VEHICLE_TIERS) {
    const rateEur = rate[`${tier}_rate_eur`]
    const rateNonEur = rate[`${tier}_rate_non_eur`]
    const min = rate[`${tier}_capacity_min`] ?? getDefaultCapacity(tier).min
    const max = rate[`${tier}_capacity_max`] ?? getDefaultCapacity(tier).max
    if (rateEur != null && rateEur > 0) {
      results.push({ vehicleType: capitalize(tier), rateEur, rateNonEur: rateNonEur ?? rateEur, capacityMin: min, capacityMax: max, tier })
    }
  }
  return results
}
