// ============================================
// Supplier properties — shared vocabulary
// ============================================
// The assets a supplier operates (supplier-HAS-properties, 2026-08-31).
// Multi-tenant port of travel-ops-pro Phase 1 (this app is English-only,
// tenant-scoped). Ships first; hotel and train are declared so later phases
// change no vocabulary, only UI + rate linkage.

export const PROPERTY_TYPES = ['ship', 'hotel', 'train'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export interface SupplierProperty {
  id: string
  tenant_id: string
  supplier_id: string
  property_type: PropertyType
  name: string
  city: string | null
  category: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Which property types a supplier's roles imply it can own. */
export function propertyTypesForRoles(types: string[] | null | undefined): PropertyType[] {
  const out = new Set<PropertyType>()
  for (const t of types ?? []) {
    if (t === 'cruise') out.add('ship')
    if (t === 'hotel') out.add('hotel')
    if (t === 'train_operator') out.add('train')
  }
  return [...out]
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  ship: 'Ship',
  hotel: 'Hotel',
  train: 'Train',
}
