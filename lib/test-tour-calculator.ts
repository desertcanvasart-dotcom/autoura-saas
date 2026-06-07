// Test Tour Calculator
// Run with: npx tsx scripts/test-tour-calculator.ts

import { calculateTourPricing, generateTourCode, validateTour } from '../lib/tourCalculator'
import { Tour } from '../app/tour-builder/types'



// Sample tour data with realistic rates
const sampleTour: Tour = {
  tour_code: generateTourCode('Test Cairo Tour', 3),
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
        tier: 'standard'
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
        meal_category: 'casual'
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
        meal_category: 'fine_dining'
      },
      guide: {
        id: 'test-guide-1',
        service_code: 'GUIDE-EN-STD',
        guide_language: 'English',
        guide_type: 'Standard',
        city: 'Cairo',
        tour_duration: 'Full Day',
        base_rate_eur: 50,
        base_rate_non_eur: 50
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
            base_rate_non_eur: 10
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
            base_rate_non_eur: 55
          }
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
            base_rate_non_eur: 13
          }
        }
      ]
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
        tier: 'standard'
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
        meal_category: 'casual'
      },
      guide: {
        id: 'test-guide-1',
        service_code: 'GUIDE-EN-STD',
        guide_language: 'English',
        guide_type: 'Standard',
        city: 'Cairo',
        tour_duration: 'Full Day',
        base_rate_eur: 50,
        base_rate_non_eur: 50
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
            base_rate_non_eur: 10
          }
        }
      ]
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
        tier: 'standard'
      },
      notes: 'Free day - departure'
    }
  ]
}









// Validate tour

const validation = validateTour(sampleTour)
if (!validation.valid) {
  console.error('❌ Validation failed:')
  validation.errors.forEach(error => console.error(`  - ${error}`))
  process.exit(1)
}


// Test with Euro passengers


const pricingEuro = calculateTourPricing(sampleTour, 10, true)


pricingEuro.daily_breakdown.forEach(day => {








})












// Test with Non-Euro passengers


const pricingNonEuro = calculateTourPricing(sampleTour, 10, false)












// Calculate difference
const difference = pricingEuro.totals.grand_total - pricingNonEuro.totals.grand_total



// Test with different PAX sizes


const paxSizes = [2, 5, 10, 20]
paxSizes.forEach(pax => {
  const pricing = calculateTourPricing(sampleTour, pax, true)

})


