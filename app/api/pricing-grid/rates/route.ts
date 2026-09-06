// GET /api/pricing-grid/rates?tier=standard
// Fetches all available rate options from existing Supabase tables,
// structured by grid slot for dropdown population.
//
// Multi-tenant: rates are read through the caller's RLS-scoped client
// (requireAuth), so every table read is automatically filtered to the
// authenticated user's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { cruisePpdNightEur, cruisePpdNightNonEur } from '@/lib/rates/cruise-ppd'
import { normalizeRateRows } from '@/lib/rates/rate-currency'
import { parseSeasons } from '@/lib/rates/rate-seasons'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { requireAuth } from '@/lib/supabase-server'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { labelFor } from '@/lib/vocabulary'

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
    // Guide rows store the language KEY (346); the grid shows the agency's word.
    const guideLanguages = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'guide_language')
    const guideLanguageLabel = (key: string | null | undefined) => (key ? labelFor(guideLanguages, key) : '')
    const airlines = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'airline')
    const airlineLabel = (key: string | null | undefined) => (key ? labelFor(airlines, key) : '')

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'

    // Fetch all rate tables in parallel
    const [
      { data: rawTransportRates },
      { data: rawGuideRates },
      { data: rawAirportRates },
      { data: rawHotelServiceRates },
      { data: rawTippingRates },
      { data: rawActivityRates },
      { data: rawAccommodationRates },
      { data: rawEntranceFees },
      { data: rawMealRates },
      { data: rawCruiseRates },
      { data: rawCruiseTransportPkgs },
      { data: rawFlightRates },
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

    // Per-rate currency (P3): rows priced in a contract currency are
    // converted into the run currency on a copy at this fetch boundary.
    // The run currency itself is the tenant's (C3.4), EUR by default.
    const runCurrency = await getTenantRunCurrency(supabase, authResult.tenant_id!)
    const [
      transportRates, guideRates, airportRates, hotelServiceRates,
      tippingRates, activityRates, accommodationRates, entranceFees,
      mealRates, cruiseRates, cruiseTransportPkgs, flightRates,
    ] = await Promise.all([
      normalizeRateRows(supabase, 'transportation_rates', rawTransportRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'guide_rates', rawGuideRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'airport_staff_rates', rawAirportRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'hotel_staff_rates', rawHotelServiceRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'tipping_rates', rawTippingRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'activity_rates', rawActivityRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'accommodation_rates', rawAccommodationRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'entrance_fees', rawEntranceFees as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'meal_rates', rawMealRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'nile_cruises', rawCruiseRates as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'b2b_transport_packages', rawCruiseTransportPkgs as Record<string, unknown>[], runCurrency),
      normalizeRateRows(supabase, 'flight_rates', rawFlightRates as Record<string, unknown>[], runCurrency),
    ])

    // First stored period's guide bed rate (B-item 3); 0 in a period means
    // "no concession entered" (the sanitizer stores blanks as 0) → null.
    const firstPeriodGuideRate = (seasons: unknown, entity: 'accommodation' | 'cruise'): number | null => {
      const first = parseSeasons(seasons, entity)?.[0]
      const rate = first?.rates.guide_rate_eur
      return typeof rate === 'number' && rate > 0 ? rate : null
    }

    // Map to RateOption format per slot. Transport tiering is built by
    // groupVehicleRowsToTiers() at module scope (see below).
    const rates = {
      route: [
        // All transport in one slot. This app stores transportation_rates as ONE
        // ROW PER VEHICLE; group them into per-route tier sets so the grid's
        // buildTransportTierIndex can re-select the vehicle as group size grows.
        // Read-only — no schema change; uses the same grouping key as
        // travel-ops-pro migration 20260205_transportation_rates_restructure.
        ...groupVehicleRowsToTiers(transportRates || []),
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
        name: `${r.guide_language ? guideLanguageLabel(r.guide_language) : 'Guide'} (${r.guide_type || 'Egyptologist'})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        details: guideLanguageLabel(r.guide_language),
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
        // The throughout guide's bed: the FIRST period's guide rate — the
        // same period the headline PP-Double mirrors (B-item 3). Null = no
        // concession on file; the grid shows an amber unpriced night.
        guide_rate_eur: firstPeriodGuideRate(r.seasons, 'accommodation'),
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
        name: `${airlineLabel(r.airline)} ${r.route_from}→${r.route_to} (${r.cabin_class})`,
        rateEur: toNum(r.base_rate_eur) + toNum(r.tax_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur) + toNum(r.tax_non_eur || r.tax_eur),
        city: r.route_from,
        details: `${airlineLabel(r.airline)} | ${r.flight_number || ''} | ${r.cabin_class}`,
        route_from: r.route_from,
        route_to: r.route_to,
        // Guide fare on the ticket: null = he pays the customer fare,
        // 0 = rides free (B-items 1/3).
        guide_rate_eur: typeof r.guide_rate === 'number' ? r.guide_rate : null,
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
        // PER PERSON PER NIGHT — the one cruise basis. The slot is picked on
        // each cruise night, so a 3-night cruise multiplies by 3 naturally.
        // This used to expose the legacy whole-trip DOUBLE-CABIN rate, so a
        // cruise picked across its nights charged nights x trip x cabin.
        rateEur: cruisePpdNightEur(r),
        rateNonEur: cruisePpdNightNonEur(r),
        details: `${r.route_name || ''} | ${r.tier || ''} | ${r.cabin_type || 'Standard'} | per person/night`,
        single_rate_eur: toNum(r.single_supplement_eur),
        single_rate_non_eur: toNum(r.single_supplement_non_eur),
        duration_nights: r.duration_nights,
        ship_category: r.ship_category,
        // The throughout guide's cabin per night, first-period rate (B3).
        guide_rate_eur: firstPeriodGuideRate(r.seasons, 'cruise'),
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

// ============================================================================
// Transport tiering (Option B) — read the one-row-per-vehicle
// transportation_rates model and synthesize the tier set the grid expects.
// ============================================================================
// The grid calculator (buildTransportTierIndex / resolveTransportRate) expects
// each transport SERVICE to expose its vehicle tiers as options whose id is
// `${rowId}__${tier}` carrying a capacity band, so the right vehicle is
// re-selected as group size grows. travel-ops-pro stores those tiers as columns
// on ONE row; this app stores ONE ROW PER VEHICLE. We group the rows here — by
// the same key travel-ops-pro migration 20260205 used — and emit the same option
// shape. Pure and read-only: the table is never modified.

interface VehicleTierDef { key: string; capMin: number; capMax: number; aliases: string[] }
const VEHICLE_TIER_DEFS: VehicleTierDef[] = [
  { key: 'sedan',   capMin: 1,  capMax: 2,  aliases: ['sedan', 'car', 'saloon'] },
  { key: 'minivan', capMin: 3,  capMax: 7,  aliases: ['minivan', 'mini van', 'mpv'] },
  { key: 'van',     capMin: 8,  capMax: 12, aliases: ['van', 'h1', 'hiace'] },
  { key: 'minibus', capMin: 13, capMax: 20, aliases: ['minibus', 'mini bus', 'coaster'] },
  { key: 'bus',     capMin: 21, capMax: 45, aliases: ['bus', 'coach'] },
]
const TIER_BY_ALIAS = new Map<string, VehicleTierDef>()
for (const t of VEHICLE_TIER_DEFS) for (const a of t.aliases) TIER_BY_ALIAS.set(a, t)

function normLower(v: any): string {
  return String(v ?? '').toLowerCase().trim()
}

function vehicleSlug(v: any): string {
  return normLower(v).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'vehicle'
}

/**
 * Group per-vehicle transportation_rates rows into the grid's tiered option
 * shape. Rows are grouped by (service_type, city, origin_city, destination_city,
 * route_name); each group's stable keeper id (earliest created_at, then lowest
 * id) becomes the option rowId, so all of a route's vehicles share one
 * `${keeperId}__${tier}` family and buildTransportTierIndex re-selects by pax.
 * Each vehicle row keeps its own rate + capacity band (falling back to the
 * canonical tier band when the row's capacity columns are null).
 */
export function groupVehicleRowsToTiers(rows: any[]): any[] {
  // One row per (route, vehicle) since migration 337 — nothing to expand.
  const groupKey = (r: any) =>
    [normLower(r.service_type), normLower(r.city), normLower(r.origin_city),
     normLower(r.destination_city), normLower(r.route_name)].join('|')

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const k = groupKey(r)
    const arr = groups.get(k)
    if (arr) arr.push(r)
    else groups.set(k, [r])
  }

  const options: any[] = []
  for (const groupRows of groups.values()) {
    const sorted = [...groupRows].sort((a, b) => {
      const ca = String(a.created_at ?? ''), cb = String(b.created_at ?? '')
      if (ca !== cb) return ca < cb ? -1 : 1
      return String(a.id) < String(b.id) ? -1 : 1
    })
    const keeper = sorted[0]
    const label =
      keeper.route_name ||
      `${keeper.origin_city || keeper.city || ''}${keeper.destination_city ? ' → ' + keeper.destination_city : ''}`.trim() ||
      keeper.service_code ||
      `${keeper.city || ''} ${keeper.service_type || 'Transport'}`.trim()

    const usedTierKeys = new Map<string, number>()
    for (const r of sorted) {
      const rate = toNum(r.base_rate_eur)
      if (rate <= 0) continue // no usable rate for this vehicle row — skip
      // The tier IS the row's vehicle (a key from the tenant's vocabulary since
      // 334/337): an agency's "coaster" is its own option, never folded into a
      // built-in class. The alias table only supplies a capacity band when the
      // row has none.
      const tier = TIER_BY_ALIAS.get(normLower(r.vehicle_type))
      let tierKey = vehicleSlug(r.vehicle_type)
      // Disambiguate if two rows map to the same tier within a group (keeps option
      // ids unique; buildTransportTierIndex still groups by the `${keeperId}` prefix).
      const seen = usedTierKeys.get(tierKey) ?? 0
      usedTierKeys.set(tierKey, seen + 1)
      if (seen > 0) tierKey = `${tierKey}_${seen + 1}`

      const capMin = r.capacity_min != null ? Number(r.capacity_min) : (tier ? tier.capMin : 1)
      const capMax = r.capacity_max != null ? Number(r.capacity_max) : (tier ? tier.capMax : 99)
      const vlabel = String(r.vehicle_type || 'Vehicle').replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())

      options.push({
        id: `${keeper.id}__${tierKey}`,
        name: `${vlabel} (${capMin}-${capMax} pax) — ${label}`,
        rateEur: rate,
        rateNonEur: toNum(r.base_rate_non_eur) || rate,
        city: r.origin_city || r.city,
        details: `${vlabel} | ${r.service_type || ''}`.trim(),
        capacity_min: capMin,
        capacity_max: capMax,
        service_type: r.service_type,
        origin_city: r.origin_city || r.city,
        destination_city: r.destination_city,
      })
    }
  }
  return options
}
