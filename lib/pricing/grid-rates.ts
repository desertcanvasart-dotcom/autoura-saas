// The pricing grid's rate options, by slot — what its dropdowns offer and
// what a grid save prices from (lib/pricing/grid-reprice): the save reads
// them again, so a saved price is the rate as it is in the database then,
// never the figure the browser carried.
//
// Multi-tenant: read through the caller's RLS-scoped client, so every table
// read is filtered to the authenticated user's tenant.

import { cruisePpdNightEur, cruisePpdNightNonEur } from '@/lib/rates/cruise-ppd'
import { normalizeRateRows } from '@/lib/rates/rate-currency'
import { parseSeasons } from '@/lib/rates/rate-seasons'
import { gridHotelRate } from '@/lib/rates/grid-hotel-rate'
import { priceSupplements, supplementSeason } from '@/lib/rates/hotel-supplements'
import { getTenantRunCurrency } from '@/lib/rates/run-currency'
import { DEFAULT_WATER_PER_PERSON_PER_DAY, isWaterCostType } from '@/lib/fixed-costs'
import { pricingBasisLabel, toPricingBasis } from '@/lib/pricing/pricing-basis'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { labelFor } from '@/lib/vocabulary'
import { packageVehicles, type PackageVehicleRates } from '@/lib/pricing/package-vehicle'

// The caller's RLS-scoped client (requireAuth's).
type GridRatesClient = any

export type GridRates = Record<string, any[]>

export async function loadGridRates(
  supabase: GridRatesClient,
  tenantId: string,
  opts: { tier?: string | null; startDate?: string | null },
): Promise<GridRates> {
  // Guide rows store the language KEY (346); the grid shows the agency's word.
  const guideLanguages = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'guide_language')
  const guideLanguageLabel = (key: string | null | undefined) => (key ? labelFor(guideLanguages, key) : '')
  const airlines = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'airline')
  const airlineLabel = (key: string | null | undefined) => (key ? labelFor(airlines, key) : '')
  const directions = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'airport_direction')
  const directionLabel = (key: string | null | undefined) => labelFor(directions, key || 'both')
  const pricingTypes = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'activity_pricing_type')
  const pricingTypeLabel = (key: string | null | undefined) => (key ? labelFor(pricingTypes, key) : '')
  const transportTypes = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'transport_service_type')
  const transportTypeLabel = (key: string | null | undefined) => {
    const label = key ? labelFor(transportTypes, key) : ''
    // A key the agency's list does not hold reads as words, not a code.
    return label === key ? label.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : label
  }
  // A transport rate files its vehicle under a vocabulary KEY; the agency
  // may since have renamed it (key "minivan" now reads "Coach"), so the
  // option names the vehicle in today's word, never the stored slug.
  const supplementTypes = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'hotel_supplement')
  const supplementLabel = (key: string) => labelFor(supplementTypes, key)
  const vehicleTypes = await loadVocabulary(supabase as Parameters<typeof loadVocabulary>[0], 'vehicle_type')
  const vehicleTypeLabel = (key: string) => {
    const item = vehicleTypes.find(i => i.key === key || normLower(i.key) === normLower(key))
    return item?.label ?? ''
  }

  const tier = opts.tier || 'standard'
  // The trip's start date: a hotel is priced from the period covering it.
  const startDate = opts.startDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startDate) ? opts.startDate : null

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
    { data: rawFixedCosts },
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
    // Water is priced from the company's "Water Bottle" fixed cost (Rates →
    // Fixed costs), the same rate the pricing engine uses — the grid used a
    // hardcoded 0.50 of its own. rate_currency lets normalizeRateRows convert it.
    supabase.from('fixed_daily_costs').select('cost_type, cost_per_person_per_day, rate_currency, tenant_id').eq('is_active', true),
  ])

  // Per-rate currency (P3): rows priced in a contract currency are
  // converted into the run currency on a copy at this fetch boundary.
  // The run currency itself is the tenant's (C3.4), EUR by default.
  const runCurrency = await getTenantRunCurrency(supabase, tenantId)
  const [
    transportRates, guideRates, airportRates, hotelServiceRates,
    tippingRates, activityRates, accommodationRates, entranceFees,
    mealRates, cruiseRates, cruiseTransportPkgs, flightRates, fixedCosts,
  ] = await Promise.all([
    normalizeRateRows(supabase, 'transportation_rates', rawTransportRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'guide_rates', rawGuideRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'airport_staff_rates', rawAirportRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'hotel_staff_rates', rawHotelServiceRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'tipping_rates', rawTippingRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'activity_rates', rawActivityRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'accommodation_rates', rawAccommodationRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'entrance_fees', rawEntranceFees as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'meal_rates', rawMealRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'nile_cruises', rawCruiseRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'b2b_transport_packages', rawCruiseTransportPkgs as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'flight_rates', rawFlightRates as Record<string, unknown>[], runCurrency, tenantId),
    normalizeRateRows(supabase, 'fixed_daily_costs', rawFixedCosts as Record<string, unknown>[], runCurrency, tenantId),
  ])
  // The company's own row wins over a shared (tenant-less) one.
  const waterRows = (fixedCosts || []).filter(r => isWaterCostType(r.cost_type))
  const waterRow = waterRows.find(r => r.tenant_id === tenantId) ?? waterRows[0]
  const waterRate = waterRow ? toNum(waterRow.cost_per_person_per_day) : DEFAULT_WATER_PER_PERSON_PER_DAY

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
      ...groupVehicleRowsToTiers(transportRates || [], transportTypeLabel, vehicleTypeLabel),
      // Cruise transport packages (bundled sightseeing vehicle for cruise days).
      // One option per vehicle the package prices (its `vehicles` list since
      // migration 381, keyed by the agency's vehicle_type vocabulary), encoded
      // `${pkgId}__${vehicle}` with the vocabulary's pax band, so the grid
      // re-selects the vehicle as the group grows — as it does for a route.
      ...packageVehicleTiers((cruiseTransportPkgs || []) as unknown as Parameters<typeof packageVehicleTiers>[0], vehicleTypes, vehicleTypeLabel),
    ],

    guide: (guideRates || []).map((r: any) => ({
      id: r.id,
      name: `${r.guide_language ? guideLanguageLabel(r.guide_language) : 'Guide'} (${r.guide_type || 'Egyptologist'})`,
      rateEur: toNum(r.base_rate_eur || r.rate_eur),
      rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
      city: r.city,
      details: guideLanguageLabel(r.guide_language),
      // The dropdown filters by language and by kind of guide.
      language: r.guide_language ? guideLanguageLabel(r.guide_language) : undefined,
      category: r.guide_type || 'Egyptologist',
    })),

    airport_services: (airportRates || []).map((r: any) => ({
      id: r.id,
      name: `${r.airport_code} — ${directionLabel(r.direction)} (${r.airport_code})`,
      rateEur: toNum(r.rate_eur),
      rateNonEur: toNum(r.rate_eur),
      city: r.airport_code,
      details: `${directionLabel(r.direction)} | ${pricingBasisLabel(toPricingBasis(r.pricing_type), r.max_capacity)}${r.description ? ` | ${r.description}` : ''}`,
      ...basisOf(r),
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
        details: `${pricingBasisLabel(toPricingBasis(r.pricing_type), r.max_capacity)} | ${r.description || `${typeLabel} | ${r.hotel_category || 'all'}`}`,
        ...basisOf(r),
      }
    }).concat(
      // Each hotel's room supplements (a view, a floor, a meal plan), priced
      // for the season of its period on the trip date, per person per night.
      // Offered only on a night that hotel is picked (DayRow), never added on
      // their own (lib/rates/hotel-supplements.ts).
      (accommodationRates || []).flatMap((r: any) => {
        const price = gridHotelRate(r, startDate)
        if (price.gapDate) return []
        return priceSupplements(r.supplements, supplementSeason(price.seasonKey, price.periodName), supplementLabel)
          .map(sup => ({
            id: `${r.id}__rsupp_${sup.type}`,
            name: `${sup.label} supplement — ${r.property_name}`,
            rateEur: sup.eur,
            rateNonEur: sup.nonEur,
            category: 'all',
            city: r.city,
            details: `Room supplement | per person per night | ${sup.season.replace('_', ' ')}`,
            pricing_basis: 'per_person',
            unit_capacity: null,
            service_type: 'room_supplement',
            hotel_id: r.id,
          }))
      }),
    ),

    tipping: (tippingRates || []).map((r: any) => ({
      id: r.id,
      // `r.role` is not a column: every tip without a service code was
      // listed as just "Tip". The description says whose it is.
      name: r.description || r.service_code || [r.role_type, r.context].filter(Boolean).join(' – ') || 'Tip',
      // Whose tip — the guide's are dropped when the guide is off (guide-rule.ts).
      tip_role: r.role_type ?? null,
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
        details: pricingTypeLabel(r.pricing_type),
        ...basisOf(r),
      })),

    accommodation: (accommodationRates || []).map((r: any) => {
      // Priced from the hotel's periods, whichever column family it was
      // saved in (lib/rates/grid-hotel-rate.ts).
      const price = gridHotelRate(r, startDate)
      const board = r.board_basis || 'BB'
      const note = price.gapDate ? ` | no rate period covers ${price.gapDate}` : price.periodName ? ` | ${price.periodName}` : ''
      return {
        id: r.id,
        name: `${r.property_name} ${r.city} (${r.tier} | ${board})`,
        rateEur: price.ppdEur,
        rateNonEur: price.ppdNonEur,
        city: r.city,
        details: `${r.tier} | ${board}${note}`,
        board_basis: board,
        single_supp_eur: price.singleSuppEur,
        single_supp_non_eur: price.singleSuppNonEur,
        // The throughout guide's bed, from the same period as the price.
        // Null = no concession on file; the grid shows an amber unpriced night.
        guide_rate_eur: price.guideRateEur,
      }
    }),

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
        details: pricingTypeLabel(r.pricing_type),
        ...basisOf(r),
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
      {
        id: 'water-standard', name: 'Water Bottles', rateEur: waterRate, rateNonEur: waterRate,
        details: !waterRow
          ? 'Per person per day (default — set it in Rates → Fixed costs)'
          : waterRate > 0
            ? 'Per person per day'
            : 'rate is 0 — set it in Rates → Fixed costs',
      }
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
      // The dropdown filters by the ports and the cabin.
      origin_city: r.embark_city || undefined,
      destination_city: r.disembark_city || undefined,
      category: r.cabin_type || undefined,
      // The throughout guide's cabin per night, first-period rate (B3).
      guide_rate_eur: firstPeriodGuideRate(r.seasons, 'cruise'),
    })),
  }
  return rates
}

/** A rate row's pricing basis for the grid (lib/pricing/pricing-basis.ts). */
function basisOf(r: { pricing_type?: unknown; max_capacity?: unknown }) {
  const basis = toPricingBasis(r.pricing_type)
  const capacity = typeof r.max_capacity === 'number' && r.max_capacity > 0 ? r.max_capacity : null
  return basis ? { pricing_basis: basis, unit_capacity: capacity } : {}
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
export function groupVehicleRowsToTiers(
  rows: any[],
  typeLabel?: (serviceType: string) => string,
  vehicleLabel?: (vehicleType: string) => string,
): any[] {
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
    const routeLabel =
      keeper.route_name ||
      `${keeper.origin_city || keeper.city || ''}${keeper.destination_city ? ' → ' + keeper.destination_city : ''}`.trim() ||
      keeper.service_code ||
      `${keeper.city || ''} ${keeper.service_type || 'Transport'}`.trim()
    // The kind of journey, in the agency's words (Day Tour, Intercity Day
    // Trip …): two routes on the same road differ only by it, and without it
    // an "Intercity Overnight" chip read like the day's whole programme.
    const kind = keeper.service_type && typeLabel ? typeLabel(String(keeper.service_type)) : ''
    const label = kind && !normLower(routeLabel).includes(normLower(kind)) ? `${routeLabel} · ${kind}` : routeLabel

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
      // The agency's word for the vehicle; a key its list no longer holds
      // reads as words, not a slug.
      const vlabel = (r.vehicle_type && vehicleLabel ? vehicleLabel(String(r.vehicle_type)) : '') ||
        String(r.vehicle_type || 'Vehicle').replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase())

      options.push({
        id: `${keeper.id}__${tierKey}`,
        // The vehicle's own row: a line priced from it by its row id (the AI
        // parser's) is found again when a save re-reads the rates.
        row_id: r.id,
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

/**
 * A cruise transport package's vehicles as tiered grid options. The package
 * stores one rate per vocabulary vehicle (`vehicles`, migration 381) — or, for
 * a row entered before it, the five legacy columns read as one list. Each
 * option is `${pkgId}__${vehicle}` with that vehicle's pax band from the
 * agency's vocabulary (else the built-in band for its alias), so
 * buildTransportTierIndex re-selects the vehicle by group size. `row_id` is the
 * package id, so a selection saved under the old flat id is found again.
 */
export function packageVehicleTiers(
  rows: Array<PackageVehicleRates & {
    id: string; package_name?: string | null; package_type?: string | null
    origin_city?: string | null; destination_city?: string | null; duration_days?: number | null
  }>,
  vehicleTypes: Array<{ key: string; meta?: Record<string, unknown> | null }>,
  vehicleLabel?: (vehicleType: string) => string,
): Array<Record<string, unknown>> {
  const options: Array<Record<string, unknown>> = []
  for (const r of rows) {
    const tiers = packageVehicles(r)
      .map(v => {
        const rate = toNum(v.rate)
        if (rate <= 0) return null
        const vocab = vehicleTypes.find(i => normLower(i.key) === normLower(v.vehicle_type))
        const alias = TIER_BY_ALIAS.get(normLower(v.vehicle_type))
        const vMin = Number(vocab?.meta?.min_pax), vMax = Number(vocab?.meta?.max_pax)
        const capMin = vMax > 0 ? (vMin > 0 ? vMin : 1) : (alias ? alias.capMin : 1)
        const capMax = vMax > 0 ? vMax : (alias ? alias.capMax : 99)
        const vlabel = (vehicleLabel ? vehicleLabel(v.vehicle_type) : '') ||
          v.vehicle_type.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
        return { key: vehicleSlug(v.vehicle_type), rate, capMin, capMax, vlabel }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => a.capMax - b.capMax || a.capMin - b.capMin)
    for (const t of tiers) {
      options.push({
        id: `${r.id}__${t.key}`,
        row_id: r.id,
        // They live in Tours → Transport Packages, not in Rates → Transportation,
        // so the name says where to find them.
        name: `${t.vlabel} (${t.capMin}-${t.capMax} pax) — Transport package: ${r.package_name} (${r.origin_city}→${r.destination_city}, ${r.duration_days}d)`,
        rateEur: t.rate,
        rateNonEur: t.rate,
        city: r.origin_city,
        details: `cruise_package | ${t.vlabel}`,
        // The two cruise kinds go on cruise days; Day Tour and Multi-Day on
        // road days (DayRow).
        service_type: r.package_type === 'day_tour' || r.package_type === 'multi_day' ? 'road_transport_package' : 'cruise_transport_package',
        package_type: r.package_type,
        capacity_min: t.capMin,
        capacity_max: t.capMax,
        origin_city: r.origin_city,
        destination_city: r.destination_city,
      })
    }
  }
  return options
}
