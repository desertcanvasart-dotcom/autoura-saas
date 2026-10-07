// ============================================
// The B2C quote a Pricing Grid save writes to
// ============================================
// Saving the grid used to INSERT a new draft B2C quote every time — so after
// "Update Itinerary" the quote the operator started from still showed the old
// price, and the quotes list gained a duplicate draft per save.
//
// Now a re-save updates the itinerary's quote that is still open (draft,
// sent or viewed): its price, cost, margin, per-person price and traveller
// count follow the grid, and a version snapshot records the change (the same
// create_b2c_quote_version the quote editor uses). A quote that is closed —
// accepted (the client agreed a price), rejected or expired — is never
// repriced: the new price goes on a new draft instead.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Statuses whose price may still change. */
export const OPEN_QUOTE_STATUSES = ['draft', 'sent', 'viewed'] as const

export interface GridQuotePrice {
  pax: number
  tier: string
  currency: string
  supplierTotal: number
  sellingTotal: number
  marginPercent: number
}

export interface OpenQuote {
  id: string
  quote_number: string
  status: string
  selling_price: number | null
}

/** The itinerary's most recent quote that is still open, if any. */
export async function findOpenGridQuote(db: SupabaseClient, itineraryId: string): Promise<OpenQuote | null> {
  const { data, error } = await db
    .from('b2c_quotes')
    .select('id, quote_number, status, selling_price')
    .eq('itinerary_id', itineraryId)
    .in('status', [...OPEN_QUOTE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as OpenQuote | undefined) ?? null
}

/** The fields a grid save sets on the quote. */
export function quotePriceFields(p: GridQuotePrice) {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const pax = Math.max(p.pax, 1)
  return {
    num_travelers: pax,
    tier: p.tier,
    currency: p.currency,
    total_cost: p.supplierTotal,
    margin_percent: p.marginPercent,
    selling_price: p.sellingTotal,
    price_per_person: round2(p.sellingTotal / pax),
  }
}
