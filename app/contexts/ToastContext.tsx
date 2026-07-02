'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
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
  if (listeners.length === 0) {
    // No Toaster mounted (e.g. during SSR) — fall back to the console.
    // eslint-disable-next-line no-console
    console.log(`[${type}] ${message}`)
    return
  }
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

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((prev) => [...prev, t])
      // Auto-dismiss after 5s (errors linger a little longer).
      const ttl = t.type === 'error' ? 8000 : 5000
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ttl)
    }
    listeners.push(listener)
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const s = TOAST_STYLES[t.type]
        const Icon = s.icon
        return (
          <div
            key={t.id}
            role="status"
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
