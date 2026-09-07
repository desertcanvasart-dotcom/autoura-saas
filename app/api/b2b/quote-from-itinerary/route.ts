import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getCatalogScope } from '@/lib/catalog-scope'
import { getEntranceFee, getHotelRates, getCruiseRates, getGuideRate, getMealRates } from '@/lib/pricing/rate-resolution'
import { getTieredActivityRate } from '@/lib/rates/activity-tiers'
import { getCurrencySymbol } from '@/lib/currency'
import { repriceItineraryServices } from '@/lib/b2b/quote-from-itinerary-pricing'
import type { Json } from '@/types/database.types'

// POST /api/b2b/quote-from-itinerary
// Creates a B2B quote from an itinerary. Lines the pricing grid already
// priced keep their cost; unpriced lines go through the engine's canonical
// lookups (pinned row first, then the tier lookup, which refuses to guess).
// Any remaining hole REFUSES the quote (422) — never a quote priced at 0.
// Rules: lib/b2b/quote-from-itinerary-pricing.ts.

function getSeason(date: Date): 'low' | 'high' | 'peak' {
  const month = date.getMonth() + 1
  if ([12, 1, 2, 3, 4].includes(month)) return 'high'
  if ([7, 8].includes(month)) return 'peak'
  return 'low'
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { itinerary_id, partner_id = null, margin_percent = 25, tour_leader_included = false, is_eur_passport = true, language = 'English', guide_mode = null, guide_grade = null } = body
    if (!itinerary_id) return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })

    // 1. Fetch itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries').select('*').eq('id', itinerary_id).single()
    if (itinError || !itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    // 2. Fetch days with services
    const { data: days } = await supabase
      .from('itinerary_days').select('*, itinerary_services!itinerary_services_itinerary_day_id_fkey(*)').eq('itinerary_id', itinerary_id).order('day_number')

    // 3. Partner margin override
    let effectiveMargin = margin_percent
    if (partner_id) {
      const { data: partner } = await supabase.from('b2b_partners').select('default_margin_percent').eq('id', partner_id).single()
      if (partner?.default_margin_percent) effectiveMargin = Number(partner.default_margin_percent)
    }

    const tier = itinerary.tier || 'standard'
    const numPax = (itinerary.num_adults || 2) + (itinerary.num_children || 0)
    const travelDate = itinerary.start_date ? new Date(itinerary.start_date) : new Date()
    const season = getSeason(travelDate)

    // 4–6. Price the lines, the tour leader and the single supplement
    //       through the engine (pinned row → tier lookup → hole).
    const scope = await getCatalogScope(createAdminClient(), tenant_id)
    const travelDateStr = itinerary.start_date || undefined
    const currencySymbol = getCurrencySymbol(itinerary.currency || 'EUR')
    const repriced = await repriceItineraryServices(
      (days || []) as never,
      { tier, numPax, isEurPassport: is_eur_passport, currencySymbol, tourLeaderIncluded: tour_leader_included },
      {
        hotel: (city, rateId) => getHotelRates(scope, city, tier, travelDateStr, { rateId }),
        cruise: (city, rateId) => getCruiseRates(scope, tier, city, travelDateStr, { rateId }),
        meals: () => getMealRates(scope, tier),
        guide: () => getGuideRate(scope, language, tier),
        entrance: name => getEntranceFee(scope, name, is_eur_passport),
        tieredActivity: name => getTieredActivityRate(supabase as never, name, tenant_id),
      }
    )

    if (repriced.holes.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Incomplete pricing — ${repriced.holes.length} item(s) have no usable rate`,
        holes: repriced.holes,
        complete: false,
      }, { status: 422 })
    }

    const servicesSnapshot = repriced.services
    const subtotalCost = repriced.subtotalCost
    const tourLeaderCost = repriced.tourLeaderCost
    const singleSupplement = repriced.singleSupplement

    // 7. Final pricing
    const totalCost = Math.round(subtotalCost * 100) / 100
    const marginAmount = Math.round(totalCost * (effectiveMargin / 100) * 100) / 100
    const sellingPrice = Math.round((totalCost + marginAmount) * 100) / 100
    const pricePerPerson = Math.round((sellingPrice / Math.max(numPax, 1)) * 100) / 100

    // 8. Create B2B quote (use b2b_quotes table)
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30)

    // Generate quote number via admin RPC
    const adminClient = createAdminClient()
    const { data: quoteNum } = await adminClient.rpc('generate_b2b_quote_number')

    const { data: quote, error: quoteError } = await supabase
      .from('b2b_quotes')
      .insert({
        tenant_id,
        itinerary_id,
        // Attribution (mig 270): the staff member creating the quote.
        created_by: authResult.user!.id,
        partner_id: partner_id || null,
        quote_number: quoteNum || `B2B-${Date.now()}`,
        tier,
        currency: itinerary.currency || 'EUR',
        status: 'draft',
        pricing_table: [{ pax: numPax, cost_per_person: Math.round((totalCost / numPax) * 100) / 100, selling_per_person: pricePerPerson, total: sellingPrice }],
        // Summary pricing + trip facts (migration 270 columns). These used to
        // be computed above and then dropped from the insert, so converting
        // the quote to a booking found selling_price NULL and froze a zero.
        trip_name: itinerary.trip_name,
        travel_date: itinerary.start_date,
        num_adults: itinerary.num_adults,
        num_children: itinerary.num_children,
        is_eur_passport,
        services_snapshot: servicesSnapshot as unknown as Json,
        total_cost: totalCost,
        margin_percent: effectiveMargin,
        margin_amount: marginAmount,
        selling_price: sellingPrice,
        price_per_person: pricePerPerson,
        season,
        // Guide ask (B-items 1/3): NULL = the defaults, only non-default stored.
        guide_mode: guide_mode === 'throughout' ? 'throughout' : null,
        guide_grade: guide_grade === 'senior' ? 'senior' : null,
        source: 'from_itinerary',
        tour_leader_included,
        tour_leader_cost: tourLeaderCost,
        single_supplement: singleSupplement,
        internal_notes: `Created from itinerary ${itinerary.itinerary_code} | Season: ${season} | Margin: ${effectiveMargin}%`,
      })
      .select().single()

    if (quoteError || !quote) {
      return NextResponse.json({ success: false, error: quoteError?.message || 'Failed to create quote' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: quote.id, quote_number: quote.quote_number, itinerary_id,
        itinerary_code: itinerary.itinerary_code, trip_name: itinerary.trip_name,
        total_cost: totalCost, margin_percent: effectiveMargin, margin_amount: marginAmount,
        selling_price: sellingPrice, price_per_person: pricePerPerson,
        tour_leader_cost: tourLeaderCost, single_supplement: singleSupplement,
        currency: itinerary.currency || 'EUR', num_pax: numPax, season,
        services_count: servicesSnapshot.length,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating B2B quote from itinerary:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
