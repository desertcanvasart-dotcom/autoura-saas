'use client'

// ============================================
// Options and upgrades, on the traveller's side
// ============================================
// Ported from travel-ops-pro. Two things happen here and nothing else: the
// traveller answers an offer the office has priced, or asks for something the
// office has not thought of. NEITHER MOVES MONEY.

import { useCallback, useEffect, useState } from 'react'
import { currencySymbol } from '@/lib/currency-totals'

type Extra = {
  id: string
  kind: 'addon' | 'upgrade'
  title: string
  description: string | null
  quantity: number
  status: 'requested' | 'offered' | 'accepted' | 'confirmed'
  currency: string | null
  amount: number | null
}

const money = (amount: number | null, currency: string | null) => {
  if (amount == null) return null
  const code = (currency || 'EUR').toUpperCase()
  const digits = code === 'JPY' ? 0 : 2
  return `${currencySymbol(code)}${amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

const STATUS_TEXT: Record<Extra['status'], string> = {
  requested: 'Your agency is checking the price',
  offered: 'Waiting for your answer',
  accepted: 'Being arranged',
  confirmed: 'Arranged',
}

export default function ExtrasSection({ token }: { token: string }) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [canRequest, setCanRequest] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/extras`)
      if (res.ok) {
        const data = await res.json()
        setExtras(data.extras || [])
        setCanRequest(Boolean(data.canRequest))
      }
    } finally { setLoaded(true) }
  }, [token])
  useEffect(() => { void load() }, [load])

  const answer = async (extra: Extra, action: 'accept' | 'decline') => {
    setBusy(extra.id); setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/extras/${extra.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || 'Could not send your answer.'); return }
      await load()
    } catch { setError('Something went wrong. Please try again.') } finally { setBusy(null) }
  }

  // Nothing offered and nothing askable: the section would be an empty heading.
  if (!loaded || (extras.length === 0 && !canRequest)) return null

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-2">Options and upgrades</h2>

      {extras.length > 0 && (
        <ul className="divide-y">
          {extras.map(e => (
            <li key={e.id} className="py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {e.title}{e.quantity > 1 && <span className="text-gray-500"> × {e.quantity}</span>}
                </p>
                {e.description && <p className="text-xs text-gray-600">{e.description}</p>}
                <p className="text-xs text-gray-500">{STATUS_TEXT[e.status]}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {money(e.amount, e.currency) && (
                  <p className="text-sm font-semibold text-gray-900">
                    {money(e.amount, e.currency)}
                    {e.kind === 'upgrade' && <span className="block text-[11px] font-normal text-gray-500">difference</span>}
                  </p>
                )}
                {e.status === 'offered' && (
                  <div className="flex gap-1 mt-1 justify-end">
                    <button type="button" disabled={busy === e.id} onClick={() => answer(e, 'accept')}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
                      {busy === e.id ? 'Sending…' : 'Yes, add it'}
                    </button>
                    <button type="button" disabled={busy === e.id} onClick={() => answer(e, 'decline')}
                      className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                      No thanks
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">{error}</p>}

      {canRequest && (
        sent ? (
          <p className="text-sm text-[#4a5c35] bg-[#e8ede3] rounded-lg px-3 py-2 mt-3">Thank you — your agency will come back to you with a price.</p>
        ) : !open ? (
          <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm text-[#647C47] underline">
            Would you like something else on this trip?
          </button>
        ) : (
          <RequestForm token={token} onSent={async () => { setSent(true); await load() }} onError={setError} />
        )
      )}
    </section>
  )
}

function RequestForm({ token, onSent, onError }: { token: string; onSent: () => void; onError: (m: string | null) => void }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/portal/${token}/extras`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, note }),
      })
      if (!res.ok) { onError((await res.json().catch(() => ({})))?.error || 'Could not send your request.'); return }
      onSent()
    } catch { onError('Something went wrong. Please try again.') } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <p className="text-xs text-gray-600">Tell us what you would like. Your agency will confirm the price before anything is added.</p>
      <label className="block text-xs text-gray-600" htmlFor="ex-title">What would you like?</label>
      <input id="ex-title" value={title} maxLength={200} required placeholder="e.g. Hot-air balloon at Luxor"
        onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      <label className="block text-xs text-gray-600" htmlFor="ex-note">Anything we should know? (optional)</label>
      <textarea id="ex-note" value={note} maxLength={1000} rows={2} onChange={e => setNote(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      <button type="submit" disabled={busy || !title.trim()}
        className="px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
        {busy ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}
