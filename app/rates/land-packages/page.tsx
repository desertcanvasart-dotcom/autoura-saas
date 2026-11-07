'use client'

// ============================================
// Rates → Land packages (migration 462)
// ============================================
// A multi-day trip bought from one provider at one price per person — the
// Bahariya desert safari. Each package says how many days it runs, where each
// night is spent (camp / hotel), which meals it gives each day, and what else
// it includes. Priced once on a quote; on its days, what it includes is not
// charged again (lib/pricing/land-package.ts).

import { useCallback, useEffect, useState } from 'react'
import { Package, Edit, Trash2, X, Check } from 'lucide-react'
import RatePageHeader from '@/components/rates/RatePageHeader'
import RateStats from '@/components/rates/RateStats'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { useRateRowFormat } from '@/hooks/useRateCurrencySymbol'
import { useDestinationCities } from '@/hooks/useDestinationCities'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { showToast } from '@/app/contexts/ToastContext'
import { packageInclusions, packageLength, type DayMeals, type LandPackageRow } from '@/lib/pricing/land-package'
import { NIGHT_PLACES, MAX_PACKAGE_DAYS } from '@/lib/rates/land-package-input'

interface PackageRow extends LandPackageRow {
  service_code: string | null
  supplier_id: string | null
  rate_currency: string | null
  notes: string | null
  is_active: boolean
}
interface SupplierOption { id: string; name: string }

interface Form {
  package_name: string
  service_code: string
  supplier_id: string
  city: string
  start_city: string
  duration_days: number
  night_places: string[]
  meals: DayMeals[]
  includes_transport: boolean
  includes_local_vehicle: boolean
  includes_guide: boolean
  includes_entrance: boolean
  covered_attractions: string
  vehicle_capacity: string
  base_rate_eur: string
  rate_currency: string
  description: string
  notes: string
  is_active: boolean
}

const NO_MEALS: DayMeals = { breakfast: false, lunch: false, dinner: false }
const NIGHT_LABEL: Record<string, string> = { camp: 'Desert camp', hotel: 'Hotel', other: 'Other' }

const EMPTY: Form = {
  package_name: '', service_code: '', supplier_id: '', city: '', start_city: 'Cairo',
  duration_days: 2, night_places: ['camp'], meals: [{ ...NO_MEALS }, { ...NO_MEALS }],
  includes_transport: true, includes_local_vehicle: false, includes_guide: true, includes_entrance: true,
  covered_attractions: '', vehicle_capacity: '', base_rate_eur: '', rate_currency: '', description: '', notes: '', is_active: true,
}

/** Keep nights and meals in step with the number of days. */
function resize(f: Form, days: number): Form {
  const nights = Array.from({ length: Math.max(0, days - 1) }, (_, i) => f.night_places[i] ?? 'hotel')
  const meals = Array.from({ length: days }, (_, i) => f.meals[i] ?? { ...NO_MEALS })
  return { ...f, duration_days: days, night_places: nights, meals }
}

function toForm(p: PackageRow): Form {
  const base = resize({ ...EMPTY, night_places: p.night_places ?? [], meals: Array.isArray(p.meals) ? (p.meals as DayMeals[]) : [] }, p.duration_days)
  return {
    ...base,
    package_name: p.package_name, service_code: p.service_code ?? '', supplier_id: p.supplier_id ?? '',
    city: p.city ?? '', start_city: p.start_city ?? '',
    includes_transport: p.includes_transport, includes_local_vehicle: !!p.includes_local_vehicle,
    includes_guide: p.includes_guide, includes_entrance: p.includes_entrance,
    covered_attractions: (p.covered_attractions ?? []).join(', '),
    vehicle_capacity: p.vehicle_capacity ? String(p.vehicle_capacity) : '',
    base_rate_eur: p.base_rate_eur != null ? String(p.base_rate_eur) : '',
    rate_currency: p.rate_currency ?? '', description: p.description ?? '', notes: p.notes ?? '', is_active: p.is_active,
  }
}

export default function LandPackagesPage() {
  const [rows, setRows] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [editing, setEditing] = useState<PackageRow | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const { cities } = useDestinationCities()
  const { fmtRate } = useRateRowFormat()
  const { confirmDelete } = useConfirmDialog()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rates/land-packages')
      const data = await res.json()
      if (data.success) setRows(data.data)
      else showToast('error', data.error || 'Could not load the packages.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/suppliers?status=active&type=activity_provider,tour_operator,ground_handler,transport_company')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data)) setSuppliers(d.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))) })
      .catch(() => {})
  }, [])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f))
  const openNew = () => { setEditing(null); setForm({ ...EMPTY }) }
  const openEdit = (p: PackageRow) => { setEditing(p); setForm(toForm(p)) }

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const body = {
        ...form,
        supplier_id: form.supplier_id || null,
        covered_attractions: form.covered_attractions.split(/[,;\n]/).map(s => s.trim()).filter(Boolean),
        vehicle_capacity: form.vehicle_capacity ? Number(form.vehicle_capacity) : null,
        base_rate_eur: form.base_rate_eur === '' ? NaN : Number(form.base_rate_eur),
        ...rateCurrencyPatch(form.rate_currency, editing?.rate_currency),
      }
      const res = await fetch(editing ? `/api/rates/land-packages/${editing.id}` : '/api/rates/land-packages', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { showToast('error', data.error || 'Could not save the package.'); return }
      showToast('success', editing ? 'Package saved.' : 'Package added.')
      setForm(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: PackageRow) => {
    if (!(await confirmDelete(p.package_name, 'Trips that use it will show a gap until you pick another package.'))) return
    const res = await fetch(`/api/rates/land-packages/${p.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) { showToast('error', data.error || 'Could not delete it.'); return }
    showToast('success', 'Package deleted.')
    await load()
  }

  const active = rows.filter(r => r.is_active)
  const supplierName = (id: string | null) => suppliers.find(s => s.id === id)?.name ?? '—'

  return (
    <div className="min-h-screen bg-gray-50">
      <RatePageHeader
        icon={Package}
        title="Land packages"
        subtitle={`${rows.length} ${rows.length === 1 ? 'package' : 'packages'}`}
        addLabel="Add package"
        onAdd={openNew}
      />
      <div className="px-4 lg:px-6 py-6">
        <p className="mb-4 max-w-3xl text-sm text-gray-600">
          A trip you buy from one provider as one package — say, the Bahariya desert safari with its car from Cairo,
          4x4, camp night, guide, meals and ticket — at one price per person. On a quote it is charged once; on the
          days it covers, what it includes is not charged again.
        </p>
        <RateStats stats={[
          { label: 'Packages', value: rows.length },
          { label: 'Active', value: active.length, tone: 'green' },
          { label: 'Longest', value: rows.length ? packageLength({ duration_days: Math.max(...rows.map(r => r.duration_days)) }) : '—' },
        ]} />

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left font-semibold min-w-[14rem]">Package</th>
                <th className="px-4 py-2 text-left font-semibold">Provider</th>
                <th className="px-4 py-2 text-left font-semibold">Length</th>
                <th className="px-4 py-2 text-left font-semibold min-w-[18rem]">Includes</th>
                <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Per person</th>
                <th className="px-4 py-2 text-center font-semibold">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No packages yet. <button onClick={openNew} className="text-primary-700 hover:underline">Add the first one</button>.</td></tr>
              )}
              {rows.map(p => (
                <tr key={p.id} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.package_name}</p>
                    <p className="text-xs text-gray-500 font-mono whitespace-nowrap">{p.service_code}</p>
                    {(p.city || p.start_city) && <p className="text-xs text-gray-500">{[p.start_city && `From ${p.start_city}`, p.city].filter(Boolean).join(' · ')}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{supplierName(p.supplier_id)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{packageLength(p)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{packageInclusions(p).join(' · ')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{p.base_rate_eur != null ? fmtRate(Number(p.base_rate_eur), p, 0) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-500 hover:text-primary-700" aria-label={`Edit ${p.package_name}`}><Edit className="w-4 h-4" /></button>
                    <button onClick={() => remove(p)} className="p-1.5 text-gray-500 hover:text-red-600" aria-label={`Delete ${p.package_name}`}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit package' : 'Add package'}</h2>
              <button onClick={() => setForm(null)} className="p-1 text-gray-500 hover:text-gray-800" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5 px-5 py-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="sm:col-span-2 block">
                  <span className="text-xs font-medium text-gray-600">Package name *</span>
                  <input value={form.package_name} onChange={e => set('package_name', e.target.value)} placeholder="Bahariya desert safari (camp)" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Provider</span>
                  <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 bg-white">
                    <option value="">No supplier linked</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Service code</span>
                  <input value={form.service_code} onChange={e => set('service_code', e.target.value)} placeholder="Made for you if blank" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Where it happens</span>
                  <input list="lp-cities" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Bahariya" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Starts and ends in</span>
                  <input list="lp-cities" value={form.start_city} onChange={e => set('start_city', e.target.value)} placeholder="Cairo" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <datalist id="lp-cities">{cities.map(c => <option key={c} value={c} />)}</datalist>
              </div>

              <div>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Days</span>
                  <select value={form.duration_days} onChange={e => setForm(f => (f ? resize(f, Number(e.target.value)) : f))} className="mt-1 w-40 rounded-lg border border-gray-300 px-3 py-2 bg-white">
                    {Array.from({ length: MAX_PACKAGE_DAYS }, (_, i) => i + 1).map(n => <option key={n} value={n}>{packageLength({ duration_days: n })}</option>)}
                  </select>
                </label>
                <table className="mt-3 w-full text-xs">
                  <thead><tr className="text-gray-500"><th className="text-left py-1">Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th className="text-left">That night</th></tr></thead>
                  <tbody>
                    {form.meals.map((m, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1.5 font-medium text-gray-700">Day {i + 1}</td>
                        {(['breakfast', 'lunch', 'dinner'] as const).map(k => (
                          <td key={k} className="text-center">
                            <input type="checkbox" aria-label={`${k} on day ${i + 1}`} checked={m[k]} onChange={e => set('meals', form.meals.map((x, j) => (j === i ? { ...x, [k]: e.target.checked } : x)))} className="h-4 w-4 rounded border-gray-300" />
                          </td>
                        ))}
                        <td>
                          {i < form.duration_days - 1 ? (
                            <select aria-label={`Night ${i + 1}`} value={form.night_places[i]} onChange={e => set('night_places', form.night_places.map((x, j) => (j === i ? e.target.value : x)))} className="rounded border border-gray-300 px-2 py-1 bg-white">
                              {NIGHT_PLACES.map(n => <option key={n} value={n}>{NIGHT_LABEL[n]}</option>)}
                            </select>
                          ) : <span className="text-gray-400">— not included (back home)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-gray-500">Tick only the meals the package gives. Anything not ticked is priced on the quote as usual.</p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-gray-600">Included</legend>
                {([
                  ['includes_transport', 'Car from and back to the start city — no road transfers are charged on its days'],
                  ['includes_local_vehicle', '4x4 / local vehicle on the trip'],
                  ['includes_guide', 'Guide — no guide is charged on its days'],
                  ['includes_entrance', 'Entrance tickets'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-start gap-2">
                    <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                    <span>{label}</span>
                  </label>
                ))}
                {form.includes_entrance && (
                  <label className="block pl-6">
                    <span className="text-xs text-gray-600">Places the ticket covers (comma-separated; leave blank for every sight on its days)</span>
                    <textarea value={form.covered_attractions} onChange={e => set('covered_attractions', e.target.value)} rows={2} placeholder="White Desert, Crystal Mountain, English Mountain, Hot Spring, Black Desert" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                )}
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Price per person *</span>
                  <input type="number" min={0} step="0.01" value={form.base_rate_eur} onChange={e => set('base_rate_eur', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <RateCurrencyField value={form.rate_currency} onChange={v => set('rate_currency', v)} />
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">People per car</span>
                  <input type="number" min={1} value={form.vehicle_capacity} onChange={e => set('vehicle_capacity', e.target.value)} placeholder="6" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
              </div>
              <p className="-mt-3 text-xs text-gray-500">The same price per person whatever the group&apos;s size. People per car is shown for your team; a bigger group simply takes another car.</p>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Description (the client sees it)</span>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Notes (internal)</span>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <span>Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
