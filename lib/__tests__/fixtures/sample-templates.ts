// Fixtures for the holistic engine (lib/auto-pricing-service.ts).
//
// The template's itinerary uses EXPLICIT fields (city, accommodation_type,
// attractions, meals object, services) so parseItinerary() does no inference —
// the parse is fully deterministic. See PRICING-HARNESS-PLAN.md (Layer 0).

import type { MockTables } from '../_mock-supabase'

export const TEMPLATE_ID = 'tmpl-cairo-3d'

const noServices = {
  airport_arrival: false,
  airport_departure: false,
  hotel_checkin: false,
  hotel_checkout: false,
  guide_required: false,
}

/** 3-day Cairo template: arrival, a sightseeing day, departure. */
export const cairoTemplateRow = {
  id: TEMPLATE_ID,
  template_name: 'Cairo Explorer 3D',
  template_code: 'CAI-3D',
  duration_days: 3,
  tour_type: 'classic',
  category_id: null,
  itinerary: [
    {
      day: 1,
      title: 'Arrival in Cairo',
      city: 'Cairo',
      accommodation_type: 'hotel',
      meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
      attractions: [],
      services: { ...noServices },
    },
    {
      day: 2,
      title: 'Pyramids & Museum',
      city: 'Cairo',
      accommodation_type: 'hotel',
      meals: { breakfast: 'included', lunch: 'external', dinner: 'none' },
      attractions: ['Pyramids of Giza', 'Egyptian Museum'],
      services: { ...noServices, guide_required: true },
    },
    {
      day: 3,
      title: 'Departure',
      city: 'Cairo',
      accommodation_type: 'none',
      meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
      attractions: [],
      services: { ...noServices },
    },
  ],
}

/** A fully-populated rate dataset — every lookup resolves to a real row. */
export function fullRateTables(): MockTables {
  return {
    tour_templates: [cairoTemplateRow],
    accommodation_rates: [
      {
        id: 'h-cai-std',
        property_name: 'Cairo Grand Hotel',
        city: 'Cairo',
        tier: 'standard',
        ppd_eur: 55,
        single_supplement_eur: 30,
        triple_reduction_eur: 0,
        is_active: true,
      },
    ],
    nile_cruises: [],
    guides: [
      {
        id: 'g-ahmed',
        name: 'Ahmed',
        daily_rate: 60,
        languages: ['English'],
        tier: 'standard',
        is_preferred: true,
        is_active: true,
      },
    ],
    meal_rates: [{ lunch_rate_eur: 14, dinner_rate_eur: 20, is_active: true }],
    tipping_rates: [{ rate_eur: 10, rate_unit: 'per_day', is_active: true }],
    entrance_fees: [
      {
        id: 'e-pyramids',
        attraction_name: 'Pyramids of Giza',
        eur_rate: 20,
        non_eur_rate: 10,
        is_active: true,
      },
      {
        id: 'e-museum',
        attraction_name: 'Egyptian Museum',
        eur_rate: 15,
        non_eur_rate: 8,
        is_active: true,
      },
    ],
    // Day 2 has 2 attractions → duration 'half_day'. Vehicle size varies with
    // pax (Sedan→Minivan→Van→Minibus→Bus), so a COMPLETE template needs a rate
    // for every vehicle size any pax 1-40 (+leader) could use.
    transportation_rates: ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus'].map(
      (vehicle, i) => ({
        id: `t-cai-${vehicle.toLowerCase()}`,
        service_type: 'day_tour',
        city: 'Cairo',
        duration: 'half_day',
        area: '',
        vehicle_type: vehicle,
        base_rate_eur: 70 + i * 50, // 70, 120, 170, 220, 270
        base_rate_non_eur: 70 + i * 50,
        is_active: true,
      })
    ),
    airport_staff_rates: [],
    hotel_staff_rates: [],
  }
}

/**
 * Same dataset but with NO accommodation rows — exercises the "missing rate"
 * path: the engine must record a hole, never fabricate a default.
 */
export function missingHotelTables(): MockTables {
  const tables = fullRateTables()
  tables.accommodation_rates = []
  return tables
}

/**
 * Only a BUDGET hotel exists; a STANDARD request fuzzy-matches it (wrong tier).
 * Per policy, a fuzzy match blocks exactly like a missing rate.
 */
export function fuzzyHotelTables(): MockTables {
  const tables = fullRateTables()
  tables.accommodation_rates = [
    {
      id: 'h-cai-budget',
      property_name: 'Cairo Budget Inn',
      city: 'Cairo',
      tier: 'budget',
      ppd_eur: 40,
      single_supplement_eur: 20,
      triple_reduction_eur: 0,
      is_active: true,
    },
  ]
  return tables
}
