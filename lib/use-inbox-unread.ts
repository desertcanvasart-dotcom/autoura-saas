'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { showToast } from '@/app/contexts/ToastContext'

// How many unread emails sit in the signed-in user's Gmail inbox — the number
// the sidebar's Inbox link and the Inbox page header show.
//
// Read from POST /api/gmail/poll (the INBOX label's own counter, one cheap
// Gmail call). Checked every minute while the tab is visible, again the moment
// the tab comes back into view, and on demand when the Inbox page reads,
// marks or moves mail (requestInboxUnreadRefresh).

const REFRESH_EVENT = 'autoura:inbox-unread-refresh'
const POLL_MS = 60_000

/** Ask every mounted counter to re-read now (e.g. after marking mail read). */
export function requestInboxUnreadRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}

interface Options {
  /** Pop a "new email" toast when the count goes up. */
  notify?: boolean
}

/**
 * The unread count, or null while unknown or when Gmail is not connected
 * (the badge then shows nothing rather than a misleading 0).
 */
export function useInboxUnreadCount(userId: string | null | undefined, { notify = false }: Options = {}) {
  const [count, setCount] = useState<number | null>(null)
  const lastRef = useRef<number | null>(null)
  const stoppedRef = useRef(false) // Gmail not connected: stop asking
  const inFlightRef = useRef(false)
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const read = useCallback(async () => {
    if (!userId || stoppedRef.current || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/gmail/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.status === 401 || res.status === 403) {
        // No Gmail connected (or signed out). Nothing to count until the page
        // reloads — e.g. after connecting Gmail in Settings.
        stoppedRef.current = true
        lastRef.current = null
        setCount(null)
        return
      }
      if (!res.ok) return // transient (Gmail hiccup): keep the last known count
      const data = await res.json()
      const next = Number(data.unreadCount) || 0
      const prev = lastRef.current
      if (notifyRef.current && prev !== null && next > prev) {
        const n = next - prev
        showToast('info', n === 1 ? 'New email in your Inbox' : `${n} new emails in your Inbox`)
      }
      lastRef.current = next
      setCount(next)
    } catch {
      // Network blip: keep the last known count, try again next tick.
    } finally {
      inFlightRef.current = false
    }
  }, [userId])

  useEffect(() => {
    stoppedRef.current = false
    lastRef.current = null
    setCount(null)
    if (!userId) return

    read()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') read()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(REFRESH_EVENT, read)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(REFRESH_EVENT, read)
    }
  }, [userId, read])

  return count
}
