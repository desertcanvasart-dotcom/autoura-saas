// ============================================
// What an extras-catalogue row may hold
// ============================================
// One check for creating and editing an extra. Editing took any unit (an
// extra "per_night" then priced as nothing knew how) and either route took a
// negative cost or price, which a booking then sold as a refund.

export const EXTRA_UNITS = ['per_person', 'per_booking'] as const

/** The problem with `record`, or null when it may be saved. */
export function extraInputError(record: Record<string, unknown>): string | null {
  if (record.unit !== undefined && !(EXTRA_UNITS as readonly string[]).includes(String(record.unit))) {
    return 'Unit must be per_person or per_booking'
  }
  for (const [key, label] of [['supplier_cost', 'Supplier cost'], ['selling_price', 'Selling price']] as const) {
    const v = record[key]
    if (typeof v === 'number' && v < 0) return `${label} cannot be negative`
  }
  return null
}
