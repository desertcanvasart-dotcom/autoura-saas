'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

// Ask the supplier for this line from the office's OWN WhatsApp (D2): the
// message is pre-typed with the supplier's one-tap reply link; WhatsApp opens,
// the office presses send, then confirms here — only then is the line
// Requested (and its reply deadline set). A line already requested gets a
// reminder the same way. With notice="cancelled" it tells a supplier who was
// asked that the line is no longer needed.

export default function RequestOnWhatsApp({
  bookingId,
  lineId,
  requested,
  onSent,
  notify,
  notice,
}: {
  bookingId: string
  lineId: string
  requested: boolean
  notice?: 'cancelled'
  onSent: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const url = `/api/bookings/${bookingId}/suppliers/${lineId}/request`

  const open = async () => {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notice ? { notice } : {}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not prepare the message'); return }
      window.open(data.data.whatsapp_url, '_blank', 'noopener')
      if (data.data.phone_warning) notify('info', data.data.phone_warning)
      else if (!data.data.phone) notify('info', 'No WhatsApp number on this supplier — pick the chat in WhatsApp')
      setLink(data.data.url ?? null)
      setAsking(true)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent: true, ...(notice ? { notice } : {}) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not save'); return }
      notify('success', data.told ? 'Noted — supplier told' : data.reminded ? 'Reminder noted' : 'Requested — waiting for their answer')
      setAsking(false)
      onSent()
    } finally {
      setBusy(false)
    }
  }

  if (asking) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-gray-600">Did you send it?</span>
        <button type="button" disabled={busy} onClick={confirm} className="px-2 py-0.5 rounded bg-green-600 text-white font-medium disabled:opacity-50">Yes</button>
        <button type="button" disabled={busy} onClick={() => setAsking(false)} className="px-2 py-0.5 rounded border border-gray-300 text-gray-700">No</button>
        {link && (
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); notify('info', 'Reply link copied') }} className="text-blue-700 hover:underline">Copy link</button>
        )}
      </span>
    )
  }
  return (
    <button type="button" disabled={busy} onClick={open} className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline disabled:opacity-50">
      <MessageCircle className="w-3.5 h-3.5" /> {notice ? 'Tell them it’s not needed' : requested ? 'Remind on WhatsApp' : 'Ask on WhatsApp'}
    </button>
  )
}
