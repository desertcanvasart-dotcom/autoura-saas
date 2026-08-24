'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'

// Enable/disable checkpoint alerts for THIS browser. Hidden entirely when the
// browser can't do push or the server has no VAPID key — a button that can
// only fail is worse than no button.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

type State = 'unsupported' | 'off' | 'on' | 'denied' | 'busy'

export default function PushToggle() {
  const [state, setState] = useState<State>('unsupported')
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    }).catch(() => setState('unsupported'))
  }, [vapidKey])

  const enable = async () => {
    setState('busy')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error('save failed')
      setState('on')
    } catch {
      setState('off')
    }
  }

  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      setState('on')
    }
  }

  if (state === 'unsupported') return null
  if (state === 'denied') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500" title="Notifications are blocked in your browser settings">
        <BellOff className="w-3.5 h-3.5" /> blocked
      </span>
    )
  }
  const on = state === 'on'
  return (
    <button
      onClick={on ? disable : enable}
      disabled={state === 'busy'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
        on ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'
      }`}
      title={on ? 'Checkpoint alerts are on for this device — tap to turn off' : 'Get a notification when a checkpoint is tapped'}
    >
      {on ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      {on ? 'Alerts on' : 'Alerts'}
    </button>
  )
}
