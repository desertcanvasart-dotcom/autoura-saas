import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { calculateAutoPricing, ServiceTier } from '@/lib/auto-pricing-service'

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
// B2B-SPECIFIC TABLES (kept for tiered pricing):
// - b2b_pricing_rules, b2b_transport_packages, b2b_partners, b2b_partner_pricing
// ============================================

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
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
}

function getSeason(date: Date): 'low' | 'high' | 'peak' {
  const month = date.getMonth() + 1
  if ([12, 1, 2, 3, 4].includes(month)) return 'high'
  if ([7, 8].includes(month)) return 'peak'
  return 'low'
}

// Check for B2B pricing rules for an activity (kept for tiered pricing like felucca)
async function getB2BPricingRule(serviceName: string): Promise<any | null> {
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('b2b_pricing_rules')
    .select('*')
    .eq('is_active', true)
    .ilike('service_name', `%${serviceName.split(' ')[0]}%`)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

// Get transport package for cruise sightseeing (kept for package deals)
async function getTransportPackage(packageType: string, originCity: string, destCity: string): Promise<any | null> {
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('b2b_transport_packages')
    .select('*')
    .eq('package_type', packageType)
    .eq('origin_city', originCity)
    .eq('destination_city', destCity)
    .eq('is_active', true)
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

// Calculate price using B2B pricing rule (tiered pricing)
function applyB2BPricingRule(
  rule: any, 
  numPax: number
): { unitCost: number; lineTotal: number; pricingNote: string; quantityMode: string } {
  const model = rule.pricing_model

  switch (model) {
    case 'per_unit': {
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 999)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || 'Small'
      } else if (rule.tier2_max_pax && numPax <= rule.tier2_max_pax) {
        rate = rule.tier2_rate_eur
        label = rule.tier2_label || 'Large'
      } else {
        const largeCapacity = rule.tier2_max_pax || rule.tier1_max_pax || 8
        const largeRate = rule.tier2_rate_eur || rule.tier1_rate_eur
        const unitsNeeded = Math.ceil(numPax / largeCapacity)
        const totalCost = largeRate * unitsNeeded

        return {
          unitCost: totalCost,
          lineTotal: totalCost,
          pricingNote: `${unitsNeeded}x ${rule.tier2_label || rule.unit_type} @ €${largeRate} = €${totalCost}`,
          quantityMode: 'fixed'
        }
      }

      return {
        unitCost: rate,
        lineTotal: rate,
        pricingNote: `${label}: €${rate} flat`,
        quantityMode: 'fixed'
      }
    }

    case 'tiered': {
      let rate: number
      let label: string

      if (numPax <= (rule.tier1_max_pax || 2)) {
        rate = rule.tier1_rate_eur
        label = rule.tier1_label || `1-${rule.tier1_max_pax}`
      } else if (numPax <= (rule.tier2_max_pax || 10)) {
        rate = rule.tier2_rate_eur
        label = rule.tier2_label || `${rule.tier1_max_pax + 1}-${rule.tier2_max_pax}`
      } else if (numPax <= (rule.tier3_max_pax || 20)) {
        rate = rule.tier3_rate_eur
        label = rule.tier3_label || `${rule.tier2_max_pax + 1}-${rule.tier3_max_pax}`
      } else {
        rate = rule.tier4_rate_eur || rule.tier3_rate_eur
        label = rule.tier4_label || `${rule.tier3_max_pax + 1}+`
      }

      return {
        unitCost: rate,
        lineTotal: rate * numPax,
        pricingNote: `${label}: €${rate}/pax × ${numPax} = €${rate * numPax}`,
        quantityMode: 'per_pax'
      }
    }

    default:
      return {
        unitCost: rule.tier1_rate_eur || 0,
        lineTotal: (rule.tier1_rate_eur || 0) * numPax,
        pricingNote: 'Per person',
        quantityMode: 'per_pax'
      }
  }
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
async function selectVehicleFromB2CTable(numPax: number, tier: string = 'standard'): Promise<{ rate: number; vehicle: string; id: string } | null> {
  const { data: vehicles, error } = await (getSupabaseAdmin() as any)
    .from('vehicles')
    .select('id, vehicle_type, name, daily_rate, passenger_capacity, tier, is_preferred')
    .eq('is_active', true)
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
async function selectGuideFromB2CTable(language: string = 'English', tier: string = 'standard'): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: guides, error } = await (getSupabaseAdmin() as any)
    .from('guides')
    .select('id, name, daily_rate, languages, tier, is_preferred')
    .eq('is_active', true)
    .contains('languages', [language])
    .order('is_preferred', { ascending: false })

  if (error || !guides || guides.length === 0) {
    // Fallback: any guide
    const { data: anyGuide } = await (getSupabaseAdmin() as any)
      .from('guides')
      .select('id, name, daily_rate, tier')
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyGuide || anyGuide.length === 0) return null

    const g = anyGuide[0] as any
    return {
      rate: g.daily_rate || 55,
      name: g.name || 'Guide',
      id: g.id
    }
  }

  // Find guide matching tier
  const selectedGuide = (guides.find((g: any) => g.tier === tier) || guides[0]) as any

  return {
    rate: selectedGuide.daily_rate || 55,
    name: selectedGuide.name || 'Guide',
    id: selectedGuide.id
  }
}

// Get entrance fee from entrance_fees table
async function getEntranceFee(attractionName: string, isEurPassport: boolean): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: fees, error } = await (getSupabaseAdmin() as any)
    .from('entrance_fees')
    .select('id, attraction_name, eur_rate, non_eur_rate')
    .eq('is_active', true)
    .ilike('attraction_name', `%${attractionName}%`)
    .limit(1)

  if (error || !fees || fees.length === 0) return null

  const fee = fees[0] as any
  const rate = isEurPassport
    ? (fee.eur_rate || 0)
    : (fee.non_eur_rate || fee.eur_rate || 0)

  return {
    rate,
    name: fee.attraction_name,
    id: fee.id
  }
}

// Get hotel rate from hotel_contacts table
async function getHotelRate(city: string, tier: string = 'standard'): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: hotels, error } = await (getSupabaseAdmin() as any)
    .from('hotel_contacts')
    .select('id, name, rate_double_eur, city, tier, is_preferred')
    .eq('is_active', true)
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
      .ilike('city', `%${city}%`)
      .order('is_preferred', { ascending: false })
      .limit(1)

    if (!anyHotel || anyHotel.length === 0) return null

    const h = anyHotel[0] as any
    return {
      rate: h.rate_double_eur || 80,
      name: h.name || 'Hotel',
      id: h.id
    }
  }

  const hotel = hotels[0] as any
  return {
    rate: hotel.rate_double_eur || 80,
    name: hotel.name || 'Hotel',
    id: hotel.id
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      variation_id,
      num_pax = 2,
      travel_date = new Date().toISOString().split('T')[0],
      is_eur_passport = true,
      margin_percent = 25,
      partner_id = null,
      include_optionals = false,
      language = 'English',
      tier = 'standard',
      tour_leader_included = false  // NEW: Added tour leader parameter
    } = body

    console.log('📥 B2B Calculate Price Request:', {
      variation_id,
      num_pax,
      tour_leader_included,  // Log this
      is_eur_passport,
      margin_percent
    })

    if (!variation_id) {
      return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
    }

    // Fetch variation with template info
    const { data: variation, error: varError } = await (getSupabaseAdmin() as any)
      .from('tour_variations')
      .select(`
        id, variation_name, variation_code, tier, group_type, min_pax, max_pax,
        tour_templates (id, template_name, template_code, duration_days, uses_day_builder, pricing_mode)
      `)
      .eq('id', variation_id)
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
      console.log('📊 No variation services found, using auto-pricing fallback')
      console.log(`   tourLeaderIncluded: ${tour_leader_included}`)
      
      // Determine effective margin (partner override)
      let effectiveMargin = margin_percent
      if (partner_id) {
        const { data: partner } = await (getSupabaseAdmin() as any)
          .from('b2b_partners')
          .select('default_margin_percent')
          .eq('id', partner_id)
          .single()

        if ((partner as any)?.default_margin_percent) {
          effectiveMargin = (partner as any).default_margin_percent
        }
      }

      // Call auto-pricing service with tour leader parameter
      const autoPriceResult = await calculateAutoPricing({
        templateId,
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
        pax_pricing_table: autoPriceResult.paxPricingTable  // NEW - for rate sheet
      }

      console.log('🎉 B2B Price calculated via auto-pricing:', {
        variation: v.variation_name,
        numPax: num_pax,
        tourLeader: tour_leader_included,
        cost: result.total_cost,
        tourLeaderCost: result.tour_leader_cost,
        margin: effectiveMargin + '%',
        selling: result.selling_price,
        perPerson: result.price_per_person,
        singleSupplement: result.single_supplement
      })

      return NextResponse.json({ success: true, data: result })
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
        .single()

      if ((partner as any)?.default_margin_percent) {
        effectiveMargin = (partner as any).default_margin_percent
      }

      const { data: override } = await (getSupabaseAdmin() as any)
        .from('b2b_partner_pricing')
        .select('margin_percent_override')
        .eq('partner_id', partner_id)
        .eq('variation_id', variation_id)
        .eq('is_active', true)
        .single()

      if ((override as any)?.margin_percent_override) {
        effectiveMargin = (override as any).margin_percent_override
      }
    }

    const calculatedServices: CalculatedService[] = []
    const optionalServices: CalculatedService[] = []
    let subtotalCost = 0
    let optionalTotal = 0

    // Process each service
    for (const svc of (services || [])) {
      const service = svc as any
      let unitCost = 0
      let lineTotal = 0
      let rateSource = 'manual'
      let pricingNote = ''
      let effectiveQuantityMode = service.quantity_mode || 'per_pax'

      // ============================================
      // STEP 1: Check for B2B pricing rules (tiered pricing like felucca)
      // ============================================
      if (service.rate_type === 'activity' && service.service_name) {
        const b2bRule = await getB2BPricingRule(service.service_name)
        
        if (b2bRule) {
          const priceResult = applyB2BPricingRule(b2bRule, num_pax)
          unitCost = priceResult.unitCost
          lineTotal = priceResult.lineTotal
          pricingNote = priceResult.pricingNote
          effectiveQuantityMode = priceResult.quantityMode
          rateSource = 'b2b_rule'
          
          console.log(`✅ B2B Rule applied: ${service.service_name} -> ${pricingNote}`)
        }
      }

      // ============================================
      // STEP 2: Check for B2B transport packages (cruise sightseeing)
      // ============================================
      if (rateSource === 'manual' && service.service_category === 'transportation') {
        if (service.service_name?.toLowerCase().includes('sightseeing')) {
          const pkg = await getTransportPackage('cruise_sightseeing', 'Luxor', 'Aswan')
          if (pkg) {
            const vehicle = selectVehicleFromPackage(pkg, num_pax)
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: €${vehicle.rate} (${num_pax} pax)`
            rateSource = 'b2b_package'
            console.log(`✅ B2B Package applied: ${service.service_name} -> ${pricingNote}`)
          }
        }
        else if (service.service_name?.toLowerCase().includes('transfer') || 
                 service.service_name?.toLowerCase().includes('airport')) {
          const pkg = await getTransportPackage('cruise_transfer', 'Luxor', 'Aswan')
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
            const vehicle = await selectVehicleFromB2CTable(num_pax, effectiveTier)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: €${vehicle.rate}/day`
              rateSource = 'vehicles'
              console.log(`✅ Vehicle from B2C: ${vehicle.vehicle} -> €${vehicle.rate}`)
            }
            break
          }

          case 'guide': {
            const guide = await selectGuideFromB2CTable(language, effectiveTier)
            if (guide) {
              unitCost = guide.rate
              lineTotal = guide.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${guide.name}: €${guide.rate}/day`
              rateSource = 'guides'
              console.log(`✅ Guide from B2C: ${guide.name} -> €${guide.rate}`)
            }
            break
          }

          case 'activity':
          case 'entrance': {
            if (service.service_name) {
              const fee = await getEntranceFee(service.service_name, is_eur_passport)
              if (fee) {
                unitCost = fee.rate
                lineTotal = fee.rate * num_pax
                effectiveQuantityMode = 'per_pax'
                pricingNote = `${fee.name}: €${fee.rate}/pax (${is_eur_passport ? 'EUR' : 'non-EUR'})`
                rateSource = 'entrance_fees'
                console.log(`✅ Entrance from B2C: ${fee.name} -> €${fee.rate}/pax`)
              }
            }
            break
          }

          case 'accommodation': {
            const hotel = await getHotelRate(service.city || 'Cairo', effectiveTier)
            if (hotel) {
              const roomsNeeded = Math.ceil(num_pax / 2)
              unitCost = hotel.rate
              lineTotal = hotel.rate * roomsNeeded
              effectiveQuantityMode = 'per_room'
              pricingNote = `${hotel.name}: €${hotel.rate}/room × ${roomsNeeded}`
              rateSource = 'hotel_contacts'
              console.log(`✅ Hotel from B2C: ${hotel.name} -> €${hotel.rate}/room`)
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
                console.log(`✅ Cruise from B2C: ${c.ship_name} -> €${unitCost}/pax`)
              }
            }
            break
          }

          case 'meal': {
            const { data: mealRate } = await (getSupabaseAdmin() as any)
              .from('meal_rates')
              .select('*')
              .eq('is_active', true)
              .limit(1)
              .single()

            if (mealRate) {
              const m = mealRate as any
              if (service.service_name?.toLowerCase().includes('dinner')) {
                unitCost = m.dinner_rate_eur || 18
              } else {
                unitCost = m.lunch_rate_eur || 12
              }
              lineTotal = unitCost * num_pax
              effectiveQuantityMode = 'per_pax'
              pricingNote = `€${unitCost}/pax`
              rateSource = 'meal_rates'
              console.log(`✅ Meal from B2C: ${service.service_name} -> €${unitCost}/pax`)
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
        console.log(`⚠️ Fallback to stored: ${service.service_name} -> €${unitCost}`)
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
        optionalServices.push(calculatedService)
        if (include_optionals) optionalTotal += lineTotal
      } else {
        calculatedServices.push(calculatedService)
        subtotalCost += lineTotal
      }
    }

    // Calculate totals
    const totalCost = subtotalCost + (include_optionals ? optionalTotal : 0)
    const marginAmount = totalCost * (effectiveMargin / 100)
    const sellingPrice = totalCost + marginAmount
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
      currency: 'EUR'
    }

    console.log('🎉 B2B Price calculated:', {
      variation: v.variation_name,
      numPax: num_pax,
      cost: totalCost,
      margin: effectiveMargin + '%',
      selling: sellingPrice
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('❌ Error calculating tour price:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
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