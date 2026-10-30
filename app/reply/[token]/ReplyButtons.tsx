'use client'

import { useState } from 'react'
import type { SupplierView } from '@/lib/supplier-reply-link'

// Accept / Decline / name the car or guide. Big buttons: this is opened on a
// phone from a WhatsApp message. Answers go to /api/reply/[token], or — on
// the supplier's own page (449) — to that line's endpoint.

const SAID: Record<string, string> = {
  accepted: 'You accepted — thank you.',
  assigned: 'Thank you — we have the details.',
  declined: 'You declined. Thank you for letting us know.',
  done: 'This service is done. Thank you.',
}

export default function ReplyButtons({ token, view, endpoint }: { token: string; view: SupplierView; endpoint?: string }) {
  const [status, setStatus] = useState(view.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [plate, setPlate] = useState(view.plate ?? '')
  const [guideName, setGuideName] = useState(view.guideName ?? '')
  const [guidePhone, setGuidePhone] = useState(view.guidePhone ?? '')
  const [driverNote, setDriverNote] = useState(view.driverNote ?? '')
  const [reason, setReason] = useState('')

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(endpoint ?? `/api/reply/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || 'Could not save — please try again'); return }
      setStatus(data.status); setNaming(false); setDeclining(false)
    } finally {
      setBusy(false)
    }
  }

  const answered = status === 'accepted' || status === 'assigned' || status === 'declined' || status === 'done'
  const canName = view.assign !== 'none' && status !== 'declined' && status !== 'done'
  const big = 'w-full rounded-xl py-4 text-base font-semibold disabled:opacity-50'

  return (
    <div className="space-y-3">
      {answered && <p className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm">{SAID[status]}</p>}
      {status === 'cancelled' && <p className="rounded-xl bg-gray-100 text-gray-700 px-4 py-3 text-sm">This service is no longer needed. Thank you.</p>}
      {status === 'assigned' && (plate || guideName) && (
        <p className="text-sm text-gray-700">{view.assign === 'car' ? `Car: ${plate}` : `Guide: ${guideName}${guidePhone ? ` · ${guidePhone}` : ''}`}{driverNote ? ` · Driver: ${driverNote}` : ''}</p>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>}

      {!answered && status !== 'cancelled' && !naming && !declining && (
        <>
          <button disabled={busy} onClick={() => send({ action: 'accept' })} className={`${big} bg-green-600 text-white`}>Accept</button>
          <button disabled={busy} onClick={() => setDeclining(true)} className={`${big} bg-white border border-gray-300 text-gray-800`}>Decline</button>
        </>
      )}

      {canName && !naming && !declining && status !== 'cancelled' && (
        <button disabled={busy} onClick={() => setNaming(true)} className={`${big} bg-blue-600 text-white`}>
          {view.assign === 'car' ? (status === 'assigned' ? 'Change the car' : 'Name the car (plate)') : (status === 'assigned' ? 'Change the guide' : 'Name the guide')}
        </button>
      )}

      {naming && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {view.assign === 'car' ? (
            <label className="block text-sm text-gray-700">Plate number
              <input value={plate} onChange={e => setPlate(e.target.value)} autoCapitalize="characters" className="mt-1 w-full" />
            </label>
          ) : (
            <>
              <label className="block text-sm text-gray-700">Guide’s name
                <input value={guideName} onChange={e => setGuideName(e.target.value)} className="mt-1 w-full" />
              </label>
              <label className="block text-sm text-gray-700">Guide’s phone (optional)
                <input value={guidePhone} onChange={e => setGuidePhone(e.target.value)} inputMode="tel" className="mt-1 w-full" />
              </label>
            </>
          )}
          {view.assign === 'car' && (
            <label className="block text-sm text-gray-700">Driver of the day — name and phone (optional)
              <input value={driverNote} onChange={e => setDriverNote(e.target.value)} className="mt-1 w-full" />
            </label>
          )}
          <button disabled={busy} onClick={() => send({ action: 'assign', plate, guide_name: guideName, guide_phone: guidePhone, driver_note: driverNote })} className={`${big} bg-blue-600 text-white`}>Send</button>
          <button disabled={busy} onClick={() => setNaming(false)} className="w-full py-2 text-sm text-gray-600">Back</button>
        </div>
      )}

      {declining && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <label className="block text-sm text-gray-700">Reason (optional)
            <input value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full" />
          </label>
          <button disabled={busy} onClick={() => send({ action: 'decline', reason })} className={`${big} bg-gray-800 text-white`}>Decline this request</button>
          <button disabled={busy} onClick={() => setDeclining(false)} className="w-full py-2 text-sm text-gray-600">Back</button>
        </div>
      )}
    </div>
  )
}
