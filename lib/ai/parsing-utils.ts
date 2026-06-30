// ============================================
// PARSING UTILITIES & TIER SYSTEM
// ============================================
// Type definitions, tier normalization, and raw-itinerary parsing helpers.
// Pure functions — no DB access, no side effects.

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type InputMode = 'creative' | 'structured'
export type PackageType = 'day-trips' | 'tours-only' | 'land-package' | 'cruise-package' | 'cruise-land'

// Default margin percentage (used if no user preference)
export const DEFAULT_MARGIN_PERCENT = 25

export const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

// Map legacy budget_level values to new tier system
export const TIER_MAP: Record<string, ServiceTier> = {
  'budget': 'budget',
  'economy': 'budget',
  'standard': 'standard',
  'mid-range': 'standard',
  'deluxe': 'deluxe',
  'superior': 'deluxe',
  'luxury': 'luxury',
  'premium': 'luxury',
  'vip': 'luxury'
}

export const TIER_DESCRIPTIONS: Record<ServiceTier, string> = {
  'budget': 'cost-effective, good value',
  'standard': 'comfortable mid-range',
  'deluxe': 'superior quality, premium',
  'luxury': 'top-tier, VIP treatment'
}

// ============================================
// EXTRACTED DAY STRUCTURE (from parser)
// ============================================
export interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string | null
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  activities: string[]
  attractions: string[]
  meals_included: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  overnight_city: string
  notes: string | null
}

// Helper to validate date
export function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// Helper to safely convert to number
export function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

// Helper to normalize tier value
export function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  return TIER_MAP[normalized] || 'standard'
}

// ============================================
// CALCULATE EXPECTED DAYS FROM RAW ITINERARY
// ============================================
export function calculateExpectedDays(rawItinerary: string, extractedDays: ExtractedDay[] | null): number {
  // Method 1: Count day markers (D1, D2, D3... or Day 1, Day 2...)
  const dayMarkerPattern = /\b[Dd](?:ay)?\s*(\d+)\b/g
  let maxDayNumber = 0
  let match
  while ((match = dayMarkerPattern.exec(rawItinerary)) !== null) {
    const dayNum = parseInt(match[1])
    if (dayNum > maxDayNumber) {
      maxDayNumber = dayNum
    }
  }

  // Method 2: Sum up NTS (nights) patterns like "2NTS CAI + 3NTS CRZ"
  const ntsPattern = /(\d+)\s*NTS/gi
  let totalNights = 0
  while ((match = ntsPattern.exec(rawItinerary)) !== null) {
    totalNights += parseInt(match[1])
  }
  const daysFromNights = totalNights > 0 ? totalNights + 1 : 0

  // Method 3: Use extracted days array length
  const extractedCount = extractedDays?.length || 0

  // Take the maximum of all methods
  const expectedDays = Math.max(maxDayNumber, daysFromNights, extractedCount)

  return expectedDays || 1 // Default to 1 if nothing found
}

// ============================================
// PRE-PARSE RAW ITINERARY INTO DAY SEGMENTS
// ============================================
export function preParseRawItinerary(rawItinerary: string): { dayNumber: number; rawContent: string }[] {
  const segments: { dayNumber: number; rawContent: string }[] = []

  // Split by D1, D2, D3... or Day 1, Day 2... patterns
  const dayPattern = /(?:^|\n)\s*(D(\d+)|Day\s*(\d+))\b/gi
  const matches = [...rawItinerary.matchAll(dayPattern)]

  if (matches.length === 0) {
    // No day markers found, return entire content as day 1
    return [{ dayNumber: 1, rawContent: rawItinerary.trim() }]
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const dayNum = parseInt(match[2] || match[3])
    const startIdx = match.index!
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : rawItinerary.length

    const content = rawItinerary.substring(startIdx, endIdx).trim()
    segments.push({ dayNumber: dayNum, rawContent: content })
  }

  // Sort by day number
  segments.sort((a, b) => a.dayNumber - b.dayNumber)

  return segments
}
