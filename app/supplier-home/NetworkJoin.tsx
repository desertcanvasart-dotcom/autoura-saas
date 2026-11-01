'use client'

import { useEffect, useRef, useState } from 'react'
import { NETWORK_KINDS, PAPER_KINDS, VERIFICATION_LABEL } from '@/lib/supplier-network'
import LoadError from '@/components/LoadError'
import { NETWORK_CITIES, NETWORK_LANGUAGES } from '@/lib/supplier-network-lists'

// Join the Autoura supplier network (Phase 3): a profile other agencies can
// find — name, kinds of service, cities, languages, a few words — and papers
// for the Autoura team to check. Never a phone, email or price: agencies see
// those only once they add you, and agree each price with you.

interface Profile {
  display_name: string; kinds: string[]; cities: string[]; languages: string[]; about: string | null
  listed: boolean; verification_status: string; verification_note: string | null
}
interface Paper { id: string; kind: string; title: string; size_bytes: number | null; uploaded_at: string }

/** Tap to choose: the cities and languages come from fixed lists, so agencies can search them. */
function Picks({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-gray-700">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {options.map(o => {
          const on = value.includes(o)
          return (
            <label key={o} className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(x => x !== o))} />
              {o}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function NetworkJoin() {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('unverified')
  const [note, setNote] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kinds, setKinds] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  // Words typed before the lists existed that match nothing: shown so the supplier picks again.
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [about, setAbout] = useState('')
  const [listed, setListed] = useState(false)
  const [papers, setPapers] = useState<Paper[]>([])
  const [paperKind, setPaperKind] = useState('licence')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // A failed read used to leave the whole section blank, forever (audit SN-13).
  const [loadFailed, setLoadFailed] = useState(false)
  const load = async () => {
    setLoadFailed(false)
    const res = await fetch('/api/supplier-account/network-profile').catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !d.success) { setLoadFailed(true); return }
    const p: Profile | null = d.data.profile
    setPapers(d.data.papers)
    if (p) {
      // Already in the lists' words (the route reads older typed entries).
      setName(p.display_name); setKinds(p.kinds); setCities(p.cities); setLanguages(p.languages)
      setUnmatched(Array.isArray(d.data.unmatched) ? d.data.unmatched : [])
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
    if (d) {
      setUnmatched([])
      const next = d.rechecking ? 'Saved — sent for checking again (name or kinds changed)'
        : listed && (status === 'unverified' || status === 'rejected') ? 'Saved. To appear in the network, upload your papers and press Send for checking.'
        : 'Saved'
      setMsg({ ok: true, text: next }); void load()
    }
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

  if (loadFailed && !loaded) return <LoadError compact what="your network profile" onRetry={() => { void load() }} />
  if (!loaded) return null
  const statusColor = status === 'verified' ? 'text-green-700' : status === 'rejected' ? 'text-red-700' : status === 'pending' ? 'text-amber-700' : 'text-gray-600'

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Join the Autoura network</h2>
      <p className="text-sm text-gray-600">Let other agencies on Autoura find you. They see only what you write here — never your phone, email or prices. If they add you, they ask you here like the agencies you already work with, and agree each price with you.</p>
      <p className={`text-sm font-medium ${statusColor}`}>
        {status === 'verified' && !listed ? 'Verified — hidden from other agencies (tick “Let agencies find me” and Save)' : (VERIFICATION_LABEL[status] ?? status)}
      </p>
      {status === 'pending' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The Autoura team is checking your papers. You appear in the network as soon as they approve them — we will email you.
        </p>
      )}
      {(status === 'unverified' || status === 'rejected') && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Other agencies can’t find you yet.</b> Save your profile, upload your papers below, then press <b>Send for checking</b>. Once the Autoura team has checked them, you appear in the network.
        </p>
      )}
      {status === 'rejected' && note && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{note}</p>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
        <label className="block text-gray-700">Name agencies will see
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={120} className="mt-1 w-full" />
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
        {unmatched.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            We couldn’t match {unmatched.map(u => `“${u}”`).join(', ')} — please tap your cities and languages below, then Save.
          </p>
        )}
        <Picks label="Cities you work in" options={NETWORK_CITIES} value={cities} onChange={setCities} />
        <Picks label="Languages (optional)" options={NETWORK_LANGUAGES} value={languages} onChange={setLanguages} />
        <label className="block text-gray-700">About you (optional)
          <textarea value={about} onChange={e => setAbout(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full" />
        </label>
        {/* Being found needs BOTH this box and Autoura's check of the papers
            (operator, 2026-11-01: ticking alone looked like it should be enough). */}
        <label className="flex items-start gap-2 text-gray-700">
          <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} className="mt-0.5" />
          <span>
            Let agencies find me{status === 'verified' ? '' : ' once Autoura has checked my papers'}
            <span className="block text-xs text-gray-500">
              {status === 'verified' ? 'You can turn this off any time.' : 'Ticking this is not enough on its own: upload your papers and press Send for checking below. You can turn this off any time.'}
            </span>
          </span>
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
      {status !== 'verified' && status !== 'pending' && papers.length === 0 && (
        <p className="text-xs text-gray-500 text-center">Upload at least one paper (licence or vehicle papers) to send for checking.</p>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
    </section>
  )
}
