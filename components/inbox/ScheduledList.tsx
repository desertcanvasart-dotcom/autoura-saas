'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, AlertCircle, X, Pencil } from 'lucide-react'

interface ScheduledEmail {
  id: string
  gmail_draft_id: string
  send_at: string
  status: 'pending' | 'sending' | 'failed'
  to_summary: string | null
  subject: string | null
  error: string | null
}

/**
 * The Scheduled folder: emails waiting to go out at their chosen time, and
 * any that could not be sent, with why. Cancel keeps the message in Drafts;
 * Edit cancels the schedule and opens the draft to change and send or
 * schedule again.
 */
export default function ScheduledList({
  userId,
  onEditDraft,
  refreshKey = 0,
}: {
  userId: string
  /** Open a draft in the composer (its Gmail draft id). */
  onEditDraft: (gmailDraftId: string) => void
  /** Changes when something was just scheduled, to reload the list. */
  refreshKey?: number
}) {
  const [items, setItems] = useState<ScheduledEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gmail/scheduled?userId=${userId}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load scheduled emails')
      setItems(d.scheduled || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scheduled emails')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load, refreshKey])

  const cancel = async (item: ScheduledEmail, thenEdit: boolean) => {
    setBusy(item.id)
    try {
      const res = await fetch(`/api/gmail/scheduled?userId=${userId}&id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not cancel')
      setItems(prev => prev.filter(i => i.id !== item.id))
      if (thenEdit) onEditDraft(item.gmail_draft_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading scheduled emails…
      </div>
    )
  }

  return (
    <div data-testid="scheduled-list">
      {error && (
        <div className="m-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">Nothing scheduled</p>
            <p className="text-xs text-gray-400 mt-1">Use Schedule in the composer to send an email later</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{item.subject || '(No subject)'}</p>
                <p className="text-xs text-gray-500 truncate">To: {item.to_summary || '—'}</p>
                {item.status === 'failed' && (
                  <p className="text-xs text-red-600 mt-0.5">Not sent: {item.error || 'unknown reason'}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-xs ${item.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>
                  {item.status === 'sending' ? 'Sending now' : new Date(item.send_at).toLocaleString(undefined, {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              {item.status !== 'sending' && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => cancel(item, true)}
                    disabled={busy === item.id}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50"
                    title="Edit — cancels the schedule and opens the draft"
                  >
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => cancel(item, false)}
                    disabled={busy === item.id}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50"
                    title="Cancel — the message stays in Drafts"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
