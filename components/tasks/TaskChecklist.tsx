'use client'

// ============================================
// TASK CHECKLIST — the rows of a generated operations task
// ============================================
// A generated task (lib/tasks/itinerary-tasks.ts) lists its services as rows.
// Staff tick each row as booked and note its confirmation number; the task is
// done when every row is ticked and nothing is waiting to be cancelled.
//
// Two views: <TaskChecklist> is the full table (in the task dialog), and
// <ChecklistSummary> is the one-line progress shown on task cards and rows.

import { useState } from 'react'
import { Loader2, AlertTriangle, Check } from 'lucide-react'
import { checklistProgress, type ChecklistItem, type GenerationSnapshot } from '@/lib/tasks/itinerary-tasks'

function nightsText(n: number): string {
  return `${n} night${n === 1 ? '' : 's'}`
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function dateRange(from: string | null, to: string | null): string {
  if (!from) return ''
  return to && to !== from ? `${shortDate(from)} – ${shortDate(to)}` : shortDate(from)
}

/** The span of dates the checklist covers, for the card summary. */
function coveredDates(items: ChecklistItem[]): string {
  const dates = items.flatMap(i => [i.date_from, i.date_to]).filter((d): d is string => !!d).sort()
  return dates.length ? dateRange(dates[0], dates[dates.length - 1]) : ''
}

export function ChecklistSummary({ items }: { items: ChecklistItem[] }) {
  const p = checklistProgress(items)
  const pct = p.total ? Math.round((p.booked / p.total) * 100) : 0
  const dates = coveredDates(items.filter(i => !i.removed))
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
        <span className="font-medium whitespace-nowrap">{`${p.booked} of ${p.total} booked`}</span>
        {dates && <span className="text-gray-400 whitespace-nowrap">· {dates}</span>}
        {p.newRows > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">{`${p.newRows} new`}</span>
        )}
        {p.unpriced > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">{`${p.unpriced} not priced`}</span>
        )}
        {p.toCancel > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">{`${p.toCancel} to cancel`}</span>
        )}
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${p.complete ? 'bg-green-500' : 'bg-[#647C47]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

interface TaskWithChecklist {
  id: string
  checklist: ChecklistItem[]
  generation_snapshot?: GenerationSnapshot | null
}

/**
 * The full checklist. Each change is saved at once through
 * PATCH /api/tasks/[id]/checklist; `onUpdated` receives the updated task
 * (its status may have changed with the rows).
 */
export function TaskChecklist<T extends TaskWithChecklist>({
  task,
  onUpdated,
  readOnly = false,
}: {
  task: T
  onUpdated: (task: T) => void
  readOnly?: boolean
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Confirmation numbers being typed, saved on blur.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const items = task.checklist
  const p = checklistProgress(items)
  const header = task.generation_snapshot?.header

  const send = async (body: Record<string, unknown>) => {
    setBusyKey(String(body.key))
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the change')
      onUpdated({ ...task, ...data.data })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change')
    } finally {
      setBusyKey(null)
    }
  }

  const saveConfirmation = (row: ChecklistItem) => {
    const draft = drafts[row.key]
    if (draft === undefined) return
    setDrafts(prev => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
    if ((draft.trim() || null) === (row.confirmation || null)) return
    send({ key: row.key, confirmation: draft })
  }

  return (
    <div className="space-y-3">
      {header && (
        <div className="text-xs text-gray-500 leading-5 whitespace-pre-line">{header}</div>
      )}

      <ChecklistSummary items={items} />

      {error && (
        <div className="p-2 text-xs rounded border border-red-200 bg-red-50 text-red-700">{error}</div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="w-10 px-2 py-2 text-left" aria-label={'Booked'} />
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">{'Day'}</th>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">{'Date'}</th>
              <th className="px-2 py-2 text-left font-medium">{'City'}</th>
              <th className="px-2 py-2 text-left font-medium min-w-[180px]">{'Service'}</th>
              <th className="px-2 py-2 text-left font-medium">{'Supplier'}</th>
              <th className="px-2 py-2 text-left font-medium min-w-[120px]">{'Confirmation'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(row => {
              const busy = busyKey === row.key
              // A row carried over from a task generated before checklists
              // existed has only its text, not its fields.
              const legacy = row.day_from === 0
              if (row.removed) {
                return (
                  <tr key={row.key} className="bg-red-50/60">
                    <td className="px-2 py-2 align-top">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </td>
                    <td colSpan={5} className="px-2 py-2 align-top">
                      <div className="text-gray-500 line-through">{legacy ? row.name : `${row.name}${row.nights ? ` · ${nightsText(row.nights)}` : ''}`}</div>
                      <div className="text-xs text-red-700 mt-0.5">
                        {'No longer on the itinerary — cancel this booking'}
                        {row.confirmation ? ` · ${'Confirmation'}: ${row.confirmation}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => send({ key: row.key, cancelled: true })}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          {'Cancelled'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={row.key} className={row.booked ? 'bg-green-50/40' : undefined}>
                  <td className="px-2 py-2 align-top">
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#647C47] cursor-pointer"
                        checked={row.booked}
                        disabled={readOnly}
                        aria-label={'Booked'}
                        onChange={e => send({ key: row.key, booked: e.target.checked })}
                      />
                    )}
                  </td>
                  {legacy ? (
                    <td colSpan={5} className="px-2 py-2 align-top text-gray-700">{row.name}</td>
                  ) : (
                    <>
                      <td className="px-2 py-2 align-top whitespace-nowrap text-gray-600">
                        {row.day_to !== row.day_from ? `${row.day_from}–${row.day_to}` : row.day_from}
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap text-gray-600">{dateRange(row.date_from, row.date_to)}</td>
                      <td className="px-2 py-2 align-top text-gray-600">{row.city}</td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={row.booked ? 'text-gray-500' : 'text-gray-900'}>{row.name}</span>
                          {row.quantity !== 1 && <span className="text-xs text-gray-500">×{row.quantity}</span>}
                          {row.nights != null && (
                            <span className="text-xs text-gray-500">· {nightsText(row.nights)}</span>
                          )}
                          {row.unpriced && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-800 border border-amber-200"
                              title={'The day calls for this, but the itinerary has no priced service for it yet'}
                            >
                              {'Not priced'}
                            </span>
                          )}
                          {row.is_new && !row.booked && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">{'New'}</span>
                          )}
                        </div>
                        {row.notes && <div className="text-xs text-gray-500 mt-0.5">{row.notes}</div>}
                      </td>
                      <td className="px-2 py-2 align-top text-gray-600">{row.supplier}</td>
                    </>
                  )}
                  <td className="px-2 py-2 align-top">
                    <input
                      type="text"
                      className="w-full min-w-[110px] px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] disabled:bg-gray-50"
                      placeholder={'Conf. no.'}
                      value={drafts[row.key] ?? row.confirmation ?? ''}
                      disabled={readOnly || busy}
                      onChange={e => setDrafts(prev => ({ ...prev, [row.key]: e.target.value }))}
                      onBlur={() => saveConfirmation(row)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          ;(e.target as HTMLInputElement).blur()
                        }
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {p.complete && (
        <p className="text-xs text-green-700">{'Everything is booked.'}</p>
      )}
      <p className="text-xs text-gray-400">{'Rows come from the itinerary. Change the itinerary, then Sync tasks there to update them — ticks and confirmation numbers are kept.'}</p>
    </div>
  )
}
