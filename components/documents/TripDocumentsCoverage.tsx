'use client'

// The trip's supplier documents, checked against its itinerary: whether every
// service line is on a document, what Sync would change, the documents that
// need a person (edited or sent before the trip changed), and nights or days
// that look unplanned. One Sync button makes the documents the itinerary's;
// the rest are one-click actions. Nothing to run by hand
// (app/api/itineraries/[id]/generate-documents, lib/documents/sync-plan).

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2, ChevronDown, Info } from 'lucide-react'

interface Attention { docId: string; documentNumber: string | null; title: string; status: string; reason: 'edited_and_changed' | 'sent_and_changed' | 'no_longer_on_trip' | 'made_before_sync' }
interface Coverage {
  totalLines: number
  onDocuments: number
  excluded: { day: number; name: string; reason: string }[]
  documents: { key: string; title: string; docType: string; lines: number; cities: string[] }[]
  pending: { create: { title: string }[]; update: { docId: string; title: string }[]; retire: { docId: string }[] }
  attention: Attention[]
  warnings: { kind: string; dayNumber?: number; message: string }[]
}

const REASON: Record<Attention['reason'], { text: string; fix: 'replace' | 'cancel' }> = {
  sent_and_changed: { text: 'was sent, and the itinerary has changed since', fix: 'replace' },
  edited_and_changed: { text: 'was edited by hand, and the itinerary has changed since', fix: 'replace' },
  made_before_sync: { text: 'was sent before documents synced with the itinerary — it may be missing services', fix: 'replace' },
  no_longer_on_trip: { text: 'is for services no longer on the itinerary', fix: 'cancel' },
}

export default function TripDocumentsCoverage({ itineraryId, onChanged }: { itineraryId: string; onChanged?: () => void }) {
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [showExcluded, setShowExcluded] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/itineraries/${itineraryId}/generate-documents`)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) setCoverage(data.coverage)
    else setMessage({ ok: false, text: data.error || 'Could not check the documents' })
  }, [itineraryId])

  useEffect(() => { load() }, [load])

  const sync = async (replace: string[] = []) => {
    setBusy(replace[0] ?? 'sync'); setMessage(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/generate-documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(replace.length ? { replace } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Sync failed')
      setMessage({ ok: true, text: replace.length ? 'Replaced with the itinerary’s version — it is a draft again, ready to send.' : data.message })
      await load(); onChanged?.()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Sync failed' })
    } finally { setBusy(null) }
  }

  const cancelDoc = async (docId: string) => {
    setBusy(docId); setMessage(null)
    const res = await fetch(`/api/supplier-documents/${docId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })
    if (res.ok) { await load(); onChanged?.() } else setMessage({ ok: false, text: 'Could not cancel the document' })
    setBusy(null)
  }

  if (!coverage) {
    return message
      ? <p className="text-sm text-red-600">{message.text}</p>
      : <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Checking the documents against the itinerary…</div>
  }

  const pendingCount = coverage.pending.create.length + coverage.pending.update.length + coverage.pending.retire.length
  const allGood = pendingCount === 0 && coverage.attention.length === 0
  const lineCount = coverage.totalLines - coverage.excluded.length

  return (
    <section className={`rounded-xl border p-4 ${allGood ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`} data-testid="documents-coverage">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {allGood ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
          <div>
            <p className={`font-medium ${allGood ? 'text-green-900' : 'text-amber-900'}`}>
              {lineCount === 0
                ? 'This itinerary has no services that need a supplier document yet.'
                : allGood
                  ? `All ${lineCount} service lines are on the documents below.`
                  : pendingCount > 0
                    ? `The documents don’t match the itinerary yet — Sync will ${[
                        coverage.pending.create.length && `create ${coverage.pending.create.length}`,
                        coverage.pending.update.length && `update ${coverage.pending.update.length}`,
                        coverage.pending.retire.length && `replace ${coverage.pending.retire.length} older`,
                      ].filter(Boolean).join(', ')}.`
                    : `${coverage.attention.length} document(s) need a look.`}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {coverage.documents.length} document(s): {coverage.documents.map(d => `${d.title} (${d.lines})`).join(' · ') || '—'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => sync()} disabled={!!busy || pendingCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40">
          {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync documents
        </button>
      </div>

      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{message.text}</p>}

      {coverage.attention.length > 0 && (
        <ul className="mt-3 space-y-2">
          {coverage.attention.map(a => {
            const r = REASON[a.reason]
            return (
              <li key={a.docId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm">
                <span className="text-gray-800"><strong>{a.title}</strong>{a.documentNumber ? ` (${a.documentNumber})` : ''} {r.text}.</span>
                {r.fix === 'replace' ? (
                  <button type="button" onClick={() => sync([a.docId])} disabled={!!busy} className="px-2.5 py-1 rounded-md border border-primary-300 text-primary-700 hover:bg-primary-50 disabled:opacity-40">
                    {busy === a.docId ? 'Replacing…' : 'Replace with the itinerary’s version'}
                  </button>
                ) : (
                  <button type="button" onClick={() => cancelDoc(a.docId)} disabled={!!busy} className="px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                    {busy === a.docId ? 'Cancelling…' : 'Cancel this document'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {coverage.warnings.length > 0 && (
        <div className="mt-3 rounded-lg bg-white border border-amber-200 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">On the itinerary</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-800">
            {coverage.warnings.map((w, i) => <li key={i}>• {w.message}</li>)}
          </ul>
        </div>
      )}

      {coverage.excluded.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowExcluded(v => !v)} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
            <Info className="w-3.5 h-3.5" /> {coverage.excluded.length} line(s) need no supplier document
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExcluded ? 'rotate-180' : ''}`} />
          </button>
          {showExcluded && (
            <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
              {coverage.excluded.map((e, i) => <li key={i}>Day {e.day}: {e.name} — {e.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
