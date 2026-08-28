'use client'

// The lead asks to add travellers (booking-level link only). Price changes,
// so the portal never creates passengers itself — the office approves and
// the same per-person rate the booking already carries is extended.

import { useState } from 'react'

export default function ChangeRequestForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/portal/${token}/change-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, note }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setNotice({ ok: true, text: 'Request sent — your agency will confirm the updated price.' })
        setOpen(false)
      } else {
        setNotice({ ok: false, text: data.error || 'Could not submit — please try again.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Could not submit — please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Need to bring more people?</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Ask to add travellers — the same per-person rate as your booking, confirmed by your agency.
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47]/40 rounded-md hover:bg-[#647C47]/5"
          >
            Request
          </button>
        )}
      </div>
      {notice && <p className={`mt-2 text-xs ${notice.ok ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>}
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">How many more?</label>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. two friends joining from Amman"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sm text-gray-500">
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
