// The table behind each rate category of the Rates page's menu (slugs as in
// lib/nav/config.ts RATE_GROUPS). `dated`: the table carries rate_valid_to,
// so "expiring in 30 days" can be counted for it.

export interface RateTable {
  table: string
  dated: boolean
}

export const RATE_TABLES: Record<string, RateTable> = {
  hotels: { table: 'accommodation_rates', dated: true },
  cruises: { table: 'nile_cruises', dated: true },
  'sleeping-train': { table: 'sleeping_train_rates', dated: true },
  'hotel-services': { table: 'hotel_staff_rates', dated: false },
  transportation: { table: 'transportation_rates', dated: false },
  flights: { table: 'flight_rates', dated: true },
  trains: { table: 'train_rates', dated: true },
  'airport-services': { table: 'airport_staff_rates', dated: false },
  guides: { table: 'guide_rates', dated: true },
  meals: { table: 'meal_rates', dated: true },
  attractions: { table: 'entrance_fees', dated: true },
  activities: { table: 'activity_rates', dated: true },
  tipping: { table: 'tipping_rates', dated: false },
  'fixed-costs': { table: 'fixed_daily_costs', dated: false },
}

export interface RateCategorySummary {
  /** Active rates on file. */
  count: number
  /** Latest updated_at among them (ISO), or null with none. */
  updatedAt: string | null
  /** Active rates whose rate_valid_to falls in the next 30 days (dated tables only). */
  expiring: number
}

export interface RatesSummary {
  categories: Record<string, RateCategorySummary>
  /** Rates the Rates check flags (hotel tier vs stars, transport type vs route). */
  flagged: number
}

/** YYYY-MM-DD for `days` from `from`, in UTC (rate_valid_to is a date). */
export function isoDatePlus(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days))
  return d.toISOString().slice(0, 10)
}
