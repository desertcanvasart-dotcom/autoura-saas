'use client'

import { useEffect, useState } from 'react'
import { Link2, MessageCircle } from 'lucide-react'
import DaysOffEditor from '@/components/DaysOffEditor'

// The supplier's own page (migration 449): one standing link listing every
// request and job from this agency. Send it from the office's own WhatsApp
// (D2), copy it, or switch it off (then send a new one).

export default function SupplierPageLink({ supplierId, canEdit }: { supplierId: string; canEdit: boolean }) {
  const [link, setLink] = useState<{ url: string; last_opened_at: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const url = `/api/suppliers/${supplierId}/portal-link`

  useEffect(() => {
    let live = true
    fetch(url).then(r => r.json()).then(d => { if (live && d.success) setLink(d.data) }).catch(() => {})
    return () => { live = false }
  }, [url])

  const send = async () => {
    setBusy(true); setNote(null)
    try {
      const res = await fetch(url, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setNote(d.error || 'Could not make the link'); return }
      setLink({ url: d.data.url, last_opened_at: d.data.last_opened_at })
      window.open(d.data.whatsapp_url, '_blank', 'noopener')
      if (!d.data.phone) setNote('No WhatsApp number on this supplier — pick the chat in WhatsApp')
    } finally { setBusy(false) }
  }

  const stop = async () => {
    if (!window.confirm('Switch this link off? The supplier’s page stops working until you send a new one.')) return
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) { setLink(null); setNote('Link switched off') }
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-gray-800 inline-flex items-center gap-1"><Link2 className="w-4 h-4" /> Supplier’s page</span>
        <span className="text-xs text-gray-500">
          {link ? (link.last_opened_at ? `Opened ${new Date(link.last_opened_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Sent — not opened yet') : 'Their requests and jobs on one link, no login'}
        </span>
        {canEdit && (
          <button type="button" disabled={busy} onClick={send} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline disabled:opacity-50">
            <MessageCircle className="w-3.5 h-3.5" /> {link ? 'Send again on WhatsApp' : 'Send on WhatsApp'}
          </button>
        )}
        {link && (
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(link.url); setNote('Link copied') }} className="text-xs text-blue-700 hover:underline">Copy link</button>
        )}
        {link && canEdit && (
          <button type="button" disabled={busy} onClick={stop} className="text-xs text-red-700 hover:underline disabled:opacity-50">Switch off</button>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-gray-600">{note}</p>}
      <details className="mt-2">
        <summary className="text-xs font-medium text-gray-700 cursor-pointer">Days off</summary>
        <div className="mt-2"><DaysOffEditor url={`/api/suppliers/${supplierId}/days-off`} who="office" canEdit={canEdit} /></div>
      </details>
    </div>
  )
}
