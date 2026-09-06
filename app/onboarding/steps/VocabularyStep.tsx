'use client'

// ============================================
// Onboarding → Your words
// ============================================
// The first place an agency makes the app speak its language: the cities it
// actually sells, what it calls its service tiers, and which kinds of
// suppliers it works with. Everything is pre-filled with Egypt's defaults
// and every change is saved as it happens (the same APIs as Settings → Your
// vocabulary and Settings → Destinations), so Continue never loses work.

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookA, Loader2, Plus, X, Check } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { useAllVocabularies, clearVocabularyCache } from '@/hooks/useVocabulary'
import { clearDestinationCache, type CatalogDestination } from '@/hooks/useDestinationCities'
import { VOCABULARY_KIND_INFO, type VocabularyItem } from '@/lib/vocabulary'

interface Props {
  onNext: () => void
  onBack: () => void
  currentStep: number
  tenant: unknown
}

export default function VocabularyStep({ onNext, onBack, currentStep }: Props) {
  const { byKind, loading: vocabLoading, reload } = useAllVocabularies()
  const [catalog, setCatalog] = useState<CatalogDestination[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [newTier, setNewTier] = useState('')
  const [tierDrafts, setTierDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/destination-catalog')
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.success) setCatalog(json.data ?? [])
    } finally {
      setCatalogLoading(false)
    }
  }, [])
  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const tiers = byKind.tier.filter(t => t.is_active)
  const supplierTypes = byKind.supplier_type
  const destinations = catalog.filter(d => d.selected)

  // --- helpers -------------------------------------------------------------
  const call = async (key: string, req: () => Promise<Response>, after: 'vocab' | 'catalog') => {
    setBusy(key)
    try {
      const res = await req()
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) { showToast('error', json.error || 'Could not save'); return false }
      if (after === 'vocab') { clearVocabularyCache(); await reload() } else { clearDestinationCache(); await loadCatalog() }
      return true
    } catch {
      showToast('error', 'Could not save')
      return false
    } finally {
      setBusy(null)
    }
  }
  const json = (method: string, url: string, body?: unknown) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

  const renameTier = async (t: VocabularyItem) => {
    const label = (tierDrafts[t.id] ?? t.label).trim()
    if (!label || label === t.label) return
    await call(t.id, () => json('PATCH', `/api/vocabulary/${t.id}`, { label }), 'vocab')
  }
  const removeTier = async (t: VocabularyItem) => {
    await call(t.id, () => json('DELETE', `/api/vocabulary/${t.id}`), 'vocab')
  }
  const addTier = async () => {
    const label = newTier.trim()
    if (!label) return
    if (await call('add-tier', () => json('POST', '/api/vocabulary', { kind: 'tier', label }), 'vocab')) setNewTier('')
  }
  const toggleSupplierType = async (t: VocabularyItem) => {
    await call(t.id, () => json('PATCH', `/api/vocabulary/${t.id}`, { is_active: !t.is_active }), 'vocab')
  }
  const toggleCity = async (d: CatalogDestination, cityId: string) => {
    const on = d.cities.some(c => c.id === cityId)
    if (on && d.cities.length === 1) return
    const next = on ? d.cities.filter(c => c.id !== cityId).map(c => c.id!) : [...d.cities.map(c => c.id!), cityId]
    await call(`city-${cityId}`, () => json('POST', '/api/destination-catalog/manage', { action: 'set_cities', catalog_id: d.id, city_ids: next }), 'catalog')
  }
  const allCities = async (d: CatalogDestination) => {
    await call(`all-${d.id}`, () => json('POST', '/api/destination-catalog/manage', { action: 'set_cities', catalog_id: d.id, city_ids: null }), 'catalog')
  }

  const handleContinue = async () => {
    setSaving(true)
    try {
      await fetch('/api/onboarding/vocabulary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_step: currentStep + 1 }) })
    } finally {
      setSaving(false)
      onNext()
    }
  }

  const loading = vocabLoading || catalogLoading

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BookA className="w-6 h-6 text-[#647C47]" />
          <h2 className="text-2xl font-bold text-gray-900">Your words</h2>
        </div>
        <p className="text-gray-600">
          Autoura will use <strong>your</strong> vocabulary everywhere — the cities you sell, what you call your service levels,
          the kinds of suppliers you work with. Egypt&rsquo;s defaults are filled in; change what doesn&rsquo;t fit, or keep them and move on.
          You can revisit all of this later in Settings &rarr; Your vocabulary.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {/* 1. Cities */}
          <section>
            <h3 className="text-base font-semibold text-gray-900">Where you sell</h3>
            <p className="text-sm text-gray-500 mb-3">Tap a city to offer it or set it aside. Only the filled ones appear in your dropdowns.</p>
            {destinations.length === 0 ? (
              <p className="text-sm text-gray-500">No destination selected yet — you can pick your countries in Settings &rarr; Destinations.</p>
            ) : destinations.map(d => (
              <div key={d.id} className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-gray-800">{d.name} <span className="text-gray-400 font-normal">· {d.cities.length} of {d.all_cities.length} cities</span></p>
                  {d.city_ids && (
                    <button type="button" onClick={() => void allCities(d)} disabled={busy !== null} className="text-xs text-gray-500 hover:text-[#647C47]">Offer every city</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.all_cities.map(c => {
                    const on = d.cities.some(x => x.id === c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => void toggleCity(d, c.id!)} disabled={busy !== null || (on && d.cities.length === 1)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-60 ${on ? 'bg-[#647C47] text-white border-[#647C47]' : 'bg-white text-gray-500 border-gray-300 hover:border-[#647C47] hover:text-[#647C47]'}`}>
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* 2. Tiers */}
          <section>
            <h3 className="text-base font-semibold text-gray-900">{VOCABULARY_KIND_INFO.tier.title}</h3>
            <p className="text-sm text-gray-500 mb-3">Lowest to highest. Rename them in your own words — e.g. {VOCABULARY_KIND_INFO.tier.example}.</p>
            <div className="space-y-2 max-w-md">
              {tiers.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-gray-400 text-right">{i + 1}</span>
                  <input
                    value={tierDrafts[t.id] ?? t.label}
                    onChange={e => setTierDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                    onBlur={() => void renameTier(t)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]/30 focus:border-[#647C47]"
                  />
                  {busy === t.id ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : (
                    <button type="button" onClick={() => void removeTier(t)} disabled={busy !== null || tiers.length <= VOCABULARY_KIND_INFO.tier.minItems}
                      title={tiers.length <= VOCABULARY_KIND_INFO.tier.minItems ? `Keep at least ${VOCABULARY_KIND_INFO.tier.minItems}` : 'Remove'}
                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30"><X className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 pl-7">
                <input value={newTier} onChange={e => setNewTier(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addTier() }}
                  placeholder="Add a tier (e.g. Ultra luxury)" className="flex-1 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg" />
                <button type="button" onClick={() => void addTier()} disabled={busy !== null || !newTier.trim()}
                  className="p-1.5 text-[#647C47] hover:bg-[#647C47]/10 rounded disabled:opacity-30"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </section>

          {/* 3. Supplier types */}
          <section>
            <h3 className="text-base font-semibold text-gray-900">{VOCABULARY_KIND_INFO.supplier_type.title}</h3>
            <p className="text-sm text-gray-500 mb-3">Tick the kinds you work with. You can rename them later, or add your own.</p>
            <div className="flex flex-wrap gap-2">
              {supplierTypes.map(t => (
                <button key={t.id} type="button" onClick={() => void toggleSupplierType(t)} disabled={busy !== null}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${t.is_active ? 'bg-[#647C47] text-white border-[#647C47]' : 'bg-white text-gray-500 border-gray-300 hover:border-[#647C47] hover:text-[#647C47]'}`}>
                  {t.is_active && <Check className="w-3.5 h-3.5" />}
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="flex justify-between pt-8 mt-8 border-t border-gray-200">
        <button type="button" onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={() => void handleContinue()} disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#2d3b2d] rounded-lg hover:bg-[#1f2a1f] disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
