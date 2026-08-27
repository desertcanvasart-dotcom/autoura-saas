'use client'

// ============================================
// Settings → Destinations
// ============================================
// P1b: which countries this tenant operates, which one is the default, and
// the per-destination AI voice (generation brief + glossary). The catalog
// itself is GLOBAL and self-serve — a tenant can add a country or a city the
// catalog does not know yet, and every other tenant can then select it.
// Writes go through /api/destination-catalog/manage (admin-gated).

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe2,
  Plus,
  Star,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import type { CatalogDestination } from '@/hooks/useDestinationCities'
import { clearDestinationCache } from '@/hooks/useDestinationCities'
import { linesToGlossary, glossaryToLines } from '@/lib/destination-catalog'

interface Notice {
  kind: 'success' | 'error' | 'warning'
  text: string
}

export default function DestinationSettingsPage() {
  const { isAdmin } = useRole()
  const [catalog, setCatalog] = useState<CatalogDestination[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // action key in flight
  const [notice, setNotice] = useState<Notice | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Brief/glossary drafts per catalog_id (glossary edited as "English = 日本語" lines)
  const [briefDraft, setBriefDraft] = useState<Record<string, string>>({})
  const [glossaryDraft, setGlossaryDraft] = useState<Record<string, string>>({})

  // Add-country / add-city form state
  const [showAddCountry, setShowAddCountry] = useState(false)
  const [countryForm, setCountryForm] = useState({ country_code: '', name: '', name_ja: '' })
  const [cityForms, setCityForms] = useState<Record<string, { name: string; name_ja: string }>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/destination-catalog')
      const json = await res.json()
      if (json?.success) setCatalog(json.data)
      else setNotice({ kind: 'error', text: json?.error || 'Failed to load destinations' })
    } catch {
      setNotice({ kind: 'error', text: 'Failed to load destinations' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (key: string, payload: Record<string, unknown>, okText?: string) => {
    setBusy(key)
    setNotice(null)
    try {
      const res = await fetch('/api/destination-catalog/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json?.success) {
        setNotice({ kind: 'error', text: json?.error || 'Request failed' })
        return false
      }
      if (json.warning) setNotice({ kind: 'warning', text: json.warning })
      else if (okText) setNotice({ kind: 'success', text: okText })
      clearDestinationCache() // dropdowns everywhere pick up the change
      await load()
      return true
    } catch {
      setNotice({ kind: 'error', text: 'Request failed' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const saveVoice = async (d: CatalogDestination) => {
    const glossaryText = glossaryDraft[d.id] ?? glossaryToLines(d.glossary)
    const glossary = linesToGlossary(glossaryText)
    if (glossary === null) {
      setNotice({ kind: 'error', text: 'Glossary lines must look like: Cairo = カイロ' })
      return
    }
    await act(`voice-${d.id}`, {
      action: 'update_destination',
      catalog_id: d.id,
      generation_brief: briefDraft[d.id] ?? d.generation_brief ?? '',
      glossary: Object.keys(glossary).length ? glossary : null,
    }, 'Saved')
  }

  const addCity = async (d: CatalogDestination) => {
    const form = cityForms[d.id]
    if (!form?.name.trim()) return
    const ok = await act(`city-${d.id}`, {
      action: 'add_city',
      catalog_id: d.id,
      name: form.name.trim(),
      name_ja: form.name_ja.trim() || null,
    }, `${form.name.trim()} added`)
    if (ok) setCityForms(prev => ({ ...prev, [d.id]: { name: '', name_ja: '' } }))
  }

  const addCountry = async () => {
    if (!countryForm.country_code.trim() || !countryForm.name.trim()) return
    const ok = await act('add-country', {
      action: 'add_country',
      country_code: countryForm.country_code.trim(),
      name: countryForm.name.trim(),
      name_ja: countryForm.name_ja.trim() || null,
    }, `${countryForm.name.trim()} added and selected`)
    if (ok) {
      setCountryForm({ country_code: '', name: '', name_ja: '' })
      setShowAddCountry(false)
    }
  }

  const selected = catalog.filter(d => d.selected)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">← Settings</Link>
        <div className="flex items-center gap-3 mt-2">
          <Globe2 className="w-6 h-6 text-[#647C47]" />
          <h1 className="text-2xl font-semibold text-gray-900">Destinations</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          The countries your agency operates. City dropdowns, itinerary generation and
          document vocabulary all follow this list. The default destination is where new
          itineraries start.
        </p>
      </div>

      {notice && (
        <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
          notice.kind === 'success' ? 'bg-green-50 border-green-200 text-green-800'
          : notice.kind === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {notice.kind === 'success' ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isAdmin && !loading && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Viewing only — an admin can change destination settings.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : catalog.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          The destination catalog is not available yet (database migration pending).
          City dropdowns keep working with the built-in Egypt list in the meantime.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200">
          {catalog.map(d => {
            const isOpen = expanded === d.id
            return (
              <div key={d.id}>
                <div className="p-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={d.selected}
                    disabled={!isAdmin || busy !== null}
                    onChange={() =>
                      act(
                        `sel-${d.id}`,
                        { action: d.selected ? 'deselect_destination' : 'select_destination', catalog_id: d.id },
                        d.selected ? `${d.name} removed` : `${d.name} selected`
                      )
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                  />
                  <button
                    className="flex items-center gap-2 min-w-0 text-left flex-1"
                    onClick={() => setExpanded(isOpen ? null : d.id)}
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="font-medium text-gray-900">{d.name}</span>
                    {d.name_ja && <span className="text-sm text-gray-400">{d.name_ja}</span>}
                    <span className="text-xs text-gray-400 uppercase">{d.country_code}</span>
                    <span className="text-xs text-gray-400">· {d.cities.length} {d.cities.length === 1 ? 'city' : 'cities'}</span>
                  </button>
                  {d.is_default ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[#647C47]/10 text-[#4a5c35] border border-[#647C47]/30">
                      <Star className="w-3 h-3 fill-current" /> Default
                    </span>
                  ) : d.selected && isAdmin ? (
                    <button
                      onClick={() => act(`def-${d.id}`, { action: 'set_default', catalog_id: d.id }, `${d.name} is now the default`)}
                      disabled={busy !== null}
                      className="text-xs text-gray-500 hover:text-[#647C47] border border-gray-200 rounded px-2 py-0.5"
                    >
                      Make default
                    </button>
                  ) : null}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 pl-11 space-y-4">
                    {/* Cities */}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">Cities</p>
                      {d.cities.length === 0 ? (
                        <p className="text-sm text-gray-400">No cities yet — add the ones you operate.</p>
                      ) : (
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {d.cities.map(c => c.name).join(' · ')}
                        </p>
                      )}
                      {isAdmin && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            value={cityForms[d.id]?.name ?? ''}
                            onChange={e => setCityForms(prev => ({ ...prev, [d.id]: { name: e.target.value, name_ja: prev[d.id]?.name_ja ?? '' } }))}
                            placeholder="City name"
                            className="px-2 py-1 text-sm border border-gray-300 rounded-md w-40"
                          />
                          <input
                            value={cityForms[d.id]?.name_ja ?? ''}
                            onChange={e => setCityForms(prev => ({ ...prev, [d.id]: { name: prev[d.id]?.name ?? '', name_ja: e.target.value } }))}
                            placeholder="日本語名 (optional)"
                            className="px-2 py-1 text-sm border border-gray-300 rounded-md w-40"
                          />
                          <button
                            onClick={() => addCity(d)}
                            disabled={busy !== null || !(cityForms[d.id]?.name ?? '').trim()}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-sm text-white bg-[#647C47] rounded-md hover:bg-[#4f6238] disabled:opacity-50"
                          >
                            {busy === `city-${d.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Add city
                          </button>
                        </div>
                      )}
                    </div>

                    {/* AI voice — only meaningful for selected destinations */}
                    {d.selected && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Generation brief
                          </label>
                          <textarea
                            value={briefDraft[d.id] ?? d.generation_brief ?? ''}
                            onChange={e => setBriefDraft(prev => ({ ...prev, [d.id]: e.target.value }))}
                            disabled={!isAdmin}
                            rows={3}
                            placeholder="How itineraries for this destination should read — tone, pacing, must-mention practicalities…"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Glossary <span className="text-gray-400 font-normal">(one per line: English = 日本語)</span>
                          </label>
                          <textarea
                            value={glossaryDraft[d.id] ?? glossaryToLines(d.glossary)}
                            onChange={e => setGlossaryDraft(prev => ({ ...prev, [d.id]: e.target.value }))}
                            disabled={!isAdmin}
                            rows={4}
                            placeholder={'Cairo = カイロ\nPetra = ペトラ'}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
                          />
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => saveVoice(d)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
                          >
                            {busy === `voice-${d.id}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Save brief & glossary
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Self-serve: add a country the catalog does not know yet */}
      {isAdmin && !loading && catalog.length > 0 && (
        <div className="mt-4">
          {showAddCountry ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ISO code</label>
                <input
                  value={countryForm.country_code}
                  onChange={e => setCountryForm(f => ({ ...f, country_code: e.target.value.toUpperCase() }))}
                  placeholder="JO"
                  maxLength={2}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md w-16 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Country name</label>
                <input
                  value={countryForm.name}
                  onChange={e => setCountryForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jordan"
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md w-44"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">日本語名 (optional)</label>
                <input
                  value={countryForm.name_ja}
                  onChange={e => setCountryForm(f => ({ ...f, name_ja: e.target.value }))}
                  placeholder="ヨルダン"
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md w-36"
                />
              </div>
              <button
                onClick={addCountry}
                disabled={busy !== null || !countryForm.country_code.trim() || !countryForm.name.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
              >
                {busy === 'add-country' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add country
              </button>
              <button
                onClick={() => setShowAddCountry(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCountry(true)}
              className="inline-flex items-center gap-1.5 text-sm text-[#647C47] hover:text-[#4f6238]"
            >
              <Plus className="w-4 h-4" /> Add a country that isn&apos;t listed
            </button>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <p className="mt-6 text-xs text-gray-400">
          Cities added here are shared across the whole catalog — every agency using this
          country benefits. Removing a destination hides it from your dropdowns but keeps
          existing rates and itineraries untouched.
        </p>
      )}
    </div>
  )
}
