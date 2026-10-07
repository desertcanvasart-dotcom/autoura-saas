// ============================================
// A trip's margin, quoted and actual, as a markup on cost
// ============================================
// The house margin (tenants.default_margin_percent, migration 279) is a
// markup on cost: a service costing 100 at 25% sells for 125. The page's
// "Quoted margin" is the same measure, so the agency's minimum
// (tenants.min_margin_percent, migration 399) is compared in it too — never
// against a share of revenue, which reads lower for the same trip (25% on
// cost is 20% of the price).
//
//   · quoted — from the service lines: each line's client price, or its cost
//     plus the itinerary's margin (what Profit & Loss shows);
//   · actual — from the P&L report (lib/trip-pnl.ts): invoiced revenue less
//     the costs recorded so far (expenses, commissions). Only once there is
//     an invoice AND a recorded cost; before that it measures nothing.
//
// Pure: the page, the P&L card and the tests share it.

export interface MarginLine {
  total_cost?: number | string | null
  client_price?: number | string | null
}

export interface QuotedMargin {
  supplierCost: number
  clientPrice: number
  margin: number
  /** Markup on cost; 0 when nothing costs anything. */
  percent: number
}

export function quotedMargin(lines: readonly MarginLine[], marginPercent: number): QuotedMargin {
  let supplierCost = 0
  let clientPrice = 0
  for (const s of lines) {
    const cost = Number(s.total_cost) || 0
    supplierCost += cost
    clientPrice += s.client_price ? Number(s.client_price) : cost * (1 + marginPercent / 100)
  }
  const margin = clientPrice - supplierCost
  return { supplierCost, clientPrice, margin, percent: supplierCost > 0 ? (margin / supplierCost) * 100 : 0 }
}

export interface ActualPnlLike {
  total_revenue: number
  gross_profit: number
  invoice_count: number
  expense_count: number
}

export interface ActualMargin {
  profit: number
  costs: number
  /** Markup on the costs recorded so far; null when none are. */
  percent: number | null
}

export function actualMargin(p: ActualPnlLike | null | undefined): ActualMargin | null {
  if (!p || p.invoice_count === 0 || p.expense_count === 0) return null
  const costs = p.total_revenue - p.gross_profit
  return { profit: p.gross_profit, costs, percent: costs > 0 ? (p.gross_profit / costs) * 100 : null }
}
