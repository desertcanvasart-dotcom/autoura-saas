'use client'
// ============================================
// Look and feel — the About page's people and photos, and opening hours
// ============================================
// The website template's About page (board 11) shows a team photo and the
// people a visitor meets — a list kept only for the website, not read from
// Team or Suppliers (operator, 2026-10-29). Photos go up through
// /api/publish/media into the company's own folder; the page only keeps
// their addresses until "Save" sends everything.

import { useState } from 'react'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

export interface Person { name: string; role: string; kind: 'guide' | 'staff'; languages: string[]; photo: string | null }
export interface Hours { opens: string; closes: string; days: string[] }

/** The languages a guide can be said to speak (lib/publish/admin.ts GUIDE_LANGUAGES). */
const LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'zh', 'ja', 'ko', 'ar'] as const
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const langName = (code: string) => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code

async function uploadPhoto(file: File): Promise<string | null> {
  const body = new FormData()
  body.append('file', file)
  try {
    const res = await fetch('/api/publish/media', { method: 'POST', body })
    const j = await res.json()
    if (!j.success) throw new Error(j.error)
    return j.data.url as string
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : 'The photo could not be uploaded')
    return null
  }
}

function PhotoPicker({ value, onChange, disabled, label }: { value: string | null; onChange: (url: string | null) => void; disabled: boolean; label: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3">
      {value
        // eslint-disable-next-line @next/next/no-img-element -- the company's own upload
        ? <img src={value} alt="" className="h-14 w-14 rounded-md object-cover border border-gray-200" />
        : <div className="h-14 w-14 rounded-md border border-dashed border-gray-300 grid place-items-center text-gray-400"><ImagePlus className="h-5 w-5" /></div>}
      <label className={`text-xs px-3 py-1.5 rounded-md border border-gray-300 ${disabled || busy ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50'}`}>
        {busy ? 'Uploading…' : value ? `Replace ${label}` : `Upload ${label}`}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled || busy}
          onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            const url = await uploadPhoto(file)
            setBusy(false)
            if (url) onChange(url)
          }} />
      </label>
      {value && !disabled && <button type="button" className="text-xs text-gray-500 underline" onClick={() => onChange(null)}>Remove</button>}
    </div>
  )
}

export function TeamPhoto({ value, onChange, disabled }: { value: string | null; onChange: (url: string | null) => void; disabled: boolean }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-600 mb-1">Team photo (wide, shown under the headline; PNG, JPEG or WebP, up to 5 MB)</p>
      <PhotoPicker value={value} onChange={onChange} disabled={disabled} label="team photo" />
    </div>
  )
}

export function PeopleEditor({ people, onChange, disabled }: { people: Person[]; onChange: (p: Person[]) => void; disabled: boolean }) {
  const set = (i: number, patch: Partial<Person>) => onChange(people.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="mt-4">
      <p className="text-xs text-gray-600 mb-2">&ldquo;The people who will guide you&rdquo; — guides are counted as licensed Egyptologists on the page; staff (a trip planner) are not. Only names you fill in are shown.</p>
      <div className="space-y-3">
        {people.map((p, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 space-y-2">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
              <input value={p.name} disabled={disabled} maxLength={80} placeholder="Name" onChange={e => set(i, { name: e.target.value })}
                className="text-sm border border-gray-300 rounded-md px-3 py-2" />
              <input value={p.role} disabled={disabled} maxLength={80} placeholder="Role (Egyptologist, Trip planner…)" onChange={e => set(i, { role: e.target.value })}
                className="text-sm border border-gray-300 rounded-md px-3 py-2" />
              <select value={p.kind} disabled={disabled} onChange={e => set(i, { kind: e.target.value as Person['kind'] })} className="text-sm border border-gray-300 rounded-md px-2 py-2">
                <option value="guide">Guide</option>
                <option value="staff">Staff</option>
              </select>
              {!disabled && <button type="button" aria-label="Remove this person" className="text-gray-400 hover:text-red-600 px-2" onClick={() => onChange(people.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-1">
              {LANGUAGES.map(l => {
                const on = p.languages.includes(l)
                return (
                  <button key={l} type="button" disabled={disabled} aria-pressed={on}
                    onClick={() => set(i, { languages: on ? p.languages.filter(x => x !== l) : [...p.languages, l] })}
                    className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-[#647C47] border-[#647C47] text-white' : 'border-gray-300 text-gray-600'}`}>{langName(l)}</button>
                )
              })}
            </div>
            <PhotoPicker value={p.photo} onChange={url => set(i, { photo: url })} disabled={disabled} label="portrait" />
          </div>
        ))}
      </div>
      {!disabled && people.length < 12 && (
        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
          onClick={() => onChange([...people, { name: '', role: '', kind: 'guide', languages: [], photo: null }])}>
          <Plus className="h-3.5 w-3.5" />Add a person
        </button>
      )}
    </div>
  )
}

export function HoursEditor({ hours, onChange, disabled }: { hours: Hours | null; onChange: (h: Hours | null) => void; disabled: boolean }) {
  const h = hours ?? { opens: '09:00', closes: '21:00', days: [...DAYS] }
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={hours !== null} disabled={disabled} onChange={e => onChange(e.target.checked ? h : null)} />
        Show our opening hours on the Contact page
      </label>
      {hours && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-600">Opens <input type="time" value={hours.opens} disabled={disabled} onChange={e => onChange({ ...hours, opens: e.target.value })}
            className="ml-1 text-sm border border-gray-300 rounded-md px-2 py-1" /></label>
          <label className="text-xs text-gray-600">Closes <input type="time" value={hours.closes} disabled={disabled} onChange={e => onChange({ ...hours, closes: e.target.value })}
            className="ml-1 text-sm border border-gray-300 rounded-md px-2 py-1" /></label>
          <div className="flex gap-1">
            {DAYS.map(d => {
              const on = hours.days.includes(d)
              return (
                <button key={d} type="button" disabled={disabled} aria-pressed={on}
                  onClick={() => onChange({ ...hours, days: on ? hours.days.filter(x => x !== d) : DAYS.filter(x => x === d || hours.days.includes(x)) })}
                  className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-[#647C47] border-[#647C47] text-white' : 'border-gray-300 text-gray-600'}`}>{DAY_LABEL[d]}</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
