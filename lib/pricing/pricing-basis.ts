// ============================================
// How a rate's price applies to a group
// ============================================
// One rule for every rate that says what its price covers — activities
// (activity_rates.pricing_type, migration 351) and airport / hotel assistance
// (migration 393):
//
//   flat        once for the whole group;
//   per_person  the rate × the number of travellers;
//   per_unit    the rate × the units the group needs, `capacity` people per
//               unit (one boat per 6, one room per 2). No capacity = one unit.
//
// ('tiered' activities are priced by their bands in the engine,
// lib/pricing/day-activity.ts; anywhere that only has one rate treats them
// per person.)
//
// Pure, so the pricing engine, the AI generator, the Pricing Grid and its save
// all price a line the same way, and the rule is tested once.

export type PricingBasis = 'flat' | 'per_person' | 'per_unit'

export const PRICING_BASES: ReadonlyArray<{ value: PricingBasis; label: string; hint: string }> = [
  { value: 'flat', label: 'Per group', hint: 'One price for the whole group, whatever its size' },
  { value: 'per_person', label: 'Per person', hint: 'The rate × the number of travellers' },
  { value: 'per_unit', label: 'Per unit', hint: 'The rate × the units the group needs (e.g. per room of 2)' },
]

/** A stored pricing type as a basis; unknown / empty values are null. */
export function toPricingBasis(value: unknown): PricingBasis | null {
  if (value === 'flat' || value === 'per_person' || value === 'per_unit') return value
  if (value === 'tiered') return 'per_person'
  return null
}

export function pricingBasisLabel(basis: PricingBasis | null | undefined, capacity?: number | null): string {
  if (basis === 'per_person') return 'Per person'
  if (basis === 'per_unit') return capacity && capacity > 0 ? `Per unit of ${capacity}` : 'Per unit'
  return 'Per group'
}

/** How many units a group of `pax` needs, `capacity` people per unit. */
export function unitsFor(pax: number, capacity: number | null | undefined): number {
  const people = Math.max(1, Math.floor(pax) || 1)
  if (!capacity || !(capacity > 0)) return 1
  return Math.max(1, Math.ceil(people / capacity))
}

export interface BasisLine {
  /** How many times the rate is charged for this group. */
  quantity: number
  /** rate × quantity. */
  lineTotal: number
  /** true = scales with every traveller (per person). */
  isPerPax: boolean
}

/** One rate priced for a group of `pax` by its basis. */
export function priceByBasis(
  rate: number,
  basis: PricingBasis | null | undefined,
  pax: number,
  capacity?: number | null,
): BasisLine {
  const r = Number(rate) || 0
  const round2 = (n: number) => Math.round(n * 100) / 100
  if (basis === 'per_person') {
    const quantity = Math.max(1, Math.floor(pax) || 1)
    return { quantity, lineTotal: round2(r * quantity), isPerPax: true }
  }
  if (basis === 'per_unit') {
    const quantity = unitsFor(pax, capacity)
    return { quantity, lineTotal: round2(r * quantity), isPerPax: false }
  }
  return { quantity: 1, lineTotal: round2(r), isPerPax: false }
}

/**
 * Validate the pricing fields of a rate write. Returns the clean fields to
 * store, or an error. Absent fields are left out (a partial update keeps
 * what is stored).
 */
export function cleanPricingBasisFields(body: Record<string, unknown>):
  | { ok: true; fields: { pricing_type?: PricingBasis; max_capacity?: number | null } }
  | { ok: false; error: string } {
  const fields: { pricing_type?: PricingBasis; max_capacity?: number | null } = {}
  if ('pricing_type' in body && body.pricing_type !== undefined && body.pricing_type !== null && body.pricing_type !== '') {
    const basis = body.pricing_type
    if (basis !== 'flat' && basis !== 'per_person' && basis !== 'per_unit') {
      return { ok: false, error: 'Pricing must be per group, per person or per unit' }
    }
    fields.pricing_type = basis
  }
  if ('max_capacity' in body) {
    const raw = body.max_capacity
    if (raw === null || raw === undefined || raw === '') fields.max_capacity = null
    else {
      const n = Number(raw)
      if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'People per unit must be a whole number above 0' }
      fields.max_capacity = n
    }
  }
  if (fields.pricing_type && fields.pricing_type !== 'per_unit' && 'max_capacity' in body) fields.max_capacity = null
  return { ok: true, fields }
}
