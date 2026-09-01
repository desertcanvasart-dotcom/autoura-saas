'use client'

// ============================================
// Options of ONE tour variation — priced upgrades that belong to a programme
// ============================================
// A hot-air balloon on the Luxor deluxe trip, a private felucca on the Aswan
// standard. Authored here, on the variation, because a Standard and a Deluxe
// trip sell different upgrades at different prices (migration 319). Extras
// that go with ANY quote live under Rates → Extras instead.
//
// Same money model as extras, priced at quote time through the engine
// (lib/pricing/extras-pricing.ts): cost + the quote's margin, or the price set
// here as-is. Blank cost AND blank price = "not priced" — an honest hole at
// quote time, never a free line.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useTenant } from '@/app/contexts/TenantContext'

interface Option {
  id: string
  name: string
  description: string | null
  supplier_cost: number | null
  selling_price: number | null
  unit: 'per_person' | 'per_booking'
  is_active: boolean
  sort_order: number
}

type Draft = {
  id?: string
  name: string
  description: string
  supplier_cost: string
  selling_price: string
  unit: 'per_person' | 'per_booking'
  is_active: boolean
}

const EMPTY: Draft = {
  name: '', description: '', supplier_cost: '', selling_price: '', unit: 'per_person', is_active: true,
}

interface Props {
  variationId: string
  variationName: string
  onClose: () => void
}

export default function VariationOptionsModal({ variationId, variationName, onClose }: Props) {
  const { tenant } = useTenant()
  const rateCurrency = (tenant as { rates_currency?: string | null } | null)?.rates_currency || 'EUR'
  const dialog = useConfirmDialog()
  const base = `/api/tours/variations/${variationId}/options`

  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(base)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) { setOptions(data.data || []); setError(null) }
      else setError(data.error || 'Could not load options.')
    } catch { setError('Could not load options.') } finally { setLoading(false) }
  }, [base])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(draft.id ? `${base}/${draft.id}` : base, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || 'Could not save the option.'); return }
      setDraft(null)
      await load()
    } finally { setSaving(false) }
  }

  const remove = async (o: Option) => {
    const ok = await dialog.confirmDelete(o.name)
    if (!ok) return
    const res = await fetch(`${base}/${o.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) { setError(data.error || 'Could not delete the option.'); return }
    await load()
  }

  /** Blank stays blank: an unpriced option says so rather than showing 0. */
  const money = (n: number | null) =>
    n == null ? <span className="text-gray-400">Not priced</span> : `${rateCurrency} ${n}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-600" /> Options — {variationName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Upgrades sold with this variation. Priced at quote time: cost plus the quote&apos;s margin, or the price you set here.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
          ) : options.length === 0 && !draft ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-sm text-gray-500">No options yet for this variation.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Option</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Cost</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Price</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Charged</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {options.map(o => (
                    <tr key={o.id} className={`border-t border-gray-100 ${o.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {o.name}
                        {!o.is_active && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Off</span>}
                        {o.description && <p className="text-xs text-gray-500">{o.description}</p>}
                      </td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">{money(o.supplier_cost)}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums font-medium">{money(o.selling_price)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{o.unit === 'per_booking' ? 'Per booking' : 'Per person'}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`Edit ${o.name}`}
                          onClick={() => setDraft({
                            id: o.id, name: o.name, description: o.description || '',
                            supplier_cost: o.supplier_cost?.toString() ?? '',
                            selling_price: o.selling_price?.toString() ?? '',
                            unit: o.unit, is_active: o.is_active,
                          })}
                          className="p-1.5 text-gray-400 hover:text-primary-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${o.name}`}
                          onClick={() => void remove(o)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!draft && !loading && (
            <button
              type="button"
              onClick={() => setDraft(EMPTY)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" /> Add option
            </button>
          )}

          {draft && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">{draft.id ? 'Edit option' : 'New option'}</h3>
                <button type="button" onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Cancel">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Hot-air balloon at sunrise"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Charged</label>
                  <select value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value as Draft['unit'] })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                    <option value="per_person">Per person</option>
                    <option value="per_booking">Per booking</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 self-end pb-2">
                  <input type="checkbox" checked={draft.is_active}
                    onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-sm text-gray-700">Offer this option</span>
                </label>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{`What it costs us (${rateCurrency})`}</label>
                  <input type="number" min="0" step="0.01" value={draft.supplier_cost}
                    onChange={e => setDraft({ ...draft, supplier_cost: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  <p className="text-xs text-gray-500 mt-1">Leave blank if the supplier has not quoted yet — blank means unpriced, not free.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{`What we charge (${rateCurrency})`}</label>
                  <input type="number" min="0" step="0.01" value={draft.selling_price}
                    onChange={e => setDraft({ ...draft, selling_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  <p className="text-xs text-gray-500 mt-1">Set a price and that IS what the customer pays, with no margin added. Leave blank to price it from cost plus the quote&apos;s margin.</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setDraft(null)}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
