'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'

// Turn phone/desktop alerts on or off for THIS browser. One subscription per
// device serves every alert: new email, WhatsApp messages and concierge leads
// (operator, 2026-09-24), and the ops checkpoint alerts it began with.
//
// Two looks: 'dark' on the ops board, 'light' in the bell menu. The light one
// also explains the two cases a button cannot fix — an iPhone that has not
// added Autoura to its Home Screen (iOS only allows web alerts from there),
// and alerts blocked in the browser's settings. Otherwise it is hidden when
// the browser can't do push or the server has no VAPID key: a button that can
// only fail is worse than no button.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

type State = 'unsupported' | 'off' | 'on' | 'denied' | 'busy'

/** iPhone/iPad Safari not opened from the Home Screen: no PushManager until it is. */
function iosNeedsHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}

export default function PushToggle({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false)
  const [state, setState] = useState<State>('unsupported')
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    if (vapidKey && iosNeedsHomeScreen()) { setNeedsHomeScreen(true); return }
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

  const on = state === 'on'

  if (variant === 'light') {
    if (needsHomeScreen) {
      return (
        <p className="text-[11px] leading-snug text-gray-500">
          <span className="font-medium text-gray-700">Alerts on this iPhone:</span> tap Share → <span className="font-medium">Add to Home Screen</span>, open Autoura from there, then turn alerts on here.
        </p>
      )
    }
    if (state === 'unsupported') return null
    if (state === 'denied') {
      return (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
          <BellOff className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Alerts are blocked for this site in your browser settings. Allow notifications for Autoura there, then reload.
        </p>
      )
    }
    return (
      <button
        onClick={on ? disable : enable}
        disabled={state === 'busy'}
        className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          on ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
        title={on
          ? 'New email, WhatsApp messages and concierge leads alert this device, even with Autoura closed. Click to turn off.'
          : 'Get an alert on this device for new email, WhatsApp messages and concierge leads, even with Autoura closed.'}
      >
        {on ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {on ? 'Alerts on for this device' : 'Turn on alerts for this device'}
      </button>
    )
  }

  if (state === 'unsupported') return null
  if (state === 'denied') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500" title="Notifications are blocked in your browser settings">
        <BellOff className="w-3.5 h-3.5" /> blocked
      </span>
    )
  }
  return (
    <button
      onClick={on ? disable : enable}
      disabled={state === 'busy'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
        on ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'
      }`}
      title={on ? 'Alerts are on for this device — tap to turn off' : 'Get a notification on this device for checkpoints, new email, WhatsApp messages and leads'}
    >
      {on ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      {on ? 'Alerts on' : 'Alerts'}
    </button>
  )
}
