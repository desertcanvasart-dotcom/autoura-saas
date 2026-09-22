// ============================================
// /api/tours/browse/prices — the "starting from" figures, after the list
// ============================================
// GET ?ids=<uuid>,<uuid>,…   (at most MAX_IDS)
//
// The tours page used to wait for the pricing engine before showing ANYTHING:
// /api/tours/browse priced every tour on the page, and one tour is ~30
// database round trips (#467). Measured on production data, 2026-09-21: about
// 5–8 seconds for Sawa Tours' page, 6–7 for Sillage's — for cards that then
// showed no price, because every tour still lacked a rate.
//
// So the list comes first, from /api/tours/browse, which no longer prices at
// all; and the page asks HERE for the prices, a few tours at a time, filling
// each card in as its answer arrives. Nothing is remembered between requests:
// a rate changed a second ago is the rate this prices from.
//
// Tenant safety: the templates are read through the caller's own RLS client,
// so an id from another agency simply is not found — and is not priced.

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { startingFromFor, NO_PRICE, type PricedTemplate, type StartingFrom } from '@/lib/tours/starting-from'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'

export const dynamic = 'force-dynamic'

/** A few tours per request — the page sends several requests, so one slow
 *  tour holds up its own small batch, not the whole page. */
const MAX_IDS = 6
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()

    const raw = (new URL(request.url).searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    const ids = [...new Set(raw)]
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'Say which tours to price: ?ids=<id>,<id>' }, { status: 400 })
    if (ids.length > MAX_IDS) return NextResponse.json({ success: false, error: `At most ${MAX_IDS} tours per request` }, { status: 400 })
    if (!ids.every(id => UUID.test(id))) return NextResponse.json({ success: false, error: 'ids must be tour ids' }, { status: 400 })

    // RLS scopes this to the caller's tenant: another agency's id finds nothing.
    const { data: templates, error } = await supabase
      .from('tour_templates')
      .select('id, tenant_id, itinerary, tour_variations ( id, is_active )')
      .in('id', ids)
      .eq('is_active', true)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    const readManualPrice = async (variationIds: string[]): Promise<number | null> => {
      const { data } = await supabase
        .from('variation_pricing')
        .select('price_per_person')
        .in('variation_id', variationIds)
        .order('price_per_person', { ascending: true })
        .limit(1)
      const price = data?.[0]?.price_per_person
      return typeof price === 'number' ? price : price == null ? null : Number(price)
    }

    const prices: Record<string, StartingFrom> = {}
    await Promise.all(((templates ?? []) as unknown as PricedTemplate[]).map(async t => {
      try {
        prices[t.id] = await startingFromFor(t, readManualPrice)
      } catch (e) {
        // One tour that cannot be priced is a card with no price, not a page
        // with no prices.
        console.error(`starting-from failed for template ${t.id}:`, e)
        prices[t.id] = NO_PRICE
      }
    }))

    // The figures are in the tenant's own run currency, not a hard-coded EUR —
    // an agency that prices in USD/EGP must not read its cards as euros. One
    // tenant per request (RLS), so one currency for the batch.
    const tenantId = (templates ?? [])[0]?.tenant_id
    const currency = tenantId ? await getTenantRunCurrency(supabase, tenantId) : 'EUR'

    return NextResponse.json({ success: true, data: { prices, currency } })
  } catch (error) {
    console.error('Error in tours browse prices API:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
