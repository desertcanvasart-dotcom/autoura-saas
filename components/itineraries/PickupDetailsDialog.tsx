'use client'

// Pickup details for one day of the trip, to the client on WhatsApp: the
// time and place (kept on the itinerary), and who is meeting them — read
// from that day's assignments (GET /api/whatsapp/send-pickup). The text is
// written from those (lib/notify/pickup-message) and can be edited before it
// goes: from the agency's WhatsApp, or the operator's own (wa.me).

import { useTenant } from '@/app/contexts/TenantContext'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buildPickupMessage, type PickupMessageInput } from '@/lib/notify/pickup-message'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/communication-utils'

type Draft = Omit<PickupMessageInput, 'time' | 'place'> & {
  time: string | null
  place: string | null
  clientPhone: string | null
}

export default function PickupDetailsDialog({ itineraryId, days, today, onClose, onSent }: {
  itineraryId: string
  days: { day_number: number; date: string }[]
  /** YYYY-MM-DD: the first day from today is offered first. */
  today: string
  onClose: () => void
  onSent: (how: 'agency' | 'mine') => void
}) {
  // The agency's country, for a local number's dialling code.
  const { tenant } = useTenant()
  const sorted = useMemo(() => [...days].filter(d => d.date).sort((a, b) => a.day_number - b.day_number), [days])
  const [date, setDate] = useState(() => (sorted.find(d => d.date.slice(0, 10) >= today) ?? sorted[0])?.date.slice(0, 10) ?? today)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The day's people, and the pickup time and place already on the trip.
  useEffect(() => {
    let live = true
    setDraft(null)
    setError(null)
    fetch(`/api/whatsapp/send-pickup?itineraryId=${encodeURIComponent(itineraryId)}&date=${date}`)
      .then(r => r.json())
      .then(json => {
        if (!live) return
        if (!json?.success) { setError(json?.error || 'Could not prepare the message'); return }
        setDraft(json.data)
        setTime(prev => prev || json.data.time || '')
        setPlace(prev => prev || json.data.place || '')
        setEdited(false)
      })
      .catch(() => live && setError('Could not prepare the message'))
    return () => { live = false }
  }, [itineraryId, date])

  // The text follows the fields until the operator edits it by hand.
  useEffect(() => {
    if (!draft || edited) return
    setText(buildPickupMessage({ ...draft, time, place }))
  }, [draft, time, place, edited])

  const save = (send: boolean) =>
    fetch('/api/whatsapp/send-pickup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itineraryId, message: text, pickup_time: time, pickup_location: place, send }),
    }).then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.success) throw new Error(data.error || 'Could not send')
    })

  const sendFromAgency = async () => {
    setBusy(true); setError(null)
    try { await save(true); onSent('agency') } catch (e) { setError(e instanceof Error ? e.message : 'Could not send') } finally { setBusy(false) }
  }

  // The tab opens inside the click (a window.open after an await is
  // popup-blocked on Safari); it gets the wa.me link once the details are saved.
  const sendFromMine = async () => {
    if (!draft?.clientPhone) return
    const tab = window.open('', '_blank')
    setBusy(true); setError(null)
    try {
      await save(false)
      const url = generateWhatsAppLink(formatPhoneForWhatsApp(draft.clientPhone, tenant?.operating_country), text)
      if (tab) tab.location.href = url
      else window.location.href = url
      onSent('mine')
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : 'Could not save the pickup details')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="pickup-title">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 id="pickup-title" className="text-base font-semibold text-gray-900">Pickup details</h2>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-gray-600">Day
            <select value={date} onChange={e => setDate(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              {sorted.map(d => <option key={d.day_number} value={d.date.slice(0, 10)}>Day {d.day_number} · {d.date.slice(5, 10)}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Time
            <input value={time} onChange={e => setTime(e.target.value)} placeholder="08:00" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </label>
          <label className="text-xs text-gray-600">Pickup point
            <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Hotel lobby" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </label>
        </div>

        {draft && !draft.guide && !draft.driver && !draft.airport && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">Nobody is assigned to this day yet — the message names no guide or driver.</p>
        )}

        <label className="block text-xs text-gray-600">
          <span className="flex items-center justify-between">
            Message
            {edited && <button type="button" onClick={() => setEdited(false)} className="text-primary-600 hover:underline">Rewrite from the details</button>}
          </span>
          {draft ? (
            <textarea value={text} onChange={e => { setText(e.target.value); setEdited(true) }} rows={12} className="mt-0.5 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono" />
          ) : (
            <p className="mt-1 text-sm text-gray-400 flex items-center gap-1.5">{!error && <Loader2 className="w-4 h-4 animate-spin" />}{error ? '' : 'Preparing…'}</p>
          )}
        </label>

        {draft && !draft.clientPhone && <p className="text-sm text-amber-800">This itinerary has no client phone number — add it in Edit itinerary.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">Cancel</button>
          <button type="button" onClick={sendFromMine} disabled={busy || !draft?.clientPhone || !text.trim()} className="px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50" title="Open your own WhatsApp with this message typed in">
            Send via my WhatsApp
          </button>
          <button type="button" onClick={sendFromAgency} disabled={busy || !draft?.clientPhone || !text.trim()} className="px-3 py-1.5 text-sm font-medium bg-[#25D366] text-white rounded-md hover:bg-[#20BD5A] disabled:opacity-50 flex items-center gap-1.5">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send on WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
