'use client'

// ============================================
// The Properties tab of the supplier view modal
// ============================================
// Lists and edits the assets a supplier operates (ships now; hotels and
// trains in later phases). This is where a cruise line's fleet lives — the
// cruise rate form picks from here instead of typing a ship name into the
// rate row.

import { useCallback, useEffect, useState } from 'react'

import { Loader2, Pencil, Plus, Ship, Building2, TrainFront, Trash2, X } from 'lucide-react'
import {
  PROPERTY_TYPE_LABELS,
  propertyTypesForRoles,
  type PropertyType,
  type SupplierProperty,
} from '@/lib/supplier-properties'

const TYPE_ICONS: Record<PropertyType, typeof Ship> = {
  ship: Ship,
  hotel: Building2,
  train: TrainFront,
}

interface Props {
  supplierId: string
  /** Every role the supplier fills — decides which property types it can own. */
  supplierRoles: string[] | null | undefined
}

type Draft = {
  id?: string
  property_type: PropertyType
  name: string
  city: string
  category: string
  contact_name: string
  contact_phone: string
  contact_email: string
}

const EMPTY = (type: PropertyType): Draft => ({
  property_type: type, name: '', city: '', category: '',
  contact_name: '', contact_phone: '', contact_email: '',
})

export default function SupplierPropertiesPanel({ supplierId, supplierRoles }: Props) {

  const allowedTypes = propertyTypesForRoles(supplierRoles)
  const [properties, setProperties] = useState<SupplierProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/properties`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setProperties(data.data || [])
      else setError(data.error || 'Could not load properties')
    } catch {
      setError('Could not load properties')
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      const url = draft.id
        ? `/api/suppliers/${supplierId}/properties/${draft.id}`
        : `/api/suppliers/${supplierId}/properties`
      const res = await fetch(url, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not save the property')
        return
      }
      setDraft(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: SupplierProperty) => {
    setError(null)
    const res = await fetch(`/api/suppliers/${supplierId}/properties/${p.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      setError(data.error || 'Could not delete the property')
      return
    }
    await load()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {properties.length === 0 && !draft && (
        <div className="text-center py-6 text-gray-500">
          <Ship className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">No properties yet. Add the ships, hotels or trains this supplier operates.</p>
        </div>
      )}

      {properties.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">City</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Contact</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {properties.map(p => {
              const Icon = TYPE_ICONS[p.property_type] ?? Ship
              return (
                <tr key={p.id} className={`border-t border-gray-100 ${p.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" /> {p.name}
                    {p.category && <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{p.category}</span>}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600">{PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{p.city || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">
                    {p.contact_name || '—'}
                    {p.contact_phone && <span className="text-xs text-gray-400 block">{p.contact_phone}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setDraft({
                      id: p.id, property_type: p.property_type, name: p.name,
                      city: p.city || '', category: p.category || '',
                      contact_name: p.contact_name || '', contact_phone: p.contact_phone || '', contact_email: p.contact_email || '',
                    })} className="p-1.5 text-gray-400 hover:text-primary-600" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => void remove(p)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">{draft.id ? 'Edit property' : 'Add property'}</h4>
            <button type="button" onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={draft.property_type}
                onChange={e => setDraft({ ...draft, property_type: e.target.value as PropertyType })}
                disabled={!!draft.id}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              >
                {(allowedTypes.length ? allowedTypes : (['ship', 'hotel', 'train'] as PropertyType[])).map(pt => (
                  <option key={pt} value={pt}>{PROPERTY_TYPE_LABELS[pt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="5★ deluxe" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact name</label>
              <input value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact phone</label>
              <input value={draft.contact_phone} onChange={e => setDraft({ ...draft, contact_phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact email</label>
              <input type="email" value={draft.contact_email} onChange={e => setDraft({ ...draft, contact_email: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft(EMPTY(allowedTypes[0] ?? 'ship'))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
        >
          <Plus className="w-4 h-4" /> Add property
        </button>
      )}
    </div>
  )
}
