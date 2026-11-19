'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Loader2, Send } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { FOLLOW_UP_LANGUAGE_NAMES, type FollowUpLanguage, type WindowState } from '@/lib/whatsapp-templates'

/**
 * Above the composer when WhatsApp's 24-hour window has closed: when the
 * client last wrote, and a "Send follow-up" button per approved template
 * (lib/whatsapp-templates.ts). A free message would be refused (Twilio 63016);
 * the template is the one message that goes. Once the client replies, the
 * window opens again and this notice disappears.
 */
export default function FollowUpNotice({
  conversationId,
  refreshKey,
  onSent,
  onWindowChange,
}: {
  conversationId: string
  /** Re-check when this changes (the message count), so a reply clears the notice. */
  refreshKey: number
  onSent: (saved: unknown) => void
  onWindowChange: (open: boolean) => void
}) {
  const [state, setState] = useState<{ window: WindowState; templates: Array<{ language: FollowUpLanguage; body: string }> } | null>(null)
  const [busy, setBusy] = useState<FollowUpLanguage | null>(null)
  const [preview, setPreview] = useState<FollowUpLanguage | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/whatsapp/conversations/${conversationId}/follow-up`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!live || !j?.success) return
        setState(j.data)
        onWindowChange(Boolean(j.data.window.open))
      })
      .catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, refreshKey])

  if (!state || state.window.open) return null

  const last = state.window.lastInboundAt
  const since = last
    ? `last wrote on ${new Date(last).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, more than 24 hours ago`
    : 'has never written to you on WhatsApp'

  const send = async (language: FollowUpLanguage) => {
    setBusy(language)
    try {
      const r = await fetch(`/api/whatsapp/conversations/${conversationId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.success) {
        showToast('error', j?.error || 'The follow-up could not be sent')
        return
      }
      showToast('success', 'Follow-up sent. When the client replies, you can write freely again.')
      onSent(j.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="status">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>
            The client {since}. WhatsApp only allows an approved template now; a typed message would not be delivered.
          </p>
          {state.templates.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {state.templates.map(t => (
                <span key={t.language} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => send(t.language)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1 text-xs font-medium text-white hover:bg-[#20bd5a] disabled:opacity-50"
                  >
                    {busy === t.language ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send follow-up ({FOLLOW_UP_LANGUAGE_NAMES[t.language]})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(p => (p === t.language ? null : t.language))}
                    className="text-xs underline underline-offset-2"
                    aria-expanded={preview === t.language}
                  >
                    {preview === t.language ? 'Hide text' : 'See text'}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1">
              No follow-up template is set up yet.{' '}
              <Link href="/settings/whatsapp" className="underline underline-offset-2">Add one in Settings → WhatsApp</Link>, or reach the client by email or phone.
            </p>
          )}
          {preview && (
            <p className="mt-2 whitespace-pre-line rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-700">
              {state.templates.find(t => t.language === preview)?.body}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
