'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Search } from 'lucide-react'
import { NETWORK_KINDS } from '@/lib/supplier-network'
import { useRole } from '@/hooks/useRole'

// Find suppliers in the shared Autoura network (Phase 3): verified suppliers
// who chose to be found. Add one and it joins YOUR supplier list, connected —
// ask them like any supplier and agree each price with them. Other agencies
// never see your rates or notes, and you never see theirs.

interface Found {
  account_id: string; display_name: string; kinds: string[]; cities: string[]; languages: string[]; about: string | null
  my_supplier_id: string | null
}

export default function NetworkSuppliersPage() {
  const { isViewer, isMember } = useRole()
  const [kind, setKind] = useState('')
  const [city, setCity] = useState('')
  const [language, setLanguage] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Found[] | null>(null)
  const [off, setOff] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const search = useCallback(async () => {
    const p = new URLSearchParams()
    if (kind) p.set('kind', kind); if (city.trim()) p.set('city', city.trim()); if (language.trim()) p.set('language', language.trim()); if (q.trim()) p.set('q', q.trim())
    const res = await fetch(`/api/network-suppliers?${p}`)
    const d = await res.json().catch(() => ({}))
    if (d.network_off) { setOff(d.error); setRows([]); return }
    setOff(null)
    setRows(res.ok && d.success ? d.data : [])
    if (!res.ok && !d.network_off) setMsg({ ok: false, text: d.error || 'Could not search' })
  }, [kind, city, language, q])
  useEffect(() => { void search() }, [search])

  const add = async (r: Found) => {
    setBusy(r.account_id); setMsg(null)
    try {
      const res = await fetch(`/api/network-suppliers/${r.account_id}`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setMsg({ ok: false, text: d.error || 'Could not add' }); return }
      setMsg({ ok: true, text: `${r.display_name} is on your supplier list — choose them in “Who covers it” and agree the price.` })
      setRows(prev => prev?.map(x => x.account_id === r.account_id ? { ...x, my_supplier_id: d.data.supplier_id } : x) ?? null)
    } finally { setBusy(null) }
  }

  const canAdd = !isViewer && !isMember

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900">Network suppliers</h1>
      <p className="text-sm text-gray-600 mt-1">Verified suppliers on Autoura who chose to be found by other agencies. Add one to your list, then ask them and agree each price — nobody else sees your rates or notes.</p>

      {off ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {off} <Link href="/settings/company" className="underline">Open Settings</Link>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2 items-end">
            <label className="text-xs text-gray-600">Kind
              <select value={kind} onChange={e => setKind(e.target.value)} className="block !w-44">
                <option value="">Any</option>
                {Object.entries(NETWORK_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">City<input value={city} onChange={e => setCity(e.target.value)} placeholder="Luxor" className="block !w-40" /></label>
            <label className="text-xs text-gray-600">Language<input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Italian" className="block !w-40" /></label>
            <label className="text-xs text-gray-600 flex-1 min-w-[10rem]">Words<input value={q} onChange={e => setQ(e.target.value)} placeholder="name or about" className="block w-full" /></label>
            <button onClick={() => void search()} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm inline-flex items-center gap-1"><Search className="w-4 h-4" /> Search</button>
          </div>
          {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
          {rows === null ? <p className="mt-6 text-gray-500">Searching…</p> : rows.length === 0 ? (
            <p className="mt-6 text-gray-500">No verified network suppliers match yet.</p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {rows.map(r => (
                <li key={r.account_id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                  <p className="font-semibold text-gray-900 flex items-center gap-1">{r.display_name} <BadgeCheck className="w-4 h-4 text-blue-600" aria-label="Verified by Autoura" /></p>
                  <p className="text-gray-600">{r.kinds.map(k => NETWORK_KINDS[k] ?? k).join(' · ')}</p>
                  <p className="text-gray-600">{r.cities.join(', ')}{r.languages.length ? ` · ${r.languages.join(', ')}` : ''}</p>
                  {r.about && <p className="mt-1 text-gray-700">{r.about}</p>}
                  <div className="mt-3">
                    {r.my_supplier_id ? (
                      <span className="text-green-700 font-medium">On your list</span>
                    ) : canAdd ? (
                      <button disabled={busy === r.account_id} onClick={() => add(r)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50">Add to my suppliers</button>
                    ) : <span className="text-gray-500">A manager can add them</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
