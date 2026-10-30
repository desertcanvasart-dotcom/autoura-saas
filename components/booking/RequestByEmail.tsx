'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'

// The same request (or a reminder) by email: sent at once through the
// company's sender, after a confirm — the line becomes Requested when it has
// gone. The supplier answers with the same one-tap link.

export default function RequestByEmail({
  bookingId,
  lineId,
  supplierName,
  requested,
  onSent,
  notify,
  notice,
}: {
  bookingId: string
  lineId: string
  supplierName: string
  requested: boolean
  onSent: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
  /** 'cancelled': email the "no longer needed" note instead of a request. */
  notice?: 'cancelled'
}) {
  const [busy, setBusy] = useState(false)

  const send = async () => {
    const ask = notice ? `Email ${supplierName} that it is no longer needed?` : requested ? `Email ${supplierName} a reminder now?` : `Email the request to ${supplierName} now?`
    if (!window.confirm(ask)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/suppliers/${lineId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notice ? { channel: 'email', notice } : { channel: 'email' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not send the email'); return }
      notify('success', data.told ? `Told by email (${data.emailed})` : data.reminded ? `Reminder emailed to ${data.emailed}` : `Requested — emailed to ${data.emailed}`)
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" disabled={busy} onClick={send} className="inline-flex items-center gap-1 text-xs text-gray-700 hover:underline disabled:opacity-50">
      <Mail className="w-3.5 h-3.5" /> {busy ? 'Sending…' : notice ? 'Email it' : requested ? 'Remind by email' : 'Email it'}
    </button>
  )
}
