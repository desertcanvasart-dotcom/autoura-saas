// ============================================
// COMMISSION GENERATION — turning priced services into commission records
// ============================================
// Design port of the reference implementation's engine (C2 of
// docs/plans/parity-campaign.md). Extracted from the generate-commissions
// route so the mapping is testable without a database — and because the
// route's previous math computed every commission off `selling_price ||
// cost`, the CLIENT price first, regardless of direction: it would have
// over-claimed against every supplier by the size of our own markup.
//
// TWO DIRECTIONS (the reference operator's model, 2026-08-22):
//
//   receivable  WE RECEIVE a share of the supplier's SALE — a shop our
//               clients visit. Base = the supplier's price (total_cost).
//   payable     WE PAY the supplier a share of OUR PROFIT — a guide who sold
//               an optional tour gets a cut of what we made on it. Base =
//               profit on that service (client_price − total_cost). No
//               profit, no commission: we do not pay a cut of a loss, and we
//               do not pay it off the client price as if there were no cost.
//
// The direction is the supplier's `commission_type` (set on the supplier
// form). Anything but 'payable' reads as receivable — the common case is a
// supplier owing us.
//
// SOLD BY
//
// The guide who sells a third party's optional tour is not that service's
// supplier. `itinerary_services.sold_by_supplier_id` (migration 303) names
// the seller; when set, the service yields a SECOND commission — payable to
// the seller, at the seller's rate, on the same profit — alongside whatever
// the provider is owed or owes. A seller is always "we pay": a seller whose
// direction is "we receive" is skipped with a reason rather than silently
// paid or ignored.
//
// WHY SKIPS ARE REPORTED: a correct run over unpriced services still
// produces zero commissions, which is indistinguishable from a broken run —
// so every skipped service is returned with its reason.

import { ALL_SERVICE_TYPES } from './service-types'

/** Commission categories the UI renders (app/commissions/page.tsx
 *  CATEGORY_CONFIG). Emitting anything outside this set renders as a blank
 *  chip, so the mapping below is deliberately closed. */
export type CommissionCategory =
  | 'hotel'
  | 'shopping'
  | 'restaurant'
  | 'transport'
  | 'cruise'
  | 'attraction'
  | 'optional_tour'
  | 'activity'
  | 'show'
  | 'spa'
  | 'agent_referral'
  | 'partner'
  | 'other'

/** service_type → commission category, keyed on the values THIS app actually
 *  writes (lib/service-types.ts is the canonical list). */
export const SERVICE_TYPE_TO_CATEGORY: Readonly<Record<string, CommissionCategory>> = {
  accommodation: 'hotel',
  hotel_service: 'hotel',
  meal: 'restaurant',
  transportation: 'transport',
  airport_service: 'transport',
  flight: 'transport',
  cruise: 'cruise',
  entrance: 'attraction',
  activity: 'activity',
  // No 'guide'/'tips'/'supplies' chip exists in the UI; 'other' keeps the
  // commission visible rather than rendering blank.
  guide: 'other',
  tips: 'other',
  supplies: 'other',
}

export type CommissionDirection = 'payable' | 'receivable'

export interface CommissionSupplier {
  id?: string | null
  name?: string | null
  commission_type?: string | null
  default_commission_rate?: number | string | null
}

export interface CommissionSourceService {
  id: string
  service_type?: string | null
  service_name?: string | null
  /** What we charge the client. Enters the base only through PROFIT, for a
   *  payable commission — never as the base itself. */
  client_price?: number | string | null
  /** What the supplier charges us. The base for a receivable commission; the
   *  cost side of profit for a payable one. */
  total_cost?: number | string | null
  supplier_id?: string | null
  commission_rate?: number | string | null
  commission_status?: string | null
  supplier?: CommissionSupplier | null
  /** Who SOLD the service (a guide), distinct from who provides it. */
  sold_by_supplier_id?: string | null
  seller?: CommissionSupplier | null
}

export interface CommissionContext {
  tenantId: string
  itineraryId: string
  itineraryCode: string
  clientId?: string | null
  /** The trip's start date — the date the commission is booked against. */
  startDate?: string | null
  /** The trip's currency. base_amount is stored in it, so it must match. */
  currency?: string | null
  /** Injected for testability; defaults to today. */
  today?: string
}

export interface CommissionRow {
  tenant_id: string
  itinerary_id: string
  supplier_id: string | null
  client_id: string | null
  commission_type: string
  category: CommissionCategory
  source_name: string | null
  description: string
  /** What the rate applies to: supplier cost (receivable) or profit (payable). */
  base_amount: number
  /** The supplier's cost on the service, whichever direction — a payable row
   *  still shows what the profit was made against. Column from mig 303; the
   *  route strips it when the database does not have it yet. */
  cost_amount: number
  commission_rate: number
  commission_amount: number
  currency: string
  status: string
  transaction_date: string
  notes: string
}

export type SkipReason =
  | 'already_generated'
  | 'no_supplier'
  | 'no_rate'
  | 'no_base_amount'
  | 'no_client_price'
  | 'no_profit'
  | 'seller_no_rate'
  | 'seller_not_payable'
  | 'seller_no_profit'

export interface SkippedService {
  service_id: string
  service_name: string
  reason: SkipReason
  detail: string
}

export interface CommissionPair {
  serviceId: string
  commission: CommissionRow
}

export interface BuildCommissionsResult {
  pairs: CommissionPair[]
  skipped: SkippedService[]
}

const SKIP_DETAIL: Record<SkipReason, string> = {
  already_generated: 'A commission has already been generated for this service.',
  no_supplier: 'No supplier is linked, so there is nobody to owe or be owed.',
  no_rate:
    'Neither the service nor the supplier carries a commission rate. Set the rate on the supplier (Commission rate) or on the service.',
  no_base_amount:
    'The service has no supplier cost to calculate a commission from. Commission is a percentage of the SUPPLIER price, so a service priced only to the client is skipped rather than commissioned off our markup.',
  no_client_price:
    "This supplier is paid a share of OUR PROFIT, and the service has no client price, so there is no profit to share. Price the service to the client, or change the supplier's commission direction.",
  no_profit:
    'This supplier is paid a share of OUR PROFIT, and this service made none (client price is not above the supplier cost). No commission is paid on a loss.',
  seller_no_rate:
    'The service names who sold it, but that seller has no commission rate. Set one on the supplier form ("We pay").',
  seller_not_payable:
    'The service names who sold it, but that seller\'s commission is set to "We receive". A seller is paid a share of our profit — change the direction to "We pay".',
  seller_no_profit:
    'The service names who sold it, but there is no profit to share (no client price, or client price not above the supplier cost). No seller commission is paid on a loss.',
}

/** Anything but 'payable' is receivable — the common case is a supplier
 *  owing us. */
export function commissionDirection(supplier: CommissionSupplier | null | undefined): CommissionDirection {
  return supplier?.commission_type === 'payable' ? 'payable' : 'receivable'
}

const toNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Build the commission rows for a trip's services.
 *
 * Returns (serviceId, commission) PAIRS, not parallel arrays — the route
 * claims and inserts BY ID, and matching by position would let one skipped
 * service silently attribute every later commission to the wrong row.
 */
export function buildCommissions(
  services: CommissionSourceService[],
  ctx: CommissionContext
): BuildCommissionsResult {
  const pairs: CommissionPair[] = []
  const skipped: SkippedService[] = []

  const currency = (ctx.currency || 'EUR').toUpperCase()
  const transactionDate = ctx.startDate || ctx.today || new Date().toISOString().split('T')[0]

  const skip = (s: CommissionSourceService, reason: SkipReason) => {
    skipped.push({
      service_id: s.id,
      service_name: s.service_name || s.service_type || 'service',
      reason,
      detail: SKIP_DETAIL[reason],
    })
  }

  for (const s of services) {
    // Already claimed by a previous run; regenerating would double-count.
    if (s.commission_status && s.commission_status !== 'pending') {
      skip(s, 'already_generated')
      continue
    }

    const serviceType = (s.service_type || '').trim().toLowerCase()
    const costAmount = toNumber(s.total_cost)
    const clientPrice = toNumber(s.client_price)
    // Profit on the service — what the "we pay" commissions are a share of.
    const profit =
      costAmount > 0 && clientPrice > 0 ? Math.round((clientPrice - costAmount) * 100) / 100 : null

    // ---- The seller's commission (sold by), independent of the provider's ----
    if (s.sold_by_supplier_id && s.seller) {
      const sellerRate = toNumber(s.seller.default_commission_rate)
      if (sellerRate <= 0) skip(s, 'seller_no_rate')
      else if (commissionDirection(s.seller) !== 'payable') skip(s, 'seller_not_payable')
      else if (profit === null || profit <= 0) skip(s, 'seller_no_profit')
      else {
        pairs.push({
          serviceId: s.id,
          commission: {
            tenant_id: ctx.tenantId,
            itinerary_id: ctx.itineraryId,
            supplier_id: s.sold_by_supplier_id,
            client_id: ctx.clientId || null,
            commission_type: 'payable',
            // A sale credit, not the service's own category.
            category: 'optional_tour',
            source_name: s.seller.name || null,
            description: `${s.service_name || s.service_type || 'Service'} — sold by ${s.seller.name || 'seller'} - ${ctx.itineraryCode}`,
            base_amount: profit,
            cost_amount: costAmount,
            commission_rate: sellerRate,
            commission_amount: Math.round(profit * sellerRate) / 100,
            currency,
            status: 'pending',
            transaction_date: transactionDate,
            notes: `Auto-generated from itinerary ${ctx.itineraryCode} — sold by ${s.seller.name || 'seller'}: ${sellerRate}% of profit (client price − supplier cost ${costAmount})`,
          },
        })
      }
    }

    // ---- The provider's commission ----
    if (!s.supplier || !s.supplier_id) {
      skip(s, 'no_supplier')
      continue
    }

    const rate = toNumber(s.commission_rate) || toNumber(s.supplier.default_commission_rate)
    if (rate <= 0) {
      skip(s, 'no_rate')
      continue
    }

    // The SUPPLIER's price, not ours. Deliberately NO fallback to
    // client_price: a service with no supplier cost is skipped, not priced
    // off the marked-up figure — falling back would reintroduce the exact
    // error this exists to prevent, on precisely the rows where nobody
    // would notice.
    if (costAmount <= 0) {
      skip(s, 'no_base_amount')
      continue
    }

    const direction = commissionDirection(s.supplier)

    let baseAmount = costAmount
    if (direction === 'payable') {
      if (clientPrice <= 0) {
        skip(s, 'no_client_price')
        continue
      }
      if (profit === null || profit <= 0) {
        skip(s, 'no_profit')
        continue
      }
      baseAmount = profit
    }

    pairs.push({
      serviceId: s.id,
      commission: {
        tenant_id: ctx.tenantId,
        itinerary_id: ctx.itineraryId,
        supplier_id: s.supplier_id,
        client_id: ctx.clientId || null,
        commission_type: direction,
        category: SERVICE_TYPE_TO_CATEGORY[serviceType] || 'other',
        source_name: s.supplier.name || null,
        description: `${s.service_name || s.service_type || 'Service'} - ${ctx.itineraryCode}`,
        base_amount: baseAmount,
        cost_amount: costAmount,
        commission_rate: rate,
        // (base × rate / 100) rounded to cents. Algebraically that is
        // Math.round(base × rate) / 100 — the two /100s cancel — which looks
        // like a missing division but is not.
        commission_amount: Math.round(baseAmount * rate) / 100,
        currency,
        status: 'pending',
        transaction_date: transactionDate,
        notes:
          direction === 'payable'
            ? `Auto-generated from itinerary ${ctx.itineraryCode} — ${rate}% of profit (client price − supplier cost ${costAmount})`
            : `Auto-generated from itinerary ${ctx.itineraryCode} — ${rate}% of supplier price`,
      },
    })
  }

  return { pairs, skipped }
}

/** Group skip reasons into a short summary for the API response. */
export function summariseSkips(skipped: SkippedService[]): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const s of skipped) summary[s.reason] = (summary[s.reason] || 0) + 1
  return summary
}

/** Routable service types the commission mapper does not know — a drift
 *  check against lib/service-types.ts. */
export function unmappedServiceTypes(): string[] {
  return ALL_SERVICE_TYPES
    .filter(t => t.routable)
    .map(t => t.value)
    .filter(v => !(v in SERVICE_TYPE_TO_CATEGORY))
}
