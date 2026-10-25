// ============================================
// A confirmed extra's supplier cost, in the currency the supplier is paid in
// ============================================
// A confirmed extra goes onto the booking's supplier manifest
// (booking_supplier_status) and, once confirmed there, becomes an expense
// (lib/bookings/supplier-expense) in the row's cost_currency. An extra's
// supplier cost of EGP 150 on a yen booking went in as ¥150 (documents
// audit, round 12), then as its yen conversion; now it goes in as EGP 150,
// which is what the supplier is owed. cost_currency null = the booking's
// currency. Pure: the extras route and the tests share it.

export interface ManifestCost {
  quotedCost: number | null
  /** Currency of quotedCost; null = the booking's. */
  costCurrency: string | null
}

export function manifestCost(
  extra: { supplier_cost?: unknown; supplier_currency?: unknown; currency?: unknown },
  bookingCurrency: unknown,
): ManifestCost {
  const booking = String(bookingCurrency || 'EUR').trim().toUpperCase()
  const raw = extra.supplier_cost
  const cost = raw == null || raw === '' ? null : Number(raw)
  if (cost == null || !Number.isFinite(cost)) return { quotedCost: null, costCurrency: null }
  const from = String(extra.supplier_currency || extra.currency || booking).trim().toUpperCase()
  return { quotedCost: cost, costCurrency: from === booking ? null : from }
}
