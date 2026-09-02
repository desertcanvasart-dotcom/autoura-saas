'use client'

// ============================================
// The options a programme sells
// ============================================
// Mirrors travel-ops-pro's screen of the same path. A priced option is an
// optional SERVICE line of the variation (tour_variation_services with
// is_optional, a cost in cost_per_unit and, when the operator has decided one,
// optional_price_override). What is set here is what the B2B calculator
// offers, priced off-margin: a price set here is THE price, a margin
// percentage never restates it. See lib/b2b/optional-pricing.ts.
//
// Extras that go with ANY quote (airport fast-track, late check-out) are not
// here — they live under Rates → Extras.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Trash2, Sparkles, Package } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useTenant } from '@/app/contexts/TenantContext'

interface VariationService {
  id: string
  service_name: string
  service_category: string | null
  quantity_mode: string | null
  quantity_value: number | null
  cost_per_unit: number | null
  day_number: number | null
  is_optional: boolean | null
  optional_price_override: number | null
}

const CATEGORIES = [
  'option', 'activity', 'entrance', 'transportation', 'guide', 'meal',
  'accommodation', 'cruise', 'tips', 'supplies', 'other',
]

const QUANTITY_MODES = ['per_pax', 'per_group', 'fixed', 'per_day', 'per_night', 'per_room']

export default function VariationOptionsPage() {
  const params = useParams()
  const variationId = String(params?.id ?? '')
  const dialog = useConfirmDialog()
  // Costs and prices here are RATE-table amounts, labelled in the tenant's
  // rate currency — never a hard-coded symbol.
  const { tenant } = useTenant()
  const rateCurrency = (tenant as { rates_currency?: string | null } | null)?.rates_currency || 'EUR'

  const [services, setServices] = useState<VariationService[]>([])
  const [variationName, setVariationName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [svcRes, varRes] = await Promise.all([
        fetch(`/api/tours/variations/${variationId}/services`),
        fetch(`/api/tours/variations/${variationId}`),
      ])
      if (svcRes.ok) {
        const json = await svcRes.json()
        setServices(json.data ?? [])
      }
      if (varRes.ok) {
        const json = await varRes.json()
        setVariationName(json?.data?.variation_name ?? '')
      }
    } finally {
      setLoading(false)
    }
  }, [variationId])
  useEffect(() => { void load() }, [load])

  const patch = async (serviceId: string, fields: Record<string, unknown>) => {
    setBusy(serviceId); setError(null)
    try {
      const res = await fetch(`/api/tours/variations/${variationId}/services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, ...fields }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || 'Could not save.'); return }
      await load()
    } finally { setBusy(null) }
  }

  const remove = async (service: VariationService) => {
    const ok = await dialog.confirmDelete(service.service_name)
    if (!ok) return
    setBusy(service.id); setError(null)
    try {
      const res = await fetch(
        `/api/tours/variations/${variationId}/services?serviceId=${service.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || 'Could not delete.'); return }
      await load()
    } finally { setBusy(null) }
  }

  const optional = services.filter(s => s.is_optional)
  const included = services.filter(s => !s.is_optional)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/tours/manage" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Tour Manager
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[#647C47]" />
        Options and upgrades
      </h1>
      {variationName && <p className="text-sm text-gray-600 mb-1">{variationName}</p>}
      <p className="text-sm text-gray-500 mb-6">
        What this programme sells on top of its price. The customer picks options in the B2B calculator; a price set here is charged as-is, with no margin added. Leave the price blank to charge cost plus the quote&apos;s margin.
      </p>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <section className="bg-white rounded-lg shadow-sm border mb-6">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-medium text-gray-900">Options this programme sells</h2>
              <button type="button" onClick={() => { setAdding(v => !v); setError(null) }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3]">
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            </div>

            {adding && (
              <AddOptionForm
                variationId={variationId}
                rateCurrency={rateCurrency}
                onDone={async () => { setAdding(false); await load() }}
                onError={setError}
              />
            )}

            {optional.length === 0 && !adding ? (
              <p className="p-4 text-sm text-gray-500">No options yet. Add one, or mark an included service as optional below.</p>
            ) : (
              <div className="divide-y">
                {optional.map(s => (
                  <div key={s.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.service_name}</p>
                      <p className="text-xs text-gray-500">
                        {[s.service_category, s.quantity_mode, s.day_number != null ? `Day ${s.day_number}` : null]
                          .filter(Boolean).join(' · ')}
                        {s.cost_per_unit != null
                          ? ` · costs ${rateCurrency} ${s.cost_per_unit}`
                          : ' · cost not entered'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <label className="text-xs text-gray-600">
                        Sells for
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">{rateCurrency}</span>
                          <input
                            type="number" min="0" step="0.01"
                            defaultValue={s.optional_price_override ?? ''}
                            placeholder="cost + margin"
                            disabled={busy === s.id}
                            onBlur={e => {
                              const raw = e.target.value
                              const next = raw === '' ? null : Number(raw)
                              if (next === (s.optional_price_override ?? null)) return
                              void patch(s.id, { optional_price_override: next })
                            }}
                            className="w-32 px-2 py-1 text-sm border border-gray-300 rounded-lg"
                          />
                        </div>
                      </label>
                      {busy === s.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-4" />}
                      {/* Says where it GOES, not that it is being added — "Include
                          it" read as "add this to the trip" and moved options
                          into the base price by mistake (sibling, 2026-08-30). */}
                      <button type="button" onClick={() => void patch(s.id, { is_optional: false })}
                        disabled={busy === s.id} title="Move into the base price"
                        className="mt-4 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                        Move to included
                      </button>
                      <button type="button" onClick={() => void remove(s)} disabled={busy === s.id}
                        title="Delete" className="mt-4 p-1 text-gray-400 hover:text-red-600 disabled:opacity-40">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="px-4 py-3 text-[11px] text-gray-500 border-t">
              A set price is charged exactly as entered — the quote&apos;s margin is never added on top. An option with no cost and no price is unpriced, and a quote that includes it is flagged incomplete.
            </p>
          </section>

          <section className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-medium text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                Included in the base price
              </h2>
              <p className="text-xs text-gray-500 mt-1">The services every customer gets. Make one optional to sell it separately instead.</p>
            </div>
            {included.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No service lines on this variation.</p>
            ) : (
              <div className="divide-y">
                {included.map(s => (
                  <div key={s.id} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{s.service_name}</p>
                      <p className="text-xs text-gray-500">
                        {[s.service_category, s.day_number != null ? `Day ${s.day_number}` : null]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button type="button" onClick={() => void patch(s.id, { is_optional: true })}
                      disabled={busy === s.id}
                      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3] disabled:opacity-40">
                      {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Make optional'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function AddOptionForm({
  variationId, rateCurrency, onDone, onError,
}: { variationId: string; rateCurrency: string; onDone: () => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('option')
  const [quantityMode, setQuantityMode] = useState('per_pax')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/tours/variations/${variationId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_name: name.trim(),
          service_category: category,
          quantity_mode: quantityMode,
          quantity_value: 1,
          cost_per_unit: cost === '' ? null : Number(cost),
          day_number: day === '' ? null : Number(day),
          is_optional: true,
          optional_price_override: price === '' ? null : Number(price),
        }),
      })
      if (!res.ok) { onError((await res.json().catch(() => ({})))?.error || 'Could not save.'); return }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="p-4 bg-gray-50 border-b space-y-3">
      <input value={name} onChange={e => setName(e.target.value)} required
        placeholder="Hot-air balloon at sunrise"
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <label className="text-xs text-gray-600">
          Category
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Charged
          <select value={quantityMode} onChange={e => setQuantityMode(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
            {QUANTITY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          {`Costs (${rateCurrency})`}
          <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          {`Sells for (${rateCurrency})`}
          <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
            placeholder="cost + margin"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          Day
          <input type="number" min="1" value={day} onChange={e => setDay(e.target.value)}
            placeholder="any day"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
      </div>
      <button type="submit" disabled={busy || !name.trim()}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add option
      </button>
    </form>
  )
}
