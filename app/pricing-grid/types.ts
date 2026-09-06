import type { PackageType } from '@/lib/package-types'

// ============================================
// PRICING GRID — Type Definitions
// ============================================

// --- Grid Configuration (header controls) ---

/** A key from the tenant's tier vocabulary (Settings → Your vocabulary). */
export type Tier = string
export type ClientType = 'b2b' | 'b2c'
export type PassportType = 'eu' | 'non_eu'

export interface GridConfig {
  pax: number
  passport: PassportType
  tier: Tier
  clientType: ClientType
  /** What the customer is buying — decides which day components the grid
   *  requires. The grid was a full-package engine in disguise: it demanded
   *  accommodation on every overnight and airport services on every arrival
   *  whatever the product was, and stamped every saved itinerary
   *  'land-package' regardless (see lib/package-types.ts). Older saved
   *  configs lack the field; consumers default it to 'full-package', which
   *  is the behaviour the gate always had. */
  packageType?: PackageType
  withGuide: boolean
  /** Spot (default): the per-day guide slots as picked. Throughout (B-item
   *  3): ONE guide travels the whole trip — his bed from each night's
   *  chosen property's guide rate, meals when pax ≤ 3, a seat on every
   *  flight pick, and the rate sheet sizes vehicles at pax+1. Pure grid
   *  math from what the slots already hold; nothing is fetched. Grade
   *  needs no control — the guide slot's dropdown lists every guide-rate
   *  row (senior and Meet & Assist included). */
  guideMode?: 'spot' | 'throughout'
  currency: string
  marginPercent: number
  exchangeRate: number | null  // EUR → target currency
  startDate: string  // ISO date string (YYYY-MM-DD) — for seasonality pricing
  // Client & trip info (maps to itineraries table)
  clientName: string
  clientEmail: string
  clientPhone: string
  tourName: string
  nationality: string
  // Linked itinerary (set after save or load)
  itineraryId: string | null
  itineraryCode: string | null
  // B2B partner (when clientType === 'b2b')
  partnerId: string | null
  partnerName: string
  // Linked CRM client (multi-tenant): the itinerary/quote is stamped with this
  // client_id on save. Null for ad-hoc quotes not tied to a CRM client.
  clientId: string | null
}

// --- Day Type Preset + Component Model (consolidation Phase B / rich gate) ---
//
// Each day in the grid carries a `dayType` preset that fills the component
// flags via DAY_TYPE_DEFAULTS. Per-day boolean overrides on GridDay take
// precedence when set, so a "transfer day that also sightsees" is just a
// transfer preset with hasSightseeing = true.
//
// The rich completeness gate (grid-completeness.ts) reads these via
// resolveComponents(day) to decide what each day requires and what's
// missing. The 6 day_type values map 1:1 to the DB CHECK constraint added
// in migrations/20260627_itinerary_days_day_type_components.sql.

export type DayType = 'arrival' | 'tour' | 'transfer' | 'cruise' | 'free' | 'departure'

export const DAY_TYPES: DayType[] = ['arrival', 'tour', 'transfer', 'cruise', 'free', 'departure']

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  arrival:   'Arrival (airport in + hotel check-in)',
  tour:      'Tour (overnight + sightseeing)',
  transfer:  'Transfer (intercity by road)',
  cruise:    'Cruise (on board)',
  free:      'Free day (overnight, no sightseeing)',
  departure: 'Departure (hotel check-out + airport out)',
}

export const DEFAULT_DAY_TYPE: DayType = 'tour'

export type Intercity = 'none' | 'road' | 'flight'

export interface DayComponents {
  overnight: boolean
  hasSightseeing: boolean
  airportArrival: boolean
  airportDeparture: boolean
  hotelCheckIn: boolean
  hotelCheckOut: boolean
  intercity: Intercity
}

export const DAY_TYPE_DEFAULTS: Record<DayType, DayComponents> = {
  arrival:   { overnight: true,  hasSightseeing: false, airportArrival: true,  airportDeparture: false, hotelCheckIn: true,  hotelCheckOut: false, intercity: 'none' },
  tour:      { overnight: true,  hasSightseeing: true,  airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  transfer:  { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: true,  hotelCheckOut: true,  intercity: 'road' },
  cruise:    { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  free:      { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  departure: { overnight: false, hasSightseeing: false, airportArrival: false, airportDeparture: true,  hotelCheckIn: false, hotelCheckOut: true,  intercity: 'none' },
}

// Entrance-fee class — used by the rich gate so a `mandatory` fee that's
// not priced blocks save, while `optional` / `free` are never required.
// Selections that carry this attribute are gate-aware; ones that don't
// fall through to the count-based fallback path.
export type PricingClass = 'mandatory' | 'optional' | 'free'

// --- Slot Definitions (fixed structure) ---

export type SlotBucket = 'group' | 'per_person'
export type SelectionMode = 'single' | 'multi' | 'custom' | 'auto'

export interface SlotDefinition {
  slotId: string
  label: string
  bucket: SlotBucket
  selectionMode: SelectionMode
  icon: string
  rateTable: string | null  // null = manual entry
}

// All 16 fixed slots
export const SLOT_DEFINITIONS: SlotDefinition[] = [
  // GROUP SERVICES (charged once, divided by pax)
  { slotId: 'route',            label: 'Transport',        bucket: 'group',      selectionMode: 'multi',  icon: '🚗', rateTable: 'transportation_rates' },
  { slotId: 'guide',            label: 'Guide',            bucket: 'group',      selectionMode: 'single', icon: '👨‍🏫', rateTable: 'guide_rates' },
  { slotId: 'airport_services', label: 'Airport Services', bucket: 'group',      selectionMode: 'multi',  icon: '✈️', rateTable: 'airport_staff_rates' },
  { slotId: 'hotel_services',   label: 'Hotel Services',   bucket: 'group',      selectionMode: 'multi',  icon: '🏨', rateTable: 'hotel_staff_rates' },
  { slotId: 'tipping',          label: 'Tipping',          bucket: 'group',      selectionMode: 'multi',  icon: '💰', rateTable: 'tipping_rates' },
  { slotId: 'boat_rides',       label: 'Boat Rides',       bucket: 'group',      selectionMode: 'multi',  icon: '⛵', rateTable: 'activity_rates' },
  { slotId: 'other_group',      label: 'Other (Group)',    bucket: 'group',      selectionMode: 'custom', icon: '📋', rateTable: null },
  // PER-PERSON SERVICES (multiplied by pax)
  { slotId: 'accommodation',    label: 'Accommodation',    bucket: 'per_person', selectionMode: 'single', icon: '🛏️', rateTable: 'accommodation_rates' },
  { slotId: 'entrance_fees',    label: 'Entrance Fees',    bucket: 'per_person', selectionMode: 'multi',  icon: '🎫', rateTable: 'entrance_fees' },
  { slotId: 'flights',          label: 'Flights',          bucket: 'per_person', selectionMode: 'multi',  icon: '🛩️', rateTable: null },
  { slotId: 'experiences',      label: 'Experiences',      bucket: 'per_person', selectionMode: 'multi',  icon: '🎈', rateTable: 'activity_rates' },
  { slotId: 'meals',            label: 'Meals',            bucket: 'per_person', selectionMode: 'multi',  icon: '🍽️', rateTable: 'meal_rates' },
  { slotId: 'water',            label: 'Water',            bucket: 'per_person', selectionMode: 'single', icon: '💧', rateTable: null },
  { slotId: 'cruise',           label: 'Nile Cruise',      bucket: 'per_person', selectionMode: 'single', icon: '🚢', rateTable: 'cruise_rates' },
  { slotId: 'other_pp',         label: 'Other (PP)',       bucket: 'per_person', selectionMode: 'custom', icon: '📋', rateTable: null },
]

export const GROUP_SLOTS = SLOT_DEFINITIONS.filter(s => s.bucket === 'group')
export const PP_SLOTS = SLOT_DEFINITIONS.filter(s => s.bucket === 'per_person')

// --- Runtime Slot Values ---

export interface SelectedItem {
  rateId: string
  name: string
  rateEur: number
  rateNonEur: number
  // Optional metadata attached at selection time so the rich gate can do
  // type/class-aware checks. Slot pickers populate these from the rate row;
  // legacy selections without them fall through to the gate's count-based
  // path. See app/pricing-grid/lib/grid-completeness.ts.
  serviceType?: string         // e.g. 'airport_transfer' / 'day_tour' / 'intercity_transfer' on route slot
  pricingClass?: PricingClass  // 'mandatory' / 'optional' / 'free' on entrance_fees
}

export interface SlotValue {
  slotId: string
  selectedItems: SelectedItem[]
  customAmount: number  // For 'custom' slots (Other Group / Other PP)
}

// --- Day State ---

export interface GridDay {
  id: string
  dayNumber: number
  title: string
  city: string
  description: string
  isExpanded: boolean
  slots: SlotValue[]
  // Day-type preset + per-component overrides (consolidation Phase B rich).
  // dayType picks a preset from DAY_TYPE_DEFAULTS; the override fields below
  // (each nullable / undefined = "use the preset's default") let operators
  // build combined days like "transfer + sightseeing". resolveComponents()
  // in grid-completeness.ts merges the two.
  dayType?: DayType
  overnight?: boolean
  hasSightseeing?: boolean
  airportArrival?: boolean
  airportDeparture?: boolean
  hotelCheckIn?: boolean
  hotelCheckOut?: boolean
  intercity?: Intercity
}

// --- Rate Options (fetched from DB, used in dropdowns) ---

export interface RateOption {
  id: string
  name: string
  rateEur: number
  rateNonEur: number
  city?: string
  category?: string
  details?: string  // e.g., "4★", "Standard cabin", "Aswan → Luxor"
  // Optional metadata used by the rich gate. Transport rates carry
  // service_type (airport_transfer / day_tour / intercity_transfer / etc.);
  // entrance fees carry pricing_class (mandatory / optional / free). Slot
  // pickers pass these through to SelectedItem so the gate can do
  // type-/class-aware checks.
  service_type?: string
  pricing_class?: PricingClass
  // Vehicle-tier capacity (transport rates only). The rates route expands each
  // transportation_rates row into one option per vehicle tier (sedan/minivan/
  // van/minibus/bus), each carrying its capacity band. The multi-pax engine
  // (calculator.ts → buildTransportTierIndex) uses these to re-select the right
  // vehicle as group size grows — the one cost that is non-linear in pax.
  capacity_min?: number
  capacity_max?: number
  /** The throughout guide's rate on this option (B-item 3): a hotel/cruise
   *  option's FIRST-period guide bed (null = no concession — an amber
   *  unpriced night, never a silent zero), or a flight's negotiated guide
   *  fare (null = customer fare, 0 = rides free). */
  guide_rate_eur?: number | null
}

export interface AllRates {
  route: RateOption[]
  guide: RateOption[]
  airport_services: RateOption[]
  hotel_services: RateOption[]
  tipping: RateOption[]
  boat_rides: RateOption[]
  accommodation: RateOption[]
  entrance_fees: RateOption[]
  flights: RateOption[]
  experiences: RateOption[]
  meals: RateOption[]
  water: RateOption[]
  cruise: RateOption[]
}

// --- Calculation Results ---

export interface DayCalc {
  groupTotal: number
  perPersonTotal: number
  groupPerPerson: number
  dailyPerPerson: number
  dailyTotal: number
}

export interface GridTotals {
  costPerPerson: number
  totalCost: number
  marginAmount: number
  sellingPricePerPerson: number
  sellingPriceTotal: number
}

// --- Multi-Pax Rate Sheet (B2B shape of the one grid engine) ---
//
// The grid produces a single quote per GridConfig.pax. The B2B "shape" is the
// same trip priced across a pax RANGE, with the vehicle tier re-selected per
// pax count. The per-pax row shape lives in the canonical core primitive
// (lib/pricing/pax-range.ts) so both shapes — grid and auto-pricing — share it.
import type { PaxPricingRow } from '@/lib/pricing/pax-range'
export type { PaxPriceCell, PaxPricingRow } from '@/lib/pricing/pax-range'

export interface PaxRangeResult {
  paxPricing: PaxPricingRow[]
  // One number for the whole tour (single-room add-on), summed from
  // accommodation single-supplement selections + cruise single rates.
  singleSupplement: number
  currency: string
}
