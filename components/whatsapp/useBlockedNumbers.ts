'use client'
// The company's blocked WhatsApp numbers (migration 465), for the inbox's
// Block/Unblock button and the list in Settings → WhatsApp.
import { useCallback, useEffect, useState } from 'react'
import type { BlockedNumber } from '@/lib/whatsapp-blocked'

type Result = { ok: true } | { ok: false; error: string }

async function send(method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<Result> {
  try {
    const res = await fetch('/api/whatsapp/blocked', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.success === false) return { ok: false, error: json.error || `Failed (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function useBlockedNumbers() {
  const [blocked, setBlocked] = useState<BlockedNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/blocked')
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) {
        setError(json.error || `Could not load blocked numbers (${res.status})`)
      } else {
        setBlocked(json.blocked ?? [])
        setError(null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const block = useCallback(async (phone_number: string, reason?: string) => {
    const r = await send('POST', { phone_number, reason })
    if (r.ok) await refresh()
    return r
  }, [refresh])

  const unblock = useCallback(async (phone_number: string) => {
    const r = await send('DELETE', { phone_number })
    if (r.ok) await refresh()
    return r
  }, [refresh])

  return { blocked, loading, error, refresh, block, unblock }
}
