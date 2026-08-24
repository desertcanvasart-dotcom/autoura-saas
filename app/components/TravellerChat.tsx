'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'

// ============================================
// TRAVELLER CHAT — the office side of the trip thread
// ============================================
// The same thread the traveller sees on the share page. Opening it marks
// their messages read (the GET does that); replies go out under the team
// member's own name. Polls while the page is open, like TripTimeline.

interface TripMessage {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sender_name: string | null
  is_read: boolean
  created_at: string
}

export default function TravellerChat({ itineraryId }: { itineraryId: string }) {
  const [messages, setMessages] = useState<TripMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/messages`)
      const data = await res.json()
      if (res.ok && data.success) setMessages(data.messages)
    } catch {
      // Polling — a failed cycle just waits for the next one.
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    fetchMessages()
    const t = setInterval(fetchMessages, 30000)
    return () => clearInterval(t)
  }, [fetchMessages])

  // Reading happens when a human SEES the thread, not when it mounts —
  // expanding an /ops row (or an itinerary page where this card sits below
  // the fold) must not silently clear the office's unread signal. The PATCH
  // fires once per view; the mig 292 trigger keeps the inbox badge in step.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const markedRef = useRef(false)
  const markRead = useCallback(() => {
    if (markedRef.current) return
    markedRef.current = true
    fetch(`/api/itineraries/${itineraryId}/messages`, { method: 'PATCH' }).catch(() => {
      markedRef.current = false
    })
  }, [itineraryId])
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) markRead() },
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [markRead])

  const send = async () => {
    if (sending || !draft.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send')
      setMessages(prev => [...prev, data.message])
      setDraft('')
      markRead() // replying is reading, even if the observer never fired
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
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

  // No thread yet and nothing to say? Stay quiet — the composer is the
  // invitation, the empty state should not shout.
  return (
    <div ref={rootRef} className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Traveller chat</h3>
        <span className="text-xs text-gray-400">shared with the traveller&rsquo;s trip page</span>
      </div>

      <div className="px-4 py-3 max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            No messages yet. Anything you send here appears on the traveller&rsquo;s trip page.
          </p>
        ) : (
          <ol className="space-y-2">
            {messages.map(m => (
              <li key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.direction === 'outbound'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="whitespace-pre-line break-words">{m.content}</p>
                  <p className={`mt-1 text-[10px] ${m.direction === 'outbound' ? 'text-white/70' : 'text-gray-500'}`}>
                    {m.sender_name ? `${m.sender_name} · ` : ''}{fmtTime(m.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            maxLength={2000}
            placeholder="Reply to the traveller…"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
