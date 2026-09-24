'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { showToast } from '@/app/contexts/ToastContext'

// The live counts the sidebar badges, so you notice something new arrived:
//
//   email     — unread emails in the Primary tab of YOUR Gmail inbox
//               (Promotions, Social, Updates, Forums left out).
//               POST /api/gmail/poll.
//   whatsapp  — the team's unread WhatsApp messages.       GET /api/badges
//   concierge — concierge leads still in "Needs review".    GET /api/badges
//
// Each is checked every minute while the tab is visible, again the moment the
// tab comes back into view, and on demand when a page reads, marks or moves
// something (requestBadgeRefresh). When a count goes UP it can pop a toast.

const REFRESH_EVENT = 'autoura:badges-refresh'
const POLL_MS = 60_000

/** The bell re-reads on this: each Gmail check may have filed new-email
 *  notifications (POST /api/gmail/poll). */
export const NOTIFICATIONS_REFRESH_EVENT = 'autoura:notifications-refresh'

/** Ask every mounted counter to re-read now (e.g. after marking mail read). */
export function requestBadgeRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}
/** The Inbox page's name for the same thing. */
export const requestInboxUnreadRefresh = requestBadgeRefresh

/** A count per key (null = unknown: the badge hides); 'stop' = never ask again
 *  this page load (signed out / no Gmail); 'skip' = transient failure. */
type Reading<K extends string> = Record<K, number | null> | 'stop' | 'skip'

/**
 * Polls `read` and returns its counts. When a key's count rises, pops
 * `toasts[key](howManyNew)` — unless notify is off. The first reading is
 * never "new".
 */
function useLiveCounts<K extends string>(
  keys: readonly K[],
  read: (() => Promise<Reading<K>>) | null,
  toasts: Partial<Record<K, (n: number) => string>>,
  notify: boolean,
): Record<K, number | null> {
  const empty = useCallback(
    () => Object.fromEntries(keys.map(k => [k, null])) as Record<K, number | null>,
    [keys],
  )
  const [counts, setCounts] = useState<Record<K, number | null>>(empty)
  const lastRef = useRef<Record<K, number | null>>(empty())
  const stoppedRef = useRef(false)
  const inFlightRef = useRef(false)
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const tick = useCallback(async () => {
    if (!read || stoppedRef.current || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const r = await read()
      if (r === 'skip') return // keep the last known counts
      if (r === 'stop') {
        stoppedRef.current = true
        lastRef.current = empty()
        setCounts(empty())
        return
      }
      for (const k of keys) {
        const prev = lastRef.current[k]
        const next = r[k]
        const say = toastsRef.current[k]
        if (notifyRef.current && say && prev !== null && next !== null && next > prev) {
          showToast('info', say(next - prev))
        }
      }
      lastRef.current = r
      setCounts(r)
    } catch {
      // Network blip: keep the last known counts, try again next tick.
    } finally {
      inFlightRef.current = false
    }
  }, [read, keys, empty])

  useEffect(() => {
    stoppedRef.current = false
    lastRef.current = empty()
    setCounts(empty())
    if (!read) return

    tick()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(REFRESH_EVENT, tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(REFRESH_EVENT, tick)
    }
  }, [read, tick, empty])

  return counts
}

/** Signed out / no access / no Gmail → stop asking; other failures → try again later. */
function outcome(res: Response): 'stop' | 'skip' | null {
  if (res.status === 401 || res.status === 403) return 'stop'
  if (!res.ok) return 'skip'
  return null
}

const EMAIL_KEYS = ['email'] as const
const EMAIL_TOASTS = {
  email: (n: number) => (n === 1 ? 'New email in your Inbox' : `${n} new emails in your Inbox`),
}

/**
 * Unread Primary-tab emails, or null while unknown or when Gmail is not
 * connected (the badge then shows nothing rather than a misleading 0).
 */
export function useInboxUnreadCount(
  userId: string | null | undefined,
  { notify = false }: { notify?: boolean } = {},
) {
  const read = useCallback(async (): Promise<Reading<'email'>> => {
    const res = await fetch('/api/gmail/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const bad = outcome(res)
    if (bad) return bad
    const data = await res.json()
    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT))
    return { email: Number(data.unreadCount) || 0 }
  }, [userId])
  return useLiveCounts(EMAIL_KEYS, userId ? read : null, EMAIL_TOASTS, notify).email
}

const TEAM_KEYS = ['whatsapp', 'concierge'] as const
type TeamKey = (typeof TEAM_KEYS)[number]

/** The team's unread WhatsApp messages and concierge leads awaiting review. */
export function useTeamBadges(
  enabled: boolean,
  { notify = {} }: { notify?: Partial<Record<TeamKey, boolean>> } = {},
) {
  const read = useCallback(async (): Promise<Reading<TeamKey>> => {
    const res = await fetch('/api/badges')
    const bad = outcome(res)
    if (bad) return bad
    const data = await res.json()
    const n = (v: unknown) => (typeof v === 'number' ? v : null)
    return { whatsapp: n(data.whatsappUnread), concierge: n(data.conciergeNew) }
  }, [])
  // Per-key toast switches (e.g. no WhatsApp toast while on the WhatsApp page).
  const toasts: Partial<Record<TeamKey, (n: number) => string>> = {}
  if (notify.whatsapp) toasts.whatsapp = n => (n === 1 ? 'New WhatsApp message' : `${n} new WhatsApp messages`)
  if (notify.concierge) toasts.concierge = n => (n === 1 ? 'New concierge lead' : `${n} new concierge leads`)
  return useLiveCounts(TEAM_KEYS, enabled ? read : null, toasts, true)
}
