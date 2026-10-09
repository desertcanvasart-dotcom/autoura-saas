// ============================================
// The pricing_table a B2B calculator save stores
// ============================================
// b2b_quotes.pricing_table is NOT NULL (migration 001) and every partner page,
// email and PDF reads it keyed by group size. The calculator save sent none,
// so every "Save Quote" failed. The quote's own group size is always a row
// (its selling price exactly); a rate sheet generated on the page adds its
// sizes.

export type PricingTable = Record<string, { pp: number; total: number }>

const MAX_ROWS = 40

export function calculatorPricingTable(
  own: { pax: unknown; sellingPrice: unknown; pricePerPerson: unknown },
  rateSheet?: unknown
): PricingTable | null {
  const pax = Number(own.pax)
  const total = Number(own.sellingPrice)
  const pp = Number(own.pricePerPerson)
  if (!Number.isInteger(pax) || pax < 1 || !Number.isFinite(total) || total <= 0 || !Number.isFinite(pp) || pp <= 0) {
    return null
  }
  const table: PricingTable = {}
  if (Array.isArray(rateSheet)) {
    for (const row of rateSheet.slice(0, MAX_ROWS)) {
      const r = row as { pax?: unknown; pp?: unknown; total?: unknown }
      const n = Number(r?.pax)
      const rowPp = Number(r?.pp)
      const rowTotal = Number(r?.total)
      if (!Number.isInteger(n) || n < 1 || n > 100) continue
      if (!Number.isFinite(rowPp) || rowPp <= 0 || !Number.isFinite(rowTotal) || rowTotal <= 0) continue
      table[String(n)] = { pp: rowPp, total: rowTotal }
    }
  }
  table[String(pax)] = { pp, total }
  return table
}

/** What a PUT may change: never the tenant, number, source or attribution. */
export const CALCULATOR_QUOTE_EDITABLE = [
  'partner_id', 'client_name', 'client_email', 'client_phone', 'client_nationality',
  'travel_date', 'status', 'valid_until', 'notes', 'internal_notes', 'terms_and_conditions',
] as const

export function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of CALCULATOR_QUOTE_EDITABLE) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  return out
}
