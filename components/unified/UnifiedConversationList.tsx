'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Loader2, Mail, Archive, User } from 'lucide-react'
import ChannelBadge from './ChannelBadge'

interface Conversation {
  id: string
  thread_id: string
  client_email: string
  client_name?: string
  subject: string
  last_message_snippet: string
  last_message_at: string
  unread_count: number
  status: string
  client?: { full_name?: string }
}

interface Props {
  onSelectConversation: (conv: Conversation) => void
  selectedConversationId?: string
  userId?: string
}

export default function UnifiedConversationList({ onSelectConversation, selectedConversationId, userId }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'active' | 'archived'>('active')

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: filter })
      if (search) params.set('search', search)
      const res = await fetch(`/api/email/conversations?${params}`)
      const data = await res.json()
      if (data.success) setConversations(data.conversations || [])
    } catch {} finally { setLoading(false) }
  }, [filter, search])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(fetchConversations, 300)
    return () => clearTimeout(timer)
  }, [fetchConversations])

  const handleSync = async () => {
    if (!userId) return
    setSyncing(true)
    try {
      await fetch('/api/email/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, max_results: 50, days_back: 30 }),
      })
      fetchConversations()
    } catch {} finally { setSyncing(false) }
  }

  const timeAgo = (date: string) => {
    if (!date) return ''
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800">Email Conversations</h2>
          <button onClick={handleSync} disabled={syncing} className="p-1.5 text-gray-400 hover:text-[#647C47] rounded-lg hover:bg-gray-100">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 border-none rounded-lg focus:bg-white focus:ring-1 focus:ring-[#647C47] outline-none" />
        </div>
        <div className="flex gap-1 mt-2">
          <button onClick={() => setFilter('active')} className={`px-2.5 py-1 text-xs rounded-full ${filter === 'active' ? 'bg-[#647C47] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Active</button>
          <button onClick={() => setFilter('archived')} className={`px-2.5 py-1 text-xs rounded-full ${filter === 'archived' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            <Archive className="w-3 h-3 inline mr-1" />Archived
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No conversations found
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedConversationId === conv.id ? 'bg-[#647C47]/5 border-l-2 border-l-[#647C47]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {conv.client?.full_name || conv.client_name || conv.client_email || 'Unknown'}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="bg-[#647C47] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">{conv.unread_count}</span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-700 truncate">{conv.subject || '(no subject)'}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message_snippet}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-gray-400">{timeAgo(conv.last_message_at)}</span>
                  <ChannelBadge channel="email" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
