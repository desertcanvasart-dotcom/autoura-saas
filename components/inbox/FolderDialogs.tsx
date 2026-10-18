'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { GmailLabel } from './types'

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-label={title}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Rename a folder. Its subfolders follow ("Old/Child" → "New/Child"). */
export function RenameFolderDialog({
  userId, label, onClose, onDone,
}: { userId: string; label: GmailLabel; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(label.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim() || name.trim() === label.name) return onClose()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, labelId: label.id, name: name.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not rename the folder')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the folder')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Rename folder" onClose={onClose}>
      <div className="p-5">
        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{error}</div>}
        <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="rename-folder">Folder name</label>
        <input
          id="rename-folder"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          autoFocus
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
        <button onClick={save} disabled={busy || !name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Rename'}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * Delete a folder. Says how many emails it holds first: they are moved back
 * to the Inbox before the folder goes, so nothing is lost from view.
 */
export function DeleteFolderDialog({
  userId, label, onClose, onDone,
}: { userId: string; label: GmailLabel; onClose: () => void; onDone: (moved: number) => void }) {
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/gmail/labels?userId=${userId}&labelId=${encodeURIComponent(label.id)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setCount(typeof d.label?.messagesTotal === 'number' ? d.label.messagesTotal : null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId, label.id])

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, labelId: label.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not delete the folder')
      onDone(d.movedToInbox ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the folder')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Delete folder" onClose={onClose}>
      <div className="p-5 text-sm text-gray-700 space-y-2">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{error}</div>}
        <p>Delete the folder <strong>{label.name}</strong>?</p>
        <p className="text-gray-500">
          {count === null
            ? 'Its emails will be moved back to the Inbox first.'
            : count === 0
              ? 'It is empty.'
              : `Its ${count.toLocaleString()} email${count === 1 ? '' : 's'} will be moved back to the Inbox first, so nothing is lost.`}
        </p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
        <button onClick={remove} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Moving emails…' : 'Delete folder'}
        </button>
      </div>
    </Dialog>
  )
}
