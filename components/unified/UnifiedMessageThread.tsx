'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Mail, Star, Archive, User, Send } from 'lucide-react'
import EmailReplyComposer from './EmailReplyComposer'
import { useAuth } from '@/app/contexts/AuthContext'

interface Message {
  id: string
  message_id: string
  direction: 'inbound' | 'outbound'
  from_address: string
  to_addresses: string[]
  subject: string
  body_html: string | null
  body_text: string | null
  snippet: string
  sent_at: string
  is_read: boolean
  is_starred: boolean
  attachments: any[]
}

interface Conversation {
  id: string
  thread_id: string
  client_email: string
  client_name?: string
  subject: string
  unread_count: number
  client?: { full_name?: string }
}

interface Props {
  conversation: Conversation | null
  onConversationUpdate?: (conv: Conversation) => void
}

export default function UnifiedMessageThread({ conversation, onConversationUpdate }: Props) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const refreshMessages = () => {
    if (!conversation) return
    fetch(`/api/email/messages?conversation_id=${conversation.id}`)
      .then(res => res.json())
      .then(data => { if (data.success) setMessages(data.messages || []) })
      .catch(() => {})
  }

  useEffect(() => {
    if (!conversation) { setMessages([]); return }
    setLoading(true)
    fetch(`/api/email/messages?conversation_id=${conversation.id}`)
      .then(res => res.json())
      .then(data => { if (data.success) setMessages(data.messages || []) })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Mark as read
    if (conversation.unread_count > 0) {
      fetch('/api/email/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id, action: 'mark_read' }),
      })
    }
  }, [conversation?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleArchive = async () => {
    if (!conversation) return
    await fetch('/api/email/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversation.id, action: 'archive' }),
    })
    if (onConversationUpdate) onConversationUpdate({ ...conversation, unread_count: 0 })
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a conversation to view messages</p>
        </div>
      </div>
    )
  }

  const formatDate = (date: string) => new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Thread header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">{conversation.subject || '(no subject)'}</h3>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <User className="w-3 h-3" />
            {conversation.client?.full_name || conversation.client_name || conversation.client_email}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleArchive} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Archive">
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No messages yet</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                msg.direction === 'outbound'
                  ? 'bg-[#647C47]/10 border border-[#647C47]/20'
                  : 'bg-gray-100 border border-gray-200'
              }`}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {msg.direction === 'outbound' ? 'You' : msg.from_address.split('<')[0].trim() || msg.from_address}
                  </span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(msg.sent_at)}</span>
                </div>
                {msg.body_html ? (
                  <div className="text-sm text-gray-700 prose prose-sm max-w-none [&_*]:!text-sm [&_img]:!max-w-full"
                    dangerouslySetInnerHTML={{ __html: msg.body_html }} />
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body_text || msg.snippet}</p>
                )}
                {msg.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.attachments.map((att: any, i: number) => (
                      <span key={i} className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
                        {att.filename || `Attachment ${i + 1}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inline reply composer with AI copilot */}
      {user?.id && (
        <EmailReplyComposer
          conversation={conversation}
          userId={user.id}
          onSent={refreshMessages}
        />
      )}
    </div>
  )
}
