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
import { withSeasonPremium } from '@/lib/quotes/b2c-quote-price'

/** Statuses whose price may still change. */
export const OPEN_QUOTE_STATUSES = ['draft', 'sent', 'viewed'] as const

export interface GridQuotePrice {
  pax: number
  tier: string
  currency: string
  supplierTotal: number
  sellingTotal: number
  marginPercent: number
  /** The departure's seasonal premium (lib/quotes/quote-season). */
  season?: { season_name: string | null; season_percent: number }
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
// Rounded in the currency's own units, as the quote editor rounds them
// (priceB2cQuote): a quote saved from the grid and then opened in the
// editor read a different per-person price for the same figures.
export function quotePriceFields(p: GridQuotePrice) {
  const pax = Math.max(p.pax, 1)
  // The grid's selling total, plus the departure's seasonal premium on top
  // (after margin), recorded as its own line.
  const price = withSeasonPremium(p.sellingTotal, p.season?.season_percent ?? 0, pax, p.currency)
  return {
    num_travelers: pax,
    tier: p.tier,
    currency: p.currency,
    total_cost: p.supplierTotal,
    margin_percent: p.marginPercent,
    selling_price: price.selling_price,
    price_per_person: price.price_per_person,
    season_name: p.season?.season_name ?? null,
    season_percent: p.season?.season_percent ?? 0,
    season_premium: price.season_premium,
  }
}
