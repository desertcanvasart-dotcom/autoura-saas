// ============================================
// Pricing Grid — Slot Definitions & Mapping
// ============================================

import { SlotDefinition, SlotValue, emptySlotValue } from '../types'

// --- 16 Fixed Service Slot Definitions ---

export const GROUP_SLOTS: SlotDefinition[] = [
  {
    id: 'route',
    label: 'Transport',
    icon: '🚗',
    category: 'group',
    mode: 'multi',
    rateTable: 'transportation_rates',
  },
  {
    id: 'guide',
    label: 'Guide',
    icon: '👨‍🏫',
    category: 'group',
    mode: 'single',
    rateTable: 'guide_rates',
    conditionalOn: 'withGuide',
  },
  {
    id: 'airport_services',
    label: 'Airport Services',
    icon: '✈️',
    category: 'group',
    mode: 'multi',
    rateTable: 'airport_staff_rates',
  },
  {
    id: 'hotel_services',
    label: 'Hotel Services',
    icon: '🏨',
    category: 'group',
    mode: 'multi',
    rateTable: 'hotel_staff_rates',
  },
  {
    id: 'tipping',
    label: 'Tipping',
    icon: '💰',
    category: 'group',
    mode: 'multi',
    rateTable: 'tipping_rates',
  },
  {
    id: 'boat_rides',
    label: 'Boat Rides',
    icon: '⛵',
    category: 'group',
    mode: 'multi',
    rateTable: 'activity_rates',
  },
  {
    id: 'other_group',
    label: 'Other (Group)',
    icon: '📋',
    category: 'group',
    mode: 'custom',
    rateTable: null,
  },
]

export const PER_PERSON_SLOTS: SlotDefinition[] = [
  {
    id: 'accommodation',
    label: 'Accommodation',
    icon: '🛏️',
    category: 'per_person',
    mode: 'single',
    rateTable: 'accommodation_rates',
  },
  {
    id: 'entrance_fees',
    label: 'Entrance Fees',
    icon: '🎫',
    category: 'per_person',
    mode: 'multi',
    rateTable: 'entrance_fees',
  },
  {
    id: 'flights',
    label: 'Flights',
    icon: '🛩️',
    category: 'per_person',
    mode: 'multi',
    rateTable: 'flight_rates',
  },
  {
    id: 'experiences',
    label: 'Experiences',
    icon: '🎈',
    category: 'per_person',
    mode: 'multi',
    rateTable: 'activity_rates',
  },
  {
    id: 'meals',
    label: 'Meals',
    icon: '🍽️',
    category: 'per_person',
    mode: 'multi',
    rateTable: 'meal_rates',
  },
  {
    id: 'water',
    label: 'Water',
    icon: '💧',
    category: 'per_person',
    mode: 'custom',
    rateTable: null,
  },
  {
    id: 'cruise',
    label: 'Nile Cruise',
    icon: '🚢',
    category: 'per_person',
    mode: 'single',
    rateTable: 'nile_cruises',
  },
  {
    id: 'sleeping_trains',
    label: 'Sleeping Trains',
    icon: '🚂',
    category: 'per_person',
    mode: 'single',
    rateTable: 'sleeping_train_rates',
  },
  {
    id: 'other_pp',
    label: 'Other (PP)',
    icon: '📋',
    category: 'per_person',
    mode: 'custom',
    rateTable: null,
  },
]

export const ALL_SLOTS: SlotDefinition[] = [...GROUP_SLOTS, ...PER_PERSON_SLOTS]

// --- Helper: Create empty slots array for a new day ---

export function createEmptySlots(): SlotValue[] {
  return ALL_SLOTS.map(slot => emptySlotValue(slot.id))
}

// --- Helper: Find slot definition by ID ---

export function getSlotDef(slotId: string): SlotDefinition | undefined {
  return ALL_SLOTS.find(s => s.id === slotId)
}

// --- Slot → itinerary_services mapping ---

const SLOT_TO_SERVICE_TYPE: Record<string, string> = {
  route: 'transportation',
  guide: 'guide',
  airport_services: 'transfer',
  hotel_services: 'other',
  tipping: 'tip',
  boat_rides: 'other',
  other_group: 'other',
  accommodation: 'accommodation',
  entrance_fees: 'entrance_fee',
  flights: 'flight',
  experiences: 'other',
  meals: 'meal',
  water: 'other',
  cruise: 'accommodation',
  sleeping_trains: 'transportation',
  other_pp: 'other',
}

export interface ServiceInsert {
  itinerary_id: string
  day_id: string
  service_type: string
  service_name: string
  description: string
  quantity: number
  unit_cost: number
  total_cost: number
  is_included: boolean
}

export function mapSlotToServices(
  slot: SlotValue,
  itineraryId: string,
  dayId: string,
  pax: number
): ServiceInsert[] {
  const slotDef = getSlotDef(slot.slotId)
  if (!slotDef || slot.resolvedRate === 0) return []

  const serviceType = SLOT_TO_SERVICE_TYPE[slot.slotId] || 'other'
  const isGroup = slotDef.category === 'group'

  return [{
    itinerary_id: itineraryId,
    day_id: dayId,
    service_type: serviceType,
    service_name: slot.label || slotDef.label,
    description: `[pricing-grid:${slot.slotId}] ${slot.label}`,
    quantity: isGroup ? 1 : pax,
    unit_cost: slot.resolvedRate,
    total_cost: isGroup ? slot.resolvedRate : slot.resolvedRate * pax,
    is_included: true,
  }]
}

export function mapServiceToSlot(
  service: { service_type: string; description: string; unit_cost: number; service_name: string }
): { slotId: string; rate: number; label: string } | null {
  // Extract slot ID from description tag [pricing-grid:slotId]
  const match = service.description?.match(/\[pricing-grid:(\w+)\]/)
  if (match) {
    return {
      slotId: match[1],
      rate: service.unit_cost || 0,
      label: service.service_name || '',
    }
  }
  return null
}
