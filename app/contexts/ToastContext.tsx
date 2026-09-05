'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

// ============================================
// Dismissal policy — the reliability contract
// ============================================
// A message the user could not read might as well not have been shown (an
// import result vanished mid-read and the user had no idea what it said).
//   - errors and warnings NEVER auto-dismiss: an unread problem is a
//     problem the user doesn't know they have. Only the X closes them.
//   - success/info stay for READING time: scaled to message length,
//     never less than 5s, capped at 20s.
//   - hovering any toast freezes the whole stack's timers (mouse present
//     = user is reading); they restart on leave.

const STICKY_TYPES: ReadonlyArray<ToastType> = ['error', 'warning']

/** ~200 wpm reading speed with a floor and a cap. */
export function toastTtlMs(type: ToastType, message: string): number | null {
  if (STICKY_TYPES.includes(type)) return null // sticky: manual dismiss only
  const words = message.trim().split(/\s+/).length
  return Math.min(20_000, Math.max(5_000, 1_500 + words * 300))
}

// Module-level emitter so showToast() can be called from anywhere — including
// outside the React tree (event handlers, plain modules) — and still reach the
// <Toaster /> mounted once in the layout.
let listeners: Array<(t: Toast) => void> = []
let nextId = 1

/**
 * Show a toast notification. Signature is (type, message) — matching every
 * existing call site. (The previous stub declared (message, type) but was
 * always CALLED as (type, message), so it silently mislabeled everything and
 * its alert-on-error never fired.)
 */
export const showToast = (type: ToastType, message: string) => {
  const toast: Toast = { id: nextId++, type, message }
  // Every toast also goes to the console, so a message that was dismissed
  // (or missed) is always recoverable from devtools.
  // eslint-disable-next-line no-console
  console.log(`[toast:${type}] ${message}`)
  listeners.forEach((l) => l(toast))
}

export default showToast

const TOAST_STYLES: Record<ToastType, { ring: string; icon: typeof Info; iconColor: string }> = {
  success: { ring: 'border-green-200', icon: CheckCircle, iconColor: 'text-green-600' },
  error: { ring: 'border-red-200', icon: XCircle, iconColor: 'text-red-600' },
  warning: { ring: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600' },
  info: { ring: 'border-blue-200', icon: Info, iconColor: 'text-blue-600' },
}

/**
 * Renders the toast stack. Mount once, near the root (app/layout.tsx).
 */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  // id → remaining ms; timers live here so hover can freeze and resume them.
  const timers = useRef<Map<number, { handle: ReturnType<typeof setTimeout>; expiresAt: number }>>(new Map())
  const remaining = useRef<Map<number, number>>(new Map())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer.handle)
    timers.current.delete(id)
    remaining.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const startTimer = useCallback((id: number, ms: number) => {
    const handle = setTimeout(() => {
      timers.current.delete(id)
      remaining.current.delete(id)
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, ms)
    timers.current.set(id, { handle, expiresAt: Date.now() + ms })
  }, [])

  // Mouse over the stack = the user is reading: freeze every timer, keep
  // what is left of each, and resume on leave.
  const pauseAll = useCallback(() => {
    for (const [id, timer] of timers.current) {
      clearTimeout(timer.handle)
      remaining.current.set(id, Math.max(1_000, timer.expiresAt - Date.now()))
    }
    timers.current.clear()
  }, [])

  const resumeAll = useCallback(() => {
    for (const [id, ms] of remaining.current) startTimer(id, ms)
    remaining.current.clear()
  }, [startTimer])

  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((prev) => [...prev, t])
      const ttl = toastTtlMs(t.type, t.message)
      if (ttl !== null) startTimer(t.id, ttl) // sticky types get no timer
    }
    listeners.push(listener)
    const captured = timers.current
    return () => {
      listeners = listeners.filter((l) => l !== listener)
      for (const { handle } of captured.values()) clearTimeout(handle)
    }
  }, [startTimer])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const s = TOAST_STYLES[t.type]
        const Icon = s.icon
        return (
          <div
            key={t.id}
            role={STICKY_TYPES.includes(t.type) ? 'alert' : 'status'}
            onMouseEnter={pauseAll}
            onMouseLeave={resumeAll}
            className={`pointer-events-auto flex items-start gap-3 bg-white border ${s.ring} rounded-lg shadow-lg px-4 py-3 animate-in slide-in-from-bottom-2 fade-in duration-200`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${s.iconColor}`} />
            <p className="flex-1 text-sm text-gray-800 leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
