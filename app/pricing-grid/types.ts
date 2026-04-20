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

export interface SlotValue {
  slotId: string
  selectedId: string | null        // for single-select
  selectedIds: string[]            // for multi-select
  customAmount: number | null      // for custom entry
  resolvedRate: number             // computed EUR amount for this slot
  label: string                    // display label for selections
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
