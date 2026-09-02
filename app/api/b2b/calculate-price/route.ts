import { NextRequest, NextResponse } from 'next/server'
import { calculateAutoPricing, ServiceTier } from '@/lib/auto-pricing-service'
import { getEntranceFee as canonicalGetEntranceFee } from '@/lib/pricing/rate-resolution'
import { getCatalogScope } from '@/lib/catalog-scope'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getTieredActivityRate, applyActivityTiers } from '@/lib/rates/activity-tiers'
import {
  priceExtras, addExtrasToMoney,
  type CatalogueExtra, type ExtraSelection, type MoneyBlock,
} from '@/lib/pricing/extras-pricing'
// A priced OPTION is an optional service line of the variation, priced
// off-margin when the operator set a price — the same modules as travel-ops-pro.
import { parseOptionalSelection, isOptionalSelected } from '@/lib/b2b/optional-selection'
import { composeQuoteTotals, optionalContribution, type OptionalContribution } from '@/lib/b2b/optional-pricing'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { getCurrencySymbol } from '@/lib/currency'

// ============================================
// B2B TOUR PRICE CALCULATOR - v6
// File: app/api/b2b/calculate-price/route.ts
// 
// UPDATES in v6:
// - Added tour_leader_included parameter
// - Returns single_supplement in response
// - Returns pax_pricing_table for rate sheet generation
//
// NOW WITH AUTO-PRICING FALLBACK:
// If tour_variation_services is empty, uses auto-pricing
// from tour_templates.itinerary (via auto-pricing-service.ts)
//
// SHARED B2C RATE TABLES:
// - vehicles, guides, entrance_fees, hotel_contacts, meal_rates, nile_cruises
// 
// B2B-SPECIFIC TABLES:
// - b2b_transport_packages, b2b_partners, b2b_partner_pricing
// (group-size activity tiers live on activity_rates.tiers — migration 306)
// ============================================

// Service-role client (auth is enforced per-handler via requireAuth)
function getSupabaseAdmin() {
  return createAdminClient()
}

interface CalculatedService {
  service_id: string
  service_name: string
  service_category: string
  rate_type: string | null
  rate_source: string
  quantity_mode: string
  quantity: number
  unit_cost: number
  line_total: number
  is_optional: boolean
  day_number: number | null
  pricing_note?: string
  // Optional services only: chosen for this quote, and what the customer pays.
  is_selected?: boolean
  selling_price?: number
  price_basis?: 'operator_price' | 'cost_plus_margin'
}

interface PriceCalculationResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  travel_date: string
  season: string
  is_eur_passport: boolean
  tour_leader_included: boolean  // NEW
  services: CalculatedService[]
  optional_services: CalculatedService[]
  subtotal_cost: number
  optional_total: number
  total_cost: number
  tour_leader_cost: number  // NEW
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement: number  // NEW
  currency: string
  pax_pricing_table?: any[]  // NEW - for rate sheet
  // Harness: deliverable only when complete; holes list services with no real rate.
  complete: boolean
  holes: { kind?: string; message: string }[]
}

function getSeason(date: Date): 'low' | 'high' | 'peak' {
  const month = date.getMonth() + 1
  if ([12, 1, 2, 3, 4].includes(month)) return 'high'
  if ([7, 8].includes(month)) return 'peak'
  return 'low'
}

// Catalogue extras chosen for this quote. Only ACTIVE rows of this tenant come
// back; a withdrawn or foreign id is therefore a hole downstream, never a sale.
async function loadExtras(tenantId: string, ids: string[]): Promise<CatalogueExtra[]> {
  if (ids.length === 0) return []
  const { data, error } = await getSupabaseAdmin()
    .from('extras_catalogue')
    .select('id, name, supplier_cost, selling_price, unit')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('id', ids)
  if (error) {
    console.error('Error loading extras_catalogue:', error)
    return []
  }
  // The column is a CHECK-constrained text; narrow it to the two units.
  return (data || []) as unknown as CatalogueExtra[]
}

// Fold priced extras into a finished result: lines join services (and so the
// quote's services_snapshot), money is re-totalled at every pax count of the
// rate sheet, and any hole makes the quote incomplete. Both engine branches
// return through here so extras behave identically for auto-priced and
// service-listed variations.
function foldExtras(
  result: PriceCalculationResult,
  catalogue: CatalogueExtra[],
  selections: ExtraSelection[]
): PriceCalculationResult {
  if (selections.length === 0) return result
  const m = result.margin_percent
  const r2 = (n: number) => Math.round(n * 100) / 100

  const p = priceExtras(catalogue, selections, result.num_pax)
  const money = addExtrasToMoney(
    {
      totalCost: result.total_cost,
      marginAmount: result.margin_amount,
      sellingPrice: result.selling_price,
      pricePerPerson: result.price_per_person,
    },
    p, result.num_pax, m
  )

  // Per-person extras scale per row; per-booking ones are charged once per row.
  // pax_pricing_table is typed any[] upstream; `row` is inferred, not declared.
  type PaxBlock = (MoneyBlock & Record<string, unknown>) | undefined
  const pax_pricing_table = result.pax_pricing_table?.map((row) => {
    const rp = priceExtras(catalogue, selections, row.numPax)
    const fold = (b: PaxBlock) => (b ? { ...b, ...addExtrasToMoney(b, rp, row.numPax, m) } : b)
    return { ...row, withoutLeader: fold(row.withoutLeader), withLeader: fold(row.withLeader) }
  })

  const holes = [...result.holes, ...p.holes]
  return {
    ...result,
    services: [...result.services, ...p.lines],
    subtotal_cost: r2(result.subtotal_cost + p.cost_total),
    total_cost: money.totalCost,
    margin_amount: money.marginAmount,
    selling_price: money.sellingPrice,
    price_per_person: money.pricePerPerson,
    pax_pricing_table,
    holes,
    complete: holes.length === 0,
  }
}

// Get transport package for cruise sightseeing (kept for package deals)
async function getTransportPackage(packageType: string, originCity: string, destCity: string, tenantId?: string): Promise<any | null> {
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('b2b_transport_packages')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('package_type', packageType)
    .eq('origin_city', originCity)
    .eq('destination_city', destCity)
    .eq('is_active', true)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

// Select vehicle from transport package based on group size
function selectVehicleFromPackage(pkg: any, numPax: number): { rate: number; vehicle: string } {
  if (numPax <= pkg.sedan_capacity && pkg.sedan_rate) {
    return { rate: pkg.sedan_rate, vehicle: 'Sedan' }
  } else if (numPax <= pkg.minivan_capacity && pkg.minivan_rate) {
    return { rate: pkg.minivan_rate, vehicle: 'Minivan' }
  } else if (numPax <= pkg.van_capacity && pkg.van_rate) {
    return { rate: pkg.van_rate, vehicle: 'Van' }
  } else if (numPax <= pkg.minibus_capacity && pkg.minibus_rate) {
    return { rate: pkg.minibus_rate, vehicle: 'Minibus' }
  } else {
    return { rate: pkg.bus_rate || pkg.minibus_rate, vehicle: 'Bus' }
  }
}

// Select appropriate vehicle from vehicles table based on pax count and tier
async function selectVehicleFromB2CTable(numPax: number, tier: string = 'standard', tenantId?: string): Promise<{ rate: number; vehicle: string; id: string } | null> {
  const { data: vehicles, error } = await (getSupabaseAdmin() as any)
    .from('vehicles')
    .select('id, vehicle_type, name, daily_rate, passenger_capacity, tier, is_preferred')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .order('is_preferred', { ascending: false })

  if (error || !vehicles || vehicles.length === 0) return null

  // First try to find a vehicle matching tier and capacity
  let selectedVehicle = vehicles.find((v: any) => 
    v.tier === tier && 
    numPax <= (v.passenger_capacity || 99)
  )

  // Fallback: any vehicle that fits capacity
  if (!selectedVehicle) {
    selectedVehicle = vehicles.find((v: any) => 
      numPax <= (v.passenger_capacity || 99)
    )
  }

  // Final fallback: largest vehicle
  if (!selectedVehicle) {
    selectedVehicle = vehicles[vehicles.length - 1]
  }

  if (!selectedVehicle) return null

  const v = selectedVehicle as any
  return {
    rate: v.daily_rate || 0,
    vehicle: v.vehicle_type || v.name || 'Vehicle',
    id: v.id
  }
}

// Select guide from guides table based on language and tier
async function selectGuideFromB2CTable(language: string = 'English', tier: string = 'standard', tenantId?: string): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: guides, error } = await (getSupabaseAdmin() as any)
    .from('guides')
    .select('id, name, daily_rate, languages, tier, is_preferred')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .contains('languages', [language])
    .order('is_preferred', { ascending: false })

  if (error || !guides || guides.length === 0) {
    // Fallback: any guide
    const { data: anyGuide } = await (getSupabaseAdmin() as any)
      .from('guides')
      .select('id, name, daily_rate, tier')
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyGuide || anyGuide.length === 0) return null

    const g = anyGuide[0] as any
    return {
      rate: g.daily_rate || 0,
      name: g.name || 'Guide',
      id: g.id
    }
  }

  // Find guide matching tier
  const selectedGuide = (guides.find((g: any) => g.tier === tier) || guides[0]) as any

  return {
    rate: selectedGuide.daily_rate || 0,
    name: selectedGuide.name || 'Guide',
    id: selectedGuide.id
  }
}

// Entrance fee lookup — delegates to the canonical implementation.
//
// This route used to carry its own copy, and it drifted: it had no `rate > 0`
// guard, so an attraction with a 0 rate produced a real EUR 0 line labelled
// rateSource 'entrance_fees' with a note reading "EUR 0/pax". The engine's own
// caller has always rejected that. lib/pricing/rate-resolution.ts says exactly
// why this must not be reimplemented — "any route that needs a rate must
// import from HERE, never reimplement lookups" — and this is what happens when
// it is: one surface learns the fix (migration 278's unpriced-vs-free
// distinction) and the copy does not.
//
// The signature is kept so the call site below is unchanged.
async function getEntranceFee(
  attractionName: string,
  isEurPassport: boolean,
  tenantId?: string
): Promise<{ rate: number; name: string; id: string } | null> {
  const scope = await getCatalogScope(getSupabaseAdmin(), tenantId ?? '')
  const fee = await canonicalGetEntranceFee(scope, attractionName, isEurPassport)
  if (!fee) return null
  return { rate: fee.rate, name: fee.name, id: fee.id }
}

// Get hotel rate from hotel_contacts table
async function getHotelRate(city: string, tier: string = 'standard', tenantId?: string): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: hotels, error } = await (getSupabaseAdmin() as any)
    .from('hotel_contacts')
    .select('id, name, rate_double_eur, city, tier, is_preferred')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('is_preferred', { ascending: false })
    .limit(1)

  if (error || !hotels || hotels.length === 0) {
    // Fallback: any hotel in city
    const { data: anyHotel } = await (getSupabaseAdmin() as any)
      .from('hotel_contacts')
      .select('id, name, rate_double_eur')
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyHotel || anyHotel.length === 0) return null

    const h = anyHotel[0] as any
    return {
      rate: h.rate_double_eur || 0,
      name: h.name || 'Hotel',
      id: h.id
    }
  }

  const hotel = hotels[0] as any
  return {
    rate: hotel.rate_double_eur || 0,
    name: hotel.name || 'Hotel',
    id: hotel.id
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const tenantId = authResult.tenant_id

    const body = await request.json()
    const {
      variation_id,
      num_pax = 2,
      travel_date = new Date().toISOString().split('T')[0],
      is_eur_passport = true,
      margin_percent = 25,
      partner_id = null,
      language = 'English',
      tier = 'standard',
      tour_leader_included = false,  // NEW: Added tour leader parameter
      // Catalogue extras chosen for THIS quote (ids, or {id} objects). Priced
      // through the engine like any other line — see lib/pricing/extras-pricing.
      extras = []
      // include_optionals / selected_optional_ids are read off `body` by
      // parseOptionalSelection below, not destructured here.
    } = body



    if (!variation_id) {
      return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
    }

    // Accept ids or {id} objects; anything else is ignored rather than trusted.
    const isSelection = (e: unknown): e is ExtraSelection =>
      typeof e === 'object' && e !== null &&
      typeof (e as { id?: unknown }).id === 'string' && (e as { id: string }).id.length > 0
    const extraSelections: ExtraSelection[] = (Array.isArray(extras) ? extras : [])
      .map((e: unknown) => (typeof e === 'string' ? { id: e } : e))
      .filter(isSelection)
    const extrasCatalogue = await loadExtras(tenantId, extraSelections.map((e) => e.id))

    // WHICH optional services the customer is buying, not merely whether. The
    // old boolean priced every option or none — see lib/b2b/optional-selection.
    const optionalSelection = parseOptionalSelection(body)

    // Fetch variation with template info
    const { data: variation, error: varError } = await (getSupabaseAdmin() as any)
      .from('tour_variations')
      .select(`
        id, variation_name, variation_code, tier, group_type, min_pax, max_pax,
        tour_templates (id, template_name, template_code, duration_days, uses_day_builder, pricing_mode)
      `)
      .eq('id', variation_id)
      .eq('tenant_id', tenantId)
      .single()

    if (varError || !variation) {
      console.error('Variation fetch error:', varError)
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 })
    }

    const v = variation as any
    const effectiveTier = (v.tier || tier) as ServiceTier
    const template = v.tour_templates as any
    const templateId = template?.id

    // Fetch services for this variation
    const { data: services, error: servError } = await (getSupabaseAdmin() as any)
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', variation_id)
      .eq('tenant_id', tenantId)
      .order('sequence_order')

    if (servError) {
      console.error('Services fetch error:', servError)
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
    }

    // ============================================
    // AUTO-PRICING FALLBACK
    // If no services AND template uses day builder, use auto-pricing
    // ============================================
    if ((!services || services.length === 0) && templateId) {



      // Determine effective margin (partner override)
      let effectiveMargin = margin_percent
      if (partner_id) {
        const { data: partner } = await (getSupabaseAdmin() as any)
          .from('b2b_partners')
          .select('default_margin_percent')
          .eq('id', partner_id)
          .eq('tenant_id', tenantId)
          .single()

        if ((partner as any)?.default_margin_percent) {
          effectiveMargin = (partner as any).default_margin_percent
        }
      }

      // Call auto-pricing service with tour leader parameter
      const autoPriceResult = await calculateAutoPricing({
        templateId,
        tenantId,
        tier: effectiveTier,
        numPax: num_pax,
        isEurPassport: is_eur_passport,
        language,
        marginPercent: effectiveMargin,
        mealPlan: 'lunch_only',
        includeAccommodation: (template?.duration_days || 1) > 1,
        tourLeaderIncluded: tour_leader_included  // NEW: Pass tour leader flag
      })

      if (!autoPriceResult.success) {
        return NextResponse.json({ 
          error: 'Auto-pricing failed', 
          warnings: autoPriceResult.warnings 
        }, { status: 500 })
      }

      // Convert auto-pricing result to B2B format
      const travelDate = new Date(travel_date)
      const season = getSeason(travelDate)

      const convertedServices: CalculatedService[] = autoPriceResult.services.map((s: any) => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: s.isOptional,
        day_number: s.dayNumber,
        pricing_note: s.notes
      }))

      const convertedOptional: CalculatedService[] = autoPriceResult.optionalServices.map((s: any) => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: true,
        day_number: s.dayNumber,
        pricing_note: s.notes
      }))

      const result: PriceCalculationResult = {
        variation_id: v.id,
        variation_name: v.variation_name,
        template_name: template?.template_name || '',
        num_pax,
        travel_date,
        season,
        is_eur_passport,
        tour_leader_included,  // NEW
        services: convertedServices,
        optional_services: convertedOptional,
        subtotal_cost: autoPriceResult.subtotalCost,
        optional_total: autoPriceResult.optionalTotal,
        total_cost: autoPriceResult.totalCost,
        tour_leader_cost: autoPriceResult.tourLeaderCost,  // NEW
        margin_percent: autoPriceResult.marginPercent,
        margin_amount: autoPriceResult.marginAmount,
        selling_price: autoPriceResult.sellingPrice,
        price_per_person: autoPriceResult.pricePerPerson,
        single_supplement: autoPriceResult.singleSupplement || 0,  // NEW
        currency: autoPriceResult.currency,
        pax_pricing_table: autoPriceResult.paxPricingTable,  // NEW - for rate sheet
        // Harness: propagate completeness from the hardened engine.
        complete: autoPriceResult.complete,
        holes: (autoPriceResult.holes || []).map((h) => ({ kind: h.kind, message: h.message })),
      }

      return NextResponse.json({
        success: true,
        data: foldExtras(result, extrasCatalogue, extraSelections),
      })
    }

    // ============================================
    // ORIGINAL LOGIC: Process tour_variation_services
    // ============================================

    const travelDate = new Date(travel_date)
    const season = getSeason(travelDate)

    // Determine effective margin (partner override)
    let effectiveMargin = margin_percent
    if (partner_id) {
      const { data: partner } = await (getSupabaseAdmin() as any)
        .from('b2b_partners')
        .select('default_margin_percent')
        .eq('id', partner_id)
        .eq('tenant_id', tenantId)
        .single()

      if ((partner as any)?.default_margin_percent) {
        effectiveMargin = (partner as any).default_margin_percent
      }

      const { data: override } = await (getSupabaseAdmin() as any)
        .from('b2b_partner_pricing')
        .select('margin_percent_override')
        .eq('partner_id', partner_id)
        .eq('variation_id', variation_id)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .single()

      if ((override as any)?.margin_percent_override) {
        effectiveMargin = (override as any).margin_percent_override
      }
    }

    const calculatedServices: CalculatedService[] = []
    const optionalServices: CalculatedService[] = []
    const holes: { kind?: string; message: string }[] = []
    let subtotalCost = 0
    // One entry per CHOSEN optional service — see lib/b2b/optional-pricing.
    const chosenOptionals: OptionalContribution[] = []

    // Process each service
    for (const svc of (services || [])) {
      const service = svc as any
      let unitCost = 0
      let lineTotal = 0
      let rateSource = 'manual'
      let pricingNote = ''
      let effectiveQuantityMode = service.quantity_mode || 'per_pax'

      // ============================================
      // STEP 1: Group-size tiers on the activity itself (felucca, camel ride…)
      // ============================================
      if (service.rate_type === 'activity' && service.service_name) {
        // Bands live on the activity in the catalog the rest of the app prices
        // from (activity_rates.tiers, migration 306), carry as many bands as the
        // contract has, and are matched on the FULL service name.
        const tiered = await getTieredActivityRate(
          getSupabaseAdmin() as never,
          service.service_name,
          tenantId
        )
        if (tiered) {
          // The note is shown to a human, so it carries the tenant's own
          // currency symbol rather than a hardcoded one (C3.4).
          const symbol = getCurrencySymbol(await getTenantRunCurrency(getSupabaseAdmin(), tenantId ?? ''))
          const priceResult = applyActivityTiers(tiered.tiers, num_pax, is_eur_passport ?? true, symbol)
          unitCost = priceResult.unitCost
          lineTotal = priceResult.lineTotal
          pricingNote = priceResult.pricingNote
          effectiveQuantityMode = priceResult.quantityMode
          rateSource = 'activity_tiers'
        }
      }

      // ============================================
      // STEP 2: Check for B2B transport packages (cruise sightseeing)
      // ============================================
      if (rateSource === 'manual' && service.service_category === 'transportation') {
        if (service.service_name?.toLowerCase().includes('sightseeing')) {
          const pkg = await getTransportPackage('cruise_sightseeing', 'Luxor', 'Aswan', tenantId)
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: €${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'

          }
        }
        else if (service.service_name?.toLowerCase().includes('transfer') || 
                 service.service_name?.toLowerCase().includes('airport')) {
          const pkg = await getTransportPackage('cruise_transfer', 'Luxor', 'Aswan', tenantId)
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: €${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
          }
        }
      }

      // ============================================
      // STEP 3: Use B2C tables for standard lookups
      // ============================================
      if (rateSource === 'manual') {
        const rateType = service.rate_type || service.service_category

        switch (rateType) {
          case 'transportation': {
            const vehicle = await selectVehicleFromB2CTable(num_pax, effectiveTier, tenantId)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: €${vehicle.rate}/day`
              rateSource = 'vehicles'

            }
            break
          }

          case 'guide': {
            const guide = await selectGuideFromB2CTable(language, effectiveTier, tenantId)
            if (guide) {
              unitCost = guide.rate
              lineTotal = guide.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${guide.name}: €${guide.rate}/day`
              rateSource = 'guides'

            }
            break
          }

          case 'activity':
          case 'entrance': {
            if (service.service_name) {
              const fee = await getEntranceFee(service.service_name, is_eur_passport, tenantId)
              if (fee) {
                unitCost = fee.rate
                lineTotal = fee.rate * num_pax
                effectiveQuantityMode = 'per_pax'
                pricingNote = `${fee.name}: €${fee.rate}/pax (${is_eur_passport ? 'EUR' : 'non-EUR'})`
                rateSource = 'entrance_fees'

              }
            }
            break
          }

          case 'accommodation': {
            const hotel = await getHotelRate(service.city || 'Cairo', effectiveTier, tenantId)
            if (hotel) {
              const roomsNeeded = Math.ceil(num_pax / 2)
              unitCost = hotel.rate
              lineTotal = hotel.rate * roomsNeeded
              effectiveQuantityMode = 'per_room'
              pricingNote = `${hotel.name}: €${hotel.rate}/room × ${roomsNeeded}`
              rateSource = 'hotel_contacts'

            }
            break
          }

          case 'cruise': {
            // Cruise rates from nile_cruises table
            if (service.rate_id) {
              const { data: cruise } = await (getSupabaseAdmin() as any)
                .from('nile_cruises')
                .select('*')
                .eq('id', service.rate_id)
                .eq('tenant_id', tenantId)
                .single()

              if (cruise) {
                const c = cruise as any
                if (num_pax === 1 && c.rate_single_eur) {
                  unitCost = c.rate_single_eur
                  pricingNote = 'Single occupancy'
                } else if (num_pax >= 3 && c.rate_triple_eur) {
                  unitCost = c.rate_triple_eur
                  pricingNote = 'Triple occupancy'
                } else {
                  unitCost = c.rate_double_eur || 0
                  pricingNote = 'Double occupancy'
                }
                lineTotal = unitCost * num_pax
                effectiveQuantityMode = 'per_pax'
                rateSource = 'nile_cruises'

              }
            }
            break
          }

          case 'meal': {
            // meal_rates is one row per meal_type AND tier; the columns are
            // `meal_type` + `base_rate_eur`. This read `lunch_rate_eur` /
            // `dinner_rate_eur`, which do not exist — so `|| 0` made every meal
            // cost ZERO while still claiming rateSource 'meal_rates', which
            // also skipped the stored cost_per_unit fallback below.
            const mealType = service.service_name?.toLowerCase().includes('dinner')
              ? 'dinner'
              : 'lunch'

            const { data: mealRows } = await (getSupabaseAdmin() as any)
              .from('meal_rates')
              .select('meal_type, base_rate_eur')
              .eq('is_active', true)
              .eq('tenant_id', tenantId)
              .eq('tier', tier)

            const match = (mealRows ?? []).find(
              (r: any) => String(r.meal_type ?? '').toLowerCase().includes(mealType)
            )
            const mealRate = Number(match?.base_rate_eur)

            // Only claim a db-sourced rate when one actually resolved. A zero
            // here is bad data, not a free meal, and leaving rateSource alone
            // lets the stored cost_per_unit fallback do its job.
            if (Number.isFinite(mealRate) && mealRate > 0) {
              unitCost = mealRate
              lineTotal = unitCost * num_pax
              effectiveQuantityMode = 'per_pax'
              pricingNote = `€${unitCost}/pax`
              rateSource = 'meal_rates'
            }
            break
          }
        }
      }

      // ============================================
      // STEP 4: Fall back to stored cost_per_unit
      // ============================================
      if (rateSource === 'manual' && service.cost_per_unit) {
        unitCost = service.cost_per_unit
        rateSource = 'stored'

      }

      // ============================================
      // STEP 5: Calculate line total if not already set
      // ============================================
      if (lineTotal === 0 && unitCost > 0) {
        let quantity = service.quantity_value || 1

        switch (effectiveQuantityMode) {
          case 'per_pax':
            quantity = (service.quantity_value || 1) * num_pax
            break
          case 'per_group':
          case 'fixed':
            quantity = service.quantity_value || 1
            break
          case 'per_day':
            quantity = (service.quantity_value || 1) * (template?.duration_days || 1)
            break
          case 'per_night':
            quantity = (service.quantity_value || 1) * ((template?.duration_days || 1) - 1)
            break
          case 'per_room':
            quantity = Math.ceil(num_pax / 2)
            break
        }

        lineTotal = unitCost * quantity
      }

      // Harness: a non-optional service with no real rate is a HOLE, not a guess.
      if (!service.is_optional && unitCost === 0) {
        holes.push({
          kind: service.service_category,
          message: `No rate found for "${service.service_name}" (${service.service_category || 'service'}).`,
        })
      }

      const calculatedService: CalculatedService = {
        service_id: service.id,
        service_name: service.service_name,
        service_category: service.service_category,
        rate_type: service.rate_type,
        rate_source: rateSource,
        quantity_mode: effectiveQuantityMode,
        quantity: effectiveQuantityMode === 'fixed' ? 1 : (service.quantity_value || 1) * (effectiveQuantityMode === 'per_pax' ? num_pax : 1),
        unit_cost: Math.round(unitCost * 100) / 100,
        line_total: Math.round(lineTotal * 100) / 100,
        is_optional: service.is_optional || false,
        day_number: service.day_number,
        pricing_note: pricingNote || undefined
      }

      if (service.is_optional) {
        // is_selected travels with the line so the caller can show what was
        // chosen — and so the quote can snapshot the chosen ones as real
        // services rather than losing them.
        const selected = isOptionalSelected(service.id, optionalSelection)
        const override = service.optional_price_override
        const quantity = calculatedService.quantity
        optionalServices.push({
          ...calculatedService,
          is_selected: selected,
          // What the customer pays for it: the operator's own price when there
          // is one, otherwise cost + margin like any other service.
          selling_price: override
            ? Math.round(Number(override) * quantity * 100) / 100
            : Math.round(lineTotal * (1 + effectiveMargin / 100) * 100) / 100,
          price_basis: override ? 'operator_price' : 'cost_plus_margin',
        })
        if (selected) {
          chosenOptionals.push(optionalContribution({ lineTotal, override, quantity }))
          // A chosen option with neither a cost nor a set price cannot be
          // priced — flag it rather than sell it for nothing.
          if (unitCost === 0 && !override) {
            holes.push({
              kind: 'option',
              message: `Option "${service.service_name}" has no cost and no set price.`,
            })
          }
        }
      } else {
        calculatedServices.push(calculatedService)
        subtotalCost += lineTotal
      }
    }

    // Calculate totals. An option the operator has priced is added AFTER
    // margin — that price is a decision, not a number to mark up — while its
    // cost still counts as cost. See lib/b2b/optional-pricing.
    const quoteTotals = composeQuoteTotals({
      subtotalCost,
      optionals: chosenOptionals,
      marginPercent: effectiveMargin,
    })
    const totalCost = quoteTotals.costTotal
    const marginAmount = quoteTotals.marginAmount
    const sellingPrice = quoteTotals.baseSellingPrice
    const optionalTotal = quoteTotals.optionalSellingTotal
    const pricePerPerson = sellingPrice / num_pax

    const result: PriceCalculationResult = {
      variation_id: v.id,
      variation_name: v.variation_name,
      template_name: template?.template_name || '',
      num_pax,
      travel_date,
      season,
      is_eur_passport,
      tour_leader_included,  // NEW
      services: calculatedServices,
      optional_services: optionalServices,
      subtotal_cost: Math.round(subtotalCost * 100) / 100,
      optional_total: Math.round(optionalTotal * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      tour_leader_cost: 0,  // Not calculated in legacy mode
      margin_percent: effectiveMargin,
      margin_amount: Math.round(marginAmount * 100) / 100,
      selling_price: Math.round(sellingPrice * 100) / 100,
      price_per_person: Math.round(pricePerPerson * 100) / 100,
      single_supplement: 0,  // Not calculated in legacy mode
      currency: 'EUR',
      complete: holes.length === 0,
      holes,
    }

    return NextResponse.json({
      success: true,
      data: foldExtras(result, extrasCatalogue, extraSelections),
    })
  } catch (error: any) {
    console.error('❌ Error calculating tour price:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  const { searchParams } = new URL(request.url)
  const variation_id = searchParams.get('variation_id')
  const num_pax = parseInt(searchParams.get('num_pax') || '2')
  const travel_date = searchParams.get('travel_date') || new Date().toISOString().split('T')[0]
  const is_eur = searchParams.get('is_eur') !== 'false'
  const margin = parseFloat(searchParams.get('margin') || '25')
  const tour_leader = searchParams.get('tour_leader') === 'true'  // NEW

  if (!variation_id) {
    return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
  }

  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ 
      variation_id, 
      num_pax, 
      travel_date, 
      is_eur_passport: is_eur, 
      margin_percent: margin,
      tour_leader_included: tour_leader  // NEW
    })
  })

  return POST(mockRequest)
}