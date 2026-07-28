'use client'

// Floating support chat — the tenant side of the in-app support thread.
//
// Lazy: nothing is fetched until the panel is first opened, and no
// conversation exists until the first message is sent. Replies arrive live
// via Supabase Realtime (support_messages is in the realtime publication;
// RLS scopes the subscription to the tenant's own rows). A green dot marks
// replies that arrive while the panel is closed.

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Loader2 } from 'lucide-react'
import { createClient } from '@/app/supabase'

interface ChatMessage {
  id: string
  sender_type: 'tenant' | 'support'
  body: string
  created_at: string
}

export default function SupportChatWidget() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const openRef = useRef(open)
  openRef.current = open

  const appendUnique = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
  }, [])

  // Initial load on first open.
  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    fetch('/api/support/thread')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setMessages(json.messages || [])
          setConversationId(json.conversation?.id || null)
          setLoaded(true)
        } else {
          setError(json.error || 'Could not load support chat')
        }
      })
      .catch(() => setError('Could not load support chat'))
      .finally(() => setLoading(false))
  }, [open, loaded])

  // Live replies.
  useEffect(() => {
    if (!conversationId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`support-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage
          appendUnique(msg)
          if (msg.sender_type === 'support' && !openRef.current) setHasUnread(true)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, appendUnique])

  useEffect(() => {
    if (open) {
      setHasUnread(false)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const json = await res.json()
      if (json.success) {
        appendUnique(json.message)
        if (!conversationId) setConversationId(json.conversationId)
        setInput('')
      } else {
        setError(json.error || 'Message failed to send')
      }
    } catch {
      setError('Message failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close support chat' : 'Open support chat'}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[#2d3b2d] text-white shadow-lg hover:bg-[#3d4b3d] transition-colors flex items-center justify-center"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {hasUnread && !open && (
          <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-80 sm:w-96 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-[#2d3b2d] text-white">
            <p className="font-semibold text-sm">Autoura Support</p>
            <p className="text-xs text-white/70">We reply here and by email</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
            {!loading && messages.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                How can we help? Send us a message and we&apos;ll get back to you.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_type === 'tenant' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.sender_type === 'tenant'
                      ? 'bg-[#2d3b2d] text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && <p className="px-4 py-1 text-xs text-red-600">{error}</p>}

          <div className="p-3 border-t border-gray-200 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder="Type a message…"
              className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="w-9 h-9 rounded-xl bg-[#2d3b2d] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#3d4b3d] transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
