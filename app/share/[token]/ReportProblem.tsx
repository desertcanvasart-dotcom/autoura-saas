'use client'

import { useState } from 'react'

// "Report a problem" — the traveller's escape hatch when something on the
// ground goes wrong. Collapsed by default so it never competes with the
// itinerary; one textarea, one optional name, one send. The POST lands as an
// urgent task in the operator's app, so the promise in the success message
// ("your operator has been notified") is literal.

export default function ReportProblem({ token, brandHex }: { token: string; brandHex: string }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/share/${token}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), name: name.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not send your report')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your report — try again')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center">
        <p className="text-2xl mb-1">✅</p>
        <p className="font-semibold text-gray-900">Report sent</p>
        <p className="text-sm text-gray-600 mt-1">Your operator has been notified and will get back to you.</p>
      </div>
    )
  }

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {!open ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">Something wrong?</p>
            <p className="text-sm text-gray-600">Tell your operator and they&rsquo;ll jump on it.</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 text-sm px-4 py-2 rounded-full text-white font-medium"
            style={{ background: brandHex }}
          >
            Report a problem
          </button>
        </div>
      ) : (
        <div>
          <p className="font-semibold text-gray-900 mb-3">Report a problem</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What happened? Where are you?"
            className="w-full text-sm border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: brandHex }}
          />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            placeholder="Your name (optional)"
            className="mt-2 w-full text-sm border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: brandHex }}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="text-sm px-4 py-2 rounded-full border border-gray-300 text-gray-700 font-medium disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !message.trim()}
              className="text-sm px-4 py-2 rounded-full text-white font-medium disabled:opacity-40"
              style={{ background: brandHex }}
            >
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
