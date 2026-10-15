'use client'

import { useRef, useState } from 'react'
import { Move, Tag, Inbox, FolderPlus, Loader2 } from 'lucide-react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import type { GmailLabel } from './types'

/**
 * "Move to": the mailbox's folders (in their colours), back to the Inbox when
 * the email is in a folder, or a new folder made on the spot. The button is
 * always there — with no folders yet, "New folder…" is how the first one is
 * made.
 */
export default function MoveMenu({
  userId,
  folders,
  currentFolderId,
  disabled,
  onMove,
  onMoveToInbox,
  onFolderCreated,
  align = 'left',
  buttonClassName = 'p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50',
}: {
  userId: string
  folders: GmailLabel[]
  /** The folder being viewed (its emails move OUT of it), if any. */
  currentFolderId?: string | null
  disabled?: boolean
  onMove: (labelId: string) => void
  onMoveToInbox: () => void
  /** A folder was created here (refresh the folder list). */
  onFolderCreated?: () => void
  align?: 'left' | 'right'
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, ref, () => { setOpen(false); setCreating(false); setError(null) })

  const choose = (fn: () => void) => {
    setOpen(false)
    setCreating(false)
    fn()
  }

  const createAndMove = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: n }),
      })
      const d = await res.json()
      if (!res.ok || !d.label?.id) throw new Error(d.error || 'Could not create the folder')
      onFolderCreated?.()
      setName('')
      choose(() => onMove(d.label.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder')
    } finally {
      setBusy(false)
    }
  }

  const targets = folders.filter(f => f.id !== currentFolderId)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className={buttonClassName}
        title="Move to folder"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Move className="w-4 h-4 text-gray-500" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Move to"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30`}
        >
          <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move to</p>
          {currentFolderId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onMoveToInbox)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
            >
              <Inbox className="w-3.5 h-3.5 text-gray-400" /> Inbox
            </button>
          )}
          <div className="max-h-60 overflow-y-auto">
            {targets.map(f => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                onClick={() => choose(() => onMove(f.id))}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <Tag
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: f.color?.backgroundColor || '#9ca3af' }}
                  fill={f.color?.backgroundColor || 'none'}
                />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
          {targets.length === 0 && !creating && (
            <p className="px-3 py-1.5 text-xs text-gray-400">No {currentFolderId ? 'other ' : ''}folders yet</p>
          )}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void createAndMove()
                    if (e.key === 'Escape') setCreating(false)
                  }}
                  placeholder="Folder name"
                  aria-label="New folder name"
                  className="w-full h-8 px-2 text-xs border border-gray-200 rounded"
                />
                {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
                <button
                  type="button"
                  onClick={createAndMove}
                  disabled={busy || !name.trim()}
                  className="mt-1.5 w-full inline-flex items-center justify-center gap-1.5 h-7 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create and move
                </button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setCreating(true)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-600"
              >
                <FolderPlus className="w-3.5 h-3.5 text-gray-400" /> New folder…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
