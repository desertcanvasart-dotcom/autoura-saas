'use client'

// Super-admin support inbox — list on the left, conversation on the right.
// Polls every 10s (the super admin is not a tenant member, so tenant-scoped
// realtime doesn't reach here; polling is plenty for a support inbox).

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Loader2, CheckCircle2, RotateCcw } from 'lucide-react'

interface Preview {
  body: string
  sender_type: string
  created_at: string
}
interface Conversation {
  id: string
  tenant_id: string
  status: 'open' | 'closed'
  last_message_at: string
  tenant: { company_name?: string; contact_email?: string } | null
  lastMessage: Preview | null
}
interface Message {
  id: string
  sender_type: 'tenant' | 'support'
  body: string
  created_at: string
}

const POLL_MS = 10000

export default function SupportInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/support')
      const json = await res.json()
      if (json.success) setConversations(json.conversations)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/super-admin/support/${id}`)
      const json = await res.json()
      if (json.success) setMessages(json.messages)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    loadList()
    const t = setInterval(loadList, POLL_MS)
    return () => clearInterval(t)
  }, [loadList])

  useEffect(() => {
    if (!selectedId) return
    loadConversation(selectedId)
    const t = setInterval(() => loadConversation(selectedId), POLL_MS)
    return () => clearInterval(t)
  }, [selectedId, loadConversation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const selected = conversations.find((c) => c.id === selectedId) || null

  const sendReply = async () => {
    const text = reply.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/super-admin/support/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const json = await res.json()
      if (json.success) {
        setMessages((prev) => [...prev, json.message])
        setReply('')
        setNotice(json.notified ? null : 'Sent in chat — but the email notification to the tenant failed.')
        loadList()
      } else {
        setNotice(json.error || 'Reply failed')
      }
    } catch {
      setNotice('Reply failed')
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (status: 'open' | 'closed') => {
    if (!selectedId) return
    await fetch(`/api/super-admin/support/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadList()
    setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, status } : c)))
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-green-400" /> Support Inbox
      </h1>

      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-160px)]">
        {/* Conversation list */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-y-auto">
          {loadingList && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          )}
          {!loadingList && conversations.length === 0 && (
            <p className="text-gray-500 text-sm p-4">No support conversations yet.</p>
          )}
          {conversations.map((c) => {
            const needsReply = c.lastMessage?.sender_type === 'tenant' && c.status === 'open'
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/40 transition-colors ${
                  selectedId === c.id ? 'bg-gray-700/60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium truncate">
                    {c.tenant?.company_name || c.tenant?.contact_email || c.tenant_id.slice(0, 8)}
                  </span>
                  {needsReply && <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {c.lastMessage ? `${c.lastMessage.sender_type === 'support' ? 'You: ' : ''}${c.lastMessage.body}` : '—'}
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {new Date(c.last_message_at).toLocaleString()} · {c.status}
                </p>
              </button>
            )
          })}
        </div>

        {/* Conversation detail */}
        <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-xl flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selected.tenant?.company_name || 'Unknown tenant'}
                  </p>
                  <p className="text-xs text-gray-400">{selected.tenant?.contact_email}</p>
                </div>
                {selected.status === 'open' ? (
                  <button
                    onClick={() => setStatus('closed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Close
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus('open')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_type === 'support' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        m.sender_type === 'support'
                          ? 'bg-green-900/40 text-green-100 rounded-br-sm'
                          : 'bg-gray-700 text-white rounded-bl-sm'
                      }`}
                    >
                      {m.body}
                      <span className="block text-[10px] opacity-50 mt-1">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {notice && <p className="px-4 py-1 text-xs text-amber-400">{notice}</p>}

              <div className="p-3 border-t border-gray-700 flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendReply()
                    }
                  }}
                  rows={2}
                  placeholder="Reply as Autoura Support…"
                  className="flex-1 resize-none px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="w-10 h-10 rounded-xl bg-green-700 text-white flex items-center justify-center disabled:opacity-50 hover:bg-green-600 transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
