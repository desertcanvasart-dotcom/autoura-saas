// GET /api/pricing-grid/rates?tier=standard
// Fetches all available rate options from existing Supabase tables,
// structured by grid slot for dropdown population.
//
// Multi-tenant: rates are read through the caller's RLS-scoped client
// (requireAuth), so every table read is automatically filtered to the
// authenticated user's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Auth failed' },
        { status: authResult.status || 401 }
      )
    }
    const { supabase } = authResult

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'

    // Fetch all rate tables in parallel
    const [
      { data: transportRates },
      { data: guideRates },
      { data: airportRates },
      { data: hotelServiceRates },
      { data: tippingRates },
      { data: activityRates },
      { data: accommodationRates },
      { data: entranceFees },
      { data: mealRates },
      { data: cruiseRates },
      { data: cruiseTransportPkgs },
      { data: flightRates },
    ] = await Promise.all([
      supabase.from('transportation_rates').select('*').eq('is_active', true),
      supabase.from('guide_rates').select('*').eq('is_active', true),
      supabase.from('airport_staff_rates').select('*').eq('is_active', true),
      supabase.from('hotel_staff_rates').select('*').eq('is_active', true),
      supabase.from('tipping_rates').select('*').eq('is_active', true),
      supabase.from('activity_rates').select('*').eq('is_active', true),
      supabase.from('accommodation_rates').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('entrance_fees').select('*').eq('is_active', true),
      supabase.from('meal_rates').select('*').eq('is_active', true),
      supabase.from('nile_cruises').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('b2b_transport_packages').select('*').eq('is_active', true),
      supabase.from('flight_rates').select('*').eq('is_active', true),
    ])

    // Map to RateOption format per slot
    // Vehicle tiers: each transport row expands into up to 5 options (one per vehicle type)
    const VEHICLE_TIERS = [
      { key: 'sedan',   label: 'Sedan',   capMin: 1,  capMax: 2  },
      { key: 'minivan', label: 'Minivan', capMin: 3,  capMax: 7  },
      { key: 'van',     label: 'Van',     capMin: 8,  capMax: 12 },
      { key: 'minibus', label: 'Minibus', capMin: 13, capMax: 20 },
      { key: 'bus',     label: 'Bus',     capMin: 21, capMax: 45 },
    ]

    const expandTiers = (r: any, namePrefix: string) => {
      const tiered = VEHICLE_TIERS
        .filter(t => toNum(r[`${t.key}_rate_eur`]) > 0)
        .map(t => ({
          id: `${r.id}__${t.key}`,
          name: `${t.label} (${r[`${t.key}_capacity_min`] || t.capMin}-${r[`${t.key}_capacity_max`] || t.capMax} pax) — ${namePrefix}`,
          rateEur: toNum(r[`${t.key}_rate_eur`]),
          rateNonEur: toNum(r[`${t.key}_rate_non_eur`] || r[`${t.key}_rate_eur`]),
          city: r.origin_city || r.city,
          details: `${t.label} | ${r.service_type}`,
          capacity_min: r[`${t.key}_capacity_min`] || t.capMin,
          capacity_max: r[`${t.key}_capacity_max`] || t.capMax,
          service_type: r.service_type,
          origin_city: r.origin_city || r.city,
          destination_city: r.destination_city,
        }))
      // Fallback: if no tiered columns, use legacy base_rate_eur for all tiers
      if (tiered.length === 0 && toNum(r.base_rate_eur) > 0) {
        return VEHICLE_TIERS.map(t => ({
          id: `${r.id}__${t.key}`,
          name: `${t.label} (${t.capMin}-${t.capMax} pax) — ${namePrefix}`,
          rateEur: toNum(r.base_rate_eur),
          rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur),
          city: r.origin_city || r.city,
          details: `${t.label} | ${r.service_type} (legacy rate)`,
          capacity_min: t.capMin,
          capacity_max: t.capMax,
          service_type: r.service_type,
          origin_city: r.origin_city || r.city,
          destination_city: r.destination_city,
        }))
      }
      return tiered
    }

    const rates = {
      route: [
        // Day tour vehicles (merged into route — all transport in one slot)
        ...(transportRates || [])
          .filter((r: any) => r.service_type === 'day_tour')
          .flatMap((r: any) => {
            const label = r.route_name || r.service_code || `${r.origin_city || r.city || ''} Day Tour`
            return expandTiers(r, label)
          }),
        // All other transport types (airport transfers, intercity, city transfers, dinner transfers, etc.)
        ...(transportRates || [])
          .filter((r: any) => r.service_type !== 'day_tour')
          .flatMap((r: any) => {
            const label = r.route_name || `${r.origin_city || ''} → ${r.destination_city || ''}`.trim() || r.service_code
            return expandTiers(r, label)
          }),
        // Cruise transport packages (bundled sightseeing vehicle for cruise days)
        ...(cruiseTransportPkgs || []).map((r: any) => ({
          id: r.id,
          name: `${r.package_name} (${r.origin_city}→${r.destination_city}, ${r.duration_days}d)`,
          rateEur: toNum(r.sedan_rate),
          rateNonEur: toNum(r.sedan_rate),
          city: r.origin_city,
          details: `cruise_package | ${r.description || ''}`,
          service_type: 'cruise_transport_package',
          package_type: r.package_type,
          sedan_rate: toNum(r.sedan_rate),
          minivan_rate: toNum(r.minivan_rate),
          van_rate: toNum(r.van_rate),
          minibus_rate: toNum(r.minibus_rate),
          bus_rate: toNum(r.bus_rate),
        })),
      ],

      guide: (guideRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.guide_language || 'Guide'} (${r.guide_type || 'Egyptologist'})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        details: r.guide_language,
      })),

      airport_services: (airportRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.airport_code} — ${r.direction || 'both'} (${r.airport_code})`,
        rateEur: toNum(r.rate_eur),
        rateNonEur: toNum(r.rate_eur),
        city: r.airport_code,
        details: `${r.direction || 'both'} | ${r.description || ''}`.trim(),
      })),

      hotel_services: (hotelServiceRates || []).map((r: any) => {
        // Build a readable name from service_type + category + destination
        const typeLabel = (r.service_type || 'service').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        const catLabel = r.hotel_category && r.hotel_category !== 'all' ? ` (${r.hotel_category})` : ''
        const destLabel = r.destination ? ` — ${r.destination}` : ''
        return {
          id: r.id,
          name: `${typeLabel}${catLabel}${destLabel}`,
          rateEur: toNum(r.rate_eur),
          rateNonEur: toNum(r.rate_eur),
          category: r.hotel_category,
          city: r.destination,  // Use destination as city for filtering
          details: r.description || `${typeLabel} | ${r.hotel_category || 'all'}`,
        }
      }),

      tipping: (tippingRates || []).map((r: any) => ({
        id: r.id,
        name: r.role || r.service_code || 'Tip',
        rateEur: toNum(r.rate_eur || r.amount_eur),
        rateNonEur: toNum(r.rate_eur || r.amount_eur),
        details: r.description,
      })),

      boat_rides: (activityRates || [])
        .filter((r: any) => /boat|felucca|motor/i.test(r.activity_name || r.category || ''))
        .map((r: any) => ({
          id: r.id,
          name: r.activity_name,
          rateEur: toNum(r.rate_eur || r.base_rate_eur),
          rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
          city: r.city,
          details: r.pricing_type,
        })),

      accommodation: (accommodationRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.property_name} ${r.city} (${r.tier} | ${r.board_basis || 'BB'})`,
        rateEur: toNum(r.pp_double_eur),
        rateNonEur: toNum(r.pp_double_non_eur),
        city: r.city,
        details: `${r.tier} | ${r.board_basis || 'BB'}`,
        board_basis: r.board_basis || 'BB',
        single_supp_eur: toNum(r.single_supp_eur),
        single_supp_non_eur: toNum(r.single_supp_non_eur),
      })),

      entrance_fees: (entranceFees || []).map((r: any) => ({
        id: r.id,
        name: r.attraction_name,
        rateEur: toNum(r.eur_rate),
        rateNonEur: toNum(r.non_eur_rate),
        city: r.city,
        category: r.category,
      })),

      flights: (flightRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.airline} ${r.route_from}→${r.route_to} (${r.cabin_class})`,
        rateEur: toNum(r.base_rate_eur) + toNum(r.tax_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur) + toNum(r.tax_non_eur || r.tax_eur),
        city: r.route_from,
        details: `${r.airline} | ${r.flight_number || ''} | ${r.cabin_class}`,
        route_from: r.route_from,
        route_to: r.route_to,
      })),

      experiences: (activityRates || [])
        .filter((r: any) => !/boat|felucca|motor/i.test(r.activity_name || r.category || ''))
        .map((r: any) => ({
          id: r.id,
          name: r.activity_name,
          rateEur: toNum(r.rate_eur || r.base_rate_eur),
          rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
          city: r.city,
          details: r.pricing_type,
        })),

      meals: (mealRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.meal_type} - ${r.restaurant_name || 'Restaurant'} (${r.city})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        category: r.meal_type,
        details: r.restaurant_name,
      })),

      water: [
        { id: 'water-standard', name: 'Water Bottles', rateEur: 0.50, rateNonEur: 0.50, details: 'Per person per day' }
      ],

      cruise: (cruiseRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.ship_name} (${r.duration_nights}N, ${r.cabin_type})`,
        rateEur: toNum(r.rate_double_eur || r.rate_low_double_eur),
        rateNonEur: toNum(r.rate_double_non_eur || r.rate_low_double_non_eur || r.rate_double_eur || r.rate_low_double_eur),
        details: `${r.route_name || ''} | ${r.tier || ''} | ${r.cabin_type || 'Standard'}`,
        single_rate_eur: toNum(r.rate_single_eur || r.rate_low_single_eur),
        single_rate_non_eur: toNum(r.rate_single_non_eur || r.rate_low_single_non_eur),
        duration_nights: r.duration_nights,
        ship_category: r.ship_category,
      })),
    }

    return NextResponse.json({ success: true, data: rates })
  } catch (error: any) {
    console.error('Failed to fetch grid rates:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

function toNum(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}
