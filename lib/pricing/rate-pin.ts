// ============================================
// The itinerary's pin on the rate row it was priced from (migration 353)
// ============================================
// itinerary_services.rate_table + rate_id say WHICH hotel/ship/restaurant
// row the pricing grid priced a line from. Anything that re-prices the
// itinerary later (the B2B quote, a single supplement) reads that row and
// never re-chooses one by tier.

/** Grid slot → the rate table its options come from (see /api/pricing-grid/rates). */
const SLOT_RATE_TABLE: Record<string, string> = {
  accommodation: 'accommodation_rates',
  cruise: 'nile_cruises',
  meals: 'meal_rates',
  guide: 'guide_rates',
  entrance_fees: 'entrance_fees',
  experiences: 'activity_rates',
  flights: 'flight_rates',
  airport_services: 'airport_staff_rates',
  hotel_services: 'hotel_staff_rates',
  tipping: 'tipping_rates',
  sleeping_trains: 'sleeping_train_rates',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The rate pin for a grid item, or nothing. Only a plain row id in a slot
 * whose table is known is a pin; synthetic ids (`<id>_supp`, `<id>__tier`,
 * `water-standard`) and slots that merge several tables (route) are not.
 */
export function ratePin(slotId: string, rateId: unknown): { rate_table: string; rate_id: string } | Record<string, never> {
  const table = SLOT_RATE_TABLE[slotId]
  if (!table || typeof rateId !== 'string' || !UUID_RE.test(rateId)) return {}
  return { rate_table: table, rate_id: rateId }
}

