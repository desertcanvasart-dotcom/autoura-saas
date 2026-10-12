import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getCatalogScope } from '@/lib/catalog-scope'
import { getEntranceFee, getHotelRates, getCruiseRates, getGuideRate, getMealRates } from '@/lib/pricing/rate-resolution'
import { getTieredActivityRate } from '@/lib/rates/activity-tiers'
import { getCurrencySymbol } from '@/lib/currency'
import { repriceItineraryServices } from '@/lib/b2b/quote-from-itinerary-pricing'
import type { Json } from '@/types/database.types'
import { gridSheetCosts, keyedPricingTable, type SheetCost } from '@/app/pricing-grid/lib/b2b-rate-sheet'
import { buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { buildGuideRateIndex, computeThroughoutGuideExtras } from '@/app/pricing-grid/lib/throughout-guide'
import type { GridConfig, GridDay, RateOption } from '@/app/pricing-grid/types'
import { loadGridRates } from '@/lib/pricing/grid-rates'
import { repriceGridDays } from '@/lib/pricing/grid-reprice'
import { partnerInTenant } from '@/lib/quotes/partner-in-tenant'
import { roleDenied } from '@/lib/api-role-gate'

// POST /api/b2b/quote-from-itinerary
// Creates a B2B quote from an itinerary. Lines the pricing grid already
// priced keep their cost; unpriced lines go through the engine's canonical
// lookups (pinned row first, then the tier lookup, which refuses to guess).
// Any remaining hole REFUSES the quote (422) — never a quote priced at 0.
// Rules: lib/b2b/quote-from-itinerary-pricing.ts.
//
// The Pricing Grid sends its picks (`grid`: days + config). The partner price
// list — the trip's cost at each group size (app/pricing-grid/lib/
// b2b-rate-sheet.ts) — is worked out HERE from them, each pick priced from
// the rates as they are now (lib/pricing/grid-reprice), and stored at the
// quote's margin. The grid's own figures are never taken. Without `grid` the
// quote lists its own size.

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
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { itinerary_id, partner_id = null, tour_leader_included = false, is_eur_passport = true, language = 'English', guide_mode = null, guide_grade = null } = body
    if (!itinerary_id) return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })
    const grid = body.grid
    if (grid !== undefined && (typeof grid !== 'object' || !grid || !Array.isArray(grid.days) || typeof grid.config !== 'object' || !grid.config)) {
      return NextResponse.json({ success: false, error: 'grid must carry the days and config' }, { status: 400 })
    }

    // 1. Fetch itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries').select('*').eq('id', itinerary_id).single()
    if (itinError || !itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    // 2. Fetch days with services
    const { data: days } = await supabase
      .from('itinerary_days').select('*, itinerary_services!itinerary_services_itinerary_day_id_fkey(*)').eq('itinerary_id', itinerary_id).order('day_number')

    // 3. Partner margin override — the partner must be this tenant's
    //    (lib/quotes/partner-in-tenant). A 0% default margin is a margin.
    const partnerCheck = await partnerInTenant(supabase, partner_id, tenant_id)
    if (!partnerCheck.ok) return NextResponse.json({ success: false, error: partnerCheck.error }, { status: partnerCheck.status })
    // The margin the operator priced with wins: picking a partner already
    // puts the partner's default in the grid, and a margin changed after that
    // is a decision — the server used to overwrite it with the default. With
    // none sent, the partner's default (0% is a margin), else 25%.
    const sentMargin = body.margin_percent === null || body.margin_percent === '' || body.margin_percent === undefined
      ? NaN : Number(body.margin_percent)
    let effectiveMargin = Number.isFinite(sentMargin) ? sentMargin : 25
    if (!Number.isFinite(sentMargin) && partnerCheck.partner?.default_margin_percent != null) {
      effectiveMargin = Number(partnerCheck.partner.default_margin_percent)
    }

    const tier = itinerary.tier || 'standard'
    const numPax = (itinerary.num_adults || 2) + (itinerary.num_children || 0)
    const travelDate = itinerary.start_date ? new Date(itinerary.start_date) : new Date()
    const season = getSeason(travelDate)

    // The partner price list, from the grid's picks priced from today's rates.
    let sheetCosts: SheetCost[] = []
    if (grid) {
      // The lists the grid priced from: its tier and its date.
      const gridRates = await loadGridRates(supabase, tenant_id, { tier: grid.config.tier || tier, startDate: grid.config.startDate || null })
      const pricedDays = repriceGridDays(grid.days as GridDay[], gridRates as Record<string, RateOption[]>).days
      const gridConfig = {
        ...grid.config,
        pax: numPax,
        passport: is_eur_passport ? 'eu' : 'non_eu',
        withGuide: grid.config.withGuide !== false,
      } as GridConfig
      const throughout = computeThroughoutGuideExtras(pricedDays, gridConfig, buildGuideRateIndex(gridRates as Record<string, RateOption[]>))
      sheetCosts = gridSheetCosts(
        pricedDays, gridConfig, buildTransportTierIndex((gridRates.route ?? []) as RateOption[]),
        { groupExtraEur: throughout.totalEur },
      )
    }

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

    const adminClient = createAdminClient()

    // The price and trip facts — the same on a new quote and a repriced one.
    const priced = {
        partner_id: partner_id || null,
        tier,
        currency: itinerary.currency || 'EUR',
        // Keyed by group size — the shape every quote page, email and PDF
        // reads. A list here showed as one "0 pax" column with no price.
        pricing_table: keyedPricingTable(sheetCosts, Number(effectiveMargin) || 0, { pax: numPax, sellingPrice, pricePerPerson }),
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
        // Any of the agency's grades; NULL = its first (the default).
        guide_grade: typeof guide_grade === 'string' && guide_grade.trim() ? guide_grade.trim() : null,
        source: 'from_itinerary',
        tour_leader_included,
        tour_leader_cost: tourLeaderCost,
        single_supplement: singleSupplement,
    }

    // "Update B2B Quote" reprices the itinerary's open quote (draft or sent),
    // as a B2C re-save does — it used to add a new quote on every save, so
    // the partner's list filled with copies at old prices.
    const { data: openRows } = await supabase
      .from('b2b_quotes')
      .select('id, quote_number')
      .eq('itinerary_id', itinerary_id)
      .eq('tenant_id', tenant_id)
      .in('status', ['draft', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
    const open = openRows?.[0] ?? null

    let quote: { id: string; quote_number: string } | null = null
    let quoteError: { message: string } | null = null
    if (open) {
      const res = await supabase
        .from('b2b_quotes')
        .update({ ...priced, updated_at: new Date().toISOString() })
        .eq('id', open.id)
        .eq('tenant_id', tenant_id)
        .select('id, quote_number').single()
      quote = res.data
      quoteError = res.error
      if (quote) {
        // The same version snapshot the quote editor records. The id came
        // from this tenant's own (RLS) read and update just above.
        try {
          await adminClient.rpc('create_b2b_quote_version', {
            p_quote_id: quote.id,
            p_changed_by: authResult.user!.id,
            p_change_reason: `Repriced from itinerary ${itinerary.itinerary_code}`,
          })
        } catch (versionError) {
          console.error('Error creating quote version:', versionError instanceof Error ? versionError.message : versionError)
        }
      }
    } else {
      const { data: quoteNum } = await adminClient.rpc('generate_b2b_quote_number')
      const res = await supabase
        .from('b2b_quotes')
        .insert({
          ...priced,
          tenant_id,
          itinerary_id,
          // Attribution (mig 270): the staff member creating the quote.
          created_by: authResult.user!.id,
          quote_number: quoteNum || `B2B-${Date.now()}`,
          status: 'draft',
          internal_notes: `Created from itinerary ${itinerary.itinerary_code} | Season: ${season} | Margin: ${effectiveMargin}%`,
        })
        .select('id, quote_number').single()
      quote = res.data
      quoteError = res.error
    }

    if (quoteError || !quote) {
      return NextResponse.json({ success: false, error: quoteError?.message || 'Failed to save quote' }, { status: 500 })
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
        action: open ? 'updated' : 'created',
      },
    }, { status: open ? 200 : 201 })
  } catch (error: any) {
    console.error('Error creating B2B quote from itinerary:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
