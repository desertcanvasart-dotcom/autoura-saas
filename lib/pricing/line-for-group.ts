// ============================================
// A breakdown line, as the GROUP pays it
// ============================================
// The engine emits a per-person line once — quantity 1, lineTotal = one
// person's amount — and scales it by the group when it totals. A breakdown
// that shows the line unscaled does not add up to its own subtotal: reported
// from production 2026-09-21, "Lunch · per_pax · Qty 1 · 10.00" and rows
// summing to 112.47 above a subtotal of 124.48 for two people.
//
// The app's other two pricing paths (the variation-services path and
// quote-from-itinerary) already send a per-person line as quantity =
// passengers, total = unit × passengers. This is that convention in one
// place. Pure: no database, no framework.

export interface EngineLine { isPerPax?: boolean; quantity?: number; lineTotal?: number }

export function scaleForGroup(line: EngineLine, pax: number): { quantity: number; lineTotal: number } {
  const quantity = Number(line.quantity) || 1
  const lineTotal = Number(line.lineTotal) || 0
  const people = Number.isFinite(pax) && pax > 0 ? pax : 1
  if (!line.isPerPax) return { quantity, lineTotal }
  return { quantity: quantity * people, lineTotal: Math.round(lineTotal * people * 100) / 100 }
}

/** What the rows of a breakdown add up to — for checking them against the subtotal. */
export function sumForGroup(lines: readonly EngineLine[], pax: number): number {
  return Math.round(lines.reduce((n, l) => n + scaleForGroup(l, pax).lineTotal, 0) * 100) / 100
}
