'use client'

// ============================================
// One button for the file-transfer plumbing
// ============================================
// Import and export grow one button per sheet, and a page with two sheets ends
// up with six grey lookalikes in its toolbar — which is what the Tour Programs
// Manager had. Worse than the clutter: a destructive import ("replaces the
// whole itinerary") sat next to its harmless neighbour at the same size, in
// the same grey, one word apart.
//
// This collapses them into a labelled menu where each item has room to say
// what it does, and a destructive one can look destructive.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export interface ToolbarMenuItem {
  label: string
  /** What it does, in the operator's terms. Shown under the label. */
  description?: string
  icon?: ReactNode
  onSelect: () => void
  /** Replaces or deletes something. Shown in red, under its own heading. */
  danger?: boolean
}

export interface ToolbarMenuGroup {
  label: string
  items: ToolbarMenuItem[]
}

export default function ToolbarMenu({
  label,
  icon,
  groups,
}: {
  label: string
  icon?: ReactNode
  groups: ToolbarMenuGroup[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
      >
        {icon}
        {label}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-2"
        >
          {groups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-1 pt-1 border-t border-gray-100' : ''}>
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group.label}
              </p>
              {group.items.map(item => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); item.onSelect() }}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                    item.danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`mt-0.5 flex-shrink-0 ${item.danger ? 'text-red-600' : 'text-gray-400'}`}>
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${item.danger ? 'text-red-700' : 'text-gray-800'}`}>
                      {item.label}
                    </span>
                    {item.description && (
                      <span className={`block text-xs ${item.danger ? 'text-red-600' : 'text-gray-500'}`}>
                        {item.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
