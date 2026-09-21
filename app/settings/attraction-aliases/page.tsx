'use client'

// ============================================
// Settings → Attraction names
// ============================================
// A tour says "Valley of the Kings"; the agency's fee sheet says "Valley Of
// Kings". An alias joins the two. Aliases belong to the agency (migration 370)
// — they point at names on ITS fee sheet — so this is where it sees them,
// fixes them and adds them, without anyone writing a migration.
//
// The top panel is the reason the screen exists: every wording in the
// agency's own tours that reaches no fee, with the fee picker beside it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Check, CheckCircle2, Loader2, Pencil, Plus, Signpost, Trash2, X } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
// alias-shared, NOT alias-admin: that one reaches server-only code and breaks the build.
import { COMBO_SEPARATOR, canonicalParts, type AliasHealth, type FeeName, type UnresolvedWording } from '@/lib/pricing/alias-shared'
import { ALIAS_WRITE_DENIED } from '@/lib/pricing/alias-admin-access'

interface AliasRow {
  id: string
  alias: string
  canonical: string
  is_active: boolean
  health: AliasHealth
}
interface Notice { kind: 'success' | 'error'; text: string }

const inputCls = 'px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent'

/** One or more fees — several make a combo ticket. */
function FeePicker({ value, onChange, fees, listId, disabled }: {
  value: string[]; onChange: (next: string[]) => void; fees: FeeName[]; listId: string; disabled?: boolean
}) {
  const parts = value.length ? value : ['']
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-gray-400 w-3 text-center">+</span>}
          <input
            list={listId}
            value={part}
            disabled={disabled}
            onChange={e => onChange(parts.map((p, j) => (j === i ? e.target.value : p)))}
            placeholder={i === 0 ? 'Choose a fee from your sheet' : 'Another fee on the same ticket'}
            aria-label={i === 0 ? 'Fee' : `Fee ${i + 1}`}
            className={`${inputCls} flex-1 min-w-0`}
          />
          {parts.length > 1 && (
            <button type="button" onClick={() => onChange(parts.filter((_, j) => j !== i))} disabled={disabled}
              className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove this fee">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => onChange([...parts, ''])}
        className="text-xs text-primary-600 hover:underline disabled:text-gray-400">
        + one ticket that covers another fee too
      </button>
      <datalist id={listId}>
        {fees.map(f => <option key={f.attraction_name} value={f.attraction_name}>{f.city ?? ''}</option>)}
      </datalist>
    </div>
  )
}

const join = (parts: string[]) => parts.map(p => p.trim()).filter(Boolean).join(COMBO_SEPARATOR)

export default function AttractionAliasesPage() {
  const dialog = useConfirmDialog()
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [fees, setFees] = useState<FeeName[]>([])
  const [unresolved, setUnresolved] = useState<UnresolvedWording[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const [newAlias, setNewAlias] = useState('')
  const [newFees, setNewFees] = useState<string[]>([''])
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [editing, setEditing] = useState<{ id: string; alias: string; fees: string[] } | null>(null)

  const say = useCallback((n: Notice) => {
    setNotice(n)
    // The notice sits at the top; a save made far down the list must not read
    // as "nothing happened".
    requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/attraction-aliases')
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { setState('failed'); return }
      setAliases(json.data.aliases)
      setFees(json.data.fees)
      setUnresolved(json.data.unresolved)
      setCanWrite(Boolean(json.data.canWrite))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const send = async (key: string, url: string, method: string, body?: unknown, done?: string) => {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) { say({ kind: 'error', text: json?.error || 'That did not save. Try again.' }); return false }
      say({ kind: 'success', text: [done, json.note].filter(Boolean).join(' ') })
      await load()
      return true
    } catch {
      say({ kind: 'error', text: 'The request did not reach the server. Check your connection and try again.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const add = async (alias: string, feeParts: string[], key: string) => {
    const ok = await send(key, '/api/attraction-aliases', 'POST', { alias, canonical: join(feeParts) }, `Saved: "${alias.trim()}" is priced as ${join(feeParts)}.`)
    return ok
  }

  const broken = useMemo(() => aliases.filter(a => a.is_active && !a.health.ok), [aliases])
  const noFee = unresolved.filter(u => u.reason === 'no_fee')
  const severalFees = unresolved.filter(u => u.reason === 'several_fees')

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Signpost className="w-6 h-6 text-primary-600" /> Attraction names
        </h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">
          Your tours name a sight one way; your fee sheet may name it another. Say here which fee a wording means, and
          every tour that uses the wording is priced from that fee. These are yours alone — they point at the names on{' '}
          <Link href="/rates/attractions" className="text-primary-600 hover:underline">your own fee sheet</Link>, and no other agency sees them.
        </p>
      </div>

      {state === 'ready' && !canWrite && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {ALIAS_WRITE_DENIED}
        </div>
      )}

      {notice && (
        <div ref={noticeRef} role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-lg text-sm flex items-start gap-2 ${notice.kind === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {notice.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {state === 'loading' && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Reading your tours and your fee sheet…</div>}
      {state === 'failed' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          This page could not load. <button onClick={() => { setState('loading'); load() }} className="underline">Try again</button>
        </div>
      )}

      {state === 'ready' && (
        <>
          {/* ---- what the tours say that reaches no fee ---- */}
          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                In your tours, with no fee behind it
                <span className="ml-2 text-xs font-normal text-gray-500">{unresolved.length === 0 ? 'nothing' : `${unresolved.length} wording${unresolved.length === 1 ? '' : 's'}`}</span>
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Each of these leaves a gap in the price of every tour that names it. Choose the fee it means — or, if it has no ticket
                (a river, a neighbourhood, a viewpoint), add it to <Link href="/rates/attractions" className="text-primary-600 hover:underline">your fee sheet</Link> at 0,
                which the pricing reads as free.
              </p>
            </div>

            {unresolved.length === 0 ? (
              <p className="p-4 text-sm text-gray-600 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Every attraction your tours name reaches a fee.</p>
            ) : fees.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">Your fee sheet is empty, so there is nothing to point a wording at yet. Add your entrance fees under <Link href="/rates/attractions" className="text-primary-600 hover:underline">Rates → Attractions</Link> first.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {[...noFee, ...severalFees].map(u => {
                  const key = `${u.wording}|${u.lookedUpAs}`
                  const choice = picked[key] ?? ['']
                  const rewritten = u.lookedUpAs.trim().toLowerCase() !== u.wording.trim().toLowerCase()
                  return (
                    <li key={key} className="p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-3 md:items-start">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 break-words">“{u.wording}”</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {u.days} day{u.days === 1 ? '' : 's'} in {u.tours.length} tour{u.tours.length === 1 ? '' : 's'}
                          {u.tours.length > 0 && <span title={u.tours.join('\n')}> · {u.tours[0]}{u.tours.length > 1 ? ` +${u.tours.length - 1}` : ''}</span>}
                        </p>
                        <p className="text-xs mt-1 text-amber-700">
                          {u.reason === 'several_fees'
                            ? `Fits ${u.candidates.length} fees and none is named exactly that: ${u.candidates.join(', ')}.`
                            : rewritten
                              ? `An alias already turns it into “${u.lookedUpAs}”, and no fee has that name — fix that alias below.`
                              : 'No fee on your sheet has this name.'}
                        </p>
                      </div>
                      <ArrowRight className="hidden md:block w-4 h-4 text-gray-300 mt-2.5" />
                      <FeePicker value={choice} onChange={next => setPicked(p => ({ ...p, [key]: next }))} fees={fees} listId="alias-fee-names" disabled={!canWrite || rewritten} />
                      <button
                        disabled={!canWrite || rewritten || !join(choice) || busy === key}
                        onClick={async () => { if (await add(u.wording, choice, key)) setPicked(p => { const n = { ...p }; delete n[key]; return n }) }}
                        className="px-3 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#566b3d] disabled:bg-gray-200 disabled:text-gray-500 inline-flex items-center gap-1.5 justify-center"
                      >
                        {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Use this fee
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ---- the agency's aliases ---- */}
          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Your aliases <span className="ml-2 text-xs font-normal text-gray-500">{aliases.length}</span>
                {broken.length > 0 && <span className="ml-2 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">{broken.length} no longer reach a fee</span>}
              </h2>
              <p className="text-xs text-gray-500 mt-1">Matched on the whole wording, ignoring capitals — never on part of it.</p>
            </div>

            {canWrite && (
              <div className="p-4 border-b border-gray-100 bg-gray-50 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-3 md:items-start">
                <input value={newAlias} onChange={e => setNewAlias(e.target.value)} placeholder="When a tour says…" aria-label="Wording" className={inputCls} />
                <ArrowRight className="hidden md:block w-4 h-4 text-gray-300 mt-2.5" />
                <FeePicker value={newFees} onChange={setNewFees} fees={fees} listId="alias-fee-names-new" />
                <button
                  disabled={!newAlias.trim() || !join(newFees) || busy === 'new'}
                  onClick={async () => { if (await add(newAlias, newFees, 'new')) { setNewAlias(''); setNewFees(['']) } }}
                  className="px-3 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#566b3d] disabled:bg-gray-200 disabled:text-gray-500 inline-flex items-center gap-1.5 justify-center"
                >
                  {busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add alias
                </button>
              </div>
            )}

            {aliases.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">No aliases yet. A tour whose wording matches a fee&apos;s name exactly needs none.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {aliases.map(a => {
                  const isEditing = editing?.id === a.id
                  return (
                    <li key={a.id} className={`p-4 ${a.is_active ? '' : 'bg-gray-50'}`}>
                      {isEditing && editing ? (
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-3 md:items-start">
                          <input value={editing.alias} onChange={e => setEditing({ ...editing, alias: e.target.value })} aria-label="Wording" className={inputCls} />
                          <ArrowRight className="hidden md:block w-4 h-4 text-gray-300 mt-2.5" />
                          <FeePicker value={editing.fees} onChange={next => setEditing({ ...editing, fees: next })} fees={fees} listId={`alias-fee-names-${a.id}`} />
                          <div className="flex gap-1.5">
                            <button
                              disabled={!editing.alias.trim() || !join(editing.fees) || busy === a.id}
                              onClick={async () => { if (await send(a.id, `/api/attraction-aliases/${a.id}`, 'PATCH', { alias: editing.alias, canonical: join(editing.fees) }, 'Alias updated.')) setEditing(null) }}
                              className="px-3 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg disabled:bg-gray-200 disabled:text-gray-500"
                            >Save</button>
                            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm break-words ${a.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                              <span className="font-medium">“{a.alias}”</span>
                              <ArrowRight className="inline w-3.5 h-3.5 mx-1.5 text-gray-400" />
                              {canonicalParts(a.canonical).join('  +  ')}
                              {!a.is_active && <span className="ml-2 text-[11px] text-gray-500 border border-gray-300 rounded px-1.5 py-0.5">switched off</span>}
                            </p>
                            {!a.health.ok && (
                              <p className="text-xs text-red-700 mt-1 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {a.health.problem}</p>
                            )}
                          </div>
                          {canWrite && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => setEditing({ id: a.id, alias: a.alias, fees: canonicalParts(a.canonical) })}
                                className="px-2.5 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                              <button disabled={busy === a.id}
                                onClick={() => send(a.id, `/api/attraction-aliases/${a.id}`, 'PATCH', { is_active: !a.is_active }, a.is_active ? `“${a.alias}” is switched off — it is looked up as written again.` : `“${a.alias}” is switched on.`)}
                                className="px-2.5 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">{a.is_active ? 'Switch off' : 'Switch on'}</button>
                              <button disabled={busy === a.id}
                                onClick={async () => {
                                  const yes = await dialog.confirmDelete(`“${a.alias}”`, `Delete the alias “${a.alias}”? The wording is looked up as written again. No fee and no tour is changed.`)
                                  if (yes) send(a.id, `/api/attraction-aliases/${a.id}`, 'DELETE', undefined, `“${a.alias}” deleted.`)
                                }}
                                className="px-2.5 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
