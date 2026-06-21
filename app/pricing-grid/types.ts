// ============================================
// Pricing Grid Module — Type Definitions
// ============================================

// --- Enums / Literals ---

export type Tier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type Currency = 'EUR' | 'USD' | 'GBP' | 'EGP'
export type PassportType = 'eu' | 'non_eu'
export type ClientType = 'b2b' | 'b2c'
export type SlotCategory = 'group' | 'per_person'
export type SlotInputMode = 'single' | 'multi' | 'custom' | 'auto'

// Per-day type (B-full completeness): drives which slots a day is REQUIRED to
// have priced before the grid is deliverable. See lib grid-completeness.
export type DayType = 'arrival' | 'tour' | 'transfer' | 'cruise' | 'free' | 'departure'

export const DAY_TYPES: DayType[] = ['arrival', 'tour', 'transfer', 'cruise', 'free', 'departure']

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  arrival: 'Arrival',
  tour: 'Day Tour',
  transfer: 'Transfer',
  cruise: 'Cruise Night',
  free: 'Free / Leisure',
  departure: 'Departure',
}

/** Default day type when none is set (most days are guided sightseeing days). */
export const DEFAULT_DAY_TYPE: DayType = 'tour'

// Per-day transition EVENTS — these (not the day type) drive airport & hotel
// service requirements, because the same event can occur on different day types
// (e.g. a domestic-flight Transfer day has BOTH airport events). A day with a
// check-in OR check-out requires hotel services; a day with an airport arrival
// OR departure requires airport services.
// How a city-to-city move happens on a transfer day (drives the transport
// segment kind required): none, by road, or by domestic flight.
export type IntercityMode = 'none' | 'road' | 'flight'

// The full set of components that can occur on a day. Requirements derive from
// THESE (not the day type directly), so combined days work — e.g. a domestic
// flight Transfer day that also sightsees has hasSightseeing + intercity:'flight'
// + airport events all at once.
export interface DayComponents {
  overnight: boolean           // sleeps somewhere tonight  → requires a sleep slot
  hasSightseeing: boolean       // day tour                  → day-tour transport + guide(if on) + mandatory entrances
  airportArrival: boolean       // met at arrival airport    → airport services + airport transfer
  airportDeparture: boolean     // assisted at dep. airport  → airport services + airport transfer
  hotelCheckIn: boolean         // into hotel / embark cruise → hotel services
  hotelCheckOut: boolean        // out of hotel / disembark   → hotel services
  intercity: IntercityMode      // road → intercity transfer; flight → flights slot
}

/** Default components per day type — a preset the operator can override per day. */
export const DAY_TYPE_DEFAULTS: Record<DayType, DayComponents> = {
  arrival:   { overnight: true,  hasSightseeing: false, airportArrival: true,  airportDeparture: false, hotelCheckIn: true,  hotelCheckOut: false, intercity: 'none' },
  tour:      { overnight: true,  hasSightseeing: true,  airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  transfer:  { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: true,  hotelCheckOut: true,  intercity: 'road' },
  cruise:    { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  free:      { overnight: true,  hasSightseeing: false, airportArrival: false, airportDeparture: false, hotelCheckIn: false, hotelCheckOut: false, intercity: 'none' },
  departure: { overnight: false, hasSightseeing: false, airportArrival: false, airportDeparture: true,  hotelCheckIn: false, hotelCheckOut: true,  intercity: 'none' },
}

// Entrance-fee class: mandatory (always charged), optional (paid on request),
// free (no charge — €0 is expected, not "missing").
export type PricingClass = 'mandatory' | 'optional' | 'free'

export const TIERS: Tier[] = ['budget', 'standard', 'deluxe', 'luxury']
export const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'EGP']
export const DEFAULT_MARGINS: Record<ClientType, number> = { b2b: 10, b2c: 25 }

export const VEHICLE_TIERS = [
  { label: 'Sedan', minPax: 1, maxPax: 2 },
  { label: 'Minivan', minPax: 3, maxPax: 7 },
  { label: 'Van', minPax: 8, maxPax: 12 },
  { label: 'Minibus', minPax: 13, maxPax: 20 },
  { label: 'Bus', minPax: 21, maxPax: 45 },
] as const

// --- Grid Configuration ---

export interface GridConfig {
  pax: number
  passport: PassportType
  tier: Tier
  clientType: ClientType
  withGuide: boolean
  currency: Currency
  marginPercent: number
  exchangeRate: number | null
  startDate: string
  clientName: string
  clientEmail: string
  clientPhone: string
  tourName: string
  nationality: string
  itineraryId: string | null
  partnerId: string | null
  clientId: string | null
}

export const DEFAULT_CONFIG: GridConfig = {
  pax: 2,
  passport: 'non_eu',
  tier: 'standard',
  clientType: 'b2c',
  withGuide: true,
  currency: 'EUR',
  marginPercent: 25,
  exchangeRate: null,
  startDate: new Date().toISOString().split('T')[0],
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  tourName: '',
  nationality: '',
  itineraryId: null,
  partnerId: null,
  clientId: null,
}

// --- Slot Definitions ---

export interface SlotDefinition {
  id: string
  label: string
  icon: string
  category: SlotCategory
  mode: SlotInputMode
  rateTable: string | null // null for manual/custom entry
  conditionalOn?: string   // config field that controls visibility
}

// --- Slot Values ---

// A single resolved selection within a slot. Carries the metadata the
// completeness gate needs to reason precisely: a transport line's segment kind
// (service_type) and an entrance fee's pricing class. Populated from the chosen
// rate option at selection time (manual or AI). Optional for back-compat.
export interface SlotSelection {
  id: string
  rate: number
  label?: string
  serviceType?: string        // transport: 'airport_transfer' | 'intercity_transfer' | 'day_tour' | ...
  pricingClass?: PricingClass // entrance fees: mandatory | optional | free
}

export interface SlotValue {
  slotId: string
  selectedId: string | null        // for single-select
  selectedIds: string[]            // for multi-select
  customAmount: number | null      // for custom entry
  resolvedRate: number             // computed EUR amount for this slot (sum of selections)
  label: string                    // display label for selections
  /** Per-selection detail (segment type / pricing class). Enables type/class-aware completeness. */
  selections?: SlotSelection[]
}

export function emptySlotValue(slotId: string): SlotValue {
  return {
    slotId,
    selectedId: null,
    selectedIds: [],
    customAmount: null,
    resolvedRate: 0,
    label: '',
  }
}

// --- Rate Options (from DB) ---

export interface RateOption {
  id: string
  label: string
  rateEur: number
  rateNonEur: number
  city?: string
  tier?: string
  category?: string
  details?: Record<string, any>
  // Completeness metadata (B-full), carried into the slot on selection.
  serviceType?: string
  pricingClass?: PricingClass
}

export type AllRates = Record<string, RateOption[]>

// --- Grid Day ---

export interface GridDay {
  id: string
  dayNumber: number
  title: string
  city: string
  description: string
  isExpanded: boolean
  slots: SlotValue[]
  /** B-full: a one-click preset that fills the component flags below. Defaults to DEFAULT_DAY_TYPE. */
  dayType?: DayType
  // B-full day components — when set, these OVERRIDE the dayType preset defaults.
  // Requirements are computed from these (see grid-completeness).
  overnight?: boolean
  hasSightseeing?: boolean
  airportArrival?: boolean
  airportDeparture?: boolean
  hotelCheckIn?: boolean
  hotelCheckOut?: boolean
  intercity?: IntercityMode
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

export const EMPTY_TOTALS: GridTotals = {
  costPerPerson: 0,
  totalCost: 0,
  marginAmount: 0,
  sellingPricePerPerson: 0,
  sellingPriceTotal: 0,
}

// --- Exchange Rates ---

export type ExchangeRates = Record<Currency, number>

// --- AI Parse Result ---

export interface ParseResult {
  days: GridDay[]
  metadata: {
    clientName?: string
    clientEmail?: string
    clientPhone?: string
    pax?: number
    startDate?: string
    passport?: PassportType
    tourName?: string
    nationality?: string
  }
  generationMode: 'parsed' | 'generated'
}

// --- Save Result ---

export interface SaveResult {
  itineraryId: string
  itineraryCode: string
  daysCreated: number
  servicesCreated: number
  quoteId?: string
  redirectUrl?: string
}

// --- Review Phase (structure-only, no pricing) ---

export type GridPhase = 'input' | 'review' | 'pricing'

export interface ReviewService {
  id: string
  text: string
  category: 'group' | 'per_person'
}

export interface ReviewDay {
  id: string
  dayNumber: number
  title: string
  city: string
  description: string
  services: ReviewService[]
  isExpanded: boolean
}
