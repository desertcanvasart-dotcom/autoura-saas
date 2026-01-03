'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MessageSquare, Send, Search, Phone, User, Clock,
  Sparkles, RefreshCw, Plus, CheckCheck, Check, 
  AlertCircle, X, Languages, ChevronDown, Loader2,
  Trash2, UserPlus, Users, History, ArrowRight,
  Settings, Filter, UserCheck, UserX
} from 'lucide-react'

// Supported languages
const QUICK_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
]

interface SalesAgent {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  is_available: boolean
  current_conversations: number
  max_conversations: number
}

interface Conversation {
  id: string
  phone_number: string
  client_id: string | null
  client_name: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  status: string
  assigned_agent_id: string | null
  assigned_at: string | null
  assigned_agent?: SalesAgent | null
  last_agent?: SalesAgent | null
  clients?: {
    id: string
    full_name: string
    email: string
    client_code: string
  } | null
}

interface Message {
  id: string
  conversation_id: string
  message_sid: string
  direction: 'inbound' | 'outbound'
  message_body: string
  media_url: string | null
  status: string
  sent_at: string
}

interface Activity {
  id: string
  conversation_id: string
  agent_id: string | null
  action_type: string
  action_details: any
  created_at: string
  agent?: SalesAgent | null
}

// ============================================
// AGENT AVATAR COMPONENT
// ============================================
function AgentAvatar({ agent, size = 'sm' }: { agent: SalesAgent | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
  }

  if (!agent) {
    return (
      <div className={`${sizeClasses[size]} bg-gray-200 rounded-full flex items-center justify-center`}>
        <User className="w-3 h-3 text-gray-400" />
      </div>
    )
  }

  if (agent.avatar_url) {
    return (
      <img 
        src={agent.avatar_url} 
        alt={agent.name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    )
  }

  const initials = agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500']
  const colorIndex = agent.name.charCodeAt(0) % colors.length

  return (
    <div className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium`}>
      {initials}
    </div>
  )
}

// ============================================
// AGENT SELECTOR DROPDOWN
// ============================================
function AgentSelector({ 
  agents, 
  selectedAgent, 
  onSelect, 
  onClaim,
  isLoading 
}: { 
  agents: SalesAgent[]
  selectedAgent: SalesAgent | null
  onSelect: (agentId: string | null) => void
  onClaim: () => void
  isLoading: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : selectedAgent ? (
          <>
            <AgentAvatar agent={selectedAgent} size="sm" />
            <span className="font-medium truncate max-w-[100px]">{selectedAgent.name}</span>
          </>
        ) : (
          <>
            <UserX className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">Unassigned</span>
          </>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            {/* Claim Button */}
            <button
              onClick={() => { onClaim(); setIsOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-green-50 text-green-700 border-b border-gray-100"
            >
              <UserPlus className="w-4 h-4" />
              <span className="font-medium">Claim for myself</span>
            </button>

            {/* Unassign Option */}
            <button
              onClick={() => { onSelect(null); setIsOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
            >
              <UserX className="w-4 h-4 text-gray-400" />
              <span>Unassign</span>
            </button>

            {/* Agent List */}
            <div className="py-1">
              <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">Assign to</p>
              {agents.filter(a => a.is_active).map(agent => (
                <button
                  key={agent.id}
                  onClick={() => { onSelect(agent.id); setIsOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                    selectedAgent?.id === agent.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <AgentAvatar agent={agent} size="sm" />
                  <div className="flex-1 text-left">
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-xs text-gray-500">
                      {agent.current_conversations}/{agent.max_conversations} chats
                      {!agent.is_available && ' • Away'}
                    </p>
                  </div>
                  {selectedAgent?.id === agent.id && (
                    <Check className="w-4 h-4 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================
// ACTIVITY PANEL
// ============================================
function ActivityPanel({ 
  activities, 
  isLoading 
}: { 
  activities: Activity[]
  isLoading: boolean 
}) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'claimed': return <UserPlus className="w-3.5 h-3.5 text-green-500" />
      case 'assigned': return <UserCheck className="w-3.5 h-3.5 text-blue-500" />
      case 'auto_assigned': return <Users className="w-3.5 h-3.5 text-purple-500" />
      case 'transferred': return <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
      case 'unassigned': return <UserX className="w-3.5 h-3.5 text-gray-400" />
      case 'replied': return <MessageSquare className="w-3.5 h-3.5 text-green-500" />
      case 'status_changed': return <Settings className="w-3.5 h-3.5 text-gray-500" />
      default: return <History className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  const getActionText = (activity: Activity) => {
    const agentName = activity.agent?.name || 'Unknown'
    switch (activity.action_type) {
      case 'claimed': return `${agentName} claimed this conversation`
      case 'assigned': return `Assigned to ${agentName}`
      case 'auto_assigned': return `Auto-assigned to ${agentName}`
      case 'transferred': return `Transferred to ${agentName}`
      case 'unassigned': return 'Conversation unassigned'
      case 'replied': return `${agentName} replied`
      case 'status_changed': return `Status changed by ${agentName}`
      default: return activity.action_type
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMins = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No activity yet
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
      {activities.map(activity => (
        <div key={activity.id} className="flex items-start gap-2 text-xs">
          <div className="mt-0.5">{getActionIcon(activity.action_type)}</div>
          <div className="flex-1">
            <p className="text-gray-700">{getActionText(activity)}</p>
            <p className="text-gray-400">{formatTime(activity.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// DELETE CONFIRMATION MODAL
// ============================================
function DeleteConfirmationModal({
  conversation,
  onConfirm,
  onCancel,
  isDeleting
}: {
  conversation: Conversation
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}) {
  const displayName = conversation.client_name || conversation.clients?.full_name || conversation.phone_number

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Delete Conversation</h3>
              <p className="text-sm text-gray-600">This action will hide the conversation</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-700 mb-4">Are you sure you want to delete the conversation with:</p>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{displayName}</p>
                <p className="text-sm text-gray-500">{conversation.phone_number}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> The conversation will be hidden from your inbox. 
              Messages are not permanently deleted - they will reappear if the customer sends a new message.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button onClick={onCancel} disabled={isDeleting} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2">
            {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</> : <><Trash2 className="w-4 h-4" />Delete</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// AGENTS MANAGEMENT MODAL
// ============================================
function AgentsManagementModal({
  agents,
  onClose,
  onRefresh
}: {
  agents: SalesAgent[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentEmail, setNewAgentEmail] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const addAgent = async () => {
    if (!newAgentName.trim()) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName.trim(), email: newAgentEmail.trim() || null })
      })
      if (res.ok) {
        setNewAgentName('')
        setNewAgentEmail('')
        onRefresh()
      }
    } catch (error) {
      console.error('Error adding agent:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const toggleAgentAvailability = async (agent: SalesAgent) => {
    try {
      await fetch('/api/whatsapp/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_available: !agent.is_available })
      })
      onRefresh()
    } catch (error) {
      console.error('Error updating agent:', error)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to deactivate this agent?')) return
    try {
      await fetch(`/api/whatsapp/agents?id=${agentId}`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-bold text-gray-900">Sales Agents</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6">
          {/* Add New Agent */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Add New Agent</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="email"
                value={newAgentEmail}
                onChange={(e) => setNewAgentEmail(e.target.value)}
                placeholder="Email (optional)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={addAgent}
                disabled={!newAgentName.trim() || isAdding}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Agent List */}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {agents.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No agents yet. Add one above.</p>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className={`flex items-center gap-3 p-3 rounded-lg border ${agent.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
                  <AgentAvatar agent={agent} size="md" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">
                      {agent.email || 'No email'} • {agent.current_conversations} active chats
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAgentAvailability(agent)}
                      className={`px-2 py-1 text-xs rounded-full ${
                        agent.is_available 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {agent.is_available ? 'Available' : 'Away'}
                    </button>
                    <button
                      onClick={() => deleteAgent(agent.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function WhatsAppInboxPage() {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState('')

  // Agents state
  const [agents, setAgents] = useState<SalesAgent[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null) // The logged-in agent
  const [showAgentsModal, setShowAgentsModal] = useState(false)
  const [assigningConversation, setAssigningConversation] = useState(false)

  // Activity state
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  // Filter state
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'unassigned'>('all')

  // Delete state
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Translation state
  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [translatedMessage, setTranslatedMessage] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [customerLanguage, setCustomerLanguage] = useState('es')
  const [showLanguageSelector, setShowLanguageSelector] = useState(false)
  const [incomingTranslations, setIncomingTranslations] = useState<Record<string, string>>({})
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set())
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({})

  const getLanguageInfo = (code: string) => QUICK_LANGUAGES.find(l => l.code === code) || { code, name: code, flag: '🌐' }

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/agents')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
    }
  }, [])

  // Fetch conversations
  const fetchConversations = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    try {
      let url = `/api/whatsapp/conversations?search=${searchQuery}`
      if (filterMode === 'mine' && currentAgentId) {
        url += `&agent_id=${currentAgentId}`
      } else if (filterMode === 'unassigned') {
        url += '&unassigned_only=true'
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [searchQuery, filterMode, currentAgentId])

  // Fetch messages
  const fetchMessages = useCallback(async (conversationId: string, showLoader = true) => {
    if (showLoader) setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?conversation_id=${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      if (showLoader) setMessagesLoading(false)
    }
  }, [])

  // Fetch activity
  const fetchActivity = useCallback(async (conversationId: string) => {
    setActivitiesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/activity?conversation_id=${conversationId}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setActivities(data.activities || [])
      }
    } catch (error) {
      console.error('Error fetching activity:', error)
    } finally {
      setActivitiesLoading(false)
    }
  }, [])

  // Assign conversation
  const assignConversation = async (agentId: string | null, action: string = 'assign') => {
    if (!selectedConversation) return
    setAssigningConversation(true)
    try {
      const res = await fetch('/api/whatsapp/conversations/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          agent_id: agentId,
          action
        })
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedConversation(data.conversation)
        setConversations(prev => prev.map(c => c.id === data.conversation.id ? data.conversation : c))
        fetchActivity(selectedConversation.id)
      }
    } catch (error) {
      console.error('Error assigning conversation:', error)
    } finally {
      setAssigningConversation(false)
    }
  }

  // Claim conversation
  const claimConversation = () => {
    if (currentAgentId) {
      assignConversation(currentAgentId, 'claim')
    } else {
      alert('Please set yourself as an agent first in the Agents settings')
      setShowAgentsModal(true)
    }
  }

  // Mark as read
  const markAsRead = async (conversationId: string) => {
    try {
      await fetch('/api/whatsapp/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, action: 'mark_read' })
      })
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c))
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  // Delete conversation
  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/whatsapp/conversations?id=${conversationToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== conversationToDelete.id))
        if (selectedConversation?.id === conversationToDelete.id) {
          setSelectedConversation(null)
          setMessages([])
        }
        setConversationToDelete(null)
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // Translation functions
  const translateOutgoing = async (text: string, targetLang: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: targetLang, action: 'fromEnglish' })
      })
      const data = await res.json()
      return data.success && data.data?.translatedText ? data.data.translatedText : null
    } catch { return null }
  }

  const translateIncoming = async (text: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, action: 'toEnglish' })
      })
      const data = await res.json()
      return data.success && data.data?.translatedText ? data.data.translatedText : null
    } catch { return null }
  }

  const handleTranslateMessage = async (messageId: string, messageBody: string) => {
    if (incomingTranslations[messageId] || translatingMessageIds.has(messageId)) return
    setTranslatingMessageIds(prev => new Set(prev).add(messageId))
    const translation = await translateIncoming(messageBody)
    if (translation) setIncomingTranslations(prev => ({ ...prev, [messageId]: translation }))
    setTranslatingMessageIds(prev => { const s = new Set(prev); s.delete(messageId); return s })
  }

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation || sending) return
    setSending(true)
    try {
      let messageToSend = newMessage.trim()
      if (translationEnabled && translatedMessage) messageToSend = translatedMessage
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: selectedConversation.id, message: messageToSend })
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, data.message])
        setNewMessage('')
        setTranslatedMessage('')
        setConversations(prev => prev.map(c => 
          c.id === selectedConversation.id ? { ...c, last_message: messageToSend, last_message_at: new Date().toISOString() } : c
        ))
        // Log reply activity
        if (currentAgentId) {
          fetch('/api/whatsapp/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: selectedConversation.id,
              agent_id: currentAgentId,
              action_type: 'replied'
            })
          })
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  // Start new conversation
  const startNewConversation = async () => {
    if (!newPhoneNumber.trim()) return
    try {
      const res = await fetch('/api/whatsapp/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: newPhoneNumber.trim() })
      })
      if (res.ok) {
        const data = await res.json()
        setShowNewChat(false)
        setNewPhoneNumber('')
        fetchConversations(false)
        setSelectedConversation(data.conversation)
        fetchMessages(data.conversation.id, true)
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }

  // Parse conversation
  const parseConversation = () => {
    if (!selectedConversation || messages.length === 0) return
    const conversationText = messages.map(m => `${m.direction === 'inbound' ? 'Client' : 'Agent'}: ${m.message_body}`).join('\n')
    const encoded = btoa(unescape(encodeURIComponent(conversationText)))
    router.push(`/whatsapp-parser?conversation=${encoded}&encoded=base64&clientId=${selectedConversation.client_id || ''}&phone=${selectedConversation.phone_number}`)
  }

  // Select conversation
  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv)
    fetchMessages(conv.id, true)
    fetchActivity(conv.id)
    if (conv.unread_count > 0) markAsRead(conv.id)
    setNewMessage('')
    setTranslatedMessage('')
    setIncomingTranslations({})
    setShowOriginalMap({})
  }

  // Effects
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { fetchConversations(true); fetchAgents() }, [])
  useEffect(() => { const t = setTimeout(() => fetchConversations(false), 300); return () => clearTimeout(t) }, [searchQuery, filterMode])
  useEffect(() => {
    if (!translationEnabled || !newMessage.trim()) { setTranslatedMessage(''); setIsTranslating(false); return }
    setIsTranslating(true)
    const t = setTimeout(async () => {
      const result = await translateOutgoing(newMessage.trim(), customerLanguage)
      setTranslatedMessage(result || '')
      setIsTranslating(false)
    }, 500)
    return () => clearTimeout(t)
  }, [newMessage, customerLanguage, translationEnabled])
  useEffect(() => {
    if (translationEnabled && messages.length > 0) {
      messages.forEach(msg => { if (msg.direction === 'inbound' && !incomingTranslations[msg.id]) handleTranslateMessage(msg.id, msg.message_body) })
    }
  }, [translationEnabled, messages])
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(false)
      if (selectedConversation) fetchMessages(selectedConversation.id, false)
    }, 15000)
    return () => clearInterval(interval)
  }, [selectedConversation?.id])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' })
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
      case 'sent': return <Check className="w-3.5 h-3.5 text-gray-400" />
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-300" />
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100">
      {/* Modals */}
      {conversationToDelete && <DeleteConfirmationModal conversation={conversationToDelete} onConfirm={handleDeleteConversation} onCancel={() => setConversationToDelete(null)} isDeleting={isDeleting} />}
      {showAgentsModal && <AgentsManagementModal agents={agents} onClose={() => setShowAgentsModal(false)} onRefresh={fetchAgents} />}

      {/* Conversations List */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-gray-900">WhatsApp Inbox</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAgentsModal(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Manage Agents">
                <Users className="w-4 h-4" />
              </button>
              <button onClick={() => fetchConversations(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setShowNewChat(true)} className="p-2 text-white bg-[#25D366] hover:bg-[#20bd5a] rounded-lg">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-lg">
            {[
              { key: 'all', label: 'All' },
              { key: 'mine', label: 'Mine' },
              { key: 'unassigned', label: 'Unassigned' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterMode(tab.key as any)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterMode === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25D366]"></div></div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-500"><MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p className="text-sm">No conversations</p></div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`group p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${selectedConversation?.id === conv.id ? 'bg-[#25D366]/10' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                    {/* Agent badge */}
                    {conv.assigned_agent && (
                      <div className="absolute -bottom-1 -right-1">
                        <AgentAvatar agent={conv.assigned_agent} size="sm" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.client_name || conv.clients?.full_name || conv.phone_number}</p>
                      <div className="flex items-center gap-1">
                        {conv.last_message_at && <span className="text-xs text-gray-500">{formatTime(conv.last_message_at)}</span>}
                        <button onClick={(e) => { e.stopPropagation(); setConversationToDelete(conv) }} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity ml-1" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate pr-2">{conv.last_message || 'No messages yet'}</p>
                      {conv.unread_count > 0 && <span className="px-1.5 py-0.5 text-xs font-medium bg-[#25D366] text-white rounded-full">{conv.unread_count}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{conv.phone_number}</p>
                      {!conv.assigned_agent && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Unassigned</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-gray-500" /></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedConversation.client_name || selectedConversation.clients?.full_name || selectedConversation.phone_number}</p>
                    <p className="text-xs text-gray-500">{selectedConversation.phone_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Agent Selector */}
                  <AgentSelector
                    agents={agents}
                    selectedAgent={selectedConversation.assigned_agent || null}
                    onSelect={(agentId) => assignConversation(agentId, agentId ? 'assign' : 'unassign')}
                    onClaim={claimConversation}
                    isLoading={assigningConversation}
                  />
                  {/* Activity Toggle */}
                  <button onClick={() => setShowActivity(!showActivity)} className={`p-2 rounded-lg ${showActivity ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Activity History">
                    <History className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConversationToDelete(selectedConversation) }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={parseConversation} disabled={messages.length === 0} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    <Sparkles className="w-4 h-4" />Parse
                  </button>
                  {selectedConversation.client_id ? (
                    <Link href={`/clients/${selectedConversation.client_id}`} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"><User className="w-4 h-4" />Client</Link>
                  ) : (
                    <Link href={`/clients/new?phone=${selectedConversation.phone_number}`} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4" />Create</Link>
                  )}
                </div>
              </div>
              {/* Activity Panel (collapsible) */}
              {showActivity && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 uppercase">Activity History</span>
                  </div>
                  <ActivityPanel activities={activities} isLoading={activitiesLoading} />
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]" style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAABKUlEQVR4nO2YQQ6CMBBF/924cKNXcOFGt3oKvYgLXegFPIArY7yJC1mY6E4MxKhgS0vRQL9k0oQ0M/nJn06BKIqiKIqiqH/BAIANAD+ICsADwArACYAJgH0AVwBaECUAngG4A7AEcATgGIBd+N4WwCWASwBXAB4h2gPwAMAnhN0BuAFwBeAGwCWEXQC4AXAB4QjAJYArAE8QzgGcQzgDcALh8gfuIdwDOIFwdgT3Ee4hHB3BHYRtCPsj2IawPYKvIdz8wE2E6yO4DWHV/0J9hJsjuIqwagT3EJaNYNUIHiPsNII7CMtEcP0/uQ9hZwRXIywTwXWEZSK4irD0H7mOsNQfuYGw1B+5hbDEH7mNsMgfuYuw8B+5j7DAH3mAsNMfuYuwwB95hLCg79EH3ANr+B8AAAAASUVORK5CYII=")' }}>
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25D366]"></div></div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full"><p className="text-gray-500 bg-white/80 px-4 py-2 rounded-lg">No messages yet</p></div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => {
                    const isInbound = msg.direction === 'inbound'
                    const hasTranslation = isInbound && incomingTranslations[msg.id]
                    const isTranslatingThis = translatingMessageIds.has(msg.id)
                    const showOriginal = showOriginalMap[msg.id]
                    return (
                      <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${msg.direction === 'outbound' ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                          {isInbound && translationEnabled && (
                            <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-200">
                              {isTranslatingThis ? <span className="flex items-center gap-1 text-xs text-blue-500"><Loader2 className="w-3 h-3 animate-spin" />Translating...</span>
                                : hasTranslation ? <button onClick={() => setShowOriginalMap(p => ({ ...p, [msg.id]: !p[msg.id] }))} className="text-xs text-blue-600 hover:text-blue-700">{showOriginal ? '🇬🇧 Show English' : '🌐 Show Original'}</button>
                                : <button onClick={() => handleTranslateMessage(msg.id, msg.message_body)} className="text-xs text-blue-600 hover:text-blue-700">🌐 Translate</button>}
                            </div>
                          )}
                          <p className="text-sm text-gray-900 whitespace-pre-wrap">{isInbound && hasTranslation && !showOriginal ? incomingTranslations[msg.id] : msg.message_body}</p>
                          {isInbound && hasTranslation && !showOriginal && <p className="text-xs text-gray-400 mt-1 italic">Original: {msg.message_body}</p>}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs text-gray-500">{new Date(msg.sent_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Translation Controls */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setTranslationEnabled(!translationEnabled); setTranslatedMessage('') }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${translationEnabled ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}>
                    <Languages className="w-4 h-4" />{translationEnabled ? 'Translation ON' : 'Translate'}
                  </button>
                  {translationEnabled && (
                    <div className="relative">
                      <button onClick={() => setShowLanguageSelector(!showLanguageSelector)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        <span>{getLanguageInfo(customerLanguage).flag}</span><span>{getLanguageInfo(customerLanguage).name}</span><ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                      {showLanguageSelector && (
                        <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                          {QUICK_LANGUAGES.filter(l => l.code !== 'en').map(lang => (
                            <button key={lang.code} onClick={() => { setCustomerLanguage(lang.code); setShowLanguageSelector(false); setTranslatedMessage('') }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${customerLanguage === lang.code ? 'bg-blue-50 text-blue-700' : ''}`}>
                              <span>{lang.flag}</span><span>{lang.name}</span>{customerLanguage === lang.code && <Check className="w-4 h-4 ml-auto" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {translationEnabled && newMessage && (
                  <div className="text-xs">
                    {isTranslating ? <span className="flex items-center gap-1 text-blue-600"><Loader2 className="w-3.5 h-3.5 animate-spin" />Translating...</span>
                      : translatedMessage ? <span className="flex items-center gap-1 text-green-600"><Check className="w-3.5 h-3.5" />Ready in {getLanguageInfo(customerLanguage).name}</span>
                      : <span className="text-gray-400">Type to translate</span>}
                  </div>
                )}
              </div>
              {translationEnabled && translatedMessage && !isTranslating && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium mb-1">{getLanguageInfo(customerLanguage).flag} Will send:</p>
                  <p className="text-sm text-gray-700">{translatedMessage}</p>
                </div>
              )}
            </div>

            {/* Message Input */}
            <form onSubmit={sendMessage} className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center gap-3">
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={translationEnabled ? `Type in English → sends in ${getLanguageInfo(customerLanguage).name}` : "Type a message..."} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25D366]" />
                <button type="submit" disabled={!newMessage.trim() || sending || (translationEnabled && isTranslating)} className="p-2.5 bg-[#25D366] text-white rounded-full hover:bg-[#20bd5a] disabled:opacity-50">
                  {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4"><MessageSquare className="w-8 h-8 text-gray-400" /></div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">WhatsApp Business</h2>
              <p className="text-sm text-gray-500">Select a conversation to start messaging</p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400"><Users className="w-4 h-4" /><span>{agents.length} agents active</span></div>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">New Conversation</h2>
              <button onClick={() => setShowNewChat(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-gray-400" />
                <input type="tel" value={newPhoneNumber} onChange={(e) => setNewPhoneNumber(e.target.value)} placeholder="+1234567890" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]" />
              </div>
              <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +20 for Egypt)</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewChat(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={startNewConversation} disabled={!newPhoneNumber.trim()} className="px-4 py-2 text-sm bg-[#25D366] text-white rounded-lg hover:bg-[#20bd5a] disabled:opacity-50">Start Chat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}