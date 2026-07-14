'use client'

import { useState, useEffect } from 'react'
import {
  User,
  Link as LinkIcon,
  Unlink,
  Search,
  Loader2,
  Check,
  X,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface Client {
  id: string
  name: string
  email: string
  phone?: string
  status?: string
}

interface EmailLink {
  id: string
  client_id: string
  client: Client
}

interface ClientLinkButtonProps {
  userId: string
  messageId: string
  threadId?: string
  fromEmail?: string
  toEmails?: string[]
  onLinkChange?: (link: EmailLink | null) => void
  className?: string
}

export default function ClientLinkButton({
  userId,
  messageId,
  threadId,
  fromEmail,
  toEmails,
  onLinkChange,
  className = ''
}: ClientLinkButtonProps) {
  const dialog = useConfirmDialog()
  const [linkedClient, setLinkedClient] = useState<Client | null>(null)
  const [linkId, setLinkId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Client[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)

  // Check for existing link on mount
  useEffect(() => {
    checkExistingLink()
  }, [messageId, userId])

  const checkExistingLink = async () => {
    try {
      const params = new URLSearchParams({ userId, messageId })
      const response = await fetch(`/api/email/links?${params}`)
      const data = await response.json()

      if (data.link) {
        setLinkedClient(data.link.client)
        setLinkId(data.link.id)
        onLinkChange?.(data.link)
      }
    } catch (error) {
      console.error('Error checking link:', error)
    } finally {
      setLoading(false)
    }
  }

  // Search clients
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        // Search your clients API
        const response = await fetch(`/api/clients?userId=${userId}&search=${encodeURIComponent(searchQuery)}`)
        const data = await response.json()
        setSearchResults(data.clients || [])
      } catch (error) {
        console.error('Error searching clients:', error)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, userId])

  const handleLink = async (client: Client) => {
    setLinking(true)
    try {
      const response = await fetch('/api/email/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          messageId,
          threadId,
          clientId: client.id,
          emailAddress: fromEmail,
        }),
      })

      const data = await response.json()

      if (data.link) {
        setLinkedClient(client)
        setLinkId(data.link.id)
        setIsOpen(false)
        setSearchQuery('')
        onLinkChange?.(data.link)
      }
    } catch (error) {
      console.error('Error linking:', error)
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async () => {
    if (!(await dialog.confirm({ message: 'Remove link to this client?', variant: 'danger', confirmText: 'Remove' }))) return

    setLinking(true)
    try {
      await fetch('/api/email/links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, messageId, linkId }),
      })

      setLinkedClient(null)
      setLinkId(null)
      onLinkChange?.(null)
    } catch (error) {
      console.error('Error unlinking:', error)
    } finally {
      setLinking(false)
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-1.5 text-gray-400 text-xs ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    )
  }

  // Already linked - show client info
  if (linkedClient) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Link
          href={`/clients/${linkedClient.id}`}
          className="flex items-center gap-1.5 px-2 py-1 bg-primary-50 text-primary-700 rounded-md text-xs hover:bg-primary-100 transition-colors"
        >
          <User className="w-3.5 h-3.5" />
          <span className="font-medium max-w-[120px] truncate">{linkedClient.name}</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
        <button
          onClick={handleUnlink}
          disabled={linking}
          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
          title="Remove link"
        >
          {linking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Unlink className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    )
  }

  // Not linked - show link button
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
      >
        <LinkIcon className="w-3.5 h-3.5" />
        <span>Link to Client</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="py-1">
                  {searchResults.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleLink(client)}
                      disabled={linking}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {client.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {client.email}
                        </div>
                      </div>
                      {linking && (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  No clients found
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-gray-500">
                  Type to search clients
                </div>
              )}
            </div>

            {/* Auto-match suggestion */}
            {fromEmail && !searchQuery && (
              <div className="p-2 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={async () => {
                    // Try to find client by email
                    setSearching(true)
                    try {
                      const response = await fetch(
                        `/api/email/links?userId=${userId}&emailAddress=${encodeURIComponent(fromEmail)}`
                      )
                      const data = await response.json()
                      if (data.client) {
                        handleLink(data.client)
                      } else {
                        setSearchQuery(fromEmail)
                      }
                    } catch (error) {
                      setSearchQuery(fromEmail)
                    } finally {
                      setSearching(false)
                    }
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <div className="font-medium">Auto-match by email</div>
                  <div className="text-gray-400 truncate">{fromEmail}</div>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
