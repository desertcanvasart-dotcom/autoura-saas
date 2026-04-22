'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import UnifiedConversationComposer from '@/components/unified/UnifiedConversationComposer'

interface Message {
  id: string
  channel: 'whatsapp' | 'email'
  content: string
  subject?: string
  direction: 'inbound' | 'outbound'
  message_at: string
  status?: string
  is_read?: boolean
  media_url?: string
  media_type?: string
  attachments?: any[]
}

interface Conversation {
  id: string
  contact_name: string
  contact_email: string | null
  contact_phone: string | null
  whatsapp_conversation_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_message_channel: string | null
  unread_messages: number
  total_messages: number
  is_starred: boolean
  status: string
  client?: {
    id: string
    full_name: string
    email: string
    phone: string
    nationality?: string
  }
  assigned_to?: {
    id: string
    name: string
    email: string
  }
  messages?: Message[]
}

export default function ConversationsPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [channelFilter, setChannelFilter] = useState('all')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        ...(searchTerm && { search: searchTerm }),
        ...(channelFilter !== 'all' && { channel: channelFilter })
      })

      const res = await fetch(`/api/conversations?${params}`)
      const data = await res.json()

      if (data.success) {
        setConversations(data.data || [])
      } else {
        setError(data.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchTerm, channelFilter])

  // Fetch single conversation with messages
  const fetchConversation = async (id: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/conversations/${id}?include_messages=true`)
      const data = await res.json()

      if (data.success) {
        setSelectedConversation(data.data)

        // Mark as read
        if (data.data.unread_messages > 0) {
          await fetch(`/api/conversations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark_read' })
          })
          // Update local state
          setConversations(prev =>
            prev.map(c => c.id === id ? { ...c, unread_messages: 0 } : c)
          )
        }
      }
    } catch (err: any) {
      console.error('Error fetching conversation:', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  // Toggle star
  const toggleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const conv = conversations.find(c => c.id === id)
    if (!conv) return

    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: conv.is_starred ? 'unstar' : 'star' })
    })

    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, is_starred: !c.is_starred } : c)
    )
  }

  // Initial fetch
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation?.messages])

  // Format time
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  // Get channel icon
  const getChannelIcon = (channel: string | null) => {
    switch (channel) {
      case 'whatsapp': return '📱'
      case 'email': return '✉️'
      default: return '💬'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading conversations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Unified view of WhatsApp and Email communications
            </p>
          </div>
          <button
            onClick={async () => {
              const res = await fetch('/api/conversations/sync-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 50 })
              })
              const data = await res.json()
              if (data.success) {
                alert(`Synced ${data.data.synced} emails`)
                fetchConversations()
              } else {
                alert(data.error || 'Sync failed')
              }
            }}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Sync Emails
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Panel - Conversation List */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          {/* Search & Filters */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
              >
                <option value="all">All Channels</option>
                <option value="whatsapp">WhatsApp Only</option>
                <option value="email">Email Only</option>
              </select>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <span className="text-4xl">💬</span>
                <p className="mt-2 font-medium">No conversations</p>
                <p className="text-sm">Conversations will appear here when customers message you</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => fetchConversation(conv.id)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedConversation?.id === conv.id ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                        {conv.contact_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-semibold truncate ${conv.unread_messages > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                            {conv.contact_name || 'Unknown'}
                          </h3>
                          {conv.unread_messages > 0 && (
                            <span className="px-2 py-0.5 bg-primary-500 text-white text-xs font-bold rounded-full">
                              {conv.unread_messages}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                          <span>{getChannelIcon(conv.last_message_channel)}</span>
                          <span className="truncate">
                            {conv.last_message_preview || 'No messages yet'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          {conv.contact_phone && (
                            <span>📱 {conv.contact_phone.slice(-4)}</span>
                          )}
                          {conv.contact_email && (
                            <span className="truncate">✉️ {conv.contact_email}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className="text-xs text-gray-400">
                        {formatTime(conv.last_message_at)}
                      </span>
                      <button
                        onClick={(e) => toggleStar(conv.id, e)}
                        className="text-lg hover:scale-110 transition-transform"
                      >
                        {conv.is_starred ? '⭐' : '☆'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Conversation Detail */}
        <div className="flex-1 flex flex-col bg-gray-100">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold text-xl">
                      {selectedConversation.contact_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedConversation.contact_name || 'Unknown'}
                      </h2>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        {selectedConversation.contact_phone && (
                          <span>📱 {selectedConversation.contact_phone}</span>
                        )}
                        {selectedConversation.contact_email && (
                          <span>✉️ {selectedConversation.contact_email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedConversation.client && (
                      <a
                        href={`/clients/${selectedConversation.client.id}`}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        View Client
                      </a>
                    )}
                    <button
                      onClick={() => toggleStar(selectedConversation.id, { stopPropagation: () => {} } as React.MouseEvent)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {selectedConversation.is_starred ? '⭐' : '☆'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading messages...</p>
                  </div>
                ) : selectedConversation.messages?.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <span className="text-4xl">💬</span>
                    <p className="mt-2">No messages yet</p>
                    <p className="text-sm">Start the conversation below</p>
                  </div>
                ) : (
                  <>
                    {selectedConversation.messages?.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                            msg.direction === 'outbound'
                              ? 'bg-primary-500 text-white rounded-br-md'
                              : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                          }`}
                        >
                          {/* Channel indicator */}
                          <div className={`flex items-center gap-1 text-xs mb-1 ${
                            msg.direction === 'outbound' ? 'text-primary-200' : 'text-gray-400'
                          }`}>
                            <span>{getChannelIcon(msg.channel)}</span>
                            <span className="capitalize">{msg.channel}</span>
                            {msg.subject && (
                              <span className="ml-1">· {msg.subject}</span>
                            )}
                          </div>

                          {/* Message content */}
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                          {/* Media attachment */}
                          {msg.media_url && (
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block mt-2 text-sm underline ${
                                msg.direction === 'outbound' ? 'text-primary-200' : 'text-primary-500'
                              }`}
                            >
                              View attachment ({msg.media_type || 'file'})
                            </a>
                          )}

                          {/* Timestamp */}
                          <div className={`text-xs mt-1 ${
                            msg.direction === 'outbound' ? 'text-primary-200' : 'text-gray-400'
                          }`}>
                            {new Date(msg.message_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                            {msg.direction === 'outbound' && msg.status && (
                              <span className="ml-2">
                                {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Channel-aware composer: rich email + copilot, or WhatsApp + copilot */}
              {user?.id && (
                <UnifiedConversationComposer
                  conversation={{
                    id: selectedConversation.id,
                    contact_name: selectedConversation.contact_name,
                    contact_email: selectedConversation.contact_email,
                    contact_phone: selectedConversation.contact_phone,
                    whatsapp_conversation_id: selectedConversation.whatsapp_conversation_id,
                  }}
                  userId={user.id}
                  onSent={() => {
                    fetchConversation(selectedConversation.id)
                    fetchConversations()
                  }}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <span className="text-6xl">💬</span>
                <p className="mt-4 text-xl font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Choose a conversation from the list to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
