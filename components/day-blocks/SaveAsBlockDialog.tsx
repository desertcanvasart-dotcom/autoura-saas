'use client'

// "Save as a block": a grid day that is not from the catalog, kept as a new
// day block (lib/day-blocks/from-grid-day.ts). The form starts from what the
// day holds; the operator gives it a code, checks it, and saves.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { DAY_TYPES, GUIDES, NIGHTS, type DayBlock } from '@/lib/day-blocks/blocks'
import { blockDraftFromGridDay, suggestBlockCode } from '@/lib/day-blocks/from-grid-day'
import type { GridBlock } from '@/lib/day-blocks/grid-apply'
import type { GridDay } from '@/app/pricing-grid/types'

interface Props {
  day: GridDay
  nextDay?: GridDay | null
  /** Codes the agency already uses — the suggestion avoids them. */
  takenCodes: string[]
  onClose: () => void
  onSaved: (block: GridBlock) => void
}

const NIGHT_LABEL: Record<string, string> = {
  same: 'Same hotel (no move)', move: 'Moves to another city', included: 'Included (camp, lodge…)', on_board: 'On board', none: 'No night (departure)',
}
const GUIDE_LABEL: Record<string, string> = { egyptologist: 'Guide', assistant: 'Assistant', spot: 'Spot guide', none: 'No guide' }
const input = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-200'
const lines = (v: string) => v.split(/[\n;,]/).map(s => s.trim()).filter(Boolean)

export default function SaveAsBlockDialog({ day, nextDay, takenCodes, onClose, onSaved }: Props) {
  const initial = useMemo(() => {
    const draft = blockDraftFromGridDay(day, nextDay)
    return { ...draft, code: suggestBlockCode(draft, takenCodes) }
  }, [day, nextDay, takenCodes])
  const [b, setB] = useState<DayBlock>(initial)
  const [attractions, setAttractions] = useState(initial.attractions.join('\n'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<DayBlock>) => setB(prev => ({ ...prev, ...patch }))
  const setMeal = (m: 'breakfast' | 'lunch' | 'dinner', included: boolean) =>
    setB(prev => ({ ...prev, meals: { ...prev.meals, [m]: { included, venue: included ? prev.meals[m].venue ?? 'restaurant' : null } } }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/day-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...b, attractions: lines(attractions) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) {
        setError(json?.error || 'Could not save the block')
        return
      }
      onSaved(json.data.block as GridBlock)
    } catch {
      setError('Could not save the block')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-block-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <h2 id="save-block-title" className="text-base font-semibold text-gray-900">Save Day {day.dayNumber} as a day block</h2>
            <p className="text-xs text-gray-500 mt-0.5">It joins your catalog (Settings → Day blocks) and can be used on any tour.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Code</span>
              <input value={b.code} onChange={e => set({ code: e.target.value.toUpperCase() })} className={`${input} font-mono`} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name</span>
              <input value={b.name} onChange={e => set({ name: e.target.value })} className={input} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Day type</span>
              <select value={b.day_type} onChange={e => set({ day_type: e.target.value as DayBlock['day_type'] })} className={input}>
                {DAY_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">City</span>
              <input value={b.city ?? ''} onChange={e => set({ city: e.target.value || null })} className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Night</span>
              <select value={b.night} onChange={e => set({ night: e.target.value as DayBlock['night'] })} className={input}>
                {NIGHTS.map(n => <option key={n} value={n}>{NIGHT_LABEL[n]}</option>)}
              </select>
            </label>
            {b.night === 'move' && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">To city</span>
                <input value={b.to_city ?? ''} onChange={e => set({ to_city: e.target.value || null })} className={input} />
              </label>
            )}
            {b.night === 'included' && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Where</span>
                <input value={b.night_place ?? ''} onChange={e => set({ night_place: e.target.value || null })} className={input} />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Guide</span>
              <select value={b.guide} onChange={e => set({ guide: e.target.value as DayBlock['guide'] })} className={input}>
                {GUIDES.map(g => <option key={g} value={g}>{GUIDE_LABEL[g]}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Attractions (one per line)</span>
            <textarea value={attractions} onChange={e => setAttractions(e.target.value)} rows={3} className={input} />
          </label>

          <fieldset>
            <legend className="text-xs font-medium text-gray-600">Meals included (at a restaurant)</legend>
            <div className="flex gap-4 mt-1">
              {(['breakfast', 'lunch', 'dinner'] as const).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={b.meals[m].included} onChange={e => setMeal(m, e.target.checked)} />
                  {m[0].toUpperCase() + m.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Transport</span>
            <input value={b.transport ?? ''} onChange={e => set({ transport: e.target.value || null })} className={input} />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Description</span>
            <textarea value={b.description ?? ''} onChange={e => set({ description: e.target.value || null })} rows={3} className={input} />
          </label>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 rounded-lg hover:bg-gray-100">Cancel</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !b.code.trim() || !b.name.trim()}
            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save block'}
          </button>
        </div>
      </div>
    </div>
  )
}
