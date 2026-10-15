'use client'

import { useState, useEffect, useRef } from 'react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import ComposeModal, { type ComposeMode } from '@/components/inbox/ComposeModal'
import ThreadView from '@/components/inbox/ThreadView'
import ScheduledList from '@/components/inbox/ScheduledList'
import { RenameFolderDialog, DeleteFolderDialog } from '@/components/inbox/FolderDialogs'
import RulesPanel from '@/components/inbox/RulesPanel'
import MoveMenu from '@/components/inbox/MoveMenu'
import { printEmails } from '@/lib/email/print-email'
import type { UnsubscribeMethod } from '@/lib/email/unsubscribe'
import type { RuleConditions } from '@/lib/email/mail-rules'
import { GMAIL_LABEL_COLORS } from '@/lib/email/label-colors'
import type { Email, GmailLabel, Client } from '@/components/inbox/types'
// NEW IMPORTS FOR GMAIL ENHANCEMENTS
import { AttachmentIndicator } from '@/components/AttachmentList'
import ClientLinkButton from '@/components/ClientLinkButton'
import { useEmailPolling, useEmailCache } from '@/lib/use-email-polling'
import { cacheOwnerKey } from '@/lib/email-cache'
import { useInboxUnreadCount, requestInboxUnreadRefresh } from '@/lib/use-inbox-unread'
import { 
  Mail, 
  Inbox, 
  Send, 
  RefreshCw, 
  Loader2,
  Star,
  
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  File,
  Trash2,
  Archive,
  MoreHorizontal,
  
  FolderPlus,
  Tag,
  MailOpen,
  CheckSquare,
  Square,
  Bell,
  
  Maximize2,
  Sparkles,
  ChevronDown,
  Reply,
  ReplyAll,
  Forward,
  CalendarClock,
  Pencil,
  ShieldAlert,
  Printer,
  Filter,
} from 'lucide-react'
import { createClient } from '@/app/supabase'
import { isBusinessEmail } from '@/lib/inbox-business-filter'
import { sanitizeEmailHtml } from '@/lib/sanitize-html'
import { stashConversation, toUrlBase64 } from '@/lib/grid-handoff'

// Email body formatter - converts ■ bullets to styled lists.
// Sanitizes first: the body is attacker-controlled inbound email HTML and is
// rendered via dangerouslySetInnerHTML, so scripts/handlers must be stripped.
function formatEmailBody(html: string): string {
  if (!html) return ''
  html = sanitizeEmailHtml(html)

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

type FilterType = 'business' | 'all' | 'unread' | 'starred'
// A built-in folder, Scheduled (emails waiting to be sent), or one of the
// mailbox's own folders by Gmail label id ("label:Label_12").
type FolderType = 'inbox' | 'sent' | 'drafts' | 'scheduled' | `label:${string}`

/** What the email list asks Gmail for in a folder. */
function folderRequest(folder: FolderType, search: string): { query: string; labelId?: string } {
  const q = search || ''
  if (folder === 'sent') return { query: `from:me ${q}`.trim() }
  if (folder === 'drafts') return { query: `in:drafts ${q}`.trim() }
  if (folder.startsWith('label:')) return { query: q.trim(), labelId: folder.slice('label:'.length) }
  return { query: `in:inbox -from:me ${q}`.trim() }
}

export default function InboxPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [showExpandedEmail, setShowExpandedEmail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  // The composer: a new message, a reply / reply all / forward of a message,
  // or a saved draft reopened from Drafts.
  const [compose, setCompose] = useState<{
    mode: ComposeMode; source: Email | null; draftMessageId: string | null; draftGmailId?: string | null
  } | null>(null)
  const openCompose = (mode: ComposeMode, source: Email | null = null, draftMessageId: string | null = null) =>
    setCompose({ mode, source, draftMessageId })
  // "Scheduled for …" after scheduling, and a nudge for the Scheduled list.
  const [notice, setNotice] = useState<{ text: string; scheduled?: boolean } | null>(null)
  const [scheduledVersion, setScheduledVersion] = useState(0)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])
  // The open email's whole conversation, oldest first (/api/gmail/threads).
  const [thread, setThread] = useState<Email[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Business is the default view: Gmail's noise categories and machine
  // senders hidden, anyone on record always shown (lib/inbox-business-filter).
  const [filter, setFilter] = useState<FilterType>('business')
  const [knownAddresses, setKnownAddresses] = useState<Set<string>>(new Set())
  const [folder, setFolder] = useState<FolderType>('inbox')
  const [starredEmails, setStarredEmails] = useState<Set<string>>(new Set())
  const [isFolderCollapsed, setIsFolderCollapsed] = useState(false)
  // Cancels the in-flight email-list fetch when a new one starts (e.g. a fast
  // folder switch), so a slow response for the old folder can't overwrite the
  // new folder's list with stale data.
  const emailFetchController = useRef<AbortController | null>(null)

  const [customLabels, setCustomLabels] = useState<GmailLabel[]>([])
  // A folder's ⋯ menu, and the folder being renamed or deleted.
  const [folderMenu, setFolderMenu] = useState<string | null>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(folderMenu !== null, folderMenuRef, () => setFolderMenu(null))
  // Mail rules: the panel, and a rule started from an open email.
  const [rulesPanel, setRulesPanel] = useState<{ prefill: RuleConditions | null } | null>(null)
  // "Select all N": every email in the folder or search, not just this page.
  const [allMatching, setAllMatching] = useState<{ ids: string[]; truncated: boolean } | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [renameFolder, setRenameFolder] = useState<GmailLabel | null>(null)
  const [deleteFolder, setDeleteFolder] = useState<GmailLabel | null>(null)
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)

  // NEW: State for polling notifications
  const [showNewEmailBanner, setShowNewEmailBanner] = useState(false)
  const [newEmailCount, setNewEmailCount] = useState(0)

  // NEW: State for clients (for template placeholders)
  const [clients, setClients] = useState<Client[]>([])

  // PAGINATION STATE
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const supabase = createClient()

  // NEW: Email polling hook for real-time updates
  // Unread in the Primary tab (the sidebar badge reads the same number).
  const unreadCount = useInboxUnreadCount(user?.id) ?? 0

  const {
    isPolling,
    newEmailCount: polledNewCount,
    refresh: pollRefresh,
    clearNewEmailCount,
    historyId
  } = useEmailPolling({
    userId: user?.id || null,
    enabled: isConnected && !!user,
    interval: 120000, // Poll every 2 minutes
    onNewEmails: (newEmails) => {

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
  const { getCached, cache, updateCached, removeCached, isCacheReady } = useEmailCache(cacheOwnerKey(user?.id, tenant?.id))

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
      fetchLabels()
      fetchClients() // NEW: Fetch clients for template placeholders
    }
  }, [user, tenant?.id])

  const checkConnectionAndFetchEmails = async () => {
    if (!user) return
    try {
      // This person's mailbox in the company being worked in (migration 415).
      const { data } = tenant?.id
        ? await supabase
          .from('gmail_tokens')
          .select('email')
          .eq('user_id', user.id)
          .eq('tenant_id', tenant.id)
          .maybeSingle()
        : { data: null }

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

  // UPDATED: fetchEmails with caching and attachment parsing - RESET pagination
  const fetchEmails = async (query?: string, targetFolder?: FolderType) => {
    if (!user) return

    setRefreshing(true)
    // Reset pagination when fetching fresh
    setNextPageToken(null)
    setHasMore(true)
    const currentFolder = targetFolder || folder

    try {
      // TRY CACHE FIRST (if no search query)
      if (!query && isCacheReady) {
        const cached = await getCached(currentFolder, { limit: 25 })
        if (cached.fromCache && !cached.isStale) {

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

  // UPDATED: Helper function to fetch fresh emails from API with pagination support
  const fetchFreshEmails = async (query?: string, currentFolder?: FolderType, isBackground = false, pageToken?: string) => {
    if (!user) return

    // Supersede any previous list fetch (folder-switch race guard).
    emailFetchController.current?.abort()
    const controller = new AbortController()
    emailFetchController.current = controller

    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '25', // Reduced from 50 for faster initial load
      })

      // Add page token for pagination
      if (pageToken) {
        params.append('pageToken', pageToken)
      }

      const folderToUse = currentFolder || folder
      // The Scheduled folder is its own list (ScheduledList), not Gmail's.
      if (folderToUse === 'scheduled') return
      const req = folderRequest(folderToUse, query || '')
      if (req.query) params.append('query', req.query)
      if (req.labelId) params.append('labelId', req.labelId)

      const response = await fetch(`/api/gmail/emails?${params}`, { signal: controller.signal })
      const data = await response.json()

      // A newer fetch (or folder switch) superseded this one — drop the result.
      if (controller.signal.aborted) return

      if (data.error) {
        throw new Error(data.error)
      }

      // Store next page token for pagination
      setNextPageToken(data.nextPageToken || null)
      setHasMore(!!data.nextPageToken)

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
      if (isCacheReady && !query && !pageToken) {
        await cache(folderToUse, data.messages, historyId || undefined)
      }

      setError(null)
    } catch (err: any) {
      // Abort is expected on supersede — not a user-facing error.
      if (err?.name === 'AbortError' || controller.signal.aborted) return
      if (!isBackground) {
        setError(err.message)
      }
    } finally {
      // Only the current (non-superseded) fetch clears the refreshing state.
      if (!isBackground && !controller.signal.aborted) {
        setRefreshing(false)
      }
    }
  }

  // NEW: Load more emails function for pagination
  const loadMoreEmails = async () => {
    if (!user || !nextPageToken || loadingMore) return

    setLoadingMore(true)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '25',
        pageToken: nextPageToken,
      })

      const req = folderRequest(folder, searchQuery || '')
      if (req.query) params.append('query', req.query)
      if (req.labelId) params.append('labelId', req.labelId)

      const response = await fetch(`/api/gmail/emails?${params}`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Store next page token
      setNextPageToken(data.nextPageToken || null)
      setHasMore(!!data.nextPageToken)

      // APPEND new emails instead of replacing
      setEmails(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEmails = (data.messages || []).filter((e: Email) => !existingIds.has(e.id))
        return [...prev, ...newEmails]
      })

      // Update starred set
      data.messages.forEach((email: Email) => {
        if (email.labelIds?.includes('STARRED')) {
          setStarredEmails(prev => new Set([...prev, email.id]))
        }
      })

      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
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

    // The text goes by sessionStorage, not the URL (lib/grid-handoff.ts):
    // a long email made a URL too long to open.
    const handoff = stashConversation(conversationText)
    const params = new URLSearchParams(handoff
      ? { handoff, source: 'email' }
      : { conversation: toUrlBase64(conversationText), source: 'email', encoded: 'base64' })

    // The pricing grid is the pricing engine: it decodes the conversation,
    // parses it into days and prices them, and saves onto the CRM client.
    params.set('clientName', matchedClient?.name || senderName)
    if (matchedClient) params.set('clientId', matchedClient.id)
    if (senderEmail) params.set('email', senderEmail)

    window.location.href = `/pricing-grid?${params.toString()}`
  }
  useEffect(() => {
    setAllMatching(null)
    setSelectedEmails(new Set())
    if (isConnected) {
      fetchEmails(searchQuery, folder)
    }
  }, [folder])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setAllMatching(null)
    fetchEmails(searchQuery)
  }

  const handleRefresh = () => {
    setShowNewEmailBanner(false)
    setNewEmailCount(0)
    clearNewEmailCount()
    // Straight to Gmail, never the browser's copy: a recent copy was shown
    // and the real fetch ran in the background, where a failure (an expired
    // Google sign-in) was dropped silently — Refresh then "worked" and showed
    // the old list. Now the fetch is the visible one and its error is shown.
    setRefreshing(true)
    setNextPageToken(null)
    setHasMore(true)
    fetchFreshEmails(searchQuery || undefined, folder, false)
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
    labelId?: string,
    fromLabelId?: string | null,
  ) => {
    if (!user) return

    const ids = messageIds || (selectedEmail ? [selectedEmail.id] : Array.from(selectedEmails))
    if (ids.length === 0) return

    setActionLoading(true)
    try {
      const response = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messageIds: ids, action, labelId, ...(fromLabelId ? { fromLabelId } : {}) }),
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      // UPDATE CACHE after action
      if (isCacheReady) {
        if (action === 'delete' || action === 'archive' || action === 'spam' || action === 'move' || action === 'moveToInbox') {
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
      requestInboxUnreadRefresh()
      setSelectedEmail(null)
      setSelectedEmails(new Set())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Opening an unread email reads it, as in Gmail — otherwise the unread
  // count only ever went down via the "Mark as read" button. Quiet on purpose:
  // no list reload, no closing the email; a failure just leaves it unread.
  const openEmail = (email: Email, isSentByMe: boolean) => {
    // A draft opens in the composer, to carry on writing.
    if (folder === 'drafts') {
      openCompose('new', null, email.id)
      return
    }
    setSelectedEmail(email)
    void loadThread(email)
    if (!user || !email.isUnread || isSentByMe) return
    const read = { ...email, isUnread: false }
    setEmails(prev => prev.map(e => (e.id === email.id ? { ...e, isUnread: false } : e)))
    setSelectedEmail(read)
    fetch('/api/gmail/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, messageIds: [email.id], action: 'markRead' }),
    })
      .then(async res => {
        if (!res.ok) return
        if (isCacheReady) await updateCached(email.id, { isUnread: false })
        requestInboxUnreadRefresh()
      })
      .catch(() => {})
  }

  // The conversation the opened email belongs to. Until it arrives (or if it
  // cannot be read) the email itself is shown, so opening is never blocked.
  const threadRequest = useRef(0)
  const loadThread = async (email: Email) => {
    const req = ++threadRequest.current
    setThread([email])
    if (!user || !email.threadId) return
    setThreadLoading(true)
    try {
      const res = await fetch(`/api/gmail/threads?userId=${user.id}&threadId=${encodeURIComponent(email.threadId)}`)
      const data = await res.json()
      if (req !== threadRequest.current) return
      if (res.ok && Array.isArray(data.messages) && data.messages.length > 0) setThread(data.messages)
    } catch {
      // Keep showing the single email.
    } finally {
      if (req === threadRequest.current) setThreadLoading(false)
    }
  }

  // Reply, reply all and forward from the header act on the newest message.
  const latestInThread = (): Email | null => thread[thread.length - 1] ?? selectedEmail

  const handleDelete = () => handleEmailAction('delete')
  const handleArchive = () => handleEmailAction('archive')
  const handleMarkRead = () => handleEmailAction('markRead')
  const handleMarkUnread = () => handleEmailAction('markUnread')
  const handleStarEmail = () => handleEmailAction('star')
  const handleUnstarEmail = () => handleEmailAction('unstar')
  // ── Move to folder ───────────────────────────────────────────────────────
  // The folder being viewed, if any: a move takes the email OUT of it.
  const currentFolderId = folder.startsWith('label:') ? folder.slice('label:'.length) : null
  const folderName = (labelId: string) => customLabels.find(l => l.id === labelId)?.name ?? 'the folder'

  // From an open email: the whole conversation moves, as in Gmail — not only
  // the message on screen (its earlier messages stayed in the Inbox).
  const moveOpenConversation = async (labelId: string | null) => {
    if (!selectedEmail) return
    const ids = [...new Set((thread.length ? thread : [selectedEmail]).map(m => m.id))]
    await handleEmailAction(labelId ? 'move' : 'moveToInbox', ids, labelId ?? undefined, currentFolderId)
    setNotice({ text: `Conversation moved to ${labelId ? `“${folderName(labelId)}”` : 'the Inbox'}` })
  }

  // ── Bulk actions: the ticked emails, or every email in the folder ────────
  const ACTION_WORDS: Record<string, string> = {
    archive: 'Archive', delete: 'Delete', markRead: 'Mark as read', spam: 'Report as spam', move: 'Move',
    moveToInbox: 'Move to the Inbox',
  }
  const bulkAction = (action: string, labelId?: string) => {
    const ids = allMatching ? allMatching.ids : Array.from(selectedEmails)
    if (allMatching && !window.confirm(`${ACTION_WORDS[action] || action} all ${ids.length.toLocaleString()} emails in ${folderLabel()}?`)) return
    void handleEmailAction(action, ids, labelId, currentFolderId).then(() => {
      if (allMatching) setAllMatching(null)
      if (action === 'move' || action === 'moveToInbox') {
        const where = action === 'move' && labelId ? `“${folderName(labelId)}”` : 'the Inbox'
        setNotice({ text: `${ids.length.toLocaleString()} email${ids.length === 1 ? '' : 's'} moved to ${where}` })
      }
    })
  }

  const folderLabel = () => {
    if (folder === 'inbox') return 'the Inbox'
    if (folder === 'sent') return 'Sent'
    if (folder === 'drafts') return 'Drafts'
    const l = customLabels.find(x => `label:${x.id}` === folder)
    return l ? `“${l.name}”` : 'this folder'
  }

  // The same folder, search and view filter the list shows — across pages.
  const selectAllMatching = async () => {
    if (!user) return
    setLoadingAll(true)
    try {
      const req = folderRequest(folder, searchQuery)
      const extra = filter === 'unread' ? ' is:unread' : filter === 'starred' ? ' is:starred'
        : filter === 'business' ? ' -category:promotions -category:social -category:forums' : ''
      const params = new URLSearchParams({ userId: user.id, query: (req.query + extra).trim() })
      if (req.labelId) params.set('labelId', req.labelId)
      const res = await fetch(`/api/gmail/ids?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not select all')
      setAllMatching({ ids: d.ids, truncated: Boolean(d.truncated) })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingAll(false)
    }
  }

  // ── Print, unsubscribe, rules from an email ──────────────────────────────
  const printThread = (messages: Email[]) => {
    const ok = printEmails(
      messages[messages.length - 1]?.subject || selectedEmail?.subject || '',
      messages.map(m => ({ ...m, body: sanitizeEmailHtml(m.body || '') })),
      connectedEmail,
    )
    if (!ok) setError('Allow pop-ups for this site to print')
  }

  const unsubscribe = async (message: Email, method: UnsubscribeMethod) => {
    const sender = extractName(message.from)
    if (method.kind === 'oneClick') {
      // RFC 8058 one-click: a POST from the person's own browser.
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = method.url
      form.target = '_blank'
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'List-Unsubscribe'
      input.value = 'One-Click'
      form.appendChild(input)
      document.body.appendChild(form)
      form.submit()
      form.remove()
      setNotice({ text: `Unsubscribe request sent to ${sender}` })
    } else if (method.kind === 'link') {
      window.open(method.url, '_blank', 'noopener,noreferrer')
      setNotice({ text: `Opened ${sender}'s unsubscribe page — confirm there` })
    } else {
      if (!window.confirm(`Send an unsubscribe email to ${method.to}?`)) return
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, to: method.to, subject: method.subject, body: `<p>${method.body}</p>` }),
      })
      if (res.ok) setNotice({ text: `Unsubscribe email sent to ${method.to}` })
      else setError((await res.json().catch(() => ({}))).error || 'Could not send the unsubscribe email')
    }
  }

  const filterLikeThis = (email: Email) => {
    setRulesPanel({ prefill: { from: extractEmailAddress(email.from), subject: (email.subject || '').replace(/^(re|fwd?|fw):\s*/i, '') } })
  }

  const setFolderColor = async (label: GmailLabel, backgroundColor: string) => {
    setFolderMenu(null)
    const res = await fetch('/api/gmail/labels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, labelId: label.id, color: { backgroundColor } }),
    })
    if (res.ok) fetchLabels()
    else setError((await res.json().catch(() => ({}))).error || 'Could not change the colour')
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
      setAllMatching(null)
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

  // The addresses on record — clients and suppliers — that the Business view
  // never hides. Loaded once per session; a failure just means no exception.
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    ;(async () => {
      const known = new Set<string>()
      const add = (v: unknown) => { if (typeof v === 'string' && v.includes('@')) known.add(v.trim().toLowerCase()) }
      try {
        const [c, s] = await Promise.all([
          fetch('/api/clients?limit=2000').then(r => r.json()).catch(() => null),
          fetch('/api/suppliers?status=active').then(r => r.json()).catch(() => null),
        ])
        for (const row of (c?.data ?? c?.clients ?? []) as Array<Record<string, unknown>>) add(row.email)
        for (const row of (s?.data ?? s?.suppliers ?? []) as Array<Record<string, unknown>>) { add(row.email); add(row.contact_email) }
      } catch { /* keep whatever we got */ }
      if (alive) setKnownAddresses(known)
    })()
    return () => { alive = false }
  }, [user?.id])

  // Filtering and Grouping Logic
  const filteredEmails = emails.filter(email => {
    if (filter === 'business') return isBusinessEmail(email, knownAddresses)
    if (filter === 'unread') return email.isUnread
    if (filter === 'starred') return starredEmails.has(email.id)
    return true
  })
  const hiddenAsNoise = filter === 'business' ? emails.length - filteredEmails.length : 0

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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full h-9 pl-4 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white outline-none transition-colors"
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
                onClick={() => openCompose('new')}
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

      {notice && (
        <div role="status" className="mx-4 mr-6 mt-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex-shrink-0">
          {notice.scheduled && <CalendarClock className="w-4 h-4" />}
          <span>{notice.text}</span>
          {notice.scheduled && (
            <button onClick={() => { setNotice(null); setFolder('scheduled') }} className="ml-2 underline">View scheduled</button>
          )}
          <button onClick={() => setNotice(null)} className="ml-auto"><X className="w-4 h-4" /></button>
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
                { id: 'scheduled' as FolderType, label: 'Scheduled', icon: CalendarClock, count: 0 },
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
                  {customLabels.map((label) => {
                    const id = `label:${label.id}` as FolderType
                    const active = folder === id
                    return (
                      <div key={label.id} className="group relative flex items-center">
                        <button
                          onClick={() => setFolder(id)}
                          className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                            active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <Tag
                            className="w-3.5 h-3.5 flex-shrink-0"
                            style={{ color: label.color?.backgroundColor || undefined }}
                            fill={label.color?.backgroundColor || 'none'}
                          />
                          <span className="flex-1 text-left truncate">{label.name}</span>
                        </button>
                        <button
                          onClick={() => setFolderMenu(folderMenu === label.id ? null : label.id)}
                          className="p-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Folder options for ${label.name}`}
                          title="Folder options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        {folderMenu === label.id && (
                          <div ref={folderMenuRef} className="absolute left-full top-0 ml-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30">
                            <button
                              onClick={() => { setFolderMenu(null); setRenameFolder(label) }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-400" /> Rename
                            </button>
                            <div className="px-3 py-1.5 border-t border-b border-gray-100 my-1">
                              <p className="text-[10px] text-gray-400 mb-1">Colour</p>
                              <div className="grid grid-cols-6 gap-1">
                                {GMAIL_LABEL_COLORS.map(c => (
                                  <button
                                    key={c.backgroundColor}
                                    onClick={() => setFolderColor(label, c.backgroundColor)}
                                    className={`w-5 h-5 rounded-full border ${label.color?.backgroundColor === c.backgroundColor ? 'ring-2 ring-offset-1 ring-gray-500' : 'border-gray-200'}`}
                                    style={{ backgroundColor: c.backgroundColor }}
                                    aria-label={`Colour ${c.backgroundColor}`}
                                    title={c.backgroundColor}
                                  />
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => { setFolderMenu(null); setDeleteFolder(label) }}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
              <button
                onClick={() => setRulesPanel({ prefill: null })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Rules</span>
              </button>
            )}

            {!isFolderCollapsed && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Filters</p>
                <nav className="space-y-0.5">
                  {[
                    { id: 'business' as FilterType, label: 'Business' },
                    { id: 'all' as FilterType, label: 'Everything' },
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
          {folder === 'scheduled' ? (
            <ScheduledList
              userId={user!.id}
              refreshKey={scheduledVersion}
              onEditDraft={draftGmailId => setCompose({ mode: 'new', source: null, draftMessageId: null, draftGmailId })}
            />
          ) : (<>

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
                    {allMatching ? `All ${allMatching.ids.length.toLocaleString()} selected` : `${selectedEmails.size} selected`}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => bulkAction('archive')}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => bulkAction('delete')}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => bulkAction('spam')}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Report spam"
                    >
                      <ShieldAlert className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => bulkAction('markRead')}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Mark as read"
                    >
                      <MailOpen className="w-4 h-4 text-gray-500" />
                    </button>

                    <MoveMenu
                      userId={user!.id}
                      folders={customLabels}
                      currentFolderId={currentFolderId}
                      disabled={actionLoading}
                      onMove={labelId => bulkAction('move', labelId)}
                      onMoveToInbox={() => bulkAction('moveToInbox')}
                      onFolderCreated={fetchLabels}
                      buttonClassName="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                    />
                  </div>
                </>
              )}

              {/* Email count indicator */}
              {selectedEmails.size === 0 && (
                <span className="text-xs text-gray-400 ml-auto">
                  {filteredEmails.length} emails{hiddenAsNoise > 0 && <span className="text-gray-400"> · {hiddenAsNoise} hidden as noise</span>}
                </span>
              )}
            </div>
          )}

          {/* "Select all N": the whole folder or search, not only this page. */}
          {filteredEmails.length > 0 && selectedEmails.size === filteredEmails.length && (hasMore || allMatching) && (
            <div className="px-3 py-2 text-xs text-center bg-primary-50 border-b border-primary-100 text-gray-700" data-testid="select-all-banner">
              {allMatching ? (
                <>
                  All {allMatching.ids.length.toLocaleString()} emails in {folderLabel()} are selected
                  {allMatching.truncated ? ' (the first 5,000)' : ''}.{' '}
                  <button onClick={() => { setAllMatching(null); setSelectedEmails(new Set()) }} className="font-medium text-primary-700 underline">Clear selection</button>
                </>
              ) : (
                <>
                  All {filteredEmails.length} emails on this page are selected.{' '}
                  <button onClick={selectAllMatching} disabled={loadingAll} className="font-medium text-primary-700 underline disabled:opacity-50">
                    {loadingAll ? 'Finding them all…' : `Select all emails in ${folderLabel()}`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Email List Content */}
          {filteredEmails.length === 0 && !refreshing ? (
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
                        onClick={() => openEmail(email, !!isSentByMe)}
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
                              {/* The email's folders, in their colours. */}
                              {customLabels.filter(l => email.labelIds?.includes(l.id) && folder !== `label:${l.id}`).slice(0, 3).map(l => (
                                <span
                                  key={l.id}
                                  className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 max-w-[90px] truncate"
                                  style={{ backgroundColor: l.color?.backgroundColor || '#e5e7eb', color: l.color?.textColor || '#374151' }}
                                >
                                  {l.name}
                                </span>
                              ))}
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

              {/* LOAD MORE BUTTON */}
              {hasMore && (
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={loadMoreEmails}
                    disabled={loadingMore}
                    className="w-full py-3 px-4 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more emails...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Load More Emails
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* End of list indicator */}
              {!hasMore && filteredEmails.length > 0 && (
                <div className="p-4 text-center text-xs text-gray-400">
                  You've reached the end • {filteredEmails.length} emails loaded
                </div>
              )}
            </div>
          )}
          </>)}
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

                  <MoveMenu
                    userId={user!.id}
                    folders={customLabels}
                    currentFolderId={currentFolderId}
                    disabled={actionLoading}
                    onMove={labelId => void moveOpenConversation(labelId)}
                    onMoveToInbox={() => void moveOpenConversation(null)}
                    onFolderCreated={fetchLabels}
                  />

                  {/* Reply / Forward — this action already existed but only at
                      the very BOTTOM of the message, below the full body and
                      attachments. On any long email it sat under the fold, so
                      the most common thing to do with an email looked missing.
                      Same handler; the bottom button stays for people who read
                      to the end. */}
                  <button
                    onClick={() => openCompose('reply', latestInThread())}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Reply"
                  >
                    <Reply className="w-4 h-4 text-primary-600" />
                  </button>
                  <button
                    onClick={() => openCompose('replyAll', latestInThread())}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Reply all"
                  >
                    <ReplyAll className="w-4 h-4 text-primary-600" />
                  </button>
                  <button
                    onClick={() => openCompose('forward', latestInThread())}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Forward"
                  >
                    <Forward className="w-4 h-4 text-primary-600" />
                  </button>

                  {/* Parse Email Button */}
                  <button
                    onClick={handleParseEmail}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Parse and price in the Pricing Grid"
                  >
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </button>
                  <button
                    onClick={() => handleEmailAction('spam', thread.length ? thread.filter(m => !isFromMe(m)).map(m => m.id) : [selectedEmail.id])}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Report spam"
                  >
                    <ShieldAlert className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => printThread(thread.length ? thread : [selectedEmail])}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Print the conversation"
                  >
                    <Printer className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => filterLikeThis(selectedEmail)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Filter emails like this"
                  >
                    <Filter className="w-4 h-4 text-gray-500" />
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

              {/* The whole conversation, oldest first (ThreadView). */}
              {threadLoading && thread.length <= 1 && (
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading the conversation…
                </p>
              )}
              <ThreadView
                key={selectedEmail.threadId + ':' + thread.length}
                messages={thread.length ? thread : [selectedEmail]}
                userId={user!.id}
                isOwn={e => folder === 'sent' || Boolean(isFromMe(e))}
                renderBody={formatEmailBody}
                onCompose={(mode, message) => openCompose(mode, message)}
                onPrint={m => printThread([m])}
                onUnsubscribe={unsubscribe}
              />
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
                  fromName={extractName(selectedEmail.from)}
                  subject={selectedEmail.subject}
                  snippet={selectedEmail.snippet}
                  sentAt={selectedEmail.date}
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
            title="Parse and price in the Pricing Grid"
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

          <ThreadView
            key={'expanded:' + selectedEmail.threadId + ':' + thread.length}
            messages={thread.length ? thread : [selectedEmail]}
            userId={user!.id}
            isOwn={e => folder === 'sent' || Boolean(isFromMe(e))}
            renderBody={sanitizeEmailHtml}
            onCompose={(mode, message) => { setShowExpandedEmail(false); openCompose(mode, message) }}
            onPrint={m => printThread([m])}
            onUnsubscribe={unsubscribe}
          />
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

        <div className="flex items-center gap-2">
          {([['reply', 'Reply', Reply], ['replyAll', 'Reply all', ReplyAll], ['forward', 'Forward', Forward]] as const).map(([mode, label, Icon]) => (
            <button
              key={mode}
              onClick={() => { setShowExpandedEmail(false); openCompose(mode, latestInThread()) }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
)}

{/* Compose Modal */}
{compose && (
        <ComposeModal
          key={`${compose.mode}:${compose.source?.id ?? ''}:${compose.draftMessageId ?? ''}`}
          onClose={() => {
            setCompose(null)
            // A closed message is kept in Drafts: show it there.
            if (folder === 'drafts') fetchEmails()
            if (folder === 'scheduled') setScheduledVersion(v => v + 1)
          }}
          userId={user?.id || ''}
          mode={compose.mode}
          source={compose.source}
          draftMessageId={compose.draftMessageId}
          draftGmailId={compose.draftGmailId ?? null}
          ownAddresses={connectedEmail ? [connectedEmail] : []}
          onScheduled={at => {
            setNotice({
              text: `Scheduled for ${at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
              scheduled: true,
            })
            setScheduledVersion(v => v + 1)
          }}
          onSent={() => {
            setCompose(null)
            fetchEmails()
            if (selectedEmail) void loadThread(selectedEmail)
          }}
          clients={clients}
        />
      )}

      {rulesPanel && (
        <RulesPanel
          folders={customLabels.map(l => l.name)}
          prefill={rulesPanel.prefill}
          onClose={() => setRulesPanel(null)}
          onChanged={() => { fetchLabels(); fetchEmails() }}
        />
      )}
      {renameFolder && (
        <RenameFolderDialog
          userId={user?.id || ''}
          label={renameFolder}
          onClose={() => setRenameFolder(null)}
          onDone={() => { setRenameFolder(null); fetchLabels() }}
        />
      )}
      {deleteFolder && (
        <DeleteFolderDialog
          userId={user?.id || ''}
          label={deleteFolder}
          onClose={() => setDeleteFolder(null)}
          onDone={moved => {
            const wasOpen = folder === `label:${deleteFolder.id}`
            setDeleteFolder(null)
            setNotice({ text: moved > 0 ? `Folder deleted — ${moved} email${moved === 1 ? '' : 's'} moved back to the Inbox` : 'Folder deleted' })
            fetchLabels()
            if (wasOpen) setFolder('inbox')
            else fetchEmails()
          }}
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