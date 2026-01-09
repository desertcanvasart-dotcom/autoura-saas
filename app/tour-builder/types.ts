// Tour Calculator TypeScript Interfaces
// Location: /app/tour-builder/types.ts

export interface Tour {
    id?: string
    tour_code: string
    tour_name: string
    duration_days: number
    cities: string[]
    tour_type: 'classic' | 'luxury' | 'budget' | 'custom'
    is_template: boolean
    description?: string
    created_by?: string
    created_at?: string
    updated_at?: string
    days?: TourDay[]
  }
  
  export interface TourDay {
    id?: string
    tour_id?: string
    day_number: number
    city: string
    accommodation_id?: string
    accommodation?: AccommodationRate // Populated from rates
    breakfast_included: boolean
    lunch_meal_id?: string
    lunch_meal?: MealRate // Populated from rates
    dinner_meal_id?: string
    dinner_meal?: MealRate // Populated from rates
    guide_required: boolean
    guide_id?: string
    guide?: GuideRate // Populated from rates
    notes?: string
    activities?: TourDayActivity[]
    created_at?: string
  }
  
  export interface TourDayActivity {
    id?: string
    tour_day_id?: string
    activity_order: number
    entrance_id?: string
    entrance?: EntranceRate // Populated from rates
    transportation_id?: string
    transportation?: TransportationRate // Populated from rates
    activity_notes?: string
    created_at?: string
  }
  
  export interface TourPricing {
    id?: string
    tour_id: string
    pax: number
    is_euro_passport: boolean
    total_accommodation: number
    total_meals: number
    total_guides: number
    total_transportation: number
    total_entrances: number
    total_additional_services: number
    grand_total: number
    per_person_total: number
    calculated_at?: string
  }
  
  export interface TourPricingBreakdown {
    daily_breakdown: DailyPricing[]
    totals: TourPricing
    per_person: number
  }
  
  export interface DailyPricing {
    day_number: number
    city: string
    accommodation: number
    meals: number
    guide: number
    transportation: number
    entrances: number
    additional_services: number
    daily_total: number
  }
  
  // Calculation Input Interface
  export interface TourCalculationInput {
    tour: Tour
    pax: number
    is_euro_passport: boolean
  }
  
  // API Response Types
  export interface TourCalculationResponse {
    success: boolean
    data?: TourPricingBreakdown
    error?: string
  }
  
  export interface SaveTourResponse {
    success: boolean
    data?: Tour
    error?: string
  }
  
  // Form State Types
  export interface TourBuilderState {
    step: number // 1: Setup, 2: Daily Planning, 3: Review
    tour: Tour
    current_day: number
    pax: number
    is_euro_passport: boolean
    pricing?: TourPricingBreakdown
    is_calculating: boolean
    is_saving: boolean
  }
  
  // Rate Types (imported from existing system)
  export interface AccommodationRate {
    id: string
    service_code: string
    property_name: string
    property_type: string
    star_rating: number
    room_type: string
    board_basis: 'BB' | 'HB' | 'FB' | 'AI'
    city: string
    base_rate_eur: number
    base_rate_non_eur: number
    tier: 'budget' | 'standard' | 'premium' | 'luxury'
    single_supplement_eur?: number
    single_supplement_non_eur?: number
  }
  
  export interface MealRate {
    id: string
    service_code: string
    restaurant_name: string
    meal_type: 'Breakfast' | 'Lunch' | 'Dinner'
    cuisine_type: string
    restaurant_type: string
    city: string
    base_rate_eur: number
    base_rate_non_eur: number
    tier: 'budget' | 'standard' | 'premium'
    meal_category: string
  }
  
  export interface GuideRate {
    id: string
    service_code: string
    guide_language: string
    guide_type: string
    city: string
    tour_duration: string
    base_rate_eur: number
    base_rate_non_eur: number
  }
  
  export interface EntranceRate {
    id: string
    service_code: string
    attraction_name: string
    city: string
    fee_type: string
    base_rate_eur: number
    base_rate_non_eur: number
    child_discount_percent?: number
    category?: string
  }
  
  export interface TransportationRate {
    id: string
    service_code: string
    service_type: string
    vehicle_type: string
    capacity_min: number
    capacity_max: number
    city: string
    base_rate_eur: number
    base_rate_non_eur: number
  }
  
// ============================================
// NEW: Activity Builder Types (ADD THESE)
// ============================================

// Entrance Fees
    export interface EntranceFee {
    id: string
    service_code: string
    attraction_name: string
    city: string
    eur_rate: number           // ← Changed
    non_eur_rate: number       // ← Changed
    fee_type?: string
    category?: string
    egyptian_rate?: number
    student_discount_percentage?: number
    child_discount_percent?: number
  }
  
  export interface BaseRate {
    id: string
    city?: string
    season?: string
    valid_from?: string
    valid_to?: string
    currency?: string
    created_at?: string
    updated_at?: string
  }
  
  // Transportation
  export interface TransportationRate extends BaseRate {
    vehicle_type: string
    service_type: string
    capacity_min: number
    capacity_max: number
  }
  
  // Service Fees
  export interface ServiceFee extends BaseRate {
    service_name: string
    service_category: string
    service_type: string
    rate_type: 'per_person' | 'per_group' | 'per_vehicle' | 'per_day'
  }
  
  export interface SelectedService {
    service: ServiceFee
    quantity?: number
  }
  
  // Activities
  export interface TourDayActivity {
    id?: string
    tour_day_id?: string
    activity_order: number
    entrance_id?: string
    entrance?: EntranceFee
    transportation_id?: string
    transportation?: TransportationRate
    activity_notes?: string
  }

  // Helper Types
  export type BoardBasis = 'BB' | 'HB' | 'FB' | 'AI'
  export type TourType = 'classic' | 'luxury' | 'budget' | 'custom'
  export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'
  export type VehicleType = 'Sedan' | 'Minivan' | 'Van' | 'Bus'
