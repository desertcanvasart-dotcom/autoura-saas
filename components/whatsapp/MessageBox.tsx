'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * The WhatsApp message box. A one-line <input> silently DROPS every line
 * break — a pasted itinerary went out to the customer as one long paragraph.
 * This is a textarea that keeps line breaks and grows with the text:
 * Enter sends, Shift+Enter starts a new line (as in WhatsApp Web).
 */
export default function MessageBox({
  value,
  onChange,
  onSend,
  placeholder,
  className = '',
  maxHeight = 200,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  className?: string
  maxHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow to fit the text, up to maxHeight, then scroll inside.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, maxHeight])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        // isComposing: Enter that confirms a Japanese/Chinese word must not send.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onSend()
        }
      }}
      placeholder={placeholder}
      className={`resize-none leading-5 ${className}`}
    />
  )
}
