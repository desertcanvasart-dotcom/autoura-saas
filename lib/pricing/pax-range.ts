// ============================================
// Multi-pax rate-sheet PRIMITIVE — the one engine's pricing skeleton
// ============================================
// Both pricing "shapes" build the same per-pax rate sheet from the same
// decomposition:
//
//     totalCost(pax) = groupFixed + transport(pax) + perPerson × pax
//     selling        = totalCost × (1 + marginPercent/100)
//     pricePerPerson = selling / pax            (PAYING pax, even with a leader)
//
// transport(pax) is the only non-linear term (vehicle tier re-selected by group
// size); each shape supplies it as a callback. The tour-leader add-on is also a
// per-shape policy, passed in. Everything else is identical — so it lives here
// ONCE and both shapes feed it:
//   • the pricing grid (B2C single quote + B2B sheet) — app/pricing-grid/lib/calculator.ts
//   • the rate-sheet derivation — lib/auto-pricing-service.ts
//
// Sits next to rate-resolution.ts as part of the canonical pricing core. See
// PRICING-CONSOLIDATION-PLAN.md and [[grid-multipax-consolidation]].

export interface PaxPriceCell {
  totalCost: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
}

export interface PaxPricingRow {
  numPax: number
  withoutLeader: PaxPriceCell
  withLeader: PaxPriceCell & { tourLeaderCost: number }
}

export interface PaxRangeCoreInput {
  /** Group costs charged once for the whole trip, EXCLUDING transport. */
  groupFixed: number
  /** Per-person costs (scale linearly with pax). */
  perPerson: number
  /** Margin %, applied as-is — callers clamp first if they want a cap. */
  marginPercent: number
  /** Whole-trip transport cost at a given pax count (vehicle re-selected per pax). */
  transportAt: (pax: number) => number
  /** Whole-trip add-on for the +1 tour leader (single room + their own per-person costs). */
  tourLeaderCost: number
  paxFrom?: number
  paxTo?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Price a trip across a pax range. Pure arithmetic — no rates, no I/O. The
 * with-leader variant prices transport at pax+1 (an extra seat) and adds the
 * leader's own cost, but still divides the selling price by the paying pax.
 */
export function priceAcrossPax(input: PaxRangeCoreInput): PaxPricingRow[] {
  const { groupFixed, perPerson, marginPercent, transportAt, tourLeaderCost } = input
  const from = Math.max(1, input.paxFrom ?? 1)
  const to = Math.max(from, input.paxTo ?? 40)
  const rate = marginPercent / 100

  const rows: PaxPricingRow[] = []
  for (let pax = from; pax <= to; pax++) {
    // Arithmetic ordering (margin = total × rate, then selling = total + margin)
    // is load-bearing: it must match the engine this replaced bit-for-bit so the
    // swap is behavior-preserving. Don't refactor to total × (1 + rate) — that
    // reassociates the floats and shifts the last cent on some inputs.

    // ----- Without tour leader -----
    const totalNoLeader = groupFixed + transportAt(pax) + perPerson * pax
    const marginNoLeader = totalNoLeader * rate
    const sellingNoLeader = totalNoLeader + marginNoLeader
    const ppNoLeader = pax > 0 ? sellingNoLeader / pax : 0

    // ----- With tour leader (+1 transport seat, single room, own per-person) -----
    const totalLeader = groupFixed + transportAt(pax + 1) + perPerson * pax + tourLeaderCost
    const marginLeader = totalLeader * rate
    const sellingLeader = totalLeader + marginLeader
    const ppLeader = pax > 0 ? sellingLeader / pax : 0

    rows.push({
      numPax: pax,
      withoutLeader: {
        totalCost: round2(totalNoLeader),
        marginAmount: round2(marginNoLeader),
        sellingPrice: round2(sellingNoLeader),
        pricePerPerson: round2(ppNoLeader),
      },
      withLeader: {
        totalCost: round2(totalLeader),
        tourLeaderCost: round2(tourLeaderCost),
        marginAmount: round2(marginLeader),
        sellingPrice: round2(sellingLeader),
        pricePerPerson: round2(ppLeader),
      },
    })
  }
  return rows
}
