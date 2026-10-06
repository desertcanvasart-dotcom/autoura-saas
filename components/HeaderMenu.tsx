'use client'

// A small dropdown for a page header: one button, a list of actions. Used by
// the itinerary page to fold ten coloured buttons into a few menus.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

export interface HeaderMenuItem {
  label: string
  icon?: ReactNode
  onSelect?: () => void
  href?: string
  disabled?: boolean
  title?: string
  danger?: boolean
}

export default function HeaderMenu({ label, icon, items, align = 'right', ariaLabel }: {
  label?: string
  icon?: ReactNode
  items: (HeaderMenuItem | null | false)[]
  align?: 'left' | 'right'
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const shown = items.filter(Boolean) as HeaderMenuItem[]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  if (shown.length === 0) return null
  const itemCls = (it: HeaderMenuItem) =>
    `w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${it.disabled ? 'text-gray-400 cursor-not-allowed' : it.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
      >
        {icon}
        {label}
        {label && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div role="menu" className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40`}>
          {shown.map(it =>
            it.href && !it.disabled ? (
              <Link key={it.label} href={it.href} role="menuitem" title={it.title} className={itemCls(it)} onClick={() => setOpen(false)}>
                {it.icon}{it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                title={it.title}
                disabled={it.disabled}
                className={itemCls(it)}
                onClick={() => { setOpen(false); it.onSelect?.() }}
              >
                {it.icon}{it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
