'use client'

// ============================================
// Settings → Your vocabulary
// ============================================
// Where an agency makes the app speak its language: rename the tiers, hide
// the supplier types it never uses, add the vehicle it actually runs. Every
// dropdown reads these lists (hooks/useVocabulary). Egypt's defaults are a
// preset the admin can come back to per list. Writes are admin-only.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown, ArrowUp, BookA, Check, Eye, EyeOff, Globe2, Loader2, Pencil, Plus, RotateCcw, Trash2, X, AlertCircle,
  CalendarRange, ChevronDown, Search,
} from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useAllVocabularies, clearVocabularyCache } from '@/hooks/useVocabulary'
import {
  VOCABULARY_KINDS,
  VOCABULARY_GROUPS,
  VOCABULARY_KIND_INFO,
  SUPPLIER_BEHAVIORS,
  slugifyKey,
  wouldBreakMinimum,
  type VocabularyItem,
  type VocabularyKind,
} from '@/lib/vocabulary'

interface Notice { kind: 'success' | 'error'; text: string }

type AddForm = { label: string; key: string; keyTouched: boolean; behavior: string; min_pax: string; max_pax: string; needs_destination: boolean; code: string; description: string }
const EMPTY_ADD: AddForm = { label: '', key: '', keyTouched: false, behavior: 'other', min_pax: '1', max_pax: '4', needs_destination: false, code: '', description: '' }

const inputCls = 'px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'

export default function VocabularySettingsPage() {
  const { isAdmin } = useRole()
  const dialog = useConfirmDialog()
  const { byKind, loading, reload } = useAllVocabularies()
  const [kind, setKind] = useState<VocabularyKind>('tier')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<{ id: string; label: string; behavior: string; min_pax: string; max_pax: string; needs_destination: boolean; code: string } | null>(null)
  const [add, setAdd] = useState<AddForm | null>(null)

  // Thirty-five lists in six groups is a wall, so the group nav behaves like
  // the main sidebar: groups collapse, the choice is remembered, the group
  // holding the selected list is always open, and a search box cuts across
  // groups by name.
  const GROUPS_KEY = 'autoura-vocab-groups'
  const [openGroups, setOpenGroups] = useState<string[]>(['General'])
  const [query, setQuery] = useState('')
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUPS_KEY)
      if (saved) setOpenGroups(JSON.parse(saved))
    } catch { /* private mode, or nothing saved: keep the default */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups)) } catch { /* ignore */ }
  }, [openGroups])
  useEffect(() => {
    const g = VOCABULARY_KIND_INFO[kind].group
    setOpenGroups(prev => (prev.includes(g) ? prev : [...prev, g]))
  }, [kind])
  const toggleGroup = (g: string) => setOpenGroups(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]))
  const q = query.trim().toLowerCase()
  const matches = (k: VocabularyKind) => {
    if (!q) return true
    const i = VOCABULARY_KIND_INFO[k]
    return `${i.title} ${i.example} ${i.usedIn}`.toLowerCase().includes(q)
  }

  const info = VOCABULARY_KIND_INFO[kind]
  const items = byKind[kind]
  const behaviorLabel = useMemo(() => Object.fromEntries(SUPPLIER_BEHAVIORS.map(b => [b.key, b.label])) as Record<string, string>, [])

  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t) } }, [notice])

  const call = async (key: string, fn: () => Promise<Response>, okText: string) => {
    setBusy(key)
    try {
      const res = await fn()
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) { setNotice({ kind: 'error', text: json.error || 'Something went wrong' }); return false }
      clearVocabularyCache()
      await reload()
      setNotice({ kind: 'success', text: okText })
      return true
    } catch {
      setNotice({ kind: 'error', text: 'Something went wrong' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const patch = (item: VocabularyItem, body: Record<string, unknown>, okText: string) =>
    call(item.id, () => fetch(`/api/vocabulary/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), okText)

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const ids = items.map(i => i.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await call('reorder', () => fetch('/api/vocabulary/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ids }) }), 'Order saved')
  }

  const remove = async (item: VocabularyItem) => {
    const ok = await dialog.confirmDelete(item.label, `Remove "${item.label}" from ${info.title.toLowerCase()}? Rows already filed under it keep the word until you re-file them.`)
    if (!ok) return
    await call(item.id, () => fetch(`/api/vocabulary/${item.id}`, { method: 'DELETE' }), `"${item.label}" removed`)
  }

  const reset = async () => {
    const ok = await dialog.confirm({
      title: `Reset ${info.title.toLowerCase()}?`,
      message: 'Everything you added or renamed in this list is replaced by the Egypt defaults. Other lists are untouched.',
      confirmText: 'Reset to defaults', variant: 'warning',
    })
    if (!ok) return
    await call('reset', () => fetch('/api/vocabulary/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) }), `${info.title} reset to defaults`)
  }

  const saveEdit = async () => {
    if (!editing) return
    const item = items.find(i => i.id === editing.id)
    if (!item) return
    const body: Record<string, unknown> = { label: editing.label }
    if (kind === 'supplier_type') body.behavior = editing.behavior
    if (kind === 'vehicle_type') body.meta = { ...item.meta, min_pax: Number(editing.min_pax), max_pax: Number(editing.max_pax) }
    if (kind === 'transport_service_type') body.meta = { ...item.meta, needs_destination: editing.needs_destination }
    if (kind === 'airline') body.meta = { ...item.meta, code: editing.code.trim().toUpperCase() }
    if (await patch(item, body, 'Saved')) setEditing(null)
  }

  const saveAdd = async () => {
    if (!add) return
    const body: Record<string, unknown> = { kind, label: add.label, description: add.description }
    if (add.keyTouched && add.key) body.key = add.key
    if (kind === 'supplier_type') body.behavior = add.behavior
    if (kind === 'vehicle_type') body.meta = { min_pax: Number(add.min_pax), max_pax: Number(add.max_pax) }
    if (kind === 'transport_service_type') body.meta = { needs_destination: add.needs_destination }
    if (kind === 'airline') body.meta = { code: add.code.trim().toUpperCase() }
    if (await call('add', () => fetch('/api/vocabulary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), `"${add.label}" added`)) setAdd(null)
  }

  const startEdit = (item: VocabularyItem) => setEditing({
    id: item.id, label: item.label, behavior: item.behavior || 'other',
    min_pax: String(item.meta?.min_pax ?? 1), max_pax: String(item.meta?.max_pax ?? 4),
    needs_destination: Boolean(item.meta?.needs_destination),
    code: typeof item.meta?.code === 'string' ? item.meta.code : '',
  })

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookA className="w-6 h-6 text-primary-600" /> Your vocabulary</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            The words your agency works with. Rename anything, hide what you never use, add what is missing — every dropdown in the app follows.
            Egypt&rsquo;s defaults are only a starting point.
          </p>
        </div>
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700 shrink-0">&larr; Settings</Link>
      </div>

      {!isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Only admins can change the vocabulary. You can read it here.
        </div>
      )}

      {notice && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${notice.kind === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {notice.kind === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {notice.text}
        </div>
      )}

      {/* Cities live in the destination catalog */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Globe2 className="w-5 h-5 text-primary-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Destinations and cities</p>
            <p className="text-xs text-gray-500">The countries you operate and the cities you actually sell — the list behind every city dropdown.</p>
          </div>
        </div>
        <Link href="/settings/destinations" className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 whitespace-nowrap">Manage destinations</Link>
      </div>

      {/* Two things are called "season": the demand calendar (dates + uplift,
          read by the engine) lives on its own page; the rate-row TAG is the
          Rate seasons list below. */}
      <div className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-start gap-3">
          <CalendarRange className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">Seasonal premiums (your demand calendar)</p>
            <p className="text-xs text-gray-500">The dates you charge more on, and by how much. The <span className="font-medium">Rate seasons</span> list below is different: it is only the season a supplier&rsquo;s rate is tagged with.</p>
          </div>
        </div>
        <Link href="/settings/seasons" className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 shrink-0">Manage seasons</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Kind picker */}
        <nav className="space-y-1">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Find a list…"
              aria-label="Find a list"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          {VOCABULARY_GROUPS.map(group => {
            const kinds = VOCABULARY_KINDS.filter(k => VOCABULARY_KIND_INFO[k].group === group && matches(k))
            if (q && kinds.length === 0) return null
            // A search shows every match open; otherwise the remembered state rules.
            const open = q ? true : openGroups.includes(group)
            const groupActive = kinds.reduce((n, k) => n + byKind[k].filter(i => i.is_active).length, 0)
            return (
              <div key={group}>
                <button type="button" onClick={() => toggleGroup(group)} aria-expanded={open}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-gray-50 group">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 group-hover:text-gray-600">{group}</span>
                  <span className="flex items-center gap-1.5">
                    {!open && <span className="text-[10px] text-gray-400">{kinds.length} lists · {groupActive}</span>}
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                  </span>
                </button>
                <div className={`space-y-0.5 overflow-hidden transition-all duration-200 ${open ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {kinds.map(k => {
                    const active = byKind[k].filter(i => i.is_active).length
                    return (
                      <button key={k} type="button" onClick={() => { setKind(k); setEditing(null); setAdd(null) }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left ${kind === k ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                        <span>{VOCABULARY_KIND_INFO[k].title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${kind === k ? 'bg-white/20' : 'bg-gray-200 text-gray-600'}`}>{active}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {q && VOCABULARY_KINDS.every(k => !matches(k)) && (
            <p className="px-3 py-2 text-xs text-gray-400">No list matches &ldquo;{query}&rdquo;.</p>
          )}
        </nav>

        {/* The list */}
        <section className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{info.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                <p className="text-xs text-gray-400 mt-1">Used in: {info.usedIn} · e.g. {info.example}</p>
              </div>
              {isAdmin && (
                <button type="button" onClick={() => void reset()} disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              This list is empty. {isAdmin ? 'Add your first entry below, or reset to the Egypt defaults.' : 'Ask an admin to set it up.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((item, index) => {
                const isEditing = editing?.id === item.id
                const minLocked = item.is_active && wouldBreakMinimum(kind, items, item.id)
                return (
                  <li key={item.id} className={`px-4 py-2.5 flex items-center gap-3 ${item.is_active ? '' : 'bg-gray-50'}`}>
                    {isAdmin && (
                      <div className="flex flex-col -my-1">
                        <button type="button" onClick={() => void move(index, -1)} disabled={index === 0 || busy !== null} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => void move(index, 1)} disabled={index === items.length - 1 || busy !== null} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {isEditing && editing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input autoFocus value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className={`${inputCls} w-56`} />
                          {kind === 'supplier_type' && (
                            <select value={editing.behavior} onChange={e => setEditing({ ...editing, behavior: e.target.value })} className={inputCls}>
                              {SUPPLIER_BEHAVIORS.map(b => <option key={b.key} value={b.key}>behaves as: {b.label}</option>)}
                            </select>
                          )}
                          {kind === 'vehicle_type' && (
                            <span className="flex items-center gap-1 text-sm text-gray-600">
                              <input type="number" min={1} value={editing.min_pax} onChange={e => setEditing({ ...editing, min_pax: e.target.value })} className={`${inputCls} w-16`} />–
                              <input type="number" min={1} value={editing.max_pax} onChange={e => setEditing({ ...editing, max_pax: e.target.value })} className={`${inputCls} w-16`} /> pax
                            </span>
                          )}
                          {kind === 'transport_service_type' && (
                            <label className="flex items-center gap-1.5 text-sm text-gray-600">
                              <input type="checkbox" checked={editing.needs_destination} onChange={e => setEditing({ ...editing, needs_destination: e.target.checked })} className="w-3.5 h-3.5" />
                              needs a destination
                            </label>
                          )}
                          {kind === 'airline' && (
                            <input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase().slice(0, 3) })} placeholder="IATA" maxLength={3}
                              className={`${inputCls} w-20 font-mono uppercase`} aria-label="IATA code" />
                          )}
                          <button type="button" onClick={() => void saveEdit()} disabled={busy !== null || !editing.label.trim()} className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="Save"><Check className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setEditing(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <>
                          <p className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                            {item.label}
                            {kind === 'vehicle_type' && item.meta?.min_pax != null && (
                              <span className="ml-2 text-xs font-normal text-gray-500">{String(item.meta.min_pax)}–{String(item.meta.max_pax)} pax</span>
                            )}
                            {kind === 'transport_service_type' && item.meta?.needs_destination === true && (
                              <span className="ml-2 text-xs font-normal text-gray-500">→ needs a destination</span>
                            )}
                            {kind === 'airline' && typeof item.meta?.code === 'string' && item.meta.code && (
                              <span className="ml-2 text-xs font-mono font-normal text-gray-500">{String(item.meta.code)}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {item.key}
                            {kind === 'supplier_type' && item.behavior && <span className="font-sans"> · behaves as {behaviorLabel[item.behavior] ?? item.behavior}</span>}
                            {item.description && <span className="font-sans"> · {item.description}</span>}
                          </p>
                        </>
                      )}
                    </div>

                    {isAdmin && !isEditing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button type="button" onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-primary-600" title="Rename"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => void patch(item, { is_active: !item.is_active }, item.is_active ? `"${item.label}" hidden` : `"${item.label}" shown`)}
                          disabled={busy !== null || minLocked}
                          className="p-1.5 text-gray-400 hover:text-primary-600 disabled:opacity-30"
                          title={minLocked ? `Keep at least ${info.minItems} active` : item.is_active ? 'Hide from dropdowns' : 'Show in dropdowns'}>
                          {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => void remove(item)} disabled={busy !== null || minLocked} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30" title={minLocked ? `Keep at least ${info.minItems} active` : 'Remove'}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {isAdmin && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg">
              {add ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Your word *</label>
                      <input autoFocus value={add.label} placeholder={info.example.split(' / ')[0]}
                        onChange={e => setAdd({ ...add, label: e.target.value, key: add.keyTouched ? add.key : slugifyKey(e.target.value) })}
                        onKeyDown={e => { if (e.key === 'Enter') void saveAdd(); if (e.key === 'Escape') setAdd(null) }}
                        className={`${inputCls} w-56`} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Key <span className="font-normal text-gray-400">(stored value)</span></label>
                      <input value={add.key} onChange={e => setAdd({ ...add, key: e.target.value, keyTouched: true })} className={`${inputCls} w-40 font-mono text-xs`} />
                    </div>
                    {kind === 'supplier_type' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Behaves as</label>
                        <select value={add.behavior} onChange={e => setAdd({ ...add, behavior: e.target.value })} className={inputCls}>
                          {SUPPLIER_BEHAVIORS.map(b => <option key={b.key} value={b.key}>{b.label} — {b.effect}</option>)}
                        </select>
                      </div>
                    )}
                    {kind === 'vehicle_type' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Passengers</label>
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <input type="number" min={1} value={add.min_pax} onChange={e => setAdd({ ...add, min_pax: e.target.value })} className={`${inputCls} w-16`} />–
                          <input type="number" min={1} value={add.max_pax} onChange={e => setAdd({ ...add, max_pax: e.target.value })} className={`${inputCls} w-16`} />
                        </span>
                      </div>
                    )}
                    {kind === 'transport_service_type' && (
                      <label className="flex items-center gap-1.5 text-sm text-gray-600 self-end pb-2">
                        <input type="checkbox" checked={add.needs_destination} onChange={e => setAdd({ ...add, needs_destination: e.target.checked })} className="w-3.5 h-3.5" />
                        needs a destination city
                      </label>
                    )}
                    {kind === 'airline' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">IATA code</label>
                        <input value={add.code} onChange={e => setAdd({ ...add, code: e.target.value.toUpperCase().slice(0, 3) })} placeholder="MS" maxLength={3} className={`${inputCls} w-24 font-mono uppercase`} />
                      </div>
                    )}
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Note <span className="font-normal text-gray-400">(optional)</span></label>
                      <input value={add.description} onChange={e => setAdd({ ...add, description: e.target.value })} className={`${inputCls} w-full`} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAdd(null)} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={() => void saveAdd()} disabled={busy !== null || !add.label.trim()} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                      {busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" />} Add
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAdd({ ...EMPTY_ADD })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 bg-white">
                  <Plus className="w-4 h-4" /> Add to {info.title.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
