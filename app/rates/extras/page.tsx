'use client'

// ============================================
// Extras — the sellable things that are not attractions
// ============================================
// Airport fast-track, extra luggage, a late check-out. Before this page the
// only way to offer one was to invent an attraction in the rates table, which
// polluted the entrance-fee catalogue and mispriced the day (operator, 1 Sep).
//
// Priced at QUOTE time through the engine, like optional services: an extra
// picked in the B2B calculator joins the quote at cost + the quote's margin,
// or at the price set here (as-is, never margin-stacked). No cost and no
// price is a hole, not a free line. See lib/pricing/extras-pricing.ts.
//
// Deliberately NOT where programme upgrades live: an upgrade that belongs to
// one package is authored on its variation (Tour Manager → variation →
// Options) as an optional SERVICE line with a cost and, when decided, a
// price — tour_variation_services.optional_price_override, priced off-margin
// by lib/b2b/optional-pricing (the sibling app's model, migration 320) —
// because a Standard and a Deluxe trip sell different upgrades at different
// prices. These are the extras that go with any quote.

import { useCallback, useEffect, useState } from 'react'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import { Copy, Loader2, Pencil, Plus, Trash2, X, Sparkles } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useTenant } from '@/app/contexts/TenantContext'

interface Extra {
  id: string
  name: string
  description: string | null
  category: string | null
  supplier_cost: number | null
  selling_price: number | null
  unit: 'per_person' | 'per_booking'
  is_active: boolean
}

type Draft = {
  id?: string
  name: string
  description: string
  category: string
  supplier_cost: string
  selling_price: string
  unit: 'per_person' | 'per_booking'
  is_active: boolean
}

const EMPTY: Draft = {
  name: '', description: '', category: '',
  supplier_cost: '', selling_price: '', unit: 'per_person', is_active: true,
}

export default function ExtrasPage() {
  // This app has no PreferencesContext; the rate currency is the tenant's
  // (tenants.rates_currency, EUR by default) — the same value
  // lib/rates/run-currency.ts resolves server-side.
  const { tenant } = useTenant()
  const rateCurrency = tenant?.rates_currency || 'EUR'
  const dialog = useConfirmDialog()
  const [extras, setExtras] = useState<Extra[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/extras-catalogue')
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) { setExtras(data.data || []); setError(null) }
      else setError(data.error || "Could not load extras. Please refresh.")
    } catch { setError("Could not load extras. Please refresh.") } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(
        draft.id ? `/api/extras-catalogue/${draft.id}` : '/api/extras-catalogue',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || "Could not save the extra."); return }
      setDraft(null)
      await load()
    } finally { setSaving(false) }
  }

  const remove = async (x: Extra) => {
    const ok = await dialog.confirmDelete(x.name)
    if (!ok) return
    const res = await fetch(`/api/extras-catalogue/${x.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) { setError(data.error || "Could not delete the extra."); return }
    await load()
  }

  /** Blank stays blank: an unpriced extra says so rather than showing 0. */
  const money = (n: number | null) =>
    n == null ? <span className="text-gray-400">Not priced</span> : `${rateCurrency} ${n}`

  const q = searchTerm.trim().toLowerCase()
  const filtered = q
    ? extras.filter(x =>
        x.name.toLowerCase().includes(q) ||
        (x.description || '').toLowerCase().includes(q) ||
        (x.category || '').toLowerCase().includes(q))
    : extras

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary-600" /> Extras
        </h1>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="extras_catalogue" onImportComplete={load} />
          {!draft && (
            <button
              type="button"
              onClick={() => setDraft(EMPTY)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" /> Add extra
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">Paid extras you can add to any quote — airport fast-track, extra luggage, a late check-out. Pick them in the B2B calculator: each is priced from its cost plus the quote&apos;s margin, or at the price you set here. Upgrades that belong to one programme are set on its variation, under Tour Manager → Options.</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : (
        <>
          {extras.length === 0 && !draft && (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
              <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No extras yet. Add the things you sell alongside a trip.</p>
            </div>
          )}

          {extras.length > 0 && (
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search extras…"
                className="w-full md:w-80 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
          )}

          {extras.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Category</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Cost</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Price</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Charged</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">No matches.</td></tr>
                  )}
                  {filtered.map(x => (
                    <tr key={x.id} className={`border-t border-gray-100 ${x.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {x.name}
                        {x.description && <p className="text-xs text-gray-500">{x.description}</p>}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{x.category || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">{money(x.supplier_cost)}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums font-medium">{money(x.selling_price)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {x.unit === 'per_booking' ? "Per booking" : "Per person"}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`Edit ${x.name}`}
                          onClick={() => setDraft({
                            id: x.id, name: x.name, description: x.description || '',
                            category: x.category || '',
                            supplier_cost: x.supplier_cost?.toString() ?? '',
                            selling_price: x.selling_price?.toString() ?? '',
                            unit: x.unit, is_active: x.is_active,
                          })}
                          className="p-1.5 text-gray-400 hover:text-primary-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${x.name}`}
                          title="Duplicate"
                          onClick={() => setDraft({
                            // No id: saving creates a NEW extra prefilled from
                            // this one — the safe direction (A-item 21).
                            name: `${x.name} (copy)`, description: x.description || '',
                            category: x.category || '',
                            supplier_cost: x.supplier_cost?.toString() ?? '',
                            selling_price: x.selling_price?.toString() ?? '',
                            unit: x.unit, is_active: x.is_active,
                          })}
                          className="p-1.5 text-gray-400 hover:text-primary-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${x.name}`}
                          onClick={() => void remove(x)}
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
        </>
      )}

      {draft && (
        <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{draft.id ? "Edit extra" : "New extra"}</h2>
            <button type="button" onClick={() => setDraft(null)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="Airport fast-track"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
                rows={3}
                placeholder="What the customer gets — shown on the quote line"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-y" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}
                placeholder="Airport"
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
              <p className="text-xs text-gray-500 mt-1">Set a price and that IS what the customer pays, with no margin added. Leave blank to price it from cost plus your usual margin.</p>
            </div>
            <label className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" checked={draft.is_active}
                onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300" />
              <span className="text-sm text-gray-700">Offer this extra</span>
            </label>
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
  )
}
