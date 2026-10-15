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

/** Longest pause between polls after repeated failures. */
export const MAX_POLL_BACKOFF_MS = 30 * 60_000

/**
 * How long to pause polling after `errors` failures in a row. The first two
 * failures keep the normal cadence; from the third, each failure doubles the
 * pause, capped at MAX_POLL_BACKOFF_MS. Polling always resumes.
 */
export function pollBackoffMs(errors: number, interval: number): number {
  if (errors < 3) return 0
  return Math.min(interval * 2 ** (errors - 2), MAX_POLL_BACKOFF_MS)
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
  const [error, setError] = useState<string | null>(null)
  const [newEmailCount, setNewEmailCount] = useState(0)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)
  const consecutiveErrorsRef = useRef(0)
  const pausedUntilRef = useRef(0)

  // Poll for new emails
  const poll = useCallback(async () => {
    if (!userId || isPollingRef.current) return

    // Back off after repeated failures, but never stop: polling used to give
    // up for good after three errors (a brief Gmail 429 was enough), and no
    // new mail appeared until the page was reloaded.
    if (Date.now() < pausedUntilRef.current) return

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
        pausedUntilRef.current = Date.now() + pollBackoffMs(consecutiveErrorsRef.current, interval)
        return
      }

      // Reset error count on success
      consecutiveErrorsRef.current = 0
      pausedUntilRef.current = 0

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
      pausedUntilRef.current = Date.now() + pollBackoffMs(consecutiveErrorsRef.current, interval)
      setError(err.message)
    } finally {
      isPollingRef.current = false
      setIsPolling(false)
    }
  }, [userId, historyId, interval, onNewEmails, onDeletedEmails, onLabelChanges, onNeedRefresh])

  // Clear new email notification count
  const clearNewEmailCount = useCallback(() => {
    setNewEmailCount(0)
  }, [])

  // Manual refresh - resets error count
  const refresh = useCallback(async () => {
    consecutiveErrorsRef.current = 0 // Reset errors on manual refresh
    pausedUntilRef.current = 0
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