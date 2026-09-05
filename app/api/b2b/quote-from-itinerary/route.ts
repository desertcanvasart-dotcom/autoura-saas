import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getCatalogScope } from '@/lib/catalog-scope'
import { getEntranceFee } from '@/lib/pricing/rate-resolution'
import { getTieredActivityRate, applyActivityTiers } from '@/lib/rates/activity-tiers'
import { getCurrencySymbol } from '@/lib/currency'

// POST /api/b2b/quote-from-itinerary
// Creates a B2B quote by re-pricing itinerary services using B2B rate tables

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

    // 4. Re-price services
    const servicesSnapshot: any[] = []
    let subtotalCost = 0

    for (const day of (days || [])) {
      const dayServices = day.itinerary_services || []
      for (const svc of dayServices) {
        let unitCost = svc.unit_cost || svc.total_cost || 0
        let lineTotal = svc.total_cost || 0
        let rateSource = 'itinerary'
        let quantityMode = (svc.quantity ?? 0) > 1 ? 'per_pax' : 'fixed'

        const serviceType = svc.service_type || ''
        const serviceName = svc.service_name || ''

        // Activities/entrances: group-size tiers first, then entrance fees
        if (serviceType === 'entrance' || serviceType === 'entrance_fee' || serviceType === 'activity') {
          // Bands on the activity itself (C3.3) first — same precedence as
          // the calculate-price engine, so the two cannot disagree about the
          // price of the same service.
          const tiered = await getTieredActivityRate(supabase as never, serviceName, tenant_id)
          if (tiered) {
            const priced = applyActivityTiers(tiered.tiers, numPax, true, getCurrencySymbol(itinerary.currency || 'EUR'))
            unitCost = priced.unitCost
            lineTotal = priced.lineTotal
            quantityMode = priced.quantityMode
            rateSource = 'activity_tiers'
          } else {
            // Entrance fees — through the canonical lookup, not a local query.
            //
            // The inline version this replaces had four faults, all of which
            // the canonical implementation already handles: it coerced a NULL
            // or absent rate to 0 (`|| 0`) and priced it as free; for a
            // non-EUR passport it never fell back to eur_rate, so a fee
            // priced only in EUR came out at 0; it did not filter
            // `is_active`; and it queried through the RLS-bound client, so it
            // could not see the intentional global-catalog rows
            // (tenant_id IS NULL, migrations 109/260).
            //
            // Since migration 278 a NULL rate means "not priced yet" and the
            // lookup returns null, so the service simply keeps its itinerary
            // cost instead of being silently zeroed. A real 0 means free and
            // prices as such.
            const scope = await getCatalogScope(createAdminClient(), tenant_id)
            const fee = await getEntranceFee(scope, serviceName, is_eur_passport)
            if (fee) {
              unitCost = fee.rate
              lineTotal = unitCost * numPax; quantityMode = 'per_pax'; rateSource = 'entrance_fees'
            }
          }
        }

        // Transportation — use guide_rates/vehicles
        if (serviceType === 'transportation') {
          const { data: vehicles } = await supabase.from('vehicles').select('daily_rate, vehicle_type').eq('is_active', true).order('passenger_capacity').limit(5)
          const vehicle = vehicles?.find((v: any) => (v.passenger_capacity || 99) >= numPax) || vehicles?.[0]
          if (vehicle?.daily_rate) { unitCost = vehicle.daily_rate; lineTotal = vehicle.daily_rate; quantityMode = 'fixed'; rateSource = 'vehicles' }
        }

        // Guide
        if (serviceType === 'guide') {
          const { data: guides } = await supabase.from('guides').select('daily_rate, full_name').eq('is_active', true).limit(1)
          if (guides?.length && guides[0].daily_rate) { unitCost = guides[0].daily_rate; lineTotal = guides[0].daily_rate; quantityMode = 'fixed'; rateSource = 'guides' }
        }

        // Accommodation
        if (serviceType === 'accommodation' || serviceType === 'hotel') {
          const { data: hotels } = await supabase.from('accommodation_rates').select('pp_double_eur, pp_double_non_eur, single_supp_eur, hotel_name').ilike('city', `%${day.city || 'Cairo'}%`).eq('tier', tier).limit(1)
          if (hotels?.length) {
            unitCost = is_eur_passport ? (hotels[0].pp_double_eur || 0) : (hotels[0].pp_double_non_eur || 0)
            lineTotal = unitCost * numPax; quantityMode = 'per_pax'; rateSource = 'accommodation_rates'
          }
        }

        // Meals
        if (serviceType === 'meal') {
          const { data: meals } = await supabase.from('meal_rates').select('base_rate_eur').limit(1)
          if (meals?.length) { unitCost = meals[0].base_rate_eur || 0; lineTotal = unitCost * numPax; quantityMode = 'per_pax'; rateSource = 'meal_rates' }
        }

        subtotalCost += lineTotal
        servicesSnapshot.push({
          service_name: serviceName, service_category: serviceType, rate_source: rateSource,
          quantity_mode: quantityMode, quantity: quantityMode === 'per_pax' ? numPax : 1,
          unit_cost: Math.round(unitCost * 100) / 100, line_total: Math.round(lineTotal * 100) / 100,
          day_number: day.day_number,
        })
      }
    }

    // 5. Tour leader cost
    let tourLeaderCost = 0
    if (tour_leader_included) {
      const { data: guides } = await supabase.from('guides').select('daily_rate').eq('is_active', true).limit(1)
      const guideRate = guides?.[0]?.daily_rate || 0
      const touringDays = Math.max((days || []).length - 1, 1)
      tourLeaderCost = guideRate * touringDays
      subtotalCost += tourLeaderCost
    }

    // 6. Single supplement
    let singleSupplement = 0
    const accomDays = (days || []).filter((d: any) => (d.itinerary_services || []).some((s: any) => s.service_type === 'accommodation' || s.service_type === 'hotel'))
    for (const day of accomDays) {
      const { data: hotels } = await supabase.from('accommodation_rates').select('pp_double_eur, single_supp_eur').ilike('city', `%${day.city || 'Cairo'}%`).eq('tier', tier).limit(1)
      if (hotels?.length) singleSupplement += (hotels[0].single_supp_eur || 0)
    }

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
        services_snapshot: servicesSnapshot,
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
