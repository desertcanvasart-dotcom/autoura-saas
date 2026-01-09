// Tour Pricing Calculator Logic
// Location: /lib/tourCalculator.ts

import {
    Tour,
    TourDay,
    TourDayActivity,
    TourPricing,
    TourPricingBreakdown,
    DailyPricing,
    AccommodationRate,
    MealRate,
    GuideRate,
    EntranceRate,
    TransportationRate
  } from '@/app/tour-builder/types'
  
  /**
   * Main function to calculate tour pricing
   */
  export function calculateTourPricing(
    tour: Tour,
    pax: number,
    isEuroPassport: boolean
  ): TourPricingBreakdown {
    
    if (!tour.days || tour.days.length === 0) {
      throw new Error('Tour must have at least one day')
    }
  
    if (pax <= 0) {
      throw new Error('Number of passengers must be greater than 0')
    }
  
    const dailyBreakdown: DailyPricing[] = []
    let totals: TourPricing = {
      tour_id: tour.id || '',
      pax,
      is_euro_passport: isEuroPassport,
      total_accommodation: 0,
      total_meals: 0,
      total_guides: 0,
      total_transportation: 0,
      total_entrances: 0,
      total_additional_services: 0,  // ← ADDED
      grand_total: 0,
      per_person_total: 0
    }
  
    // Calculate pricing for each day
    tour.days.forEach((day) => {
      const dayPricing = calculateDayPricing(day, pax, isEuroPassport)
      dailyBreakdown.push(dayPricing)
  
      // Add to totals
      totals.total_accommodation += dayPricing.accommodation
      totals.total_meals += dayPricing.meals
      totals.total_guides += dayPricing.guide
      totals.total_transportation += dayPricing.transportation
      totals.total_entrances += dayPricing.entrances
      totals.total_additional_services += dayPricing.additional_services  // ← ADDED
    })
  
    // Calculate grand total and per person
    totals.grand_total = 
      totals.total_accommodation +
      totals.total_meals +
      totals.total_guides +
      totals.total_transportation +
      totals.total_entrances +
      totals.total_additional_services  // ← ADDED
  
    totals.per_person_total = totals.grand_total / pax
  
    return {
      daily_breakdown: dailyBreakdown,
      totals,
      per_person: totals.per_person_total
    }
  }
  
  /**
   * Calculate pricing for a single day
   */
  function calculateDayPricing(
    day: TourDay,
    pax: number,
    isEuroPassport: boolean
  ): DailyPricing {
    
    const pricing: DailyPricing = {
      day_number: day.day_number,
      city: day.city,
      accommodation: 0,
      meals: 0,
      guide: 0,
      transportation: 0,
      entrances: 0,
      additional_services: 0,  // ← ADDED
      daily_total: 0
    }
  
    // 1. ACCOMMODATION COST
    // Calculated per room, not per person
    // Assumption: 2 people per double room
    if (day.accommodation) {
      const rooms = calculateRoomsNeeded(pax)
      const ratePerRoom = isEuroPassport
        ? day.accommodation.base_rate_eur
        : day.accommodation.base_rate_non_eur
      
      pricing.accommodation = rooms * ratePerRoom
    }
  
    // 2. MEAL COSTS
    // Calculated per person
    pricing.meals = calculateMealCosts(day, pax, isEuroPassport)
  
    // 3. GUIDE COST
    // Usually charged per day per group, not per person
    if (day.guide_required && day.guide) {
      const guideRate = isEuroPassport
        ? day.guide.base_rate_eur
        : day.guide.base_rate_non_eur
      
      pricing.guide = guideRate
    }
  
    // 4. ACTIVITIES (Entrances + Transportation)
    if (day.activities && day.activities.length > 0) {
      const activityCosts = calculateActivityCosts(
        day.activities,
        pax,
        isEuroPassport
      )
      pricing.entrances = activityCosts.entrances
      pricing.transportation = activityCosts.transportation
    }

    // 5. ADDITIONAL SERVICES  ← ADDED
    if ((day as any).additional_services && (day as any).additional_services.length > 0) {
      pricing.additional_services = calculateAdditionalServicesCosts(
        (day as any).additional_services,
        pax,
        isEuroPassport
      )
    }
  
    // Calculate daily total
    pricing.daily_total =
      pricing.accommodation +
      pricing.meals +
      pricing.guide +
      pricing.transportation +
      pricing.entrances +
      pricing.additional_services  // ← ADDED
  
    return pricing
  }
  
  /**
   * Calculate number of rooms needed
   * Standard: 2 people per double room
   */
  function calculateRoomsNeeded(pax: number): number {
    return Math.ceil(pax / 2)
  }
  
  /**
   * Calculate meal costs for a day
   */
  function calculateMealCosts(
    day: TourDay,
    pax: number,
    isEuroPassport: boolean
  ): number {
    let mealCost = 0
  
    // Breakfast (usually included in hotel, but can be separate)
    // We'll skip breakfast as it's typically included in board basis
  
    // Lunch
    if (day.lunch_meal) {
      const lunchRate = isEuroPassport
        ? day.lunch_meal.base_rate_eur
        : day.lunch_meal.base_rate_non_eur
      
      mealCost += pax * lunchRate
    }
  
    // Dinner
    if (day.dinner_meal) {
      const dinnerRate = isEuroPassport
        ? day.dinner_meal.base_rate_eur
        : day.dinner_meal.base_rate_non_eur
      
      mealCost += pax * dinnerRate
    }
  
    return mealCost
  }
  
  /**
   * Calculate activity costs (entrances + transportation)
   */
  function calculateActivityCosts(
    activities: TourDayActivity[],
    pax: number,
    isEuroPassport: boolean
  ): { entrances: number; transportation: number } {
    
    let totalEntrances = 0
    let totalTransportation = 0
  
    activities.forEach((activity) => {
      // Entrance fees (per person)
      if (activity.entrance) {
        // ← FIXED: Use eur_rate and non_eur_rate instead of base_rate_eur/non_eur
        const entrance = activity.entrance as any
       const entranceRate = isEuroPassport
  ? (entrance.eur_rate || entrance.base_rate_eur || 0)
  : (entrance.non_eur_rate || entrance.base_rate_non_eur || 0)
        
        totalEntrances += pax * entranceRate
      }
  
      // Transportation (per group, not per person)
      if (activity.transportation) {
        const transportRate = isEuroPassport
          ? activity.transportation.base_rate_eur
          : activity.transportation.base_rate_non_eur
        
        totalTransportation += transportRate
      }
    })
  
    return {
      entrances: totalEntrances,
      transportation: totalTransportation
    }
  }

  /**
   * Calculate additional services costs  ← NEW FUNCTION
   */
  function calculateAdditionalServicesCosts(
    services: any[],
    pax: number,
    isEuroPassport: boolean
  ): number {
    let total = 0

    services.forEach(({ service, quantity }) => {
      const rate = isEuroPassport ? service.base_rate_eur : service.base_rate_non_eur
      
      switch (service.rate_type) {
        case 'per_person':
          total += pax * rate
          break
        case 'per_group':
        case 'per_day':
          total += rate
          break
        case 'per_vehicle':
          total += (quantity || 1) * rate
          break
      }
    })

    return total
  }
  
  /**
   * Helper: Suggest vehicle type based on PAX
   */
  export function suggestVehicleType(pax: number): string {
    if (pax <= 2) return 'Sedan'
    if (pax <= 8) return 'Minivan'
    if (pax <= 14) return 'Van'
    return 'Bus'
  }
  
  /**
   * Helper: Check if accommodation includes meals based on board basis
   */
  export function getMealsIncluded(boardBasis: string): {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  } {
    switch (boardBasis) {
      case 'BB': // Bed & Breakfast
        return { breakfast: true, lunch: false, dinner: false }
      case 'HB': // Half Board (Breakfast + Dinner)
        return { breakfast: true, lunch: false, dinner: true }
      case 'FB': // Full Board (All meals)
        return { breakfast: true, lunch: true, dinner: true }
      case 'AI': // All Inclusive
        return { breakfast: true, lunch: true, dinner: true }
      default:
        return { breakfast: false, lunch: false, dinner: false }
    }
  }
  
  /**
   * Helper: Format currency
   */
  export function formatCurrency(amount: number, currency: string = '€'): string {
    return `${currency}${amount.toFixed(2)}`
  }
  
  /**
   * Helper: Calculate percentage
   */
  export function calculatePercentage(part: number, total: number): number {
    if (total === 0) return 0
    return (part / total) * 100
  }
  
  /**
   * Validate tour before calculation
   */
  export function validateTour(tour: Tour): { valid: boolean; errors: string[] } {
    const errors: string[] = []
  
    if (!tour.tour_name || tour.tour_name.trim() === '') {
      errors.push('Tour name is required')
    }
  
    if (!tour.duration_days || tour.duration_days <= 0) {
      errors.push('Duration must be at least 1 day')
    }
  
    if (!tour.cities || tour.cities.length === 0) {
      errors.push('At least one city is required')
    }
  
    if (!tour.days || tour.days.length === 0) {
      errors.push('Tour must have at least one day planned')
    }
  
    // Note: We removed the strict check that days must equal duration
    // because users might still be filling in the tour
  
    return {
      valid: errors.length === 0,
      errors
    }
  }
  
  /**
   * Generate tour code automatically
   */
  export function generateTourCode(tourName: string, duration: number): string {
    const prefix = 'TOUR'
    const nameCode = tourName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6)
    const durationCode = `${duration}D`
    const timestamp = Date.now().toString().slice(-4)
    
    return `${prefix}-${nameCode}-${durationCode}-${timestamp}`
  }