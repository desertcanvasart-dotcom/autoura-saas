// ============================================
// CRUISE RATE LOOKUP
// ============================================

import type { ServiceTier } from './parsing-utils'

export interface CruiseRate {
  found: boolean
  perPersonPerNight: number
  shipName: string
  supplierId: string | null
  cabinType: string
}

export async function getCruiseRate(
  tier: ServiceTier,
  recommendedSuppliers: string[],
  supabase: any
): Promise<CruiseRate> {
  // Harness: no fabricated default cruise rate. A miss yields found:false +
  // perPersonPerNight 0 so the caller can flag it, never a guessed price.
  const noRate: CruiseRate = {
    found: false,
    perPersonPerNight: 0,
    shipName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Nile Cruise`,
    supplierId: null,
    cabinType: 'Standard Cabin'
  }

  try {
    // If we have recommended suppliers, try to match
    if (recommendedSuppliers && recommendedSuppliers.length > 0) {
      const { data: matchedShips } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .in('ship_name', recommendedSuppliers)
        .limit(1)

      if (matchedShips && matchedShips.length > 0) {
        const ship = matchedShips[0]
        return {
          found: true,
          perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || 0,
          shipName: ship.ship_name,
          supplierId: ship.supplier_id || ship.id,
          cabinType: ship.cabin_type || 'Standard Cabin'
        }
      }
    }

    // Fallback: find any cruise matching tier
    const { data: tierCruises } = await supabase
      .from('nile_cruises')
      .select('*')
      .eq('is_active', true)
      .eq('tier', tier)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (tierCruises && tierCruises.length > 0) {
      const ship = tierCruises[0]
      return {
        found: true,
        perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || 0,
        shipName: ship.ship_name,
        supplierId: ship.supplier_id || ship.id,
        cabinType: ship.cabin_type || 'Standard Cabin'
      }
    }

    // Final fallback: any active cruise
    const { data: anyCruise } = await supabase
      .from('nile_cruises')
      .select('*')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (anyCruise && anyCruise.length > 0) {
      const ship = anyCruise[0]
      return {
        found: true,
        perPersonPerNight: ship.rate_per_person_eur || ship.double_cabin_rate_eur || 0,
        shipName: ship.ship_name,
        supplierId: ship.supplier_id || ship.id,
        cabinType: ship.cabin_type || 'Standard Cabin'
      }
    }

    return noRate

  } catch (err) {
    console.error('⚠️ Error fetching cruise rate:', err)
    return noRate
  }
}
