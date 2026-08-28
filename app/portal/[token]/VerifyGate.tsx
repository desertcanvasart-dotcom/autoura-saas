'use client'

// The confirmation gate's form — one field (plus date of birth on private
// per-traveller links). Success reloads the page; the server then sees the
// cookie and renders the booking.

import { useState } from 'react'

export default function VerifyGate({ token, requireDob = false }: { token: string; requireDob?: boolean }) {
  const [answer, setAnswer] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim() || busy || (requireDob && !dob)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requireDob ? { answer, dob } : { answer }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        window.location.reload()
        return
      }
      setError(data.error || 'The details entered do not match this booking.')
    } catch {
      setError('Connection problem — please try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="gate-answer" className="block text-xs font-medium text-gray-600 mb-1">
          {requireDob ? 'Your family name' : 'Booking number or family name'}
        </label>
        <input
          id="gate-answer"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder={requireDob ? 'e.g. Haddad' : 'e.g. BKG-2026-0001 or Haddad'}
          autoComplete="off"
          autoFocus
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
        />
      </div>
      {requireDob && (
        <div>
          <label htmlFor="gate-dob" className="block text-xs font-medium text-gray-600 mb-1">
            Date of birth
          </label>
          <input
            id="gate-dob"
            type="date"
            value={dob}
            onChange={e => setDob(e.target.value)}
            autoComplete="off"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
          />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !answer.trim() || (requireDob && !dob)}
        className="w-full py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Continue'}
      </button>
    </form>
  )
}
