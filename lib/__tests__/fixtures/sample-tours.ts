// Hermetic fixtures for the pure tour calculator (lib/tourCalculator.ts).
//
// These tours carry their rates inline (the pure calculator takes a fully
// populated Tour), so no DB/mocking is needed. Expected totals are
// HAND-DERIVED from the documented formulas — they assert the math is
// correct, not merely unchanged.
//
// See PRICING-HARNESS-PLAN.md (Layer 0).

import type { Tour } from '@/app/tour-builder/types'

/**
 * 3-day Cairo tour. Ported verbatim from the original scratch file
 * (lib/test-tour-calculator.ts) so the golden numbers map to a real scenario.
 * tour_code is fixed (not generated) to keep the fixture deterministic.
 */
export const sampleCairoTour: Tour = {
  tour_code: 'TOUR-TESTCA-3D-0000',
  tour_name: 'Test Cairo 3 Days',
  duration_days: 3,
  cities: ['Cairo'],
  tour_type: 'custom',
  is_template: false,
  days: [
    {
      day_number: 1,
      city: 'Cairo',
      breakfast_included: true,
      guide_required: true,
      accommodation: {
        id: 'test-acc-1',
        service_code: 'CAI-HOTEL-STD',
        property_name: 'Cairo Plaza Hotel',
        property_type: 'Hotel',
        star_rating: 4,
        room_type: 'Double Standard',
        board_basis: 'BB',
        city: 'Cairo',
        base_rate_eur: 100,
        base_rate_non_eur: 90,
        tier: 'standard',
      },
      lunch_meal: {
        id: 'test-meal-1',
        service_code: 'CAI-LUNCH-STD',
        restaurant_name: 'Local Egyptian Restaurant',
        meal_type: 'Lunch',
        cuisine_type: 'Egyptian',
        restaurant_type: 'Casual',
        city: 'Cairo',
        base_rate_eur: 15,
        base_rate_non_eur: 12,
        tier: 'budget',
        meal_category: 'casual',
      },
      dinner_meal: {
        id: 'test-meal-2',
        service_code: 'CAI-DINNER-STD',
        restaurant_name: 'Nile View Restaurant',
        meal_type: 'Dinner',
        cuisine_type: 'International',
        restaurant_type: 'Fine Dining',
        city: 'Cairo',
        base_rate_eur: 35,
        base_rate_non_eur: 30,
        tier: 'standard',
        meal_category: 'fine_dining',
      },
      guide: {
        id: 'test-guide-1',
        service_code: 'GUIDE-EN-STD',
        guide_language: 'English',
        guide_type: 'Standard',
        city: 'Cairo',
        tour_duration: 'Full Day',
        base_rate_eur: 50,
        base_rate_non_eur: 50,
      },
      activities: [
        {
          activity_order: 1,
          entrance: {
            id: 'test-entrance-1',
            service_code: 'ENT-PYRAMIDS',
            attraction_name: 'Giza Pyramids Complex',
            city: 'Cairo',
            fee_type: 'per_person',
            base_rate_eur: 13,
            base_rate_non_eur: 10,
          },
          transportation: {
            id: 'test-transport-1',
            service_code: 'CAI-MINIVAN',
            service_type: 'day_tour',
            vehicle_type: 'Minivan',
            capacity_min: 3,
            capacity_max: 8,
            city: 'Cairo',
            base_rate_eur: 55,
            base_rate_non_eur: 55,
          },
        },
        {
          activity_order: 2,
          entrance: {
            id: 'test-entrance-2',
            service_code: 'ENT-MUSEUM',
            attraction_name: 'Egyptian Museum',
            city: 'Cairo',
            fee_type: 'per_person',
            base_rate_eur: 15,
            base_rate_non_eur: 13,
          },
        },
      ],
    },
    {
      day_number: 2,
      city: 'Cairo',
      breakfast_included: true,
      guide_required: true,
      accommodation: {
        id: 'test-acc-1',
        service_code: 'CAI-HOTEL-STD',
        property_name: 'Cairo Plaza Hotel',
        property_type: 'Hotel',
        star_rating: 4,
        room_type: 'Double Standard',
        board_basis: 'BB',
        city: 'Cairo',
        base_rate_eur: 100,
        base_rate_non_eur: 90,
        tier: 'standard',
      },
      lunch_meal: {
        id: 'test-meal-1',
        service_code: 'CAI-LUNCH-STD',
        restaurant_name: 'Local Egyptian Restaurant',
        meal_type: 'Lunch',
        cuisine_type: 'Egyptian',
        restaurant_type: 'Casual',
        city: 'Cairo',
        base_rate_eur: 15,
        base_rate_non_eur: 12,
        tier: 'budget',
        meal_category: 'casual',
      },
      guide: {
        id: 'test-guide-1',
        service_code: 'GUIDE-EN-STD',
        guide_language: 'English',
        guide_type: 'Standard',
        city: 'Cairo',
        tour_duration: 'Full Day',
        base_rate_eur: 50,
        base_rate_non_eur: 50,
      },
      activities: [
        {
          activity_order: 1,
          entrance: {
            id: 'test-entrance-3',
            service_code: 'ENT-CITADEL',
            attraction_name: 'Citadel of Saladin',
            city: 'Cairo',
            fee_type: 'per_person',
            base_rate_eur: 14,
            base_rate_non_eur: 10,
          },
        },
      ],
    },
    {
      day_number: 3,
      city: 'Cairo',
      breakfast_included: true,
      guide_required: false,
      accommodation: {
        id: 'test-acc-1',
        service_code: 'CAI-HOTEL-STD',
        property_name: 'Cairo Plaza Hotel',
        property_type: 'Hotel',
        star_rating: 4,
        room_type: 'Double Standard',
        board_basis: 'BB',
        city: 'Cairo',
        base_rate_eur: 100,
        base_rate_non_eur: 90,
        tier: 'standard',
      },
      notes: 'Free day - departure',
    },
  ],
}

/**
 * HAND-DERIVED expected results for sampleCairoTour at pax=10.
 *
 * EUR passport (uses base_rate_eur):
 *   Accommodation: ceil(10/2)=5 rooms × €100 × 3 nights        = 1500
 *   Meals:  D1 (15+35)×10=500, D2 15×10=150, D3 0              =  650
 *   Guides: D1 50, D2 50, D3 0 (not required)                  =  100
 *   Transport: D1 Minivan 55, D2 0, D3 0                       =   55
 *   Entrances: D1 (13+15)×10=280, D2 14×10=140, D3 0           =  420
 *   GRAND = 1500+650+100+55+420                                = 2725
 *   per_person = 2725/10                                       = 272.5
 *
 * Non-EUR passport (uses base_rate_non_eur):
 *   Accommodation: 5 × €90 × 3                                 = 1350
 *   Meals:  D1 (12+30)×10=420, D2 12×10=120                    =  540
 *   Guides: 50+50                                              =  100
 *   Transport: 55                                              =   55
 *   Entrances: D1 (10+13)×10=230, D2 10×10=100                 =  330
 *   GRAND = 1350+540+100+55+330                                = 2375
 *   per_person = 2375/10                                       = 237.5
 */
export const sampleCairoExpected = {
  pax: 10,
  eur: {
    total_accommodation: 1500,
    total_meals: 650,
    total_guides: 100,
    total_transportation: 55,
    total_entrances: 420,
    total_additional_services: 0,
    grand_total: 2725,
    per_person_total: 272.5,
    day1_total: 1385, // cross-checks the value noted in app/test-calculator/page.tsx
  },
  nonEur: {
    total_accommodation: 1350,
    total_meals: 540,
    total_guides: 100,
    total_transportation: 55,
    total_entrances: 330,
    total_additional_services: 0,
    grand_total: 2375,
    per_person_total: 237.5,
  },
  /** EUR grand_total minus non-EUR grand_total. */
  passportDifference: 350,
} as const

/** Minimal one-day, accommodation-only tour for invariant/edge tests. */
export const minimalTour: Tour = {
  tour_code: 'TOUR-MIN-1D-0000',
  tour_name: 'Minimal 1 Day',
  duration_days: 1,
  cities: ['Cairo'],
  tour_type: 'custom',
  is_template: false,
  days: [
    {
      day_number: 1,
      city: 'Cairo',
      breakfast_included: true,
      guide_required: false,
      accommodation: {
        id: 'min-acc-1',
        service_code: 'CAI-HOTEL-MIN',
        property_name: 'Budget Inn',
        property_type: 'Hotel',
        star_rating: 3,
        room_type: 'Double',
        board_basis: 'BB',
        city: 'Cairo',
        base_rate_eur: 60,
        base_rate_non_eur: 50,
        tier: 'budget',
      },
    },
  ],
}
