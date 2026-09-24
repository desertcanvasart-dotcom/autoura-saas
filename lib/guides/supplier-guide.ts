// ============================================
// A GUIDE IS A SUPPLIER ROW (supplier_type = 'guide')
// ============================================
// /api/guides lists guides from `suppliers`, and every picker built on it
// (ResourceAssignmentV2, calendar, resources page, guide rates) stores that
// SUPPLIERS id — as itinerary_resources.resource_id, and so, via the mig 289
// trigger, as itineraries.assigned_guide_id. The single-guide route used to
// read the legacy `guides` table instead, so every guide picked in the app
// 404'd on the itinerary page. Both routes now go through this one mapping.
//
// The standalone `guides` table is legacy (lib/staff-link.ts reads it only as
// a fallback for old assignment rows).

import type { Tables, TablesUpdate } from '@/types/database.types'

export const GUIDE_SUPPLIER_TYPE = 'guide'

type SupplierRow = Tables<'suppliers'>

/**
 * The guide shape the UI reads, from a supplier row. The raw row is spread
 * FIRST so the guide-facing fields win: a supplier's own `phone`, `email`
 * and `is_active` columns are not what the guide screens mean — the phone is
 * the contact phone, the email the contact email, and "active" is `status`
 * (which the list's active filter uses).
 */
export function supplierToGuide(row: SupplierRow) {
  // Guide-only extras some legacy rows/serialisers carry; suppliers has no
  // such columns, so they come through as undefined for a real supplier row.
  const extra = row as SupplierRow & {
    specialties?: string[] | null
    daily_rate?: number | null
    hourly_rate?: number | null
  }
  return {
    ...row,
    id: row.id,
    name: row.name ?? row.company_name,
    phone: row.contact_phone || row.whatsapp || row.phone2 || row.phone,
    email: row.contact_email || row.email,
    city: row.city,
    languages: row.languages || [],
    specialties: extra.specialties || [],
    is_active: row.status === 'active',
    daily_rate: extra.daily_rate,
    hourly_rate: extra.hourly_rate,
    notes: row.notes,
    contact_phone: row.contact_phone,
    whatsapp: row.whatsapp,
  }
}

export type SupplierGuide = ReturnType<typeof supplierToGuide>

/**
 * A guide-form body → the supplier columns it edits. Only fields present in
 * the body are written. Rates are NOT supplier columns (guide pricing lives
 * in guide_rates), so daily/hourly rate and the other legacy-guides-only
 * fields are ignored rather than failing the whole update.
 */
export function guideBodyToSupplierUpdate(
  body: Record<string, unknown>
): TablesUpdate<'suppliers'> {
  const out: TablesUpdate<'suppliers'> = {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)

  if (typeof body.name === 'string' && body.name.trim() !== '') {
    out.name = body.name
    out.company_name = body.name
  }
  if (body.email !== undefined) out.contact_email = str(body.email)
  if (body.contact_email !== undefined) out.contact_email = str(body.contact_email)
  if (body.phone !== undefined) out.contact_phone = str(body.phone)
  if (body.contact_phone !== undefined) out.contact_phone = str(body.contact_phone)
  if (body.whatsapp !== undefined) out.whatsapp = str(body.whatsapp)
  if (body.city !== undefined) out.city = str(body.city)
  if (body.address !== undefined) out.address = str(body.address)
  if (body.notes !== undefined) out.notes = str(body.notes)
  if (body.languages !== undefined) {
    out.languages = Array.isArray(body.languages)
      ? body.languages.filter((l): l is string => typeof l === 'string')
      : []
  }
  if (typeof body.is_active === 'boolean') {
    out.status = body.is_active ? 'active' : 'inactive'
  }
  return out
}
