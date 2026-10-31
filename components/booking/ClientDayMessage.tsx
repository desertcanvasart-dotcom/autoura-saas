'use client'

import { useEffect, useState } from 'react'
import { Mail, Send } from 'lucide-react'

// Send the client a day's details — car, plate, driver, guide, times — from
// the office's OWN WhatsApp (D2). Pick the day (tomorrow when it has
// services), WhatsApp opens with the text typed, then "Did you send it?".

export default function ClientDayMessage({
  bookingId,
  notify,
  refreshKey,
}: {
  bookingId: string
  notify: (type: 'success' | 'error' | 'info', message: string) => void
  /** Changes when the lines change, so the days are read again. */
  refreshKey?: number
}) {
  const [days, setDays] = useState<string[]>([])
  const [tomorrow, setTomorrow] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = `/api/bookings/${bookingId}/client-day-message`

  useEffect(() => {
    let live = true
    fetch(url).then(r => r.json()).then(data => {
      if (!live || !data.success) return
      setDays(data.data.days)
      setTomorrow(data.data.tomorrow)
      setDate(d => (d && data.data.days.includes(d) ? d : data.data.offer ?? data.data.days[0] ?? ''))
    }).catch(() => {})
    return () => { live = false }
  }, [url, refreshKey])

  if (days.length === 0) return null

  const post = async (sent: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, ...(sent ? { sent } : {}) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not prepare the message'); return }
      if (sent) { notify('success', 'Noted — client told'); setAsking(false); return }
      window.open(data.data.whatsapp_url, '_blank', 'noopener')
      if (data.data.phone_warning) notify('info', data.data.phone_warning)
      else if (!data.data.phone) notify('info', 'No phone number for this client — pick the chat in WhatsApp')
      setAsking(true)
    } finally {
      setBusy(false)
    }
  }

  const email = async () => {
    if (!window.confirm('Email the client this day’s details now?')) return
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, channel: 'email' }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not send the email'); return }
      notify('success', `Emailed to ${data.emailed}`)
    } finally {
      setBusy(false)
    }
  }

  const label = (d: string) => {
    const name = new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    return d === tomorrow ? `Tomorrow (${name})` : name
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-600">Send the client the day’s details:</span>
      <select aria-label="Day to send" value={date} onChange={e => { setDate(e.target.value); setAsking(false) }} className="!w-auto !py-1 !px-2 !text-xs">
        {days.map(d => <option key={d} value={d}>{label(d)}</option>)}
      </select>
      {asking ? (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-gray-600">Did you send it?</span>
          <button type="button" disabled={busy} onClick={() => post(true)} className="px-2 py-0.5 rounded bg-primary-600 text-white font-medium disabled:opacity-50">Yes</button>
          <button type="button" disabled={busy} onClick={() => setAsking(false)} className="px-2 py-0.5 rounded border border-gray-300 text-gray-700">No</button>
        </span>
      ) : (
        <button type="button" disabled={busy || !date} onClick={() => post(false)} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline disabled:opacity-50">
          <Send className="w-3.5 h-3.5" /> On WhatsApp
        </button>
      )}
      {!asking && (
        <button type="button" disabled={busy || !date} onClick={email} className="inline-flex items-center gap-1 text-xs text-gray-700 hover:underline disabled:opacity-50">
          <Mail className="w-3.5 h-3.5" /> By email
        </button>
      )}
    </div>
  )
}
