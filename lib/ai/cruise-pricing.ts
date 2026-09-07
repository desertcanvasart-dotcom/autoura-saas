// ============================================
// CRUISE RATE LOOKUP (AI generation path)
// ============================================
// This module used to read `rate_per_person_eur` and `double_cabin_rate_eur`
// off nile_cruises. NEITHER COLUMN EXISTS: PostgREST returns them as absent,
// `|| 0` swallowed that, and every AI-generated cruise itinerary was priced
// at 0 per night while reporting found:true — a fabricated free cruise, the
// exact failure the pricing harness exists to prevent.
//
// The real shape is not one column either: a cruise may be priced by dated
// contract periods (`seasons`), by the seasonal ppd_eur family, or by the
// legacy whole-trip rate_double_eur — and its amounts may be in a contract
// currency. All of that already lives in the canonical engine lookup, so
// this is now a thin adapter over it rather than a second implementation.

import { getCruiseRates } from '@/lib/auto-pricing-service'
import type { ServiceTier } from './parsing-utils'

export interface CruiseRate {
  found: boolean
  perPersonPerNight: number
  shipName: string
  supplierId: string | null
  cabinType: string
  /** Why there is no usable rate, when found is false. Operator-facing. */
  reason?: string
}

export async function getCruiseRate(params: {
  tenantId: string
  tier: ServiceTier
  /** Ships the content library recommended; tried before the tier's ships. */
  recommendedSuppliers?: string[]
  /** Trip start — picks the right contract period / season when set. */
  travelDate?: string
  embarkCity?: string
}): Promise<CruiseRate> {
  const { tenantId, tier, recommendedSuppliers = [], travelDate, embarkCity } = params

  // No fabricated default cruise rate. A miss yields found:false and 0 so the
  // caller flags it, never a guessed price.
  const noRate = (reason: string): CruiseRate => ({
    found: false,
    perPersonPerNight: 0,
    shipName: `${String(tier).charAt(0).toUpperCase()}${String(tier).slice(1)} Nile Cruise`,
    supplierId: null,
    cabinType: 'Standard Cabin',
    reason,
  })

  if (!tenantId) return noRate('No workspace on the request, so no cruise rates could be read.')

  try {
    const rate = await getCruiseRates({ tenantId }, tier, embarkCity, travelDate, {
      shipNames: recommendedSuppliers,
    })

    if (!rate) return noRate(`No ${tier} cruise rate on file. Add one in Rates → Cruises.`)

    // Several ships fit and none is marked preferred — the engine refuses to
    // pick one (lib/pricing/candidate-selection.ts).
    if (rate.ambiguous) {
      const names = rate.ambiguous.names.join(', ')
      return noRate(`${rate.ambiguous.count} ${tier} cruises fit (${names}) and none is marked preferred. Star one in Rates → Cruises.`)
    }
    // The ship has contract periods but none covers this date.
    if (rate.periodGap) {
      return noRate(`${rate.periodGap.propertyName} has rate periods, but none covers ${rate.periodGap.date}. Add one in Rates → Cruises.`)
    }
    if (rate.source !== 'db' || !(rate.ppdNight > 0)) {
      return noRate(`No usable ${tier} cruise rate. Check the per-person rate in Rates → Cruises.`)
    }

    return {
      found: true,
      perPersonPerNight: rate.ppdNight,
      shipName: rate.shipName,
      // The company the ship is bought from; the cruise row itself when it
      // names no supplier — the identity the callers have always stored.
      supplierId: rate.supplierId ?? rate.cruiseId ?? null,
      cabinType: rate.cabinType || 'Standard Cabin',
    }
  } catch (err) {
    console.error('⚠️ Error fetching cruise rate:', err)
    return noRate('Cruise rates could not be read.')
  }
}
