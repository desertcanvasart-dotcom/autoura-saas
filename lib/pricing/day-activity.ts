// ============================================================================
// Pricing one activity attached to a day (the motorboat at Philae, a felucca,
// a camel ride) — from the agency's activity_rates catalogue.
// ============================================================================
// A tour day can carry activities the operator adds on the day editor. The
// engine prices each from its catalogue row, by the row's own pricing model:
//
//   per_person → the rate × pax        (scales with the group)
//   tiered     → the band for the group, per person   (activity-tiers.ts)
//   per_unit   → the rate × how many units the group needs (one boat per
//                max_capacity people) — a fixed cost, not per head
//   flat       → the rate, once
//
// No usable rate is a HOLE, never a free activity (refuse-to-guess). Pure and
// catalogue-shaped, so the rule is tested without the engine or a database.

import { parseTiers, applyActivityTiers } from '@/lib/rates/activity-tiers'

export interface ActivityRow {
  id: string
  activity_name: string
  pricing_type?: string | null
  base_rate_eur?: number | null
  base_rate_non_eur?: number | null
  unit_label?: string | null
  max_capacity?: number | null
  tiers?: unknown
}

export interface ActivityLine {
  unitCost: number
  lineTotal: number
  note: string
  /** true = the line scales with pax (per_person / tiered); false = a fixed
   *  group cost (per_unit / flat). Feeds the engine's cost decomposition. */
  isPerPax: boolean
  quantityMode: 'per_pax' | 'fixed'
}

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Price one activity for a group, or null when the row has no usable rate —
 * a gap the operator fills in Rates → Activities & Add-ons, never a zero line.
 */
export function priceDayActivity(
  row: ActivityRow,
  numPax: number,
  isEurPassport: boolean,
  sym: string,
): ActivityLine | null {
  const type = row.pricing_type || 'per_person'

  if (type === 'tiered') {
    const tiers = parseTiers(row.tiers)
    if (!tiers) return null
    const t = applyActivityTiers(tiers, numPax, isEurPassport, sym)
    return { unitCost: t.unitCost, lineTotal: t.lineTotal, note: t.pricingNote, isPerPax: true, quantityMode: 'per_pax' }
  }

  const rate = isEurPassport ? row.base_rate_eur : (row.base_rate_non_eur ?? row.base_rate_eur)
  if (!usable(rate)) return null

  if (type === 'per_unit') {
    const cap = usable(row.max_capacity) ? row.max_capacity : numPax
    const units = Math.max(1, Math.ceil(numPax / cap))
    const total = round2(rate * units)
    const unit = row.unit_label || 'unit'
    const holds = usable(row.max_capacity) ? `, holds ${row.max_capacity}` : ''
    return { unitCost: rate, lineTotal: total, note: `${units} × ${unit}${holds}: ${sym}${rate} = ${sym}${total}`, isPerPax: false, quantityMode: 'fixed' }
  }

  if (type === 'flat') {
    return { unitCost: rate, lineTotal: round2(rate), note: `flat: ${sym}${rate}`, isPerPax: false, quantityMode: 'fixed' }
  }

  // per_person (and any unknown type falls back to per person)
  const total = round2(rate * numPax)
  return { unitCost: rate, lineTotal: total, note: `${sym}${rate}/pax × ${numPax} = ${sym}${total}`, isPerPax: true, quantityMode: 'per_pax' }
}
