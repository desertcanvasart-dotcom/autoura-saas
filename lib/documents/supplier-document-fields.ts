// ============================================
// What PUT /api/supplier-documents/[id] may change
// ============================================
// The route used to pass the whole request body to .update(), minus a few
// keys. Any field the table does not have failed the whole update, silently
// from the user's point of view: the voucher page marked a voucher sent
// with { status: 'sent', sent_via: 'email' }, there is no sent_via column,
// the PUT 400'd, nothing checked the response, and no voucher ever reached
// "sent". The edit page sends the whole loaded row, joins included.
//
// Only these columns are written. Not id, tenant_id, created_at or
// updated_at (the route sets that), and not itinerary_id: a voucher stays
// on its trip. __tests__ pins this list to types/database.types.ts.

export const EDITABLE_SUPPLIER_DOCUMENT_FIELDS = [
  'document_type', 'document_number', 'supplier_id',
  'supplier_name', 'supplier_contact_name', 'supplier_contact_email',
  'supplier_contact_phone', 'supplier_address',
  'client_name', 'client_nationality', 'num_adults', 'num_children',
  'city', 'service_date', 'check_in', 'check_out',
  'pickup_time', 'pickup_location', 'dropoff_location',
  'vehicle_type', 'driver_name',
  'services', 'currency', 'total_cost', 'payment_terms',
  'special_requests', 'internal_notes',
  'status', 'sent_at', 'confirmed_at', 'completed_at',
] as const

/** The editable columns present in `body`; everything else is dropped. */
export function editableSupplierDocumentFields(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!body || typeof body !== 'object') return out
  for (const field of EDITABLE_SUPPLIER_DOCUMENT_FIELDS) {
    if (field in body) out[field] = (body as Record<string, unknown>)[field]
  }
  return out
}
