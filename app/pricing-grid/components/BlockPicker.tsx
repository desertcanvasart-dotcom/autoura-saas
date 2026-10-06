'use client'

// The agency's day blocks (Settings → Day blocks), offered in the Grid: pick
// one to add a day from it, or to lay it onto a day already there.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Blocks } from 'lucide-react'
import { nightLabel } from '@/lib/day-blocks/blocks'
import type { GridBlock } from '@/lib/day-blocks/grid-apply'

interface BlockPickerProps {
  blocks: GridBlock[]
  onPick: (block: GridBlock) => void
  label: string
  title?: string
  disabled?: boolean
  /** Small, for a day's header. */
  compact?: boolean
}

export default function BlockPicker({ blocks, onPick, label, title, disabled, compact }: BlockPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return blocks
    return blocks.filter(b => [b.code, b.name, b.city, b.to_city, ...b.shorthand].some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [blocks, query])

  return (
    <div ref={box} className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || blocks.length === 0}
        title={blocks.length === 0 ? 'No day blocks yet: add them in Settings → Day blocks' : title}
        className={compact
          ? 'flex items-center gap-1 p-1.5 text-gray-400 hover:text-green-700 rounded-md hover:bg-green-50 transition-colors disabled:opacity-40'
          : 'flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:border-green-500 hover:text-green-700 transition-colors disabled:opacity-40 whitespace-nowrap'}
      >
        <Blocks className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {!compact && label}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search blocks: code, name, city, shorthand"
              aria-label="Search day blocks"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-200"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {shown.map(b => (
              <li key={b.code}>
                <button
                  type="button"
                  onClick={() => { onPick(b); setOpen(false); setQuery('') }}
                  className="w-full text-left px-3 py-2 hover:bg-green-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-600">{b.code}</span>
                    <span className="text-sm text-gray-900 truncate">{b.name}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {b.city ?? 'Any city'}{b.to_city && b.to_city !== b.city ? ` → ${b.to_city}` : ''} · {nightLabel(b)}
                  </div>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No block matches.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
