// ============================================
// Bidirectional mapping: Grid Slots ↔ Itinerary Services
// ============================================

import type { GridDay, GridConfig, SlotValue, SelectedItem } from '../types'
import { SLOT_DEFINITIONS } from '../types'

// --- Slot → Service Type ---

export const SLOT_TO_SERVICE_TYPE: Record<string, string> = {
  route: 'transportation',
  guide: 'guide',
  airport_services: 'airport_services',
  hotel_services: 'hotel_services',
  tipping: 'tips',
  boat_rides: 'activity',
  accommodation: 'accommodation',
  entrance_fees: 'entrance',
  flights: 'flight',
  experiences: 'activity',
  meals: 'meal',
  water: 'supplies',
  cruise: 'cruise',
  other_group: 'extra',
  other_pp: 'extra',
}

// --- Service Type → Slot (reverse map with disambiguation) ---

export function serviceTypeToSlotId(serviceType: string, serviceName: string, quantity: number, pax: number): string {
  switch (serviceType) {
    case 'transportation': return 'route'
    case 'guide': return 'guide'
    case 'airport_services': return 'airport_services'
    case 'hotel_services': return 'hotel_services'
    case 'tips': return 'tipping'
    case 'accommodation': return 'accommodation'
    case 'entrance': return 'entrance_fees'
    case 'flight': return 'flights'
    case 'meal': return 'meals'
    case 'supplies': return 'water'
    case 'cruise': return 'cruise'
    case 'activity':
      // Disambiguate: boat rides vs experiences
      if (/boat|felucca|motor|sailing|kayak/i.test(serviceName)) return 'boat_rides'
      return 'experiences'
    case 'extra':
      // Disambiguate: group vs per-person based on quantity
      return quantity === pax ? 'other_pp' : 'other_group'
    default:
      return 'other_group'
  }
}

// --- Grid Slots → Service Inserts ---

export interface ServiceInsert {
  service_type: string
  service_name: string
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  notes: string | null
}

const GROUP_SLOT_IDS = new Set([
  'route', 'guide', 'airport_services', 'hotel_services',
  'tipping', 'boat_rides', 'other_group'
])

export function mapSlotsToServices(day: GridDay, config: GridConfig): ServiceInsert[] {
  const services: ServiceInsert[] = []
  const passport = config.passport

  for (const slot of day.slots) {
    const serviceType = SLOT_TO_SERVICE_TYPE[slot.slotId]
    if (!serviceType) continue

    const isGroup = GROUP_SLOT_IDS.has(slot.slotId)

    // Handle custom amount slots (other_group, other_pp)
    if (slot.customAmount > 0) {
      const slotDef = SLOT_DEFINITIONS.find(d => d.slotId === slot.slotId)
      services.push({
        service_type: serviceType,
        service_name: slotDef?.label || slot.slotId,
        quantity: isGroup ? 1 : config.pax,
        rate_eur: slot.customAmount,
        rate_non_eur: slot.customAmount,
        total_cost: isGroup ? slot.customAmount : slot.customAmount * config.pax,
        notes: `custom_amount|${slot.slotId}`,
      })
      continue
    }

    // Handle selected items
    for (const item of slot.selectedItems) {
      const rate = passport === 'eu' ? item.rateEur : item.rateNonEur
      services.push({
        service_type: serviceType,
        service_name: item.name,
        quantity: isGroup ? 1 : config.pax,
        rate_eur: item.rateEur,
        rate_non_eur: item.rateNonEur,
        total_cost: isGroup ? rate : rate * config.pax,
        notes: `slot:${slot.slotId}|rate_id:${item.rateId}`,
      })
    }
  }

  return services
}

// --- Service Rows → Grid Slots ---

export function mapServicesToSlots(
  services: Array<{
    id: string
    service_type: string
    service_name: string
    quantity: number
    rate_eur: number | null
    rate_non_eur: number | null
    total_cost: number
    notes?: string | null
    description?: string | null
    /** What the grid's save writes (migration 391): the rate it priced the
     *  line at, and the rate row it came from. */
    unit_cost?: number | null
    rate_id?: string | null
  }>,
  pax: number
): SlotValue[] {
  // Start with empty slots for all definitions
  const slotMap = new Map<string, SlotValue>()
  for (const def of SLOT_DEFINITIONS) {
    slotMap.set(def.slotId, {
      slotId: def.slotId,
      selectedItems: [],
      customAmount: 0,
    })
  }

  for (const svc of services) {
    // Throughout-guide synthetic rows are DERIVED from the slots (B-item
    // 3) — the grid recomputes them live, so reloading them into slots
    // would double the money.
    if ((svc.description || svc.notes || '').includes('throughout_guide')) continue

    // Try to extract original slotId from grid metadata
    // Check description first (new format: __grid:slot:xxx|rate_id:yyy)
    // Then notes (legacy format: slot:xxx|rate_id:yyy)
    // The grid's save tags each line "[pricing-grid:<slot>] <name>" — the
    // slot it came from. This used to look only for the legacy "slot:<id>"
    // tag, so every grid-saved line typed 'other' or 'transfer' (water,
    // hotel services, boat rides, airport services…) reloaded into
    // "Other (Group)", and removing it from its own row was impossible.
    let slotId: string | null = null
    const metaSource = svc.description || svc.notes || ''
    const gridTag = (svc.description || '').match(/^\[pricing-grid:([a-z_]+)\]\s*(.*)$/)
    const slotMatch = metaSource.match(/slot:(\w+)/)
    if (gridTag && slotMap.has(gridTag[1])) slotId = gridTag[1]
    else if (slotMatch) slotId = slotMatch[1]

    // Fall back to service_type reverse mapping
    if (!slotId) {
      slotId = serviceTypeToSlotId(svc.service_type, svc.service_name, svc.quantity, pax)
    }

    const slot = slotMap.get(slotId)
    if (!slot) continue

    // The grid's save never writes rate_eur / rate_non_eur — only the rate it
    // priced the line at (unit_cost). Without this fallback every reloaded
    // grid line was worth nothing.
    const unit = Number(svc.unit_cost) || 0
    const rateEur = svc.rate_eur ?? unit
    const rateNonEur = svc.rate_non_eur ?? unit

    // Check if this was a custom amount
    if (metaSource.includes('custom_amount') || (gridTag && gridTag[2] === 'custom')) {
      slot.customAmount = svc.rate_eur ?? unit
      continue
    }

    // Extract original rate_id from metadata if available
    let rateId = svc.rate_id || svc.id // fallback to service row ID
    const rateMatch = metaSource.match(/rate_id:(.+?)(\||$)/)
    if (rateMatch) rateId = rateMatch[1]
    // Water's one option has a fixed id; match it so the row shows it selected.
    if (slotId === 'water' && !svc.rate_id && !rateMatch) rateId = 'water-standard'

    slot.selectedItems.push({
      rateId,
      name: svc.service_name,
      rateEur,
      rateNonEur,
    })
  }

  return SLOT_DEFINITIONS.map(def => slotMap.get(def.slotId)!)
}
