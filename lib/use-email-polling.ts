'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface NewEmail {
  id: string
  threadId: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  labelIds?: string[]
  isUnread: boolean
}

interface PollResult {
  historyId: string
  hasChanges: boolean
  newMessages: NewEmail[]
  deletedMessages: string[]
  labelChanges: Array<{
    messageId: string
    labelsAdded?: string[]
    labelsRemoved?: string[]
  }>
  needsFullRefresh?: boolean
  totalNew?: number
}

interface UseEmailPollingOptions {
  userId: string | null
  enabled?: boolean
  interval?: number // milliseconds
  onNewEmails?: (emails: NewEmail[]) => void
  onDeletedEmails?: (messageIds: string[]) => void
  onLabelChanges?: (changes: PollResult['labelChanges']) => void
  onNeedRefresh?: () => void
}

export function useEmailPolling({
  userId,
  enabled = true,
  interval = 120000, // Poll every 2 minutes
  onNewEmails,
  onDeletedEmails,
  onLabelChanges,
  onNeedRefresh,
}: UseEmailPollingOptions) {
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [newEmailCount, setNewEmailCount] = useState(0)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)
  const consecutiveErrorsRef = useRef(0)
  const maxConsecutiveErrors = 3

  // Poll for new emails
  const poll = useCallback(async () => {
    if (!userId || isPollingRef.current) return

    // Skip polling if we've had too many consecutive errors
    if (consecutiveErrorsRef.current >= maxConsecutiveErrors) {

      return
    }

    isPollingRef.current = true
    setIsPolling(true)
    setError(null)

    try {
      const params = new URLSearchParams({ userId })
      if (historyId) {
        params.append('historyId', historyId)
      }

      const response = await fetch(`/api/gmail/poll?${params}`)

      if (!response.ok) {
        // Don't throw - just log and handle gracefully
        const errorData = await response.json().catch(() => ({}))
        console.warn('Poll request failed:', response.status, errorData.error || 'Unknown error')
        consecutiveErrorsRef.current++
        return
      }

      // Reset error count on success
      consecutiveErrorsRef.current = 0

      const result: PollResult = await response.json()

      // Update history ID
      if (result.historyId) {
        setHistoryId(result.historyId)
      }

      // Handle full refresh needed
      if (result.needsFullRefresh) {
        onNeedRefresh?.()
        return
      }

      // Handle new emails
      if (result.newMessages && result.newMessages.length > 0) {
        setNewEmailCount(prev => prev + result.newMessages.length)
        onNewEmails?.(result.newMessages)
      }

      // Handle deleted emails
      if (result.deletedMessages && result.deletedMessages.length > 0) {
        onDeletedEmails?.(result.deletedMessages)
      }

      // Handle label changes
      if (result.labelChanges && result.labelChanges.length > 0) {
        onLabelChanges?.(result.labelChanges)
      }

      setLastPollTime(new Date())

    } catch (err: any) {
      // Fail silently - polling is not critical functionality
      console.warn('Polling error (non-critical):', err.message)
      consecutiveErrorsRef.current++
      setError(err.message)
    } finally {
      isPollingRef.current = false
      setIsPolling(false)
    }
  }, [userId, historyId, onNewEmails, onDeletedEmails, onLabelChanges, onNeedRefresh])

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return

    try {
      const response = await fetch('/api/gmail/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (err) {
      // Fail silently
      console.warn('Error fetching unread count (non-critical):', err)
    }
  }, [userId])

  // Clear new email notification count
  const clearNewEmailCount = useCallback(() => {
    setNewEmailCount(0)
  }, [])

  // Manual refresh - resets error count
  const refresh = useCallback(async () => {
    consecutiveErrorsRef.current = 0 // Reset errors on manual refresh
    await poll()
  }, [poll])

  // Set up polling interval
  useEffect(() => {
    if (!enabled || !userId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Initial poll (delayed slightly to let page load first)
    const initialTimeout = setTimeout(() => {
      poll()
    }, 2000)

    // Set up interval
    intervalRef.current = setInterval(() => {
      poll()
    }, interval)

    return () => {
      clearTimeout(initialTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, userId, interval, poll])

  return {
    isPolling,
    lastPollTime,
    unreadCount,
    newEmailCount,
    error,
    refresh,
    clearNewEmailCount,
    historyId,
  }
}

/**
 * Hook for managing email cache with polling
 */
export function useEmailCache(userId: string | null) {
  const [isCacheReady, setIsCacheReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Dynamic import to avoid SSR issues
    import('./email-cache').then(({ initEmailCache }) => {
      initEmailCache().then(() => {
        setIsCacheReady(true)
      }).catch(() => {
        // Cache initialization failed - continue without cache
        console.warn('Email cache initialization failed (non-critical)')
      })
    }).catch(() => {
      // Module not found - continue without cache
      console.warn('Email cache module not found (non-critical)')
    })
  }, [])

  const getCached = useCallback(async (folder: string, options?: any) => {
    if (!isCacheReady || !userId) return { emails: [], fromCache: false, isStale: true }

    try {
      const { getCachedEmails } = await import('./email-cache')
      return getCachedEmails(userId, folder, options)
    } catch {
      return { emails: [], fromCache: false, isStale: true }
    }
  }, [isCacheReady, userId])

  const cache = useCallback(async (folder: string, emails: any[], historyId?: string) => {
    if (!isCacheReady || !userId) return

    try {
      const { cacheEmails } = await import('./email-cache')
      return cacheEmails(userId, folder, emails, historyId)
    } catch {
      // Fail silently
    }
  }, [isCacheReady, userId])

  const updateCached = useCallback(async (emailId: string, updates: any) => {
    if (!isCacheReady) return

    try {
      const { updateCachedEmail } = await import('./email-cache')
      return updateCachedEmail(emailId, updates)
    } catch {
      // Fail silently
    }
  }, [isCacheReady])

  const removeCached = useCallback(async (emailIds: string[]) => {
    if (!isCacheReady) return

    try {
      const { removeCachedEmails } = await import('./email-cache')
      return removeCachedEmails(emailIds)
    } catch {
      // Fail silently
    }
  }, [isCacheReady])

  const clearCache = useCallback(async () => {
    if (!isCacheReady) return

    try {
      const { clearEmailCache } = await import('./email-cache')
      return clearEmailCache(userId || undefined)
    } catch {
      // Fail silently
    }
  }, [isCacheReady, userId])

  return {
    isCacheReady,
    getCached,
    cache,
    updateCached,
    removeCached,
    clearCache,
  }
}