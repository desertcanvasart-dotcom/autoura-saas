'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ClientTripMessage } from '@/lib/itinerary-share'

// ============================================
// TRIP CHAT — the traveller side of the thread
// ============================================
// Messages the office, reads replies. Polls gently while the page is open;
// the server sanitizer (toClientTripMessages) is the data boundary — this
// component only ever sees direction/content/senderName/createdAt.

export default function TripChat({
  token,
  brandHex,
  operatorName,
  initialMessages,
}: {
  token: string
  brandHex: string
  operatorName: string
  initialMessages: ClientTripMessage[]
}) {
  const [messages, setMessages] = useState<ClientTripMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [name, setName] = useState('')
  const [askName, setAskName] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}/messages`)
      const data = await res.json()
      if (res.ok && data.success) setMessages(data.messages)
    } catch {
      // Polling — a failed cycle just waits for the next one.
    }
  }, [token])

  useEffect(() => {
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  const send = async () => {
    if (sending || !draft.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/share/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim(), name: name.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not send')
      if (data.message) setMessages(prev => [...prev, data.message])
      setDraft('')
      setAskName(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send — try again')
    } finally {
      setSending(false)
    }
  }

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Messages</h2>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              Need anything during your trip? Write to {operatorName || 'your operator'} here — replies show up on this page.
            </p>
          ) : (
            <ol className="space-y-2">
              {messages.map((m, i) => (
                <li key={i} className={`flex ${m.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === 'inbound' ? 'text-white' : 'bg-gray-100 text-gray-900'
                    }`}
                    style={m.direction === 'inbound' ? { background: brandHex } : undefined}
                  >
                    <p className="whitespace-pre-line break-words">{m.content}</p>
                    <p className={`mt-1 text-[10px] ${m.direction === 'inbound' ? 'text-white/70' : 'text-gray-500'}`}>
                      {m.direction === 'outbound' && m.senderName ? `${m.senderName} · ` : ''}{fmtTime(m.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          {askName && (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              placeholder="Your name (optional)"
              className="mb-2 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: brandHex }}
            />
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={() => { if (messages.length === 0) setAskName(true) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              maxLength={2000}
              placeholder="Write a message…"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: brandHex }}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
              style={{ background: brandHex }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  )
}
