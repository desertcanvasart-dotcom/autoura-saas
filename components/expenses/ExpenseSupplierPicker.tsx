'use client'

// ============================================
// Who an expense is paid to: location → supplier
// ============================================
// The expense forms had a blank "Supplier Name" box. Now the category says
// which suppliers to offer (a meal → the agency's restaurants, accommodation
// → its hotels; lib/expense-categories), the location narrows them to one
// city, and picking one stores its supplier_id — so the expense is tied to the
// real supplier record, not to however the name was typed that day. A name
// that is not in the list can still be typed.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import CitySelect from '@/components/CitySelect'
import { useVocabulary } from '@/hooks/useVocabulary'
import { supplierTypesForCategory } from '@/lib/expense-categories'

export interface SupplierChoice {
  supplier_id: string | null
  supplier_name: string
  supplier_type: string
}

interface SupplierOption {
  id: string
  name: string
  city: string | null
  type: string | null
  types: string[] | null
}

const OTHER = '__other__'

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white'

export default function ExpenseSupplierPicker({
  category, city, onCityChange, value, onChange,
}: {
  category: string
  city: string
  onCityChange: (city: string) => void
  value: SupplierChoice
  onChange: (next: SupplierChoice) => void
}) {
  const types = useMemo(() => supplierTypesForCategory(category), [category])
  const typesKey = types.join(',')
  const { labelFor } = useVocabulary('supplier_type')
  const roleLabel = types.length ? labelFor(types[0]) : 'Supplier'

  const [options, setOptions] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  // Typing a name by hand: chosen explicitly, or the stored expense names a
  // supplier that has no record.
  const [typing, setTyping] = useState(!value.supplier_id && !!value.supplier_name)

  useEffect(() => {
    if (!typesKey) { setOptions([]); return }
    const ctrl = new AbortController()
    const params = new URLSearchParams({ type: typesKey, status: 'active' })
    if (city) params.set('city', city)
    setLoading(true)
    setLoadFailed(false)
    fetch(`/api/suppliers?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        if (d.success === false || !Array.isArray(d.data)) throw new Error(d.error || 'load failed')
        setOptions(d.data.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          name: (s.name as string) || (s.company_name as string) || 'Unnamed supplier',
          city: (s.city as string) ?? null,
          type: (s.type as string) ?? null,
          types: (s.types as string[]) ?? null,
        })))
      })
      .catch(e => { if (e?.name !== 'AbortError') { setOptions([]); setLoadFailed(true) } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [typesKey, city])

  // The saved supplier stays selectable even when the city filter hides it.
  const selectOptions = useMemo(() => {
    if (!value.supplier_id || options.some(o => o.id === value.supplier_id)) return options
    return [{ id: value.supplier_id, name: value.supplier_name || 'Selected supplier', city: null, type: value.supplier_type, types: null }, ...options]
  }, [options, value.supplier_id, value.supplier_name, value.supplier_type])

  const pick = (id: string) => {
    if (id === OTHER) {
      setTyping(true)
      onChange({ supplier_id: null, supplier_name: '', supplier_type: types[0] ?? value.supplier_type })
      return
    }
    setTyping(false)
    const s = selectOptions.find(o => o.id === id)
    if (!s) { onChange({ supplier_id: null, supplier_name: '', supplier_type: types[0] ?? '' }); return }
    // The role it is paid in here: the first of its types this category wants.
    const role = (s.types || []).find(t => types.includes(t)) ?? s.type ?? types[0] ?? ''
    onChange({ supplier_id: s.id, supplier_name: s.name, supplier_type: role })
  }

  const nameInput = (
    <input
      type="text"
      value={value.supplier_name}
      onChange={e => onChange({ supplier_id: null, supplier_name: e.target.value, supplier_type: value.supplier_type || types[0] || '' })}
      placeholder={types.length ? `${roleLabel} name` : 'e.g., Ahmed Mohamed'}
      className={inputClass}
    />
  )

  // Tips, fuel, office costs…: no supplier list, just who was paid.
  if (!types.length) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Paid to</label>
        {nameInput}
      </div>
    )
  }

  const empty = !loading && !loadFailed && options.length === 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
          <CitySelect value={city} onChange={onCityChange} placeholder="All locations" className={inputClass} aria-label="Location" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
            {roleLabel}
            {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </label>
          <select
            value={typing ? OTHER : (value.supplier_id ?? '')}
            onChange={e => pick(e.target.value)}
            className={inputClass}
            aria-label={roleLabel}
          >
            <option value="">{loading ? 'Loading…' : `Select ${roleLabel.toLowerCase()}`}</option>
            {selectOptions.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.city && !city ? ` — ${s.city}` : ''}</option>
            ))}
            <option value={OTHER}>Not in the list — type a name</option>
          </select>
        </div>
      </div>

      {typing && nameInput}

      {empty && (
        <p className="text-xs text-gray-500">
          No {roleLabel.toLowerCase()} suppliers{city ? ` in ${city}` : ''} yet.{' '}
          {city && <button type="button" onClick={() => onCityChange('')} className="text-[#647C47] hover:underline">Show all locations</button>}
          {city && ' · '}
          <Link href="/suppliers" target="_blank" className="text-[#647C47] hover:underline">Add one in Suppliers</Link>
        </p>
      )}
      {loadFailed && <p className="text-xs text-red-600">Couldn&apos;t load suppliers — type the name instead.</p>}
    </div>
  )
}
