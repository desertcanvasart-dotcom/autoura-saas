'use client'

import { useCallback, useEffect, useState } from 'react'
import { NETWORK_KINDS, PAPER_KINDS } from '@/lib/supplier-network'

// The Autoura team checks suppliers who asked to join the shared network
// (Phase 3, decision §7): read their profile, open their papers, then Verify
// — or Reject / Take back with a note the supplier sees.

interface Paper { id: string; kind: string; title: string; size_bytes: number | null; uploaded_at: string }
interface Row {
  account_id: string; display_name: string; kinds: string[]; cities: string[]; languages: string[]; about: string | null
  listed: boolean; verification_status: string; verification_note: string | null; verified_at: string | null; updated_at: string
  phone: string | null; account_disabled: boolean; papers: Paper[]; agencies: number
}

const TABS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Not verified' },
  { key: 'unverified', label: 'Not sent yet' },
]

export default function NetworkSuppliersPage() {
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRows(null)
    const res = await fetch(`/api/super-admin/network-suppliers?status=${tab}`)
    const d = await res.json().catch(() => ({}))
    setRows(res.ok && d.success ? d.data : [])
    if (!res.ok) setMsg(d.error || 'Could not load')
  }, [tab])
  useEffect(() => { void load() }, [load])

  const open = async (accountId: string, docId: string) => {
    const res = await fetch(`/api/super-admin/network-suppliers/${accountId}/papers/${docId}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.success) window.open(d.url, '_blank', 'noopener')
    else setMsg(d.error || 'Could not open the paper')
  }

  const decide = async (accountId: string, decision: 'verify' | 'reject' | 'revoke') => {
    setBusy(accountId); setMsg(null)
    try {
      const res = await fetch(`/api/super-admin/network-suppliers/${accountId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: notes[accountId] ?? '' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setMsg(d.error || 'Could not save'); return }
      setMsg(`${decision === 'verify' ? 'Verified' : decision === 'revoke' ? 'Taken back' : 'Not verified'} — the supplier was told (${d.told} email${d.told === 1 ? '' : 's'})`)
      void load()
    } finally { setBusy(null) }
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-white">Network suppliers</h1>
      <p className="text-sm text-gray-400 mt-1">Suppliers asking to be found by other agencies. Check their papers, then verify — agencies see only verified, listed suppliers.</p>
      <div className="mt-4 flex gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{t.label}</button>
        ))}
      </div>
      {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}
      {rows === null ? <p className="mt-6 text-gray-400">Loading…</p> : rows.length === 0 ? <p className="mt-6 text-gray-400">Nobody here.</p> : (
        <ul className="mt-6 space-y-4">
          {rows.map(r => (
            <li key={r.account_id} className="rounded-xl bg-gray-800 border border-gray-700 p-4 text-sm text-gray-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{r.display_name}</p>
                  <p className="text-gray-400">{r.phone ?? 'no phone'}{r.account_disabled ? ' · account disabled' : ''} · {r.listed ? 'wants to be found' : 'hidden by the supplier'} · on {r.agencies} agenc{r.agencies === 1 ? 'y' : 'ies'}’ books</p>
                </div>
                <span className="text-xs text-gray-400">updated {new Date(r.updated_at).toLocaleString()}</span>
              </div>
              <p className="mt-2"><b>Does:</b> {r.kinds.map(k => NETWORK_KINDS[k] ?? k).join(', ') || '—'} · <b>Cities:</b> {r.cities.join(', ') || '—'}{r.languages.length ? <> · <b>Languages:</b> {r.languages.join(', ')}</> : null}</p>
              {r.about && <p className="mt-1 text-gray-300">{r.about}</p>}
              {r.verification_note && <p className="mt-2 text-amber-300">Note to supplier: {r.verification_note}</p>}
              <div className="mt-3">
                <p className="font-medium text-white">Papers ({r.papers.length})</p>
                {r.papers.length === 0 ? <p className="text-gray-400">None uploaded.</p> : (
                  <ul className="mt-1 space-y-1">
                    {r.papers.map(p => (
                      <li key={p.id} className="flex items-center gap-3">
                        <span>{p.title} <span className="text-gray-500">· {PAPER_KINDS[p.kind] ?? p.kind}</span></span>
                        <button onClick={() => open(r.account_id, p.id)} className="text-blue-400 hover:underline">Open</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input value={notes[r.account_id] ?? ''} onChange={e => setNotes(n => ({ ...n, [r.account_id]: e.target.value }))}
                  placeholder="Note to the supplier (needed to reject)" className="flex-1 min-w-[16rem] rounded-lg bg-gray-900 border border-gray-700 px-3 py-1.5 text-white" />
                {r.verification_status === 'pending' && (
                  <>
                    <button disabled={busy === r.account_id} onClick={() => decide(r.account_id, 'verify')} className="px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50">Verify</button>
                    <button disabled={busy === r.account_id} onClick={() => decide(r.account_id, 'reject')} className="px-3 py-1.5 rounded-lg bg-gray-700 text-white disabled:opacity-50">Reject</button>
                  </>
                )}
                {r.verification_status === 'verified' && (
                  <button disabled={busy === r.account_id} onClick={() => decide(r.account_id, 'revoke')} className="px-3 py-1.5 rounded-lg bg-red-700 text-white disabled:opacity-50">Take back</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
