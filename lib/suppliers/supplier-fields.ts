// The supplier columns the supplier form/API may write — one list for both
// /api/suppliers (create) and /api/suppliers/[id] (update), which used to
// carry two copies of it.

import { cleanOtherCities } from './supplier-cities'

export const SUPPLIER_WRITABLE_FIELDS = [
  'name', 'type', 'types', 'contact_name', 'contact_email', 'contact_phone',
  'phone2', 'whatsapp', 'website', 'address', 'city', 'country',
  'default_commission_rate', 'commission_type', 'payment_terms',
  'bank_details', 'status', 'notes',
  // Where it works (461): its base `city`, the others, or everywhere.
  'other_cities', 'works_all_cities',
  // Type-specific fields
  'languages', 'vehicle_types', 'star_rating', 'property_type',
  'cuisine_types', 'routes', 'ship_name', 'cabin_count', 'capacity',
] as const

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))] : []

/** Only the writable fields present in `body`, with the list fields cleaned. */
export function filterSupplierFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of SUPPLIER_WRITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  if (out.other_cities !== undefined) {
    out.other_cities = cleanOtherCities(typeof body.city === 'string' ? body.city : null, out.other_cities)
  }
  if (out.works_all_cities !== undefined) out.works_all_cities = out.works_all_cities === true
  if (out.languages !== undefined) out.languages = strings(out.languages)
  return out
}
