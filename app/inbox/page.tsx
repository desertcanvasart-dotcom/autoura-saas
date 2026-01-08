'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import RichTextEditor from '@/components/email/RichTextEditor'
// NEW IMPORTS FOR GMAIL ENHANCEMENTS
import AttachmentList, { AttachmentIndicator } from '@/components/AttachmentList'
import ClientLinkButton from '@/components/ClientLinkButton'
import { useEmailPolling, useEmailCache } from '@/lib/use-email-polling'
import { replacePlaceholders, buildPlaceholderData, getPlaceholders } from '@/lib/template-placeholders'
import { 
  Mail, 
  Inbox, 
  Send, 
  Search, 
  RefreshCw, 
  Loader2,
  Star,
  Paperclip,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  File,
  Trash2,
  Archive,
  MoreHorizontal,
  Minus,
  Image,
  FileText,
  FileImage,
  FileArchive,
  Signature,
  FolderPlus,
  Tag,
  MailOpen,
  Move,
  CheckSquare,
  Square,
  Bell,
  Users, 
  Building2, 
  Expand, 
  Maximize2,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/app/supabase'

// Email body formatter - converts ■ bullets to styled lists
function formatEmailBody(html: string): string {
  if (!html) return ''

  const lines = html.split(/<br\s*\/?>/gi)
  let processedLines: string[] = []
  let inList = false
  let listItems: string[] = []

  lines.forEach((line) => {
    const trimmed = line.trim()
    const bulletMatch = trimmed.match(/^[■●•◦▪▸►‣⁃\-–—\*]\s*(.+)/)
    
    if (bulletMatch) {
      if (!inList) {
        inList = true
        listItems = []
      }
      const content = bulletMatch[1].trim()
      // Check for Key: Value pattern
      const kvMatch = content.match(/^([^:]+):\s*(.+)$/)
      if (kvMatch) {
        listItems.push(`<strong>${kvMatch[1]}:</strong> ${kvMatch[2]}`)
      } else {
        listItems.push(content)
      }
    } else {
      if (inList) {
        processedLines.push(`<ul class="email-list">${listItems.map(i => `<li>${i}</li>`).join('')}</ul>`)
        inList = false
        listItems = []
      }
      
      if (trimmed) {
        const headerMatch = trimmed.match(/^\[([^\]]+)\]$/)
        if (headerMatch) {
          processedLines.push(`<h3 class="email-section">${headerMatch[1]}</h3>`)
        } else {
          processedLines.push(`<p>${trimmed}</p>`)
        }
      }
    }
  })

  if (inList && listItems.length > 0) {
    processedLines.push(`<ul class="email-list">${listItems.map(i => `<li>${i}</li>`).join('')}</ul>`)
  }

  return processedLines.join('')
}

// UPDATED: Email interface with attachments
interface Email {
  id: string
  threadId: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  isUnread: boolean
  labelIds?: string[]
  // NEW: Attachments support
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }>
}

interface Attachment {
  filename: string
  mimeType: string
  data: string
  size: number
}

interface EmailSignature {
  id: string
  name: string
  content: string
  is_default: boolean
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
  channel?: string 
}

interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
  color?: {
    backgroundColor: string
    textColor: string
  }
}

// NEW: Client interface for template placeholders
interface Client {
  id: string
  name: string
  email: string
  phone?: string
}

type FilterType = 'all' | 'unread' | 'starred'
type FolderType = 'inbox' | 'sent' | 'drafts'

export default function InboxPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [showExpandedEmail, setShowExpandedEmail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [folder, setFolder] = useState<FolderType>('inbox')
  const [starredEmails, setStarredEmails] = useState<Set<string>>(new Set())
  const [isFolderCollapsed, setIsFolderCollapsed] = useState(false)
  
  const [customLabels, setCustomLabels] = useState<GmailLabel[]>([])
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)

  // NEW: State for polling notifications
  const [showNewEmailBanner, setShowNewEmailBanner] = useState(false)
  const [newEmailCount, setNewEmailCount] = useState(0)

  // NEW: State for clients (for template placeholders)
  const [clients, setClients] = useState<Client[]>([])
  
  const supabase = createClient()

  // NEW: Email polling hook for real-time updates
  const {
    isPolling,
    unreadCount,
    newEmailCount: polledNewCount,
    refresh: pollRefresh,
    clearNewEmailCount,
    historyId
  } = useEmailPolling({
    userId: user?.id || null,
    enabled: isConnected && !!user,
    interval: 120000, // Poll every 2 minutes
    onNewEmails: (newEmails) => {
      console.log('New emails received:', newEmails.length)
      setNewEmailCount(prev => prev + newEmails.length)
      setShowNewEmailBanner(true)
      
      // Add new emails to the list if we're in inbox
      if (folder === 'inbox') {
        setEmails(prev => {
          const newIds = new Set(newEmails.map(e => e.id))
          const filtered = prev.filter(e => !newIds.has(e.id))
          return [...newEmails.map(e => ({
            ...e,
            body: '',
            attachments: []
          } as Email)), ...filtered]
        })
      }
    },
    onDeletedEmails: (deletedIds) => {
      setEmails(prev => prev.filter(e => !deletedIds.includes(e.id)))
      if (selectedEmail && deletedIds.includes(selectedEmail.id)) {
        setSelectedEmail(null)
      }
    },
    onNeedRefresh: () => {
      fetchEmails()
    }
  })

  // NEW: Email caching hook
  const { getCached, cache, updateCached, removeCached, isCacheReady } = useEmailCache(user?.id || null)

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
      fetchLabels()
      fetchClients() // NEW: Fetch clients for template placeholders
    }
  }, [user])

  const checkConnectionAndFetchEmails = async () => {
    try {
      const { data } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user?.id)
        .single()

      if (!data) {
        setIsConnected(false)
        setLoading(false)
        return
      }

      setIsConnected(true)
      setConnectedEmail(data.email || '')
      await fetchEmails()
    } catch (err) {
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchLabels = async () => {
    if (!user) return
    try {
      const response = await fetch(`/api/gmail/labels?userId=${user.id}`)
      const data = await response.json()
      if (data.labels) {
        setCustomLabels(data.labels.filter((l: GmailLabel) => l.type === 'user'))
      }
    } catch (err) {
      console.error('Error fetching labels:', err)
    }
  }

  // NEW: Fetch clients for template placeholder replacement
  const fetchClients = async () => {
    if (!user) return
    try {
      const response = await fetch(`/api/clients?userId=${user.id}&limit=100`)
      const data = await response.json()
      if (data.clients) {
        setClients(data.clients)
      }
    } catch (err) {
      console.error('Error fetching clients:', err)
    }
  }

  // UPDATED: fetchEmails with caching and attachment parsing
  const fetchEmails = async (query?: string, targetFolder?: FolderType) => {
    if (!user) return
    
    setRefreshing(true)
    const currentFolder = targetFolder || folder

    try {
      // TRY CACHE FIRST (if no search query)
      if (!query && isCacheReady) {
        const cached = await getCached(currentFolder, { limit: 50 })
        if (cached.fromCache && !cached.isStale) {
          console.log('Using cached emails for', currentFolder)
          setEmails(cached.emails as Email[])
          setRefreshing(false)
          // Still fetch fresh in background
          fetchFreshEmails(query, currentFolder, true)
          return
        }
      }
      
      await fetchFreshEmails(query, currentFolder, false)
    } catch (err: any) {
      setError(err.message)
      setRefreshing(false)
    }
  }

  // NEW: Helper function to fetch fresh emails from API
  const fetchFreshEmails = async (query?: string, currentFolder?: FolderType, isBackground = false) => {
    if (!user) return
    
    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '50',
      })
      
      const folderToUse = currentFolder || folder
      let folderQuery = query || ''

      if (folderToUse === 'sent') {
        folderQuery = 'from:me ' + folderQuery
      } else if (folderToUse === 'drafts') {
        folderQuery = 'in:drafts ' + folderQuery
      } else {
        folderQuery = 'in:inbox -from:me ' + folderQuery
      }
      
      if (folderQuery) params.append('query', folderQuery.trim())

      const response = await fetch(`/api/gmail/emails?${params}`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // PARSE ATTACHMENTS from each email
      setEmails(data.messages || [])
      
      // Update starred set
      const starred = new Set<string>()
      data.messages.forEach((email: Email) => {
        if (email.labelIds?.includes('STARRED')) {
          starred.add(email.id)
        }
      })
      setStarredEmails(starred)
      
      // CACHE THE RESULTS
      if (isCacheReady && !query) {
        await cache(folderToUse, data.messages, historyId || undefined)
      }

      setError(null)
    } catch (err: any) {
      if (!isBackground) {
        setError(err.message)
      }
    } finally {
      if (!isBackground) {
        setRefreshing(false)
      }
    }
  }

  // NEW: Helper to parse attachments from Gmail API response
  const parseAttachments = (email: any): Email['attachments'] => {
    const attachments: Email['attachments'] = []
    
    const processPart = (part: any) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0
        })
      }
      if (part.parts) {
        part.parts.forEach(processPart)
      }
    }
    
    // Check different possible locations for parts
    if (email.payload?.parts) {
      email.payload.parts.forEach(processPart)
    } else if (email.parts) {
      email.parts.forEach(processPart)
    }
    
    return attachments
  }

  // NEW: Helper to extract email address from "Name <email>" format
  const extractEmailAddress = (fromString: string): string => {
    const match = fromString.match(/<(.+)>/)
    return match ? match[1] : fromString
  }
  const handleParseEmail = () => {
    if (!selectedEmail) return
    
    const senderName = extractName(selectedEmail.from)
    const bodyText = selectedEmail.body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    
    const conversationText = `From: ${senderName}
Subject: ${selectedEmail.subject}
Date: ${new Date(selectedEmail.date).toLocaleString()}

${bodyText}`
    
    const senderEmail = extractEmailAddress(selectedEmail.from)
    const matchedClient = clients.find(c => c.email?.toLowerCase() === senderEmail.toLowerCase())
    
    // Use base64 encoding to avoid URL issues with special characters
    const encodedConversation = btoa(unescape(encodeURIComponent(conversationText)))
    
    const params = new URLSearchParams({ 
      conversation: encodedConversation, 
      source: 'email',
      encoded: 'base64'
    })
    
    if (matchedClient) params.set('clientId', matchedClient.id)
    if (senderEmail) params.set('email', senderEmail)
    
    window.location.href = `/whatsapp-parser?${params.toString()}`
  }
  useEffect(() => {
    if (isConnected) {
      fetchEmails(searchQuery, folder)
    }
  }, [folder])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEmails(searchQuery)
  }

  const handleRefresh = () => {
    setShowNewEmailBanner(false)
    setNewEmailCount(0)
    clearNewEmailCount()
    fetchEmails(searchQuery)
  }

  const toggleStar = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStarredEmails(prev => {
      const next = new Set(prev)
      if (next.has(emailId)) {
        next.delete(emailId)
      } else {
        next.add(emailId)
      }
      return next
    })
  }

  const handleEmailAction = async (
    action: string, 
    messageIds?: string[], 
    labelId?: string
  ) => {
    if (!user) return
    
    const ids = messageIds || (selectedEmail ? [selectedEmail.id] : Array.from(selectedEmails))
    if (ids.length === 0) return
  
    setActionLoading(true)
    try {
      const response = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messageIds: ids, action, labelId }),
      })
  
      const data = await response.json()
      if (data.error) throw new Error(data.error)

      // UPDATE CACHE after action
      if (isCacheReady) {
        if (action === 'delete' || action === 'archive') {
          await removeCached(ids)
        } else if (action === 'markRead') {
          for (const id of ids) {
            await updateCached(id, { isUnread: false })
          }
        } else if (action === 'markUnread') {
          for (const id of ids) {
            await updateCached(id, { isUnread: true })
          }
        }
      }
  
      await fetchEmails()
      setSelectedEmail(null)
      setSelectedEmails(new Set())
      setShowMoveMenu(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }
  
  const handleDelete = () => handleEmailAction('delete')
  const handleArchive = () => handleEmailAction('archive')
  const handleMarkRead = () => handleEmailAction('markRead')
  const handleMarkUnread = () => handleEmailAction('markUnread')
  const handleStarEmail = () => handleEmailAction('star')
  const handleUnstarEmail = () => handleEmailAction('unstar')
  const handleMoveToLabel = (labelId: string) => {
    handleEmailAction('move', undefined, labelId)
  }
  
  const toggleEmailSelection = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEmails(prev => {
      const next = new Set(prev)
      if (next.has(emailId)) {
        next.delete(emailId)
      } else {
        next.add(emailId)
      }
      return next
    })
  }
  
  const selectAllEmails = () => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set())
    } else {
      setSelectedEmails(new Set(filteredEmails.map(e => e.id)))
    }
  }
  
  const decodeHtmlEntities = (text: string) => {
    return text
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
  }

  // Filtering and Grouping Logic
  const filteredEmails = emails.filter(email => {
    if (filter === 'unread') return email.isUnread
    if (filter === 'starred') return starredEmails.has(email.id)
    return true
  })

  const groupEmailsByDate = (emails: Email[]) => {
    const groups: Record<string, Email[]> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    emails.forEach(email => {
      const emailDate = new Date(email.date)
      emailDate.setHours(0, 0, 0, 0)
      
      let group: string
      if (emailDate.getTime() === today.getTime()) {
        group = 'Today'
      } else if (emailDate.getTime() === yesterday.getTime()) {
        group = 'Yesterday'
      } else if (emailDate > weekAgo) {
        group = 'This Week'
      } else {
        group = 'Earlier'
      }

      if (!groups[group]) groups[group] = []
      groups[group].push(email)
    })

    return groups
  }

  const groupedEmails = groupEmailsByDate(filteredEmails)

  // Helper functions
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
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

  const extractName = (emailString: string) => {
    const match = emailString.match(/^"?([^"<]+)"?\s*</)
    return match ? match[1].trim() : emailString.split('@')[0]
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
      'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-teal-500'
    ]
    const hash = email.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const isFromMe = (email: Email) => {
    return connectedEmail && email.from.toLowerCase().includes(connectedEmail.toLowerCase())
  }

  const getDisplayName = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      return extractName(email.to)
    }
    return extractName(email.from)
  }

  const getDisplayEmail = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      return email.to
    }
    return email.from
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <Mail className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Gmail</h2>
          <p className="text-gray-500 mb-6">
            Connect your Gmail account to send and receive emails directly from Autoura.
          </p>
          <Link
            href="/settings/email"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Connect Gmail
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50/50">
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary-600" />
                Inbox
                {/* NEW: Polling indicator - hidden
               {isPolling && (
             <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Checking for new emails..." />
               )}
                */}
                {/* NEW: Unread count badge */}
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>

            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full h-9 pl-10 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white outline-none transition-colors"
                />
              </div>
            </form>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowCompose(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                Compose
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* NEW: New Email Notification Banner */}
      {showNewEmailBanner && newEmailCount > 0 && (
        <div className="bg-primary-50 border-b border-primary-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-primary-700">
              {newEmailCount} new email{newEmailCount > 1 ? 's' : ''} received
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Refresh to view
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mr-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex-shrink-0">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden pr-4">
        {/* Folders Sidebar */}
        <div className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${isFolderCollapsed ? 'w-12' : 'w-48'}`}>
          <div className="p-2 flex flex-col h-full">
            <button
              onClick={() => setIsFolderCollapsed(!isFolderCollapsed)}
              className="mb-2 p-1.5 hover:bg-gray-100 rounded-md transition-colors self-end"
            >
              {isFolderCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              )}
            </button>

            <nav className="space-y-1">
              {[
                { id: 'inbox' as FolderType, label: 'Inbox', icon: Inbox, count: unreadCount },
                { id: 'sent' as FolderType, label: 'Sent', icon: Send, count: 0 },
                { id: 'drafts' as FolderType, label: 'Drafts', icon: File, count: 0 },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFolder(item.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    folder === item.id
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  } ${isFolderCollapsed ? 'justify-center' : ''}`}
                  title={isFolderCollapsed ? item.label : ''}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${folder === item.id ? 'text-primary-600' : 'text-gray-400'}`} />
                  {!isFolderCollapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === 'inbox' && item.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          folder === item.id ? 'bg-primary-200 text-primary-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {item.count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </nav>

            {!isFolderCollapsed && customLabels.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Folders
                </p>
                <nav className="space-y-0.5">
                  {customLabels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => fetchEmails(`label:${label.name}`)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Tag className="w-3.5 h-3.5 text-gray-400" />
                      <span className="flex-1 text-left truncate">{label.name}</span>
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {!isFolderCollapsed && (
              <button
                onClick={() => setShowLabelModal(true)}
                className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                <span>New Folder</span>
              </button>
            )}

            {!isFolderCollapsed && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Filters</p>
                <nav className="space-y-0.5">
                  {[
                    { id: 'all' as FilterType, label: 'All Mail' },
                    { id: 'unread' as FilterType, label: 'Unread' },
                    { id: 'starred' as FilterType, label: 'Starred' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setFilter(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                        filter === item.id
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* Email List */}
        <div className={`${selectedEmail ? 'w-2/5' : 'flex-1'} bg-white border-r border-gray-200 overflow-y-auto`}>
          
          {/* Bulk Actions Bar */}
          {filteredEmails.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
              <button
                onClick={selectAllEmails}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title={selectedEmails.size === filteredEmails.length ? 'Deselect all' : 'Select all'}
              >
                {selectedEmails.size === filteredEmails.length && selectedEmails.size > 0 ? (
                  <CheckSquare className="w-4 h-4 text-primary-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
              </button>
              
              {selectedEmails.size > 0 && (
                <>
                  <span className="text-xs text-gray-500">
                    {selectedEmails.size} selected
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={handleArchive}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={handleMarkRead}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Mark as read"
                    >
                      <MailOpen className="w-4 h-4 text-gray-500" />
                    </button>
                    
                    <div className="relative">
                      <button
                        onClick={() => setShowMoveMenu(showMoveMenu ? null : 'bulk')}
                        disabled={actionLoading || customLabels.length === 0}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title="Move to folder"
                      >
                        <Move className="w-4 h-4 text-gray-500" />
                      </button>
                      {showMoveMenu === 'bulk' && (
                        <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          {customLabels.map((label) => (
                            <button
                              key={label.id}
                              onClick={() => handleMoveToLabel(label.id)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Tag className="w-3.5 h-3.5 text-gray-400" />
                              {label.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Email List Content */}
          {filteredEmails.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                {folder === 'sent' ? (
                  <Send className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                ) : (
                  <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                )}
                <p className="text-sm font-medium text-gray-600">
                  {folder === 'sent' ? 'No sent emails' : 'No emails found'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {folder === 'sent' ? 'Emails you send will appear here' : 'Try adjusting your search or filters'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {Object.entries(groupedEmails).map(([group, groupEmails]) => (
                <div key={group}>
                  <div className="sticky top-[41px] px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group}</span>
                  </div>
                  {groupEmails.map((email) => {
                    const displayName = getDisplayName(email)
                    const displayEmail = getDisplayEmail(email)
                    const isSentByMe = folder === 'sent' || isFromMe(email)
                    const isStarred = starredEmails.has(email.id)
                    const isSelected = selectedEmails.has(email.id)
                    
                    return (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmail(email)}
                        className={`group px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                          selectedEmail?.id === email.id
                            ? 'bg-primary-50'
                            : isSelected
                            ? 'bg-blue-50'
                            : email.isUnread && !isSentByMe
                            ? 'bg-blue-50/50 hover:bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={(e) => toggleEmailSelection(email.id, e)}
                            className="mt-0.5 p-0.5 hover:bg-gray-200 rounded transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                            )}
                          </button>

                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-medium ${getAvatarColor(displayEmail)}`}>
                            {getInitials(displayName)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSentByMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium flex-shrink-0">
                                    To
                                  </span>
                                )}
                                <span className={`text-sm truncate ${email.isUnread && !isSentByMe ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                  {displayName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* NEW: Attachment indicator in email list */}
                                {email.attachments && email.attachments.length > 0 && (
                                  <AttachmentIndicator count={email.attachments.length} />
                                )}
                                <button
                                  onClick={(e) => toggleStar(email.id, e)}
                                  className={`p-0.5 rounded transition-colors ${
                                    isStarred ? 'text-yellow-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-yellow-500' : ''}`} />
                                </button>
                                <span className="text-[11px] text-gray-500">
                                  {formatDate(email.date)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {email.isUnread && !isSentByMe && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                              )}
                              <p className={`text-xs truncate ${email.isUnread && !isSentByMe ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                                {decodeHtmlEntities(email.subject || '(No subject)')}
                              </p>
                            </div>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">
                              {decodeHtmlEntities(email.snippet)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Detail Panel */}
        {selectedEmail && (
          <div className="flex-1 bg-white overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleArchive}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                    title="Archive"
                  >
                    <Archive className="w-4 h-4 text-gray-500" />
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button 
                    onClick={() => selectedEmail.isUnread ? handleMarkRead() : handleMarkUnread()}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                    title={selectedEmail.isUnread ? 'Mark as read' : 'Mark as unread'}
                  >
                    {selectedEmail.isUnread ? (
                      <MailOpen className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Mail className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  
                  {customLabels.length > 0 && (
                    <div className="relative">
                      <button 
                        onClick={() => setShowMoveMenu(showMoveMenu === 'detail' ? null : 'detail')}
                        disabled={actionLoading}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                        title="Move to folder"
                      >
                        <Move className="w-4 h-4 text-gray-500" />
                      </button>
                      {showMoveMenu === 'detail' && (
                        <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          {customLabels.map((label) => (
                            <button
                              key={label.id}
                              onClick={() => handleMoveToLabel(label.id)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Tag className="w-3.5 h-3.5 text-gray-400" />
                              {label.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Parse Email Button */}
                  <button
                    onClick={handleParseEmail}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Parse to Itinerary"
                  >
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="More">
                    <MoreHorizontal className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                   {/* Expand Button */}
                 <button
                  onClick={() => setShowExpandedEmail(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Expand email"
                   >
                 <Maximize2 className="w-4 h-4 text-gray-500" />
                 </button>
                     <button
                   onClick={() => setSelectedEmail(null)}
                   className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                     <X className="w-4 h-4 text-gray-500" />
                      </button>
                   </div>
              </div>

              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
              </h2>
              
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
                {folder === 'sent' || isFromMe(selectedEmail) ? (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(selectedEmail.to)}`}>
                      {getInitials(extractName(selectedEmail.to))}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded font-medium">Sent</span>
                        <p className="font-medium text-gray-900">To: {extractName(selectedEmail.to)}</p>
                      </div>
                      <p className="text-xs text-gray-500">{extractEmailAddress(selectedEmail.to)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(selectedEmail.from)}`}>
                      {getInitials(extractName(selectedEmail.from))}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{extractName(selectedEmail.from)}</p>
                        {/* NEW: Client Link Button */}
                        <ClientLinkButton
                          userId={user!.id}
                          messageId={selectedEmail.id}
                          threadId={selectedEmail.threadId}
                          fromEmail={extractEmailAddress(selectedEmail.from)}
                        />
                      </div>
                      <p className="text-xs text-gray-500">{extractEmailAddress(selectedEmail.from)}</p>
                    </div>
                  </>
                )}
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date(selectedEmail.date).toLocaleString()}</p>
                  {folder !== 'sent' && !isFromMe(selectedEmail) && (
                    <p className="text-xs text-gray-400">To: me</p>
                  )}
                </div>
              </div>

              <div 
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: formatEmailBody(selectedEmail.body) }}
            />

              {/* NEW: Attachment List */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <AttachmentList
                  attachments={selectedEmail.attachments}
                  messageId={selectedEmail.id}
                  userId={user!.id}
                />
              )}

              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowCompose(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  {folder === 'sent' || isFromMe(selectedEmail) ? 'Forward' : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Expanded Email Modal */}
{showExpandedEmail && selectedEmail && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${
            folder === 'sent' || isFromMe(selectedEmail) 
              ? getAvatarColor(selectedEmail.to) 
              : getAvatarColor(selectedEmail.from)
          }`}>
            {folder === 'sent' || isFromMe(selectedEmail) 
              ? getInitials(extractName(selectedEmail.to))
              : getInitials(extractName(selectedEmail.from))
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              {(folder === 'sent' || isFromMe(selectedEmail)) && (
                <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded font-medium">Sent</span>
              )}
              <p className="font-medium text-gray-900">
                {folder === 'sent' || isFromMe(selectedEmail) 
                  ? `To: ${extractName(selectedEmail.to)}`
                  : extractName(selectedEmail.from)
                }
              </p>
              {!(folder === 'sent' || isFromMe(selectedEmail)) && (
                <ClientLinkButton
                  userId={user!.id}
                  messageId={selectedEmail.id}
                  threadId={selectedEmail.threadId}
                  fromEmail={extractEmailAddress(selectedEmail.from)}
                />
              )}
            </div>
            <p className="text-xs text-gray-500">
              {folder === 'sent' || isFromMe(selectedEmail)
                ? extractEmailAddress(selectedEmail.to)
                : extractEmailAddress(selectedEmail.from)
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(selectedEmail.date).toLocaleString()}
          </span>
          <button
            onClick={handleParseEmail}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Parse to Itinerary"
          >
            <Sparkles className="w-5 h-5 text-purple-500" />
          </button>
          <button
            onClick={() => setShowExpandedEmail(false)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Modal Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
          </h2>
          
          <div 
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
          />

          {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <AttachmentList
                attachments={selectedEmail.attachments}
                messageId={selectedEmail.id}
                userId={user!.id}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-2xl">
        <div className="flex items-center gap-2">
          <button 
            onClick={handleArchive}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title="Archive"
          >
            <Archive className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={handleDelete}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={() => selectedEmail.isUnread ? handleMarkRead() : handleMarkUnread()}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title={selectedEmail.isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            {selectedEmail.isUnread ? (
              <MailOpen className="w-4 h-4 text-gray-500" />
            ) : (
              <Mail className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
        
        <button
          onClick={() => {
            setShowExpandedEmail(false)
            setShowCompose(true)
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Send className="w-4 h-4" />
          {folder === 'sent' || isFromMe(selectedEmail) ? 'Forward' : 'Reply'}
        </button>
      </div>
    </div>
  </div>
)}

{/* Compose Modal */}
{showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          userId={user?.id || ''}
          replyTo={selectedEmail && folder !== 'sent' && !isFromMe(selectedEmail) ? selectedEmail : null}
          onSent={() => {
            setShowCompose(false)
            fetchEmails()
          }}
          clients={clients}
        />
      )}

      {/* Create Label Modal */}
      {showLabelModal && (
        <CreateLabelModal
          onClose={() => setShowLabelModal(false)}
          userId={user?.id || ''}
          onCreated={() => {
            setShowLabelModal(false)
            fetchLabels()
          }}
        />
      )}

      {/* Click outside to close move menu */}
      {showMoveMenu && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowMoveMenu(null)}
        />
      )}
    </div>
  )
}

// Helper functions
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.includes('pdf')) return FileText
  if (mimeType.includes('zip') || mimeType.includes('rar')) return FileArchive
  return File
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// UPDATED: Compose Modal Component with CLIENT + PARTNER template integration
// Replace your existing ComposeModal in app/inbox/page.tsx with this version

function ComposeModal({ 
  onClose, 
  userId, 
  replyTo,
  onSent,
  clients = []
}: { 
  onClose: () => void
  userId: string
  replyTo?: Email | null
  onSent: () => void
  clients?: Client[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  
  const extractEmailAddr = (from: string) => {
    const match = from.match(/<(.+)>/)
    return match ? match[1] : from
  }

  const [to, setTo] = useState(replyTo ? extractEmailAddr(replyTo.from) : '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  
  // State for template placeholder modal
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  
  // CLIENT state
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [loadingCRMData, setLoadingCRMData] = useState(false)
  const [clientItineraries, setClientItineraries] = useState<any[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('')
  const [crmPlaceholderData, setCrmPlaceholderData] = useState<Record<string, string>>({})
  
  // PARTNER state
  const [activeTab, setActiveTab] = useState<'client' | 'partner'>('client')
  const [partners, setPartners] = useState<any[]>([])
  const [selectedPartnerType, setSelectedPartnerType] = useState<string>('')
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [loadingPartnerData, setLoadingPartnerData] = useState(false)
  const [partnerPlaceholderData, setPartnerPlaceholderData] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, tempRes] = await Promise.all([
          fetch(`/api/email/signatures?userId=${userId}`),
          fetch(`/api/email/templates?userId=${userId}`)
        ])
        
        const sigData = await sigRes.json()
        const tempData = await tempRes.json()
        
        if (sigData.signatures) setSignatures(sigData.signatures)
        if (tempData.templates) setTemplates(tempData.templates)
        
        const defaultSig = sigData.signatures?.find((s: EmailSignature) => s.is_default)
        if (defaultSig) {
          setBody(`<p></p><br/>${defaultSig.content}`)
        }
      } catch (err) {
        console.error('Error fetching signatures/templates:', err)
      }
    }
    
    if (userId) fetchData()
  }, [userId])

  // Fetch partners when type changes
  const fetchPartners = async (type: string) => {
    if (!type) {
      setPartners([])
      return
    }

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners?type=${type}`)
      const data = await response.json()
      setPartners(data.partners || [])
    } catch (err) {
      console.error('Error fetching partners:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Fetch partner template data
  const fetchPartnerTemplateData = async (partnerId: string, type: string) => {
    if (!partnerId || !type) return

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners/${partnerId}/template-data?type=${type}`)
      const data = await response.json()
      
      if (data.placeholderData) {
        setPartnerPlaceholderData(data.placeholderData)
        
        // Auto-fill "To" field with partner email
        if (data.placeholderData.partner_email) {
          setTo(data.placeholderData.partner_email)
        }
      }
    } catch (err) {
      console.error('Error fetching partner template data:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Handle partner type change
  const handlePartnerTypeChange = (type: string) => {
    setSelectedPartnerType(type)
    setSelectedPartnerId('')
    setPartnerPlaceholderData({})
    fetchPartners(type)
  }

  // Handle partner selection
  const handlePartnerChange = (partnerId: string) => {
    setSelectedPartnerId(partnerId)
    if (partnerId && selectedPartnerType) {
      fetchPartnerTemplateData(partnerId, selectedPartnerType)
    }
  }

  // CLIENT functions (existing)
  const fetchClientCRMData = async (clientId: string) => {
    if (!clientId) {
      setClientItineraries([])
      setSelectedItineraryId('')
      setCrmPlaceholderData({})
      return
    }

    setLoadingCRMData(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/template-data?userId=${userId}`)
      const data = await response.json()
      
      if (data.error) {
        console.error('Error fetching CRM data:', data.error)
        return
      }

      setClientItineraries(data.allItineraries || [])
      
      if (data.latestItinerary) {
        setSelectedItineraryId(data.latestItinerary.id)
      }
      
      setCrmPlaceholderData(data.placeholderData || {})
      
      const client = clients.find(c => c.id === clientId)
      if (client?.email) {
        setTo(client.email)
      }

    } catch (err) {
      console.error('Error fetching client CRM data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const fetchItineraryData = async (clientId: string, itineraryId: string) => {
    if (!clientId || !itineraryId) return

    setLoadingCRMData(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/template-data?userId=${userId}&itineraryId=${itineraryId}`
      )
      const data = await response.json()
      
      if (data.placeholderData) {
        setCrmPlaceholderData(data.placeholderData)
      }
    } catch (err) {
      console.error('Error fetching itinerary data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setSelectedItineraryId('')
    fetchClientCRMData(clientId)
  }

  const handleItineraryChange = (itineraryId: string) => {
    setSelectedItineraryId(itineraryId)
    if (selectedClientId && itineraryId) {
      fetchItineraryData(selectedClientId, itineraryId)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const maxSize = 25 * 1024 * 1024

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      if (file.size > maxSize) {
        setError(`File "${file.name}" is too large. Maximum size is 25MB.`)
        continue
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(prev => [...prev, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
          size: file.size
        }])
      }
      reader.readAsDataURL(file)
    }

    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const insertSignature = (signature: EmailSignature) => {
    setBody(prev => `${prev}<br/>${signature.content}`)
    setShowSignatureDropdown(false)
  }

  const useTemplate = (template: EmailTemplate) => {
    const placeholders = getPlaceholders(template.content + ' ' + template.subject)
    
    if (placeholders.length > 0) {
      setSelectedTemplate(template)
      setPlaceholderValues({})
      if (!selectedClientId) {
        setCrmPlaceholderData({})
      }
      if (!selectedPartnerId) {
        setPartnerPlaceholderData({})
      }
      setShowPlaceholderModal(true)
    } else {
      setSubject(template.subject)
      setBody(template.content)
    }
    setShowTemplateDropdown(false)
  }

  const applyTemplateWithPlaceholders = () => {
    if (!selectedTemplate) return

    // Merge data: CRM client data + Partner data + manual overrides
    const finalData = { 
      ...crmPlaceholderData, 
      ...partnerPlaceholderData,
      ...placeholderValues 
    }

    const processedSubject = replacePlaceholders(selectedTemplate.subject, finalData)
    const processedContent = replacePlaceholders(selectedTemplate.content, finalData)

    setSubject(processedSubject)
    setBody(processedContent)
    setShowPlaceholderModal(false)
    setSelectedTemplate(null)
  }

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields')
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to,
          subject,
          body,
          threadId: replyTo?.threadId,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      onSent()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full transition-all duration-300 ${
        isExpanded ? 'sm:max-w-4xl sm:h-[85vh]' : 'sm:max-w-2xl'
      } max-h-[95vh] flex flex-col`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {replyTo ? 'Reply' : 'New Message'}
          </h3>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors hidden sm:block"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              <Minus className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              onClick={onClose} 
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="recipient@example.com"
            />
          </div>

          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Email subject"
            />
          </div>

               {/* Templates & Signatures */}
<div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
{templates.length > 0 && (
  <div className="relative">
    <button 
      onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} 
      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
    >
      <FileText className="w-3.5 h-3.5" />
      Templates
    </button>
    {showTemplateDropdown && (
      <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 max-h-96 overflow-y-auto">
        {['customer', 'partner', 'internal'].map(category => {
          const categoryTemplates = templates.filter(t => t.category === category)
          if (categoryTemplates.length === 0) return null
          
          return (
            <div key={category}>
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {category === 'customer' && '👤 Customer Templates'}
                  {category === 'partner' && '🏨 Partner Templates'}
                  {category === 'internal' && '📋 Internal Templates'}
                </span>
              </div>
              {categoryTemplates.map((template) => (
                <button 
                  key={template.id} 
                  onClick={() => template.channel !== 'whatsapp' && useTemplate(template)} 
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 ${
                    template.channel === 'whatsapp' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={template.channel === 'whatsapp' ? 'WhatsApp only - cannot use in email' : ''}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{template.name}</span>
                    {template.channel === 'whatsapp' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                        WA only
                      </span>
                    )}
                    {template.channel === 'both' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                        +WA
                      </span>
                    )}
                  </div>
                  {template.subject && (
                    <span className="block text-gray-500 truncate mt-0.5">
                      {template.subject}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )}
  </div>
)}
     
        {signatures.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => setShowSignatureDropdown(!showSignatureDropdown)} 
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <Signature className="w-3.5 h-3.5" />
                  Signatures
                </button>
                {showSignatureDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {signatures.map((sig) => (
                      <button 
                        key={sig.id} 
                        onClick={() => insertSignature(sig)} 
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{sig.name}</span>
                        {sig.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                            Default
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rich Text Editor */}
          <div className="flex-1 p-4">
            <RichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Write your message..."
              minHeight={isExpanded ? '350px' : '200px'}
              maxHeight={isExpanded ? '500px' : '300px'}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Attachments ({attachments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const FileIcon = getFileIcon(file.mimeType)
                  return (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200"
                    >
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">
                          {file.filename}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeAttachment(index)} 
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1">
            <input 
              ref={fileInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" 
            />
            <input 
              ref={imageInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept="image/*" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Attach file"
            >
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              onClick={() => imageInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Insert image"
            >
              <Image className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button 
              onClick={handleSend} 
              disabled={sending} 
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showSignatureDropdown || showTemplateDropdown) && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => { 
            setShowSignatureDropdown(false)
            setShowTemplateDropdown(false) 
          }} 
        />
      )}

      {/* Placeholder Modal with CLIENT + PARTNER tabs */}
      {showPlaceholderModal && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowPlaceholderModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Fill Template: {selectedTemplate.name}</h3>
              <button onClick={() => setShowPlaceholderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Tab selector */}
              <div className="flex border border-gray-200 rounded-lg p-1 bg-gray-50">
                <button
                  onClick={() => setActiveTab('client')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'client' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Client
                </button>
                <button
                  onClick={() => setActiveTab('partner')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'partner' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Partner
                </button>
              </div>

              {/* CLIENT TAB */}
              {activeTab === 'client' && (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                  <p className="text-xs font-semibold text-primary-800 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Load Client from CRM
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Select Client
                      </label>
                      <select
                        value={selectedClientId}
                       onChange={(e) => handleClientChange(e.target.value)}
                       className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                       >
                        <option value="">-- Select a client --</option>
                        {clients.map(client => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedClientId && clientItineraries.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Trip/Itinerary
                        </label>
                        <select
                          value={selectedItineraryId}
                          onChange={(e) => handleItineraryChange(e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                        >
                          <option value="">-- Select an itinerary --</option>
                          {clientItineraries.map((itin: any) => (
                            <option key={itin.id} value={itin.id}>
                              {itin.itinerary_code} - {itin.trip_name} ({itin.start_date})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedClientId && clientItineraries.length === 0 && !loadingCRMData && (
                      <p className="text-xs text-gray-500 italic">No itineraries found for this client</p>
                    )}

                    {loadingCRMData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading CRM data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded CLIENT values */}
              {activeTab === 'client' && selectedClientId && Object.keys(crmPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Client data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {crmPlaceholderData.client_name && (
                      <div><span className="text-gray-500">Client:</span> {crmPlaceholderData.client_name}</div>
                    )}
                    {crmPlaceholderData.trip_name && (
                      <div><span className="text-gray-500">Trip:</span> {crmPlaceholderData.trip_name}</div>
                    )}
                    {crmPlaceholderData.total && (
                      <div><span className="text-gray-500">Total:</span> {crmPlaceholderData.total}</div>
                    )}
                    {crmPlaceholderData.deposit && (
                      <div><span className="text-gray-500">Deposit:</span> {crmPlaceholderData.deposit}</div>
                    )}
                    {crmPlaceholderData.trip_dates && (
                      <div className="col-span-2"><span className="text-gray-500">Dates:</span> {crmPlaceholderData.trip_dates}</div>
                    )}
                  </div>
                </div>
              )}

              {/* PARTNER TAB */}
              {activeTab === 'partner' && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Load Partner from Resources
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Partner Type
                      </label>
                      <select
                         value={selectedPartnerType}
                         onChange={(e) => handlePartnerTypeChange(e.target.value)}
                         className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                           >
                        <option value="">-- Select type --</option>
                        <option value="hotel">🏨 Hotels</option>
                        <option value="guide">🧭 Tour Guides</option>
                        <option value="restaurant">🍽️ Restaurants</option>
                        <option value="airport_staff">✈️ Airport Staff</option>
                      </select>
                    </div>

                    {selectedPartnerType && partners.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Partner
                        </label>
                        <select
                          value={selectedPartnerId}
                          onChange={(e) => handlePartnerChange(e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        >
                          <option value="">-- Select partner --</option>
                          {partners.map((partner: any) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name} {partner.city ? `(${partner.city})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedPartnerType && partners.length === 0 && !loadingPartnerData && (
                      <p className="text-xs text-gray-500 italic">No {selectedPartnerType}s found</p>
                    )}

                    {loadingPartnerData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading partner data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded PARTNER values */}
              {activeTab === 'partner' && selectedPartnerId && Object.keys(partnerPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Partner data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {partnerPlaceholderData.partner_name && (
                      <div><span className="text-gray-500">Name:</span> {partnerPlaceholderData.partner_name}</div>
                    )}
                    {partnerPlaceholderData.partner_type && (
                      <div><span className="text-gray-500">Type:</span> {partnerPlaceholderData.partner_type}</div>
                    )}
                    {partnerPlaceholderData.contact_person && (
                      <div><span className="text-gray-500">Contact:</span> {partnerPlaceholderData.contact_person}</div>
                    )}
                    {partnerPlaceholderData.partner_email && (
                      <div><span className="text-gray-500">Email:</span> {partnerPlaceholderData.partner_email}</div>
                    )}
                    {partnerPlaceholderData.partner_phone && (
                      <div><span className="text-gray-500">Phone:</span> {partnerPlaceholderData.partner_phone}</div>
                    )}
                    {partnerPlaceholderData.partner_city && (
                      <div><span className="text-gray-500">City:</span> {partnerPlaceholderData.partner_city}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual override fields */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Override values (optional):
                </p>
                {getPlaceholders(selectedTemplate.content + ' ' + selectedTemplate.subject).map(placeholder => (
                  <div key={placeholder} className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                      {placeholder.replace(/_/g, ' ')}
                    </label>
                    <input
                      type="text"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => setPlaceholderValues(prev => ({
                        ...prev,
                        [placeholder]: e.target.value
                      }))}
                      placeholder={
                        crmPlaceholderData[placeholder] || 
                        partnerPlaceholderData[placeholder] || 
                        `Enter ${placeholder.replace(/_/g, ' ')}`
                      }
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                    {(crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]) && !placeholderValues[placeholder] && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Will use: {crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPlaceholderModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applyTemplateWithPlaceholders}
                disabled={loadingCRMData || loadingPartnerData}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// Create Label Modal Component
function CreateLabelModal({ 
  onClose, 
  userId, 
  onCreated 
}: { 
  onClose: () => void
  userId: string
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    
    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: name.trim() }),
      })
      
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Create New Folder</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {error}
            </div>
          )}
          
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Folder Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Important Clients"
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>
        
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreate} 
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}