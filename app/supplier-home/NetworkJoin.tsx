'use client'

import { useEffect, useRef, useState } from 'react'
import { NETWORK_KINDS, PAPER_KINDS, VERIFICATION_LABEL } from '@/lib/supplier-network'

// Join the Autoura supplier network (Phase 3): a profile other agencies can
// find — name, kinds of service, cities, languages, a few words — and papers
// for the Autoura team to check. Never a phone, email or price: agencies see
// those only once they add you, and agree each price with you.

interface Profile {
  display_name: string; kinds: string[]; cities: string[]; languages: string[]; about: string | null
  listed: boolean; verification_status: string; verification_note: string | null
}
interface Paper { id: string; kind: string; title: string; size_bytes: number | null; uploaded_at: string }

export default function NetworkJoin() {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('unverified')
  const [note, setNote] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kinds, setKinds] = useState<string[]>([])
  const [cities, setCities] = useState('')
  const [languages, setLanguages] = useState('')
  const [about, setAbout] = useState('')
  const [listed, setListed] = useState(false)
  const [papers, setPapers] = useState<Paper[]>([])
  const [paperKind, setPaperKind] = useState('licence')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await fetch('/api/supplier-account/network-profile')
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.success) return
    const p: Profile | null = d.data.profile
    setPapers(d.data.papers)
    if (p) {
      setName(p.display_name); setKinds(p.kinds); setCities(p.cities.join(', ')); setLanguages(p.languages.join(', '))
      setAbout(p.about ?? ''); setListed(p.listed); setStatus(p.verification_status); setNote(p.verification_note)
    } else {
      setName(d.data.default_name ?? '')
    }
    setLoaded(true)
  }
  useEffect(() => { void load() }, [])

  const call = async (init: RequestInit & { url?: string }) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(init.url ?? '/api/supplier-account/network-profile', init)
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setMsg({ ok: false, text: d.error || 'Something went wrong — please try again' }); return null }
      return d
    } finally { setBusy(false) }
  }

  const save = async () => {
    const d = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: name, kinds, cities, languages, about, listed }) })
    if (d) { setMsg({ ok: true, text: d.rechecking ? 'Saved — sent for checking again (name or kinds changed)' : 'Saved' }); void load() }
  }
  const submit = async () => {
    const d = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) })
    if (d) { setMsg({ ok: true, text: 'Sent — the Autoura team will check your papers' }); void load() }
  }
  const upload = async () => {
    const f = fileRef.current?.files?.[0]
    if (!f) return
    const form = new FormData(); form.append('file', f); form.append('kind', paperKind)
    const d = await call({ url: '/api/supplier-account/network-papers', method: 'POST', body: form })
    if (d) { setPapers(prev => [d.data, ...prev]); if (fileRef.current) fileRef.current.value = '' }
  }
  const remove = async (id: string) => {
    const d = await call({ url: '/api/supplier-account/network-papers', method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (d) setPapers(prev => prev.filter(p => p.id !== id))
  }

  if (!loaded) return null
  const statusColor = status === 'verified' ? 'text-green-700' : status === 'rejected' ? 'text-red-700' : status === 'pending' ? 'text-amber-700' : 'text-gray-600'

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Join the Autoura network</h2>
      <p className="text-sm text-gray-600">Let other agencies on Autoura find you. They see only what you write here — never your phone, email or prices. If they add you, they ask you here like the agencies you already work with, and agree each price with you.</p>
      <p className={`text-sm font-medium ${statusColor}`}>{VERIFICATION_LABEL[status] ?? status}</p>
      {status === 'rejected' && note && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{note}</p>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
        <label className="block text-gray-700">Name agencies will see
          <input value={name} onChange={e => setName(e.target.value)} maxLength={120} className="mt-1 w-full" />
        </label>
        <fieldset>
          <legend className="text-gray-700">What you do</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(NETWORK_KINDS).map(([k, label]) => (
              <label key={k} className={`px-3 py-1.5 rounded-full border cursor-pointer ${kinds.includes(k) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>
                <input type="checkbox" className="sr-only" checked={kinds.includes(k)} onChange={e => setKinds(prev => e.target.checked ? [...prev, k] : prev.filter(x => x !== k))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-gray-700">Cities you work in (comma between)
          <input value={cities} onChange={e => setCities(e.target.value)} placeholder="Cairo, Giza, Luxor" className="mt-1 w-full" />
        </label>
        <label className="block text-gray-700">Languages (optional)
          <input value={languages} onChange={e => setLanguages(e.target.value)} placeholder="English, Italian" className="mt-1 w-full" />
        </label>
        <label className="block text-gray-700">About you (optional)
          <textarea value={about} onChange={e => setAbout(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full" />
        </label>
        <label className="flex items-center gap-2 text-gray-700">
          <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} />
          Let agencies find me (you can turn this off any time)
        </label>
        <button type="button" disabled={busy} onClick={save} className="w-full rounded-xl py-3 font-semibold bg-gray-900 text-white disabled:opacity-50">Save</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
        <p className="font-medium text-gray-900">Papers for checking</p>
        <p className="text-gray-600">Your licence and vehicle papers (PDF or a photo, 10 MB each). Only the Autoura team sees them.</p>
        {papers.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {papers.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-gray-800">{p.title} <span className="text-gray-400">· {PAPER_KINDS[p.kind] ?? p.kind}</span></span>
                <button type="button" disabled={busy} onClick={() => remove(p.id)} className="text-red-700 hover:underline disabled:opacity-50">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select value={paperKind} onChange={e => setPaperKind(e.target.value)} className="!w-auto">
            {Object.entries(PAPER_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-xs" />
          <button type="button" disabled={busy} onClick={upload} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 disabled:opacity-50">Upload</button>
        </div>
      </div>

      {status !== 'verified' && status !== 'pending' && (
        <button type="button" disabled={busy || papers.length === 0} onClick={submit} className="w-full rounded-xl py-3 font-semibold bg-green-600 text-white disabled:opacity-50">
          Send for checking
        </button>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
    </section>
  )
}
