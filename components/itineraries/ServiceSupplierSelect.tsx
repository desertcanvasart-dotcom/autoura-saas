'use client'

// ============================================
// The supplier for one itinerary line: its kind, in its city
// ============================================
// A meal offers restaurants, a hotel night hotels, a car transport companies
// and drivers (lib/suppliers/service-supplier-kinds) — those in the line's
// city first, then the same kind in other cities. It used to list every
// supplier the agency has, airlines and cruise lines for a lunch.

import { useEffect, useMemo, useState } from 'react'
import { useVocabulary } from '@/hooks/useVocabulary'
import {
  supplierBehaviorsForService, groupSuppliersByCity, type SupplierOption,
} from '@/lib/suppliers/service-supplier-kinds'

// Many lines share a kind and a city: one request each, for the page's life.
const cache = new Map<string, Promise<SupplierOption[]>>()

function load(types: string[], city: string | null): Promise<SupplierOption[]> {
  const params = new URLSearchParams({ type: types.join(','), status: 'active' })
  if (city) params.set('city', city)
  const key = params.toString()
  let hit = cache.get(key)
  if (!hit) {
    hit = fetch(`/api/suppliers?${key}`)
      .then(r => r.json())
      .then(d => {
        if (d.success === false || !Array.isArray(d.data)) throw new Error(d.error || 'load failed')
        return d.data.map((s: Record<string, unknown>) => ({
          id: String(s.id),
          name: (s.name as string) || (s.company_name as string) || 'Unnamed supplier',
          city: (s.city as string) ?? null,
        }))
      })
      .catch(err => {
        cache.delete(key) // a failed load is tried again next time
        throw err
      })
    cache.set(key, hit)
  }
  return hit
}

const label = (s: SupplierOption) => `${s.name}${s.city ? ` (${s.city})` : ''}`

export default function ServiceSupplierSelect({
  serviceType, city, supplierId, supplierName, onChange, className,
}: {
  serviceType: string | null
  /** Where the supplier should be (supplierCityForService). */
  city: string | null
  supplierId: string | null | undefined
  supplierName: string | null | undefined
  onChange: (next: { supplier_id: string | null; supplier_name: string | null }) => void
  className?: string
}) {
  const types = useMemo(() => supplierBehaviorsForService(serviceType), [serviceType])
  const typesKey = types.join(',')
  const { labelFor } = useVocabulary('supplier_type')
  const [inCity, setInCity] = useState<SupplierOption[]>([])
  const [ofKind, setOfKind] = useState<SupplierOption[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!typesKey) { setInCity([]); setOfKind([]); return }
    let live = true
    const kinds = typesKey.split(',')
    Promise.all([city ? load(kinds, city) : Promise.resolve([]), load(kinds, null)])
      .then(([here, all]) => { if (live) { setInCity(here); setOfKind(all); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [typesKey, city])

  const groups = useMemo(() => groupSuppliersByCity(inCity, ofKind), [inCity, ofKind])
  const listed = useMemo(() => new Set([...groups.inCity, ...groups.otherCities].map(s => s.id)), [groups])
  const kindLabel = types.length ? labelFor(types[0]) : 'supplier'

  const all = [...groups.inCity, ...groups.otherCities]
  return (
    <select
      value={supplierId || ''}
      onChange={e => {
        const id = e.target.value || null
        if (!id) { onChange({ supplier_id: null, supplier_name: null }); return }
        const s = all.find(x => x.id === id)
        onChange({ supplier_id: id, supplier_name: s?.name ?? supplierName ?? null })
      }}
      className={className}
    >
      <option value="">-- No Supplier (Optional) --</option>
      {/* The saved supplier stays selectable even when it is not of this kind or city. */}
      {supplierId && !listed.has(supplierId) && (
        <option value={supplierId}>{supplierName || 'Selected supplier'}</option>
      )}
      {groups.inCity.length > 0 && (
        <optgroup label={`${kindLabel} in ${city}`}>
          {groups.inCity.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
        </optgroup>
      )}
      {groups.otherCities.length > 0 && (
        <optgroup label={city && groups.inCity.length === 0 ? `No ${kindLabel.toLowerCase()} in ${city} — other cities` : `${kindLabel} in other cities`}>
          {groups.otherCities.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
        </optgroup>
      )}
      {failed && <option disabled>Could not load suppliers — reopen to try again</option>}
      {!failed && types.length > 0 && all.length === 0 && <option disabled>No {kindLabel.toLowerCase()} suppliers yet</option>}
    </select>
  )
}
